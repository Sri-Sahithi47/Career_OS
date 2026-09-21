"""
User-facing matched jobs API.
"""

import json
import re
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.deps import get_current_user, get_db, require_csrf
from src.crud import (
    create_application_event,
    create_resume,
    count_user_matched_jobs,
    get_matched_job,
    get_application_events,
    get_job_resumes,
    get_active_resume_asset,
    get_or_create_profile,
    get_preferred_delivery_origin,
    get_user_matched_jobs,
    sync_user_matched_jobs,
    update_job,
    update_matched_job,
)
from src.ai_match_service import AIMatchError, maybe_enrich_matched_job_with_ai
from src.evaluation.tailor_service import TailorServiceError, TailorServiceUnavailable, generate_tailored_resume_data
from src.models import MatchedJob, User, KeywordReview, KeywordIgnore
from src.settings import settings

router = APIRouter(prefix="/api", tags=["jobs"])


def get_workspace_matched_skills(matched_job: MatchedJob) -> list[str]:
    """Prefer user-edited workspace skills over the source job snapshot."""
    skills = matched_job.workspace_matched_skills
    if isinstance(skills, list) and skills:
        return [skill for skill in skills if isinstance(skill, str)]
    return matched_job.job.matched_skills or []


def serialize_matched_job(matched_job: MatchedJob) -> dict:
    """Map matched job delivery rows to the frontend shape."""
    job = matched_job.job
    matched_skills = get_workspace_matched_skills(matched_job)
    analysis_data = matched_job.workspace_analysis or job.ai_evaluation or None
    display_location = matched_job.workspace_location or job.location or ""
    display_ats_score = matched_job.workspace_ats_score if matched_job.workspace_ats_score is not None else job.ats_score
    match_score = int(matched_job.fit_score or 0)
    source_labels = {
        "linkedin": "LinkedIn",
        "indeed": "Indeed",
        "ziprecruiter": "ZipRecruiter",
        "dice": "Dice",
        "glassdoor": "Glassdoor",
        "greenhouse": "Greenhouse",
        "lever": "Lever",
        "workday": "Workday",
        "ashby": "Ashby",
        "bamboohr": "BambooHR",
        "smartrecruiters": "SmartRecruiters",
        "workable": "Workable",
        "company": "Company Site",
        "company site": "Company Site",
        "web": "Company Site",
    }
    source_label = source_labels.get((job.source or "").strip().lower(), (job.source or "Web").title())
    tier = (
        "🟢 Perfect Match"
        if match_score >= 90
        else "🟡 Good Match"
        if match_score >= 70
        else "🟠 Stretch Goal"
        if match_score >= 50
        else "🔴 Skip"
    )

    return {
        "job_id": f"match_{matched_job.id}",
        "id": matched_job.id,
        "job_record_id": job.id,
        "Title": job.title,
        "Company": job.company,
        "Location": display_location,
        "Source": source_label,
        "Status": matched_job.user_status,
        "Skill Score": match_score,
        "Fit Score": match_score,
        "Base Skill Score": int(matched_job.base_skill_score or 0),
        "Experience Fit": int(matched_job.experience_fit_score or 0) if matched_job.experience_fit_score is not None else None,
        "Resume Match": int(matched_job.resume_match_score or 0) if matched_job.resume_match_score is not None else None,
        "Role Fit": int(matched_job.role_fit_score or 0) if matched_job.role_fit_score is not None else None,
        "Location Fit": int(matched_job.location_fit_score or 0) if matched_job.location_fit_score is not None else None,
        "Freshness Score": int(matched_job.freshness_score or 0) if matched_job.freshness_score is not None else None,
        "Freshness": matched_job.freshness_label or "",
        "Industry": ", ".join(matched_job.job_industries or []),
        "Industry Fit": matched_job.industry_fit_label or "",
        "Industry Boost": int(matched_job.industry_boost or 0),
        "Matched Industries": ", ".join(matched_job.matched_industries or []),
        "Fit Reasons": matched_job.fit_reasons or [],
        "AI Match Score": int(matched_job.ai_match_score or 0) if matched_job.ai_match_score is not None else None,
        "AI Match Confidence": matched_job.ai_match_confidence or "",
        "AI Match Summary": matched_job.ai_match_summary or "",
        "AI Match Reasons": matched_job.ai_match_reasons or [],
        "Tier": job.tier or tier,
        "Delivery Origin": matched_job.delivery_origin,
        "Delivery Status": matched_job.delivery_status,
        "Special Interest": bool(matched_job.special_interest),
        "Notes": matched_job.notes or "",
        "Matched Skills": ", ".join(matched_skills[:8]),
        "Search Query": job.search_query or "",
        "Date Found": matched_job.delivered_at.isoformat() if matched_job.delivered_at else (job.date_added.isoformat() if job.date_added else None),
        "Job Description": job.job_description or "",
        "Link": "" if (job.job_link or "").startswith("manual:") else job.job_link,
        "Employment Type": job.employment_type or "",
        "Contact Info": job.contact_info or {},
        "Resume Path": matched_job.workspace_resume_path or job.resume_path or "",
        "pdf_path": matched_job.workspace_resume_path or job.resume_path or "",
        "ats_score": int(display_ats_score or 0) if display_ats_score is not None else "N/A",
        "Analysis Data": analysis_data,
        "Match": f"{len(matched_skills)}/{max(len(matched_skills), len(job.missing_skills or []) + len(matched_skills), 1)} skills",
    }


def refresh_user_delivery(db: Session, user_id: int) -> None:
    """Sync any new jobs from the legacy jobs store into matched_jobs."""
    if not settings.LEGACY_DELIVERY_FALLBACK_ENABLED:
        return

    preferred_origin = get_preferred_delivery_origin(db, user_id)
    if preferred_origin:
        return

    # sync_user_matched_jobs already skips existing rows — safe to call every time
    sync_user_matched_jobs(db, user_id)


