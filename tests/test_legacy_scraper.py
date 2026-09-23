from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import legacy_scraper as legacy
from api.deps import get_current_user, require_csrf
from src.portal_scraper import RUN_LOCK


def test_original_dashboard_controls_and_account_isolation(tmp_path, monkeypatch):
    monkeypatch.setattr(legacy.settings, 'DATA_DIR', tmp_path)
    monkeypatch.setattr(legacy, 'DASHBOARDS', {})
    app = FastAPI()
    app.include_router(legacy.router)
    with TestClient(app) as client:
        assert client.get('/api/legacy-scraper/ui').status_code == 401
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id='first')
        app.dependency_overrides[require_csrf] = lambda: None
        html = client.get('/api/legacy-scraper/ui').json()['html']
        for label in ['Job Portal Control', 'Open limit', 'Keep open minutes', 'Fill & Submit Queue', 'Scrape Checked']:
            assert label in html
        assert client.post('/api/legacy-scraper/api/config', json={'keywords': ['unique keyword']}).status_code == 200
        assert client.get('/api/legacy-scraper/api/config').json()['config']['keywords'] == ['unique keyword']
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id='second')
        assert client.get('/api/legacy-scraper/api/config').json()['config']['keywords'] != ['unique keyword']
        assert client.get('/api/legacy-scraper/api/status').status_code == 200
        assert client.post('/api/legacy-scraper/api/scrape', json={'vendors': []}).status_code == 400
        assert not RUN_LOCK.locked()
        RUN_LOCK.acquire()
        try:
            assert client.post('/api/legacy-scraper/api/scrape', json={'mode': 'all'}).status_code == 409
        finally:
            RUN_LOCK.release()
        module = legacy.dashboard_for('second')
        calls = []
        monkeypatch.setattr(module, 'start_judge_apply', lambda config, payload: calls.append(payload) or {'count': 1})
        # Check routing only: never launch an application submission during tests.
        assert client.post('/api/legacy-scraper/api/judge-apply', json={'submit': False}).status_code == 200
        assert calls == [{'submit': False}]


def test_success_callback_delivers_and_releases_lock(tmp_path, monkeypatch):
    monkeypatch.setattr(legacy.settings, 'DATA_DIR', tmp_path)
    monkeypatch.setattr(legacy, 'DASHBOARDS', {})
    module = legacy.dashboard_for('callback-test')
    imported = []
    class DB:
        def __enter__(self): return self
        def __exit__(self, *args): pass
    monkeypatch.setattr(legacy, 'SessionLocal', DB)
    monkeypatch.setattr(legacy, 'sync_delivered_jobs_for_user', lambda db, user, jobs, **kw: imported.append((user, jobs, kw)))
    def start(kind, vendors, config, on_success=None, on_finished=None):
        on_success(module.VENDORS[0], [{'title': 'Python Engineer', 'job_url': 'https://example.com/jobs/1'}])
        on_finished()
        return 'test-run'
    monkeypatch.setattr(module, 'start_run', start)
    response = legacy.dispatch(module, 'scrape', 'POST', {'vendors': ['teksystems']}, {}, 'callback-test')
    assert response.status_code == 200
    assert imported[0][0] == 'callback-test'
    assert imported[0][1][0]['title'] == 'Python Engineer'
    assert imported[0][2] == {'replace_existing': False, 'preserve_user_state': True}
    assert not RUN_LOCK.locked()
