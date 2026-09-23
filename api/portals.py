"""Authenticated portal scraping controls for the Career OS dashboard."""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.deps import get_current_user, get_db, require_csrf
from src.models import ScrapeRun, User
from src.portal_scraper import RUN_LOCK, portals, run_portals

router = APIRouter(prefix="/api/portals", tags=["portals"])


class ScrapeRequest(BaseModel):
    vendors: list[str] = Field(min_length=1, max_length=33)
    keywords: list[str] = Field(min_length=1, max_length=30)
    posted_within_days: int = Field(default=4, ge=0, le=90)


@router.get("")
def list_portals(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    runs = db.query(ScrapeRun).filter(ScrapeRun.user_id == user.id, ScrapeRun.source == "portal").order_by(ScrapeRun.started_at.desc()).limit(50).all()
    return {
        "vendors": [{"slug": v.slug, "label": v.label, "supports_keywords": v.terms_mode != "none"} for v in portals.VENDORS],
        "today": portals.active_pair_for(), "busy": RUN_LOCK.locked(),
        "runs": [{"id": r.id, "vendor": r.search_query, "status": r.status,
                  "jobs_found": r.jobs_found, "error": r.error_msg,
                  "started_at": r.started_at, "finished_at": r.finished_at} for r in runs],
    }


@router.post("/scrape", status_code=202, dependencies=[Depends(require_csrf)])
def start_scrape(request: ScrapeRequest, background: BackgroundTasks,
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    vendors = list(dict.fromkeys(request.vendors))
    if any(slug not in portals.VENDOR_BY_SLUG for slug in vendors):
        raise HTTPException(422, "Unknown portal")
    keywords = [term.strip() for term in request.keywords if term.strip()]
    if not keywords or any(len(term) > 200 or '\n' in term or '\r' in term for term in keywords):
        raise HTTPException(422, "Provide search keywords of 1–200 characters each")
    if not RUN_LOCK.acquire(blocking=False):
        raise HTTPException(409, "A portal scrape is already running. Try again when it finishes.")
    try:
        runs = [ScrapeRun(user_id=user.id, source="portal", status="pending", search_query=slug) for slug in vendors]
        db.add_all(runs)
        db.commit()
        ids = [run.id for run in runs]
        config = portals.default_config()
        config.update(keywords=keywords, posted_within_days=request.posted_within_days)
        background.add_task(run_portals, ids, config)
        return {"run_ids": ids}
    except Exception:
        RUN_LOCK.release()
        raise