def require_matched_job(db: Session, user_id: str, matched_job_id: str) -> MatchedJob:
    """Return a user's matched job or raise 404."""
    matched_job = get_matched_job(db, matched_job_id, user_id)
    if not matched_job:
        raise HTTPException(status_code=404, detail="Job not found")
    return matched_job


def load_match_intelligence(db: Session, user: User, matched_job: MatchedJob, force: bool = False) -> dict:
    """Return cached or freshly generated AI match intelligence for one matched job."""
    profile = get_or_create_profile(db, user.id)
    resume_asset = next((asset for asset in user.resume_assets if asset.is_active), None)
    try:
        return maybe_enrich_matched_job_with_ai(db, profile, resume_asset, matched_job, force=force)
    except AIMatchError as error:
        return {
            "ai_match_score": int(matched_job.fit_score or 0),
            "confidence": "low",
            "summary": str(error),
            "reasons": matched_job.fit_reasons or [],
            "cached": False,
        }


_STATUS_LABELS = {
    "not_applied": "Saved",
    "applied": "Applied",
    "interviewing": "Interviewing",
    "accepted": "Offer received",
    "rejected": "Rejected",
    "skipped": "Archived",
}


def _event_label_and_detail(event) -> tuple[str, str]:
    """Return (label, detail) strings for a timeline event."""
    etype = event.event_type or ""
    meta = event.metadata_json or {}

    if etype == "status_changed":
        old = _STATUS_LABELS.get(event.old_status or "", event.old_status or "saved")
        new = _STATUS_LABELS.get(event.new_status or "", event.new_status or "saved")
        return f"Status changed to {new}", f"Previously: {old}"

    if etype == "analysis_updated":
        ats = meta.get("ats_score")
        pts = meta.get("points_count", 0)
        parts = []
        if ats is not None:
            parts.append(f"ATS score set to {ats}")
        if pts:
            parts.append(f"{pts} bullet point{'s' if pts != 1 else ''}")
        return "Analysis updated", " · ".join(parts) if parts else "Workspace analysis saved"

    if etype == "tailor_generated":
        ats = meta.get("ats_score")
        pts = meta.get("points_count", 0)
        parts = []
        if ats is not None:
            parts.append(f"ATS score {ats}")
        if pts:
            parts.append(f"{pts} AI bullet point{'s' if pts != 1 else ''}")
        return "AI tailoring applied", " · ".join(parts) if parts else "Resume workspace refreshed by AI"

    if etype == "resume_generated":
        version = meta.get("resume_version")
        label = f"Resume v{version} generated" if version else "Resume generated"
        return label, "PDF saved to workspace"

    if etype == "notes_saved":
        return "Notes saved", "Research notes updated"

    # Fallback for unknown future event types
    return etype.replace("_", " ").capitalize(), ""


def serialize_application_event(event) -> dict:
    """Serialize timeline events for the job detail workspace."""
    label, detail = _event_label_and_detail(event)
    return {
        "id": event.id,
        "event_type": event.event_type,
        "old_status": event.old_status or "",
        "new_status": event.new_status or "",
        "actor": event.actor,
        "metadata": event.metadata_json or {},
        "label": label,
        "detail": detail,
        "created_at": event.created_at.isoformat() if event.created_at else None,
    }


def serialize_resume(resume) -> dict:
    """Serialize stored resume versions for the matched-job workspace."""
    filename = (resume.pdf_path or "").split("/")[-1] if resume.pdf_path else ""
    return {
        "id": resume.id,
        "version": resume.version,
        "pdf_path": resume.pdf_path,
        "filename": filename,
        "download_url": f"/api/download-resume/{filename}" if filename else "",
        "created_at": resume.created_at.isoformat() if resume.created_at else None,
    }


class JobUpdate(BaseModel):
    status: str = None
    special_interest: bool = None
    notes: str = None

    class Config:
        from_attributes = True


class JobAnalysisUpdate(BaseModel):
    ats_score: Optional[int] = None
    location: str = ""
    tech_stack: dict = {}
    suggested_tech_stack: dict = {}
    points: list[str] = []


class JobResponse(BaseModel):
    id: int
    company: str
    title: str
    job_link: str
    location: str = None
    source: str
    status: str
    skill_score: float = None
    ats_score: float = None
    tier: str = None
    special_interest: bool
    notes: str = None
    date_added: str

    class Config:
        from_attributes = True


