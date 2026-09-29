"""Durable, account-scoped collection. Output files are a replayable ingestion log."""
import hashlib
import json
import re
import threading
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

from sqlalchemy import or_
from src.models import CollectedPosting, CollectionImport, PostingObservation, CollectionRun

IMPORT_LOCK = threading.RLock()
MEANINGFUL = ('title', 'company', 'location', 'employment_type', 'salary', 'raw_text',
              'description', 'description_snippet', 'posted_date', 'remote_status')
DESCRIPTIONS = ('raw_text', 'description', 'description_snippet')


def utc_date(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return parsed.astimezone(timezone.utc).replace(tzinfo=None) if parsed.tzinfo else parsed
    except (TypeError, ValueError):
        return None


def canonical_url(value):
    parts = urlsplit(str(value or '').strip())
    if parts.scheme not in ('http', 'https') or not parts.netloc:
        return ''
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
             if not k.lower().startswith('utm_') and k.lower() not in {'gclid', 'fbclid'}]
    # Preserve fragments: some portals use hash-based routes for distinct jobs.
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path,
                       urlencode(sorted(query)), parts.fragment))


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def serialize(row):
    return {**row.payload, 'key': row.id, 'sourceSlug': row.portal,
            'first_seen': row.first_seen.isoformat() + 'Z',
            'last_seen': row.last_seen.isoformat() + 'Z',
            'updated_at': row.updated_at.isoformat() + 'Z',
            'review_state': row.review_state, 'has_update': row.has_update,
            'job_url': row.canonical_url}


def ingest(db, user_id, portal, label, rows, source_key, observed_at):
    """One transaction per output; rerunning this transaction has no extra effects."""
    previous = db.query(CollectionImport).filter_by(user_id=user_id, source_key=source_key).first()
    if previous:
        return previous.summary
    summary = dict(new=0, updated=0, known=0, invalid=0)
    batch = CollectionImport(user_id=user_id, portal=portal, source_key=source_key,
                             observed_at=observed_at, summary=dict(summary))
    db.add(batch)
    db.flush()
    touched = set()
    for raw in rows:
        if not isinstance(raw, dict):
            summary['invalid'] += 1
            continue
        try:
            url = canonical_url(raw.get('job_url') or raw.get('apply_url'))
        except ValueError:
            summary['invalid'] += 1
            continue
        source_id = str(raw.get('job_id') or '').strip()
        if not url or not str(raw.get('title') or '').strip():
            summary['invalid'] += 1
            continue
        identity = digest(['id', source_id] if source_id else ['url', url])
        # URL alias handles a portal adding/removing source IDs in later outputs.
        row = db.query(CollectedPosting).filter(
            CollectedPosting.user_id == user_id, CollectedPosting.portal == portal,
            or_(CollectedPosting.identity == identity, CollectedPosting.canonical_url == url)
        ).first()
        if row and row.id in touched:
            continue
        data = {**raw, 'sourceLabel': label, 'sourceSlug': portal, 'job_url': url}
        text = ' '.join(str(data.get(k) or '') for k in ('title', 'raw_text', 'description', 'description_snippet', 'employment_type'))
        data['engagement'] = ('Restrictions found' if re.search(r'\b(no|not)\s+(c2c|corp.to.corp)|w.?2\s+only|no\s+third.party|c2c\s+(?:is\s+)?not', text, re.I)
            else 'C2C mentioned' if re.search(r'\bc2c\b|corp.to.corp', text, re.I) else 'Not specified')
        changes = {}
        if row is None:
            row = CollectedPosting(user_id=user_id, portal=portal, identity=identity,
                source_id=source_id, canonical_url=url, payload=data,
                fingerprint=digest({k: data.get(k) for k in MEANINGFUL}),
                first_seen=observed_at, last_seen=observed_at, updated_at=observed_at,
                posted_at=utc_date(data.get('posted_date')), review_state='new')
            db.add(row)
            db.flush()
            outcome = 'new'
        else:
            row.first_seen = min(row.first_seen, observed_at)
            if observed_at >= row.last_seen:
                merged = dict(row.payload)
                merged['_known_urls'] = sorted(set(row.payload.get('_known_urls', []) + [row.canonical_url, url]))
                for key, value in data.items():
                    if value not in (None, '', [], {}):
                        # Never replace a good full description with a partial result.
                        if key in DESCRIPTIONS and len(str(value)) < len(str(merged.get(key) or '')) * .7:
                            continue
                        merged[key] = value
                changes = {k: {'before': row.payload.get(k), 'after': merged.get(k)}
                           for k in MEANINGFUL if row.payload.get(k) != merged.get(k)}
                row.payload = merged
                row.canonical_url = url
                row.source_id = source_id or row.source_id
                row.last_seen = observed_at
                row.posted_at = utc_date(merged.get('posted_date'))
                if changes:
                    row.updated_at = observed_at
                    row.has_update = True
                    row.fingerprint = digest({k: merged.get(k) for k in MEANINGFUL})
            outcome = 'updated' if changes else 'known'
        touched.add(row.id)
        summary[outcome] += 1
        db.add(PostingObservation(import_id=batch.id, posting_id=row.id, outcome=outcome,
                                  observed_at=observed_at, changes=changes))
    batch.summary = dict(summary)
    db.commit()
    return summary


