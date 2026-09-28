"""Collection endpoints used by the authenticated scraper bridge."""
from datetime import datetime
import json
from fastapi import HTTPException
from sqlalchemy import or_, func
from src.database import SessionLocal
from src.models import CollectedPosting, CollectionImport, Job, MatchedJob, CollectionRun
from src.collected_jobs import import_outputs, serialize, utc_date, canonical_url, sync_ai_approvals


def number(params, name, default, maximum):
    try:
        value = int(params.get(name, default))
        if value < 1 or value > maximum:
            raise ValueError()
        return value
    except (TypeError, ValueError):
        raise HTTPException(422, f'Invalid {name}')


def collection_action(user_id, action, method, payload, query, directory, vendors):
    with SessionLocal() as db:
        if method == 'POST':
            ids = payload.get('ids', [])
            state = payload.get('state')
            if not isinstance(ids, list) or not ids or len(ids) > 100 or any(not isinstance(i, str) for i in ids):
                raise HTTPException(422, 'Select between 1 and 100 jobs')
            if state not in ('new', 'reviewed', 'dismissed'):
                raise HTTPException(422, 'Unknown review state')
            rows = db.query(CollectedPosting).filter(
                CollectedPosting.user_id == user_id, CollectedPosting.id.in_(ids)).all()
            if len(rows) != len(set(ids)):
                raise HTTPException(404, 'A selected job is unavailable')
            for row in rows:
                row.review_state = state
                row.reviewed_at = datetime.utcnow() if state != 'new' else None
                row.has_update = False
            db.commit()
            return {'ok': True}
        warnings = import_outputs(db, user_id, directory, vendors)
        sync_ai_approvals(db, user_id, directory)
        approved = CollectedPosting.payload['_ai_approved'].as_string() == CollectedPosting.fingerprint
        jobs = db.query(CollectedPosting).filter_by(user_id=user_id).filter(approved)
        view = query.get('view', 'new')
        if view not in ('new', 'all', 'updated', 'dismissed', 'reviewed'):
            raise HTTPException(422, 'Unknown collection view')
        if view == 'updated':
            jobs = jobs.filter(CollectedPosting.has_update.is_(True), CollectedPosting.review_state != 'dismissed')
        elif view != 'all':
            jobs = jobs.filter(CollectedPosting.review_state == view)
        portal = query.get('portal')
        if portal:
            jobs = jobs.filter_by(portal=portal)
        group = query.get('group', 'all')
        if group not in ('all', 'important', 'optional'):
            raise HTTPException(422, 'Unknown company group')
        if group != 'all':
            prime = {'apexsystems','teksystems','beaconhill','akkodis','randstad','eliassen','experis',
                     'brooksource','kellymitchell','mitchellmartin','cbts','roberthalf','kforce',
                     'insightglobal','artech','pyramidconsulting','judgegroup'}
            categories = {}
            config_path = directory / 'job_portal_dashboard_config.json'
            if config_path.exists():
                try:
                    categories = json.loads(config_path.read_text()).get('portal_categories', {})
                except (OSError, ValueError):
                    raise HTTPException(503, 'Company groups could not be loaded')
            slugs = [v.slug for v in vendors if categories.get(v.slug, 'important' if v.slug in prime else 'optional') == group]
            jobs = jobs.filter(CollectedPosting.portal.in_(slugs))
        location = query.get('location', '').strip()
        if location:
            jobs = jobs.filter(CollectedPosting.payload['location'].as_string() == location)
        if query.get('remote') == 'true':
            jobs = jobs.filter(or_(func.lower(CollectedPosting.payload['location'].as_string()).contains('remote'),
                                  func.lower(CollectedPosting.payload['remote_status'].as_string()) == 'remote'))
        signal = query.get('engagement')
        if signal:
            jobs = jobs.filter(CollectedPosting.payload['engagement'].as_string() == signal)
        text = query.get('q', '').strip()[:200]
        if text:
            # JSON payload cast works for both SQLite tests and PostgreSQL.
            from sqlalchemy import cast, String
            escaped = text.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
            jobs = jobs.filter(cast(CollectedPosting.payload, String).ilike(f'%{escaped}%', escape='\\'))
        field = query.get('date_field', 'first_seen')
        if field not in ('first_seen', 'posted_at', 'last_seen'):
            raise HTTPException(422, 'Unknown date field')
        column = getattr(CollectedPosting, field)
        for key, compare in [('from', lambda d: column >= d), ('until', lambda d: column < d)]:
            if query.get(key):
                date = utc_date(query[key])
                if date is None:
                    raise HTTPException(422, f'Invalid {key} date')
                condition = compare(date)
                if field == 'posted_at' and query.get('include_unknown', 'true') == 'true':
                    condition = or_(condition, column.is_(None))
                jobs = jobs.filter(condition)
        if query.get('from') and query.get('until') and utc_date(query['from']) >= utc_date(query['until']):
            raise HTTPException(422, 'End date must follow start date')
        page = number(query, 'page', 1, 100000)
        limit = number(query, 'limit', 25, 100)
        total = jobs.count()
        rows = jobs.order_by(column.desc().nullslast(), CollectedPosting.id).offset((page - 1) * limit).limit(limit).all()
        # Read the actual saved/application state; never reset it on subsequent imports.
        urls = list({url for r in rows for url in [r.canonical_url, *r.payload.get('_known_urls', [])]})
        saved = {}
        if urls:
            matches = db.query(Job, MatchedJob).join(MatchedJob, MatchedJob.job_id == Job.id).filter(
                Job.user_id == user_id, MatchedJob.user_id == user_id, Job.job_link.in_(urls)).all()
            saved = {canonical_url(j.job_link): {'saved': bool(m.special_interest and m.delivery_status == 'active'),
                      'application_status': m.user_status} for j, m in matches}
        latest = db.query(CollectionImport).filter_by(user_id=user_id).order_by(CollectionImport.observed_at.desc()).first()
        counts = dict(db.query(CollectedPosting.review_state, func.count()).filter_by(user_id=user_id).filter(approved)
                      .group_by(CollectedPosting.review_state).all())
        last_run = db.query(CollectionRun).filter_by(user_id=user_id).order_by(CollectionRun.started_at.desc()).first()
        run_summary = None
        if last_run:
            imports = db.query(CollectionImport).filter(CollectionImport.user_id == user_id,
                CollectionImport.observed_at >= last_run.started_at)
            if last_run.finished_at:
                imports = imports.filter(CollectionImport.observed_at <= last_run.finished_at)
            totals = {'new': 0, 'updated': 0, 'known': 0, 'invalid': 0}
            for batch in imports:
                for key in totals:
                    totals[key] += batch.summary.get(key, 0)
            run_summary = {**totals, 'status': last_run.status,
                           'failed_portals': sum(s.get('status') in ('failed', 'stopped') for s in last_run.steps)}
        locations = [value for (value,) in db.query(CollectedPosting.payload['location'].as_string()).filter(
            CollectedPosting.user_id == user_id, approved).distinct().all() if value]
        def saved_state(row):
            candidates = [saved.get(url, {}) for url in [row.canonical_url, *row.payload.get('_known_urls', [])]]
            applied = next((item.get('application_status') for item in candidates
                            if item.get('application_status') in ('applied', 'interviewing', 'accepted')), None)
            return {'saved': any(item.get('saved') for item in candidates),
                    'application_status': applied or next((item.get('application_status') for item in candidates if item), None)}
        return {'locations': sorted(locations), 'jobs': [{**serialize(r), **saved_state(r)} for r in rows],
                'total': total, 'page': page, 'limit': limit, 'warnings': warnings,
                'counts': counts, 'run_summary': None, 'latest_import': latest.summary if latest else None,
                'date_note': 'Older jobs use their earliest available output file date.'}