@router.get("/jobs/keyword-bank")
def get_keyword_bank(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Aggregate missing ATS keywords across all user's matched jobs (3-tier extraction)."""
    from concurrent.futures import ThreadPoolExecutor
    from src.evaluation.keyword_extractor import (
        extract_jd_keywords, extract_resume_keywords, scan_whitelist, _to_canonical,
    )

    resume_asset = next((a for a in user.resume_assets if a.is_active), None)
    resume_text = resume_asset.original_text if resume_asset else None

    matched_jobs = get_user_matched_jobs(db, user.id, limit=100000)

    # pre-compute resume keywords once (canonical-expanded for alias matching)
    have = extract_resume_keywords(resume_text) if resume_text else set()
    have_canonical = {_to_canonical(k) for k in have}

    # collect (mj_id, title, company, jd_text) for jobs with descriptions
    entries = []
    for mj in matched_jobs:
        job = mj.job
        if job and job.job_description:
            entries.append((mj.id, job.title or "", job.company or "", job.job_description))

    def _extract(entry):
        mj_id, title, company, jd = entry
        # whitelist-only: prevents non-tech noise (healthcare benefits, etc.) from T2 patterns
        jd_kws = scan_whitelist(jd)
        missing = {k for k in jd_kws if _to_canonical(k) not in have_canonical}
        return mj_id, title, company, jd_kws, missing

    missing_map: dict[str, dict] = {}
    all_map: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        for mj_id, title, company, jd_kws, missing in pool.map(_extract, entries):
            job_ref = {"id": mj_id, "title": title, "company": company}
            for skill in missing:
                if skill not in missing_map:
                    missing_map[skill] = {"count": 0, "jobs": []}
                missing_map[skill]["count"] += 1
                missing_map[skill]["jobs"].append(job_ref)
            for skill in jd_kws:
                if skill not in all_map:
                    all_map[skill] = {"count": 0, "jobs": []}
                all_map[skill]["count"] += 1
                all_map[skill]["jobs"].append(job_ref)

    def _sort(m):
        return sorted(
            [{"keyword": kw, "count": d["count"], "jobs": d["jobs"]} for kw, d in m.items()],
            key=lambda x: x["count"],
            reverse=True,
        )

    return {
        "keywords": _sort(missing_map),
        "all_keywords": _sort(all_map),
        "total_jobs_analyzed": len(entries),
    }


@router.get("/jobs/keyword-trends")
def get_keyword_trends(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    period: str = Query("day", pattern="^(day|week|month)$"),
):
    """Keyword frequency trends grouped by day/week/month using delivered_at."""
    from concurrent.futures import ThreadPoolExecutor
    from collections import defaultdict
    from datetime import datetime, timezone
    from src.evaluation.keyword_extractor import scan_whitelist, extract_resume_keywords, _to_canonical, is_technical

    matched_jobs = get_user_matched_jobs(db, user.id, limit=100000)

    resume_asset = next((a for a in user.resume_assets if a.is_active), None)
    resume_text = resume_asset.original_text if resume_asset else None
    have = extract_resume_keywords(resume_text) if resume_text else set()
    have_canonical = {_to_canonical(k) for k in have}

    ignored = {
        row.keyword
        for row in db.query(KeywordIgnore.keyword).filter(KeywordIgnore.user_id == user.id).all()
    }

    def _bucket_key(dt: datetime) -> str:
        if period == "day":
            return dt.strftime("%Y-%m-%d")
        if period == "week":
            # ISO week: YYYY-Www
            return dt.strftime("%G-W%V")
        # month
        return dt.strftime("%Y-%m")

    def _bucket_label(key: str) -> str:
        if period == "day":
            d = datetime.strptime(key, "%Y-%m-%d")
            return d.strftime("%b %-d")
        if period == "week":
            # parse ISO week
            d = datetime.strptime(key + "-1", "%G-W%V-%u")
            return f"Week of {d.strftime('%b %-d')}"
        d = datetime.strptime(key, "%Y-%m")
        return d.strftime("%B %Y")

    # group job entries by bucket
    buckets: dict[str, list] = defaultdict(list)
    for mj in matched_jobs:
        job = mj.job
        if not job or not job.job_description:
            continue
        dt = mj.delivered_at
        if dt is None:
            continue
        key = _bucket_key(dt)
        buckets[key].append((job.job_description, mj.id, job.title or "", job.company or ""))

    if not buckets:
        return {"period_type": period, "periods": []}

    def _extract_bucket(args):
        key, entries = args
        kw_counts: dict[str, int] = defaultdict(int)
        missing_counts: dict[str, int] = defaultdict(int)
        for jd, *_ in entries:
            for kw in scan_whitelist(jd):
                if kw in ignored:
                    continue
                kw_counts[kw] += 1
                if _to_canonical(kw) not in have_canonical:
                    missing_counts[kw] += 1
        top = sorted(kw_counts.items(), key=lambda x: x[1], reverse=True)[:60]
        top_missing = sorted(missing_counts.items(), key=lambda x: x[1], reverse=True)[:60]
        return key, len(entries), top, top_missing

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(_extract_bucket, buckets.items()))

    # sort periods newest-first
    results.sort(key=lambda x: x[0], reverse=True)

    periods = []
    for key, job_count, top_kws, top_missing in results:
        periods.append({
            "key": key,
            "label": _bucket_label(key),
            "job_count": job_count,
            "keywords": [{"keyword": kw, "count": cnt, "is_technical": is_technical(kw)} for kw, cnt in top_kws],
            "missing": [{"keyword": kw, "count": cnt, "is_technical": is_technical(kw)} for kw, cnt in top_missing],
        })

    return {"period_type": period, "periods": periods}


class KeywordReviewRequest(BaseModel):
    period_type: str
    period_key: str
    keyword: str
    reviewed: bool


class KeywordIgnoreRequest(BaseModel):
    keyword: str
    ignored: bool


