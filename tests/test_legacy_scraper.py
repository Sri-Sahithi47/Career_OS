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


def test_legacy_outputs_and_commands_are_account_scoped(tmp_path, monkeypatch):
    monkeypatch.setattr(legacy.settings, 'DATA_DIR', tmp_path)
    monkeypatch.setattr(legacy, 'DASHBOARDS', {})
    a = legacy.dashboard_for('owner-a')
    b = legacy.dashboard_for('owner-b')
    vendor = a.VENDORS[0]
    command = a.command_for_scrape(vendor, a.default_config())
    output = a.STATE_ROOT / vendor.folder / 'output'
    assert command[command.index('--out-dir') + 1] == str(output)
    (output / f'{vendor.prefix}_jobs_test.json').write_text('[]')
    assert a.latest_jobs_file(vendor)
    assert b.latest_jobs_file(vendor) is None
    opener = a.command_for_open(vendor, a.default_config(), {})
    assert opener[opener.index('--out-dir') + 1] == str(output)


def test_seen_history_uses_account_path_not_import_time_default(tmp_path, monkeypatch):
    monkeypatch.setattr(legacy.settings, 'DATA_DIR', tmp_path)
    monkeypatch.setattr(legacy, 'DASHBOARDS', {})
    a, b = legacy.dashboard_for('seen-a'), legacy.dashboard_for('seen-b')
    a.save_seen_state({'vendors': {'teksystems': {'keys': ['job-1']}}})
    assert 'teksystems' in a.load_seen_state()['vendors']
    assert b.load_seen_state() == {'vendors': {}}


def test_applied_marks_survive_days(tmp_path, monkeypatch):
    import time
    monkeypatch.setattr(legacy.settings, 'DATA_DIR', tmp_path)
    monkeypatch.setattr(legacy, 'DASHBOARDS', {})
    module = legacy.dashboard_for('persistent-history')
    module.save_applied_marks({'job-1': {'marked_at': time.time() - 7 * 86400}})
    assert 'job-1' in module.load_applied_marks()


def test_mitchell_martin_command_uses_selected_keywords(tmp_path, monkeypatch):
    monkeypatch.setattr(legacy.settings, 'DATA_DIR', tmp_path)
    monkeypatch.setattr(legacy, 'DASHBOARDS', {})
    module = legacy.dashboard_for('keyword-test')
    vendor = next(v for v in module.VENDORS if v.slug == 'mitchellmartin')
    command = module.command_for_scrape(vendor, {'keywords': ['java developer', 'spring boot']})
    terms = [command[i + 1] for i, item in enumerate(command) if item == '--term']
    assert terms == ['java developer', 'spring boot']
