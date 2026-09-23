"""Run the imported portal scrapers and deliver their results to Career OS."""
from __future__ import annotations

import json
import subprocess
import threading
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from dateutil.parser import parse as parse_date
from services.job_scrapper import job_portal_dashboard as portals
from src.crud import sync_delivered_jobs_for_user
from src.database import SessionLocal
from src.models import ScrapeRun

# Imported scrapers share output and keyword files; serialize execution across users.
RUN_LOCK = threading.Lock()


def normalize_job(row: dict, vendor) -> dict:
    url = portals.job_url(row)
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"} or not parts.netloc:
        raise ValueError("Job has no valid HTTP URL")
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
             if not k.lower().startswith("utm_") and k.lower() not in {"gclid", "fbclid"}]
    url = urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path, urlencode(sorted(query)), parts.fragment))
    title = str(row.get("title") or "").strip()
    if not title:
        raise ValueError("Job has no title")
    posted = None
    if row.get("posted_date"):
        try:
            posted = parse_date(str(row["posted_date"]))
            if posted.tzinfo:
                posted = posted.astimezone(timezone.utc).replace(tzinfo=None)
        except (ValueError, OverflowError):
            pass
    return {
        # Existing source columns are VARCHAR(20); keep longer portal IDs in metadata.
        "source": vendor.slug if len(vendor.slug) <= 20 else "staffing_portal",
        "company": str(row.get("source_company") or vendor.label),
        "title": title, "job_link": url,
        "location": str(row.get("location") or ""),
        "posting_date": posted,
        "job_description": str(row.get("raw_text") or row.get("description") or row.get("description_snippet") or ""),
        "search_query": str(row.get("search_term") or ""),
        "employment_type": str(row.get("employment_type") or ""),
        "contact_info": {
            "portal": vendor.slug, "portal_job_id": str(row.get("job_id") or ""),
            "apply_url": str(row.get("apply_url") or url),
            "remote_status": str(row.get("remote_status") or ""),
            "contact": row.get("contact_info") or "",
        },
    }


def scrape_vendor(vendor, config: dict) -> list[dict]:
    previous = portals.latest_jobs_file(vendor)
    before = (previous, previous.stat().st_mtime_ns) if previous else None
    result = subprocess.run(portals.command_for_scrape(vendor, config), cwd=portals.ROOT,
                            capture_output=True, text=True, timeout=900)
    if result.returncode:
        raise RuntimeError(f"Scraper exited {result.returncode}: {(result.stderr or result.stdout)[-1500:]}")
    latest = portals.latest_jobs_file(vendor)
    after = (latest, latest.stat().st_mtime_ns) if latest else None
    if after is None or before == after:
        raise RuntimeError("Scraper produced no fresh output; previous results were not imported")
    rows = json.loads(latest.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError("Scraper output must be a list")
    # Validate the complete output before delivering anything.
    jobs = {}
    for row in rows:
        job = normalize_job(row, vendor)
        jobs[job["job_link"]] = job
    return list(jobs.values())


def run_portals(run_ids: list[str], config: dict):
    """Called in FastAPI's background thread; browser scraping runs in child processes."""
    try:
        for run_id in run_ids:
            with SessionLocal() as db:
                run = db.get(ScrapeRun, run_id)
                vendor = portals.VENDOR_BY_SLUG[run.search_query]
                run.status = "running"
                db.commit()
                try:
                    jobs = scrape_vendor(vendor, config)
                    sync_delivered_jobs_for_user(db, run.user_id, jobs,
                                                 replace_existing=False, preserve_user_state=True)
                    run.status = "done"
                    run.jobs_found = len(jobs)
                except Exception as exc:
                    db.rollback()
                    run = db.get(ScrapeRun, run_id)
                    run.status = "failed"
                    run.error_msg = str(exc)[-2000:]
                run.finished_at = datetime.utcnow()
                db.commit()
    finally:
        RUN_LOCK.release()