@router.get("/jobs/keyword-ignore")
def list_keyword_ignores(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return the keywords this user has dismissed from the Keyword Bank."""
    rows = db.query(KeywordIgnore.keyword).filter(KeywordIgnore.user_id == user.id).all()
    return {"ignored": [r.keyword for r in rows]}


@router.post("/jobs/keyword-ignore", dependencies=[Depends(require_csrf)])
def set_keyword_ignore(
    body: KeywordIgnoreRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Add a keyword to (or remove it from) the user's ignore list."""
    row = db.query(KeywordIgnore).filter(
        KeywordIgnore.user_id == user.id,
        KeywordIgnore.keyword == body.keyword,
    ).first()
    if body.ignored and not row:
        db.add(KeywordIgnore(user_id=user.id, keyword=body.keyword))
    elif not body.ignored and row:
        db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/jobs/keyword-review")
def list_keyword_reviews(
    period_type: str = Query("week", pattern="^(day|week|month)$"),
    period_key: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return keywords the user has checked off for a given period_type (optionally one period_key)."""
    query = db.query(KeywordReview).filter(
        KeywordReview.user_id == user.id,
        KeywordReview.period_type == period_type,
        KeywordReview.reviewed == True,  # noqa: E712
    )
    if period_key:
        query = query.filter(KeywordReview.period_key == period_key)
    rows = query.all()
    return {"reviews": [{"period_key": r.period_key, "keyword": r.keyword} for r in rows]}


@router.post("/jobs/keyword-review", dependencies=[Depends(require_csrf)])
def set_keyword_review(
    body: KeywordReviewRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mark (or unmark) a keyword as reviewed for a given trend period."""
    row = db.query(KeywordReview).filter(
        KeywordReview.user_id == user.id,
        KeywordReview.period_type == body.period_type,
        KeywordReview.period_key == body.period_key,
        KeywordReview.keyword == body.keyword,
    ).first()
    if row:
        row.reviewed = body.reviewed
    else:
        row = KeywordReview(
            user_id=user.id,
            period_type=body.period_type,
            period_key=body.period_key,
            keyword=body.keyword,
            reviewed=body.reviewed,
        )
        db.add(row)
    db.commit()
    return {"ok": True}


@router.get("/jobs")
def list_jobs(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    status: str = Query(None),
    source: str = Query(None),
    date_range: str = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=2000),
):
    """Get delivered matched jobs for the signed-in user."""
    profile = get_or_create_profile(db, user.id)
    refresh_user_delivery(db, user.id)
    preferred_origin = get_preferred_delivery_origin(db, user.id)
    matched_jobs = get_user_matched_jobs(
        db,
        user.id,
        status=status,
        source=source,
        preferred_origin=preferred_origin,
        date_range=date_range,
        skip=skip,
        limit=limit,
    )
    serialized = [serialize_matched_job(matched_job) for matched_job in matched_jobs]
    match_scores = [job.get("Fit Score", 0) for job in serialized]
    total_count = count_user_matched_jobs(
        db,
        user.id,
        status=status,
        source=source,
        preferred_origin=preferred_origin,
        date_range=date_range,
    )
    status_counts = {
        "not_applied": count_user_matched_jobs(
            db,
            user.id,
            status="not_applied",
            source=source,
            preferred_origin=preferred_origin,
            date_range=date_range,
        ),
        "applied": count_user_matched_jobs(
            db,
            user.id,
            status="applied",
            source=source,
            preferred_origin=preferred_origin,
            date_range=date_range,
        ),
        "interviewing": count_user_matched_jobs(
            db,
            user.id,
            status="interviewing",
            source=source,
            preferred_origin=preferred_origin,
            date_range=date_range,
        ),
        "accepted": count_user_matched_jobs(
            db,
            user.id,
            status="accepted",
            source=source,
            preferred_origin=preferred_origin,
            date_range=date_range,
        ),
    }

    return {
        "jobs": serialized,
        "stats": {
            "total": total_count,
            "loaded": len(serialized),
            "status_counts": status_counts,
            "good_matches": len([score for score in match_scores if 70 <= score < 90]),
            "perfect_matches": len([score for score in match_scores if score >= 90]),
            "last_updated": "Live",
            "delivery_origin": preferred_origin or "",
        },
        "active_filters": profile.quality_filters or {},
    }


@router.get("/jobs/{job_id}")
def get_single_job(job_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Get a single delivered matched job by ID."""
    refresh_user_delivery(db, user.id)
    matched_job = require_matched_job(db, user.id, job_id)
    return serialize_matched_job(matched_job)


@router.get("/jobs/{job_id}/match-intelligence")
def get_match_intelligence(
    job_id: str,
    force: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return low-token cached AI match intelligence for a single delivered job."""
    refresh_user_delivery(db, user.id)
    matched_job = require_matched_job(db, user.id, job_id)
    result = load_match_intelligence(db, user, matched_job, force=force)
    return {
        "job_id": matched_job.id,
        "match_intelligence": result,
    }


@router.get("/jobs/{job_id}/events")
def get_job_events(
    job_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return application timeline events for one delivered job."""
    matched_job = require_matched_job(db, user.id, job_id)
    events = get_application_events(db, matched_job.id)
    return {
        "job_id": matched_job.id,
        "events": [serialize_application_event(event) for event in events],
    }


@router.get("/jobs/{job_id}/resumes")
def get_job_resume_versions(
    job_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return stored resume versions for one matched job."""
    matched_job = require_matched_job(db, user.id, job_id)
    resumes = get_job_resumes(db, matched_job.job_id)
    owned_paths = {matched_job.workspace_resume_path}
    owned_paths.update(
        (event.metadata_json or {}).get("pdf_path")
        for event in matched_job.application_events
        if event.event_type == "resume_generated"
    )
    return {
        "job_id": matched_job.id,
        "resumes": [serialize_resume(resume) for resume in resumes if resume.pdf_path in owned_paths],
    }


@router.patch("/jobs/{job_id}/status", dependencies=[Depends(require_csrf)])
def update_job_status(
    job_id: str,
    status: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update application status for a delivered matched job."""
    matched_job = require_matched_job(db, user.id, job_id)
    old_status = matched_job.user_status
    update_matched_job(db, job_id, user.id, user_status=status)
    if old_status != status:
        create_application_event(
            db,
            matched_job.id,
            event_type="status_changed",
            old_status=old_status,
            new_status=status,
            actor="user",
        )
    return {"message": "Status updated"}


@router.patch("/jobs/{job_id}/interest", dependencies=[Depends(require_csrf)])
def toggle_job_interest(
    job_id: str,
    special_interest: bool,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Star/unstar a delivered matched job."""
    matched_job = require_matched_job(db, user.id, job_id)
    update_matched_job(db, job_id, user.id, special_interest=special_interest)
    return {"message": "Interest updated"}


@router.patch("/jobs/{job_id}/notes", dependencies=[Depends(require_csrf)])
def update_job_notes(
    job_id: str,
    notes: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update notes for a delivered matched job."""
    matched_job = require_matched_job(db, user.id, job_id)
    update_matched_job(db, job_id, user.id, notes=notes)
    create_application_event(db, matched_job.id, "notes_saved")
    return {"message": "Notes updated"}


@router.patch("/jobs/{job_id}/analysis", dependencies=[Depends(require_csrf)])
def update_job_analysis(
    job_id: str,
    payload: JobAnalysisUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Persist edited role analysis for the matched job workspace."""
    matched_job = require_matched_job(db, user.id, job_id)

    matched_skills = []
    for category, skills in (payload.tech_stack or {}).items():
        if isinstance(skills, list):
            matched_skills.extend([skill for skill in skills if isinstance(skill, str)])

    next_ai_evaluation = {
        "ats_score": payload.ats_score,
        "location": payload.location,
        "tech_stack": payload.tech_stack or {},
        "suggested_tech_stack": payload.suggested_tech_stack or {},
        "points": payload.points or [],
    }
    refreshed = update_matched_job(
        db,
        job_id,
        user.id,
        workspace_location=payload.location,
        workspace_ats_score=payload.ats_score,
        workspace_matched_skills=matched_skills[:16],
        workspace_analysis=next_ai_evaluation,
    )
    if not refreshed:
        raise HTTPException(status_code=404, detail="Job not found")
    create_application_event(
        db,
        matched_job.id,
        event_type="analysis_updated",
        actor="user",
        metadata_json={
            "location": payload.location,
            "ats_score": payload.ats_score,
            "points_count": len(payload.points or []),
        },
    )

    return {"message": "Analysis updated", "job": serialize_matched_job(refreshed)}


@router.post("/jobs/{job_id}/resume", dependencies=[Depends(require_csrf)])
def generate_job_resume(
    job_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate a resume PDF directly from the matched-job workspace."""
    matched_job = require_matched_job(db, user.id, job_id)
    workspace = matched_job.workspace_analysis or {}
    tech_stack = workspace.get("suggested_tech_stack") or workspace.get("tech_stack") or {}
    points = workspace.get("points") or []
    user_name = user.full_name or "Candidate"
    resume_asset = get_active_resume_asset(db, user.id)
    if not resume_asset or not resume_asset.original_text.strip():
        raise HTTPException(status_code=400, detail="Upload a resume before generating a PDF.")

    try:
        from src.resume.pdf_export import export_resume_pdf
        pdf_path, pdf_url = export_resume_pdf(
            resume_text=resume_asset.original_text,
            location=matched_job.workspace_location or "",
            tech_stack=tech_stack,
            points=points,
            user_name=user_name,
        )
    except (OSError, ValueError) as error:
        raise HTTPException(status_code=500, detail="Could not generate the resume PDF. Please retry.") from error

    updated = update_matched_job(
        db,
        job_id,
        user.id,
        workspace_resume_path=pdf_path,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Job not found")
    resume_record = create_resume(db, matched_job.job_id, pdf_path)
    create_application_event(
        db,
        matched_job.id,
        event_type="resume_generated",
        actor="user",
        metadata_json={
            "resume_version": resume_record.version,
            "pdf_path": pdf_path,
        },
    )

    return {
        "success": True,
        "pdf_url": pdf_url,
        "pdf_path": pdf_path,
        "resume_version": resume_record.version,
        "job": serialize_matched_job(updated),
    }


class TailorRequest(BaseModel):
    job_description: Optional[str] = Field(default=None, max_length=50000)


@router.post("/jobs/{job_id}/tailor", dependencies=[Depends(require_csrf)])
def tailor_job_workspace(
    job_id: str,
    payload: Optional[TailorRequest] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate workspace-tailoring suggestions for a matched job and persist them on the matched job."""
    matched_job = require_matched_job(db, user.id, job_id)
    profile = get_or_create_profile(db, user.id)
    current_workspace = matched_job.workspace_analysis or {}
    resume_asset = next((a for a in user.resume_assets if a.is_active), None)
    resume_text = resume_asset.original_text if resume_asset else ""
    if not resume_text.strip():
        raise HTTPException(status_code=400, detail="Upload a resume before tailoring.")
    job_description = payload.job_description if payload and payload.job_description is not None else matched_job.job.job_description
    if not (job_description or "").strip():
        raise HTTPException(status_code=400, detail="Enter a job description before tailoring.")

    try:
        tailored_data = generate_tailored_resume_data(
            job_description,
            candidate_summary=profile.candidate_summary or "",
            resume_text=resume_text,
            current_location=matched_job.workspace_location or matched_job.job.location or "",
            current_tech_stack=current_workspace.get("tech_stack") or {},
            target_roles=profile.target_roles or [],
            seniority=profile.seniority or "",
        )
    except TailorServiceUnavailable as error:
        raise HTTPException(status_code=503, detail="AI tailoring is not configured for this workspace.") from error
    except TailorServiceError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    next_workspace = {
        "ats_score": tailored_data.get("ats_score"),
        "location": tailored_data.get("location") or matched_job.workspace_location or matched_job.job.location or "",
        "tech_stack": current_workspace.get("tech_stack") or {},
        "suggested_tech_stack": tailored_data.get("tech_stack") or current_workspace.get("suggested_tech_stack") or {},
        "points": tailored_data.get("points") or current_workspace.get("points") or [],
    }
    suggested_skills = []
    for skills in (tailored_data.get("tech_stack") or {}).values():
        if isinstance(skills, list):
            suggested_skills.extend([skill for skill in skills if isinstance(skill, str)])

    updated = update_matched_job(
        db,
        job_id,
        user.id,
        workspace_location=next_workspace["location"],
        workspace_ats_score=tailored_data.get("ats_score"),
        workspace_analysis=next_workspace,
        workspace_matched_skills=suggested_skills[:16] or matched_job.workspace_matched_skills,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Job not found")
    create_application_event(
        db,
        matched_job.id,
        event_type="tailor_generated",
        actor="user",
        metadata_json={
            "ats_score": tailored_data.get("ats_score"),
            "points_count": len(next_workspace.get("points") or []),
        },
    )

    return {
        "success": True,
        "tailored_data": next_workspace,
        "job": serialize_matched_job(updated),
    }


class CreateJobRequest(BaseModel):
    company: Optional[str] = None
    title: Optional[str] = None
    url: str = Field(default="", max_length=2048)
    description: Optional[str] = Field(default=None, max_length=50000)
    location: Optional[str] = None
    job_type: Optional[str] = None
    source: Optional[str] = "extension"
    salary: Optional[str] = None
    matched_skills: Optional[list] = None
    contact_info: Optional[dict] = None
    employment_type: Optional[str] = None


def _normalize_job_url(url: str) -> str:
    """Normalize job URLs to prevent dedup misses from tracking params or SPA variants.

    LinkedIn search pages embed the job ID in ?currentJobId=NNN — convert those
    to the canonical /jobs/view/NNN/ form so they match scraper-stored URLs.
    """
    import re
    from urllib.parse import urlparse, parse_qs
    try:
        parsed = urlparse(url)
        if "linkedin.com" in parsed.netloc:
            # Search results page: linkedin.com/jobs/search-results/?currentJobId=123...
            qs = parse_qs(parsed.query)
            if "currentJobId" in qs:
                job_id = qs["currentJobId"][0]
                return f"https://www.linkedin.com/jobs/view/{job_id}/"
            # Strip trailing query params from view pages (keep clean path)
            view_match = re.match(r"(https://[^/]*linkedin\.com/jobs/view/\d+)", url)
            if view_match:
                return view_match.group(1) + "/"
    except Exception:
        pass
    return url


DESCRIPTION_PLACEHOLDERS = {
    "about the job",
    "about the role",
    "job description",
    "show more",
    "show less",
}


def _clean_saved_description(value: Optional[str]) -> str:
    lines = [
        line.strip()
        for line in re.split(r"[\r\n]+", value or "")
        if line and line.strip()
    ]
    useful_lines = [line for line in lines if line.lower() not in DESCRIPTION_PLACEHOLDERS]
    description = re.sub(r"\s+", " ", "\n".join(useful_lines)).strip()
    if description.lower() in DESCRIPTION_PLACEHOLDERS:
        return ""
    return description[:50000]


def _should_replace_saved_description(current: Optional[str], incoming: str) -> bool:
    current_clean = _clean_saved_description(current)
    if not incoming:
        return False
    if not current_clean:
        return True
    if current_clean.lower() in DESCRIPTION_PLACEHOLDERS:
        return True
    return len(incoming) >= 80 and len(incoming) > len(current_clean) + 40


@router.post("/jobs", dependencies=[Depends(require_csrf)])
def create_job_manual(
    req: CreateJobRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Manually save a job (e.g. from the Chrome extension). Dedupes by URL and title+company."""
    from datetime import datetime as dt
    from src.models import Job, MatchedJob
    import uuid as _uuid

    raw_url = req.url.strip()
    if raw_url:
        from urllib.parse import urlparse
        parsed_url = urlparse(raw_url)
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
            raise HTTPException(status_code=400, detail="Enter a valid HTTP or HTTPS posting URL.")
    elif not (req.title or "").strip() or not (req.description or "").strip():
        raise HTTPException(status_code=400, detail="Enter a job title and description when no posting URL is provided.")
    canonical_url = _normalize_job_url(raw_url)
    if not canonical_url:
        import hashlib
        # Keep URL-less jobs distinct under the existing per-user URL constraint.
        identity = json.dumps([(req.title or "").strip(), (req.company or "").strip(), (req.description or "").strip()])
        canonical_url = "manual:" + hashlib.sha256(identity.encode("utf-8")).hexdigest()
    source = (req.source or "extension").lower()
    raw_title = (req.title or "").strip()
    raw_company = (req.company or "").strip()
    title = raw_title or "Untitled role"
    company = raw_company or "Unknown company"
    incoming_description = _clean_saved_description(req.description)

    # Dedupe by (user_id, job_link) — check both raw and normalized URL
    existing_job = (
        db.query(Job)
        .filter(
            Job.user_id == str(user.id),
            Job.job_link.in_([raw_url, canonical_url]),
        )
        .first()
    )
    # Fallback dedup: same title + company for this user. Skipped when either was
    # missing from the payload, since the placeholders would collide across unrelated jobs.
    if not existing_job and raw_title and raw_company:
        existing_job = (
            db.query(Job)
            .filter(
                Job.user_id == str(user.id),
                Job.title == title,
                Job.company == company,
            )
            .first()
        )
    if existing_job:
        matched = db.query(MatchedJob).filter(
            MatchedJob.user_id == str(user.id),
            MatchedJob.job_id == existing_job.id,
        ).first()
        if matched:
            should_commit = False
            was_archived = matched.delivery_status != "active"
            if was_archived:
                # User deleted (archived) this job previously, then re-saved it from the
                # extension. Bring it back instead of silently no-op'ing "already saved".
                matched.delivery_status = "active"
                matched.delivered_at = dt.utcnow()
                should_commit = True
            if source and (existing_job.source or "").strip().lower() in {"extension", "json-ld", ""}:
                existing_job.source = source
                should_commit = True
            if _should_replace_saved_description(existing_job.job_description, incoming_description):
                existing_job.job_description = incoming_description
                should_commit = True
            if req.location and not (existing_job.location or "").strip():
                existing_job.location = req.location
                should_commit = True
            if req.employment_type and not (existing_job.employment_type or "").strip():
                existing_job.employment_type = req.employment_type
                should_commit = True
            if should_commit:
                db.commit()
                db.refresh(matched)
            return {"created": was_archived, "job": serialize_matched_job(matched)}

    job = Job(
        id=str(_uuid.uuid4()),
        user_id=str(user.id),
        company=company,
        title=title,
        job_link=canonical_url,
        location=req.location or "",
        job_description=incoming_description,
        source=source,
        status="not_applied",
        matched_skills=req.matched_skills or [],
        date_added=dt.utcnow(),
        is_new=True,
        contact_info=req.contact_info or None,
        employment_type=req.employment_type or None,
    )
    db.add(job)
    db.flush()

    matched = MatchedJob(
        id=str(_uuid.uuid4()),
        user_id=str(user.id),
        job_id=job.id,
        delivery_origin="extension",
        delivery_status="active",
        user_status="not_applied",
        fit_score=0,
        base_skill_score=0,
        industry_boost=0,
        fit_reasons=[],
        job_industries=[],
        matched_industries=[],
        delivered_at=dt.utcnow(),
    )
    db.add(matched)
    db.commit()
    db.refresh(matched)

    return {"created": True, "job": serialize_matched_job(matched)}


@router.delete("/jobs/{job_id}", dependencies=[Depends(require_csrf)])
def delete_single_job(job_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Archive a delivered matched job so it no longer appears in the feed."""
    matched_job = update_matched_job(db, job_id, user.id, delivery_status="archived")
    if not matched_job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"message": "Job archived"}


@router.post("/jobs/backup", dependencies=[Depends(require_csrf)])
def backup_jobs():
    """Trigger backup of jobs database."""
    return {"message": "Backup triggered"}


_REQUIRED_SIGNAL_RE = re.compile(r"\b(required|must|need(?:ed)?|requirements?|minimum|at least|proficient|strong|expertise|hands-on|responsible for|you will)\b", re.IGNORECASE)
_PREFERRED_SIGNAL_RE = re.compile(r"\b(preferred|nice to have|nice-to-have|plus|bonus|familiarity|exposure|desired)\b", re.IGNORECASE)
_SENIOR_SIGNAL_RE = re.compile(r"\b(senior|lead|principal|staff|architect|manager|mentor|mentoring|leadership)\b", re.IGNORECASE)
_JUNIOR_SIGNAL_RE = re.compile(r"\b(junior|entry level|entry-level|intern|associate|0\+|1\+|2\+)\b", re.IGNORECASE)
_YEAR_RE = re.compile(r"(\d{1,2})\s*\+?\s*(?:years?|yrs?)", re.IGNORECASE)
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+|[\n\r•]+")


def _keyword_context(term: str, text: str) -> str:
    if not term or not text:
        return ""
    pattern = re.compile(r"(?<![a-z0-9])" + re.escape(term.lower()) + r"(?![a-z0-9])")
    for part in _SENTENCE_SPLIT_RE.split(text):
        cleaned = re.sub(r"\s+", " ", part).strip()
        if cleaned and pattern.search(cleaned.lower()):
            return cleaned[:240]
    return ""


def _keyword_priority(term: str, jd_text: str) -> str:
    context = _keyword_context(term, jd_text)
    if _REQUIRED_SIGNAL_RE.search(context):
        return "required"
    if _PREFERRED_SIGNAL_RE.search(context):
        return "preferred"
    return "standard"


def _keyword_weight(priority: str) -> int:
    return {"required": 3, "standard": 2, "preferred": 1}.get(priority, 2)


def _extract_years(text: str) -> int:
    years = [int(match.group(1)) for match in _YEAR_RE.finditer(text or "") if int(match.group(1)) < 40]
    return max(years) if years else 0


def _seniority_score(jd_text: str, resume_text: str) -> tuple[int, str]:
    jd = jd_text or ""
    resume = resume_text or ""
    jd_years = _extract_years(jd)
    resume_years = _extract_years(resume)
    if jd_years:
        if resume_years >= jd_years:
            return 100, f"Resume mentions {resume_years}+ years against a {jd_years}+ year requirement."
        if resume_years >= max(jd_years - 2, 0):
            return 70, f"Resume mentions {resume_years}+ years; JD asks for about {jd_years}+ years."
        return 40, f"JD asks for about {jd_years}+ years; make years of experience clearer in the resume."
    if _SENIOR_SIGNAL_RE.search(jd):
        return (85, "Senior/leadership language is visible in the resume.") if _SENIOR_SIGNAL_RE.search(resume) else (55, "JD reads senior; add leadership, ownership, mentoring, or architecture evidence if accurate.")
    if _JUNIOR_SIGNAL_RE.search(jd):
        return 90, "JD appears early-career friendly."
    return 80, "No strict years-of-experience requirement detected."


def _build_ats_report(keywords: list[dict], jd_text: str, resume_text: str) -> dict:
    visible = keywords or []
    if not visible:
        return {
            "score": 0,
            "grade": "Needs JD",
            "summary": "Paste a complete job description so the ATS check can identify requirements.",
            "breakdown": [],
            "top_missing": [],
            "critical_missing": [],
            "next_actions": ["Paste the full job description, then run the check again."],
        }

    total_weight = sum(item["weight"] for item in visible)
    matched_weight = sum(item["weight"] for item in visible if item["in_resume"])
    keyword_score = round((matched_weight / total_weight) * 100) if total_weight else 0

    required = [item for item in visible if item["priority"] == "required"]
    required_score = round((sum(item["weight"] for item in required if item["in_resume"]) / sum(item["weight"] for item in required)) * 100) if required else 85

    matched = [item for item in visible if item["in_resume"]]
    evidence_score = round((sum(min(item["resume_count"], 3) for item in matched) / (len(matched) * 3)) * 100) if matched else 0
    seniority, seniority_note = _seniority_score(jd_text, resume_text)
    final_score = round(keyword_score * 0.62 + required_score * 0.20 + evidence_score * 0.10 + seniority * 0.08)
    final_score = max(0, min(100, final_score))

    missing = [item for item in visible if not item["in_resume"]]
    top_missing = sorted(missing, key=lambda item: (-item["weight"], item["keyword"]))[:12]
    critical_missing = [item for item in top_missing if item["priority"] == "required"][:8]

    if final_score >= 85:
        grade = "Excellent"
        summary = "Strong ATS alignment. Keep the wording natural and add proof around any single-mention skills."
    elif final_score >= 72:
        grade = "Good"
        summary = "Good ATS alignment. Add the highest-priority missing terms only where they are truthful."
    elif final_score >= 55:
        grade = "Needs tailoring"
        summary = "The resume has some overlap, but several JD terms are missing or under-evidenced."
    else:
        grade = "High risk"
        summary = "This resume may be filtered out unless the missing core requirements are added with real evidence."

    next_actions = []
    if critical_missing:
        next_actions.append("Add truthful evidence for required terms: " + ", ".join(item["keyword"] for item in critical_missing[:5]) + ".")
    elif top_missing:
        next_actions.append("Consider adding relevant missing terms: " + ", ".join(item["keyword"] for item in top_missing[:5]) + ".")
    single_mentions = [item["keyword"] for item in matched if item["resume_count"] == 1][:5]
    if single_mentions:
        next_actions.append("Give stronger bullet evidence for single-mention skills: " + ", ".join(single_mentions) + ".")
    if seniority < 75:
        next_actions.append(seniority_note)
    if not next_actions:
        next_actions.append("Alignment is strong; keep the resume concise and mirror the JD wording for the most important skills.")

    return {
        "score": final_score,
        "grade": grade,
        "summary": summary,
        "breakdown": [
            {"label": "Weighted keyword coverage", "score": keyword_score, "weight": 62, "detail": f"{len(matched)} of {len(visible)} detected ATS terms are covered."},
            {"label": "Required-skill coverage", "score": required_score, "weight": 20, "detail": f"{sum(1 for item in required if item['in_resume'])} of {len(required)} required-context terms are covered." if required else "No explicit required-only skill list was detected."},
            {"label": "Evidence strength", "score": evidence_score, "weight": 10, "detail": "Repeated mentions score higher because ATS and recruiters see stronger proof."},
            {"label": "Experience alignment", "score": seniority, "weight": 8, "detail": seniority_note},
        ],
        "top_missing": top_missing,
        "critical_missing": critical_missing,
        "next_actions": next_actions,
    }


@router.post("/resume-check/extract", dependencies=[Depends(require_csrf)])
async def extract_resume_check_file(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Extract text from an uploaded resume file for the Resume Check page."""
    from api.onboarding import extract_text_from_file

    text = await extract_text_from_file(file)
    if len((text or "").strip()) < 50:
        raise HTTPException(status_code=400, detail="Resume text is too short. Upload a complete resume or paste the text.")
    return {
        "filename": file.filename,
        "text": text,
        "chars": len(text.strip()),
    }


class ResumeCheckAnalyzeRequest(BaseModel):
    resume_text: str
    jd_text: str


@router.post("/resume-check/analyze", dependencies=[Depends(require_csrf)])
def analyze_resume_check(
    body: ResumeCheckAnalyzeRequest,
    user: User = Depends(get_current_user),
):
    """Extract the tech stack a JD is asking for and flag which of those the resume already covers.

    Uses the same whitelist-based extraction and canonical alias resolution as the Keyword Bank,
    filtered to technical terms only — the point is the tech stack, not soft-skill phrases.
    """
    from src.evaluation.keyword_extractor import (
        scan_whitelist, extract_resume_keywords, _to_canonical, is_technical,
        count_term_occurrences, analyze_client_environments,
    )

    jd_text = body.jd_text or ""
    resume_text = body.resume_text or ""
    jd_keywords = [kw for kw in scan_whitelist(jd_text) if is_technical(kw)]

    # Order by first appearance in the JD so the list reads the way the posting was written,
    # rather than in whatever order a Python set happens to iterate.
    lowered_jd = jd_text.lower()
    jd_keywords.sort(key=lambda kw: lowered_jd.find(kw))

    have = extract_resume_keywords(resume_text)
    have_canonical = {_to_canonical(k) for k in have}

    keywords = []
    for kw in jd_keywords:
        priority = _keyword_priority(kw, jd_text)
        keywords.append({
            "keyword": kw,
            "in_resume": _to_canonical(kw) in have_canonical,
            "resume_count": count_term_occurrences(kw, resume_text),
            "priority": priority,
            "weight": _keyword_weight(priority),
            "context": _keyword_context(kw, jd_text),
        })

    return {
        "keywords": keywords,
        "ats": _build_ats_report(keywords, jd_text, resume_text),
        "client_environment_gaps": analyze_client_environments(resume_text),
    }