def import_outputs(db, user_id, directory, vendors):
    """Replays existing files chronologically, including after a process restart."""
    warnings = []
    files = []
    for vendor in vendors:
        for path in (directory / vendor.folder / 'output').glob(f'{vendor.prefix}_jobs_*.json'):
            try:
                stat = path.stat()
                files.append((stat.st_mtime_ns, str(path), stat.st_size, vendor, path))
            except OSError:
                warnings.append(f'{vendor.label}: output unavailable')
    with IMPORT_LOCK:
        known = {k for (k,) in db.query(CollectionImport.source_key).filter_by(user_id=user_id)}
        for stamp, _, size, vendor, path in sorted(files, key=lambda item: (item[0], item[1])):
            key = digest([str(path.relative_to(directory)), stamp, size])
            if key in known:
                continue
            try:
                rows = json.loads(path.read_text())
                if not isinstance(rows, list):
                    raise ValueError('Expected a list of jobs')
                after = path.stat()
                if after.st_mtime_ns != stamp or after.st_size != size:
                    continue  # Writer still active. Retry on the next poll.
                ingest(db, user_id, vendor.slug, vendor.label, rows, key,
                       datetime.fromtimestamp(stamp / 1e9, timezone.utc).replace(tzinfo=None))
                known.add(key)
            except (OSError, ValueError, TypeError):
                db.rollback()
                warnings.append(f'{vendor.label}: an output could not be imported; it will be retried')
    return warnings


def record_run(db, user_id, run, settings=None):
    row = db.query(CollectionRun).filter_by(user_id=user_id, run_key=run['id']).first()
    if row is None:
        row = CollectionRun(user_id=user_id, run_key=run['id'], status=run.get('status', 'running'),
                            settings_snapshot=settings or {})
        db.add(row)
    row.status = run.get('status', 'unknown')
    row.steps = [{k: step[k] for k in ('slug', 'vendor', 'status', 'count', 'returncode') if k in step}
                 for step in run.get('steps', [])]
    if row.status not in ('running', 'stopping'):
        row.finished_at = datetime.utcnow()
    db.commit()


def _review_terms(value):
    terms = value.splitlines() if isinstance(value, str) else value if isinstance(value, list) else []
    result = []
    for term in terms:
        term = str(term).strip()
        while len(term) >= 2 and term[0] == term[-1] and term[0] in ('"', "'"):
            term = term[1:-1].strip()
        if term and term not in result:
            result.append(term)
    return result


def sync_ai_approvals(db, user_id, directory):
    """Only explicit successful AI receipts grant visibility; absence fails closed."""
    with IMPORT_LOCK:
        rows = db.query(CollectedPosting).filter_by(user_id=user_id).all()
        receipts = {}
        config_path = directory / 'job_portal_dashboard_config.json'
        config = {}
        try:
            if config_path.exists():
                config = json.loads(config_path.read_text())
        except (OSError, ValueError):
            config = None
        for portal in {row.portal for row in rows}:
            try:
                document = json.loads((directory / f'{portal}_ai_reviewed.json').read_text())
                context = json.loads(document['context'])
                expected = ['title-review-v1', _review_terms((config or {}).get('keywords')), _review_terms((config or {}).get('ignore_titles'))]
                receipts[portal] = list(document.get('jobs', {}).values()) if config is not None and context == expected else []
            except (OSError, ValueError, AttributeError, TypeError, KeyError):
                receipts[portal] = []
        approved = {}
        for portal, entries in receipts.items():
            for entry in entries:
                if not isinstance(entry, dict) or entry.get('approved') is not True or not isinstance(entry.get('job'), dict):
                    continue
                raw = entry['job']
                if raw.get('job_id'):
                    approved[(portal, 'id', str(raw['job_id']))] = raw
                try:
                    url = canonical_url(raw.get('job_url') or raw.get('apply_url'))
                    if url:
                        approved[(portal, 'url', url)] = raw
                except ValueError:
                    pass
        for row in rows:
            raw = approved.get((row.portal, 'id', row.source_id)) or approved.get((row.portal, 'url', row.canonical_url))
            # A changed or enriched description must be reviewed again, not grandfathered.
            matches = raw is not None and all(
                (raw.get(k) or '') == (row.payload.get(k) or '') for k in MEANINGFUL)
            stamp = row.fingerprint if matches else None
            if row.payload.get('_ai_approved') != stamp:
                row.payload = {**row.payload, '_ai_approved': stamp}
        db.commit()
