"""Offline integration checks: normalize, import twice, isolate users, reject stale output."""
import json
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.database import Base
from src.models import User, Job, MatchedJob
from src.crud import sync_delivered_jobs_for_user
from src.portal_scraper import normalize_job, scrape_vendor, portals


@pytest.fixture
def db(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'portal.db'}")
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as session:
        yield session
    engine.dispose()


def test_import_is_idempotent_and_preserves_user_state(db):
    users = [User(username=name, hashed_password='unused') for name in ['one', 'two']]
    db.add_all(users)
    db.commit()
    vendor = portals.VENDOR_BY_SLUG['teksystems']
    row = {'title': 'Senior Python Engineer', 'job_url': 'https://jobs.example/123?utm_source=x',
           'employment_type': 'Contract', 'raw_text': 'Python API role', 'job_id': '123'}
    payload = normalize_job(row, vendor)
    first = sync_delivered_jobs_for_user(db, users[0].id, [payload])[0]
    first.user_status = 'applied'
    first.notes = 'Interview next week'
    first.special_interest = True
    first.job.status = 'applied'
    first.job.special_interest = True
    db.commit()
    payload['job_description'] = 'Updated Python role'
    payload['special_interest'] = False
    sync_delivered_jobs_for_user(db, users[0].id, [payload], preserve_user_state=True)
    db.refresh(first)
    assert db.query(Job).count() == 1
    assert db.query(MatchedJob).count() == 1
    assert first.user_status == 'applied'
    assert first.notes == 'Interview next week'
    assert first.special_interest and first.job.special_interest
    assert first.job.employment_type == 'Contract'
    assert first.job.contact_info['portal_job_id'] == '123'
    assert first.job.job_description == 'Updated Python role'
    sync_delivered_jobs_for_user(db, users[1].id, [payload])
    assert db.query(Job).count() == 2
    assert db.query(MatchedJob).filter_by(user_id=users[1].id).one().user_status == 'not_applied'


def test_normalization_retains_identity_and_metadata():
    vendor = portals.VENDOR_BY_SLUG['opensystemstechnologies']
    job = normalize_job({'title': 'Engineer', 'job_url': 'https://EXAMPLE.com/jobs?id=42&utm_source=test#job',
                         'posted_date': '2026-09-22T10:00:00-04:00', 'remote_status': 'Remote'}, vendor)
    assert job['job_link'] == 'https://example.com/jobs?id=42#job'
    assert len(job['source']) <= 20
    assert job['posting_date'].hour == 14
    assert job['contact_info']['portal'] == vendor.slug
    assert job['contact_info']['remote_status'] == 'Remote'
    with pytest.raises(ValueError):
        normalize_job({'title': 'Bad', 'job_url': 'javascript:alert(1)'}, vendor)


def test_no_reimport_of_old_output_after_success_without_new_file(tmp_path, monkeypatch):
    from src import portal_scraper
    output = tmp_path / 'old.json'
    output.write_text(json.dumps([]))
    monkeypatch.setattr(portals, 'latest_jobs_file', lambda vendor: output)
    monkeypatch.setattr(portals, 'command_for_scrape', lambda *args: ['unused'])
    monkeypatch.setattr(portal_scraper.subprocess, 'run', lambda *args, **kw: SimpleNamespace(returncode=0))
    with pytest.raises(RuntimeError, match='fresh output'):
        scrape_vendor(portals.VENDORS[0], {})


def test_portal_api_requires_auth_and_rejects_unknown_portal(db):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from api.portals import router
    from api.deps import get_db, get_current_user, require_csrf
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        assert client.get('/api/portals').status_code == 401
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id='test')
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[require_csrf] = lambda: None
        response = client.post('/api/portals/scrape', json={'vendors': ['../../bad'], 'keywords': ['python']})
        assert response.status_code == 422
        assert len(client.get('/api/portals').json()['vendors']) == 33
