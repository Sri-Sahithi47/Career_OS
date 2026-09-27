from types import SimpleNamespace
import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api import scraper_workspace as workspace
from api.deps import get_current_user, require_csrf


def test_authenticated_routing_and_action_allowlist(monkeypatch):
    app = FastAPI()
    app.include_router(workspace.router)
    calls = []
    monkeypatch.setattr(workspace, 'forward', lambda *args: calls.append(args) or {'ok': True})
    with TestClient(app) as client:
        assert client.get('/api/scraper-workspace/api/status').status_code == 401
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id='account-a')
        app.dependency_overrides[require_csrf] = lambda: None
        assert client.get('/api/scraper-workspace/api/jobs?vendor=roberthalf').status_code == 200
        assert calls[-1] == ('account-a', 'jobs', 'GET', None, {'vendor': 'roberthalf'})
        assert client.post('/api/scraper-workspace/api/jobs/ai-clean', json={'vendor': 'teksystems'}).status_code == 200
        assert client.get('/api/scraper-workspace/api/jobs/ai-clean').status_code == 404
        assert client.post('/api/scraper-workspace/api/config', json=[]).status_code == 422


def test_failed_scrape_releases_shared_lock(monkeypatch):
    monkeypatch.setattr(workspace, 'worker_for', lambda user: {})
    monkeypatch.setattr(workspace, 'output_stamp', lambda vendor, worker: None)
    monkeypatch.setattr(workspace, 'request_worker', lambda *args: httpx.Response(400, json={'ok': False}))
    assert workspace.forward('a', 'scrape', 'POST', {'vendors': []}, {}).status_code == 400
    assert not workspace.RUN_LOCK.locked()
    workspace.RUN_LOCK.acquire()
    try:
        assert workspace.forward('b', 'scrape', 'POST', {}, {}).status_code == 409
    finally:
        workspace.RUN_LOCK.release()


def test_finished_scrape_delivers_only_fresh_successful_outputs(monkeypatch):
    vendor = workspace.portals.VENDORS[0]
    worker = {'process': SimpleNamespace(poll=lambda: None)}
    monkeypatch.setattr(workspace, 'output_stamp', lambda v, w: ('new.json', 2))
    def request(w, action, **kwargs):
        return httpx.Response(200, request=httpx.Request('GET', 'http://local'), json=
            {'runs': [{'id': 'run', 'status': 'done', 'steps': [{'vendor': vendor.label, 'status': 'done'}]}]}
            if action == 'status' else {'jobs': [{'title': 'Python Engineer', 'job_url': 'https://example.com/job'}]})
    monkeypatch.setattr(workspace, 'request_worker', request)
    class DB:
        def __enter__(self): return self
        def __exit__(self, *args): pass
    monkeypatch.setattr(workspace, 'SessionLocal', DB)
    delivered = []
    monkeypatch.setattr(workspace, 'sync_delivered_jobs_for_user', lambda db, user, jobs, **kw: delivered.append((user, jobs, kw)))
    workspace.RUN_LOCK.acquire()
    workspace.finish_scrape(worker, 'run', 'owner', {vendor.slug: ('old.json', 1)})
    assert delivered[0][0] == 'owner'
    assert delivered[0][2] == {'replace_existing': False, 'preserve_user_state': True}
    assert not workspace.RUN_LOCK.locked()
    delivered.clear()
    workspace.RUN_LOCK.acquire()
    workspace.finish_scrape(worker, 'run', 'owner', {vendor.slug: ('new.json', 2)})
    assert delivered == []


def test_missing_status_stops_worker_before_unlock(monkeypatch):
    worker = {'process': SimpleNamespace(poll=lambda: None)}
    monkeypatch.setattr(workspace.time, 'sleep', lambda _: None)
    monkeypatch.setattr(workspace, 'request_worker', lambda *a, **kw: httpx.Response(
        200, request=httpx.Request('GET', 'http://local'), json={'runs': []}))
    def stop(w):
        assert workspace.RUN_LOCK.locked()
        w['process'] = SimpleNamespace(poll=lambda: -9)
    monkeypatch.setattr(workspace, 'stop_worker', stop)
    workspace.RUN_LOCK.acquire()
    workspace.finish_scrape(worker, 'lost', 'a', {})
    assert 'error' in worker
    assert not workspace.RUN_LOCK.locked()


def test_lost_start_response_stops_worker_before_unlock(monkeypatch):
    worker = {}
    monkeypatch.setattr(workspace, 'worker_for', lambda _: worker)
    monkeypatch.setattr(workspace, 'output_stamp', lambda *a: None)
    def fail(*args):
        raise httpx.ReadTimeout('response lost after server accepted scrape')
    monkeypatch.setattr(workspace, 'request_worker', fail)
    stopped = []
    def stop(w):
        assert workspace.RUN_LOCK.locked()
        stopped.append(w)
    monkeypatch.setattr(workspace, 'stop_worker', stop)
    from fastapi import HTTPException
    import pytest
    with pytest.raises(HTTPException):
        workspace.forward('a', 'scrape', 'POST', {}, {})
    assert stopped == [worker]
    assert not workspace.RUN_LOCK.locked()


def test_output_files_are_scoped_to_account(tmp_path):
    vendor = workspace.portals.VENDORS[0]
    a = {'directory': tmp_path / 'a'}
    b = {'directory': tmp_path / 'b'}
    output = a['directory'] / vendor.folder / 'output'
    output.mkdir(parents=True)
    (output / f'{vendor.prefix}_jobs_1.json').write_text('[]')
    assert workspace.output_stamp(vendor, a)
    assert workspace.output_stamp(vendor, b) is None


def test_failed_portal_delivery_does_not_block_other_portals(monkeypatch):
    first, second = workspace.portals.VENDORS[:2]
    worker = {'process': SimpleNamespace(poll=lambda: None)}
    monkeypatch.setattr(workspace, 'output_stamp', lambda *a: ('new.json', 2))
    def request(w, action, **kwargs):
        if action == 'status':
            body = {'runs': [{'id': 'run', 'status': 'done', 'steps': [
                {'vendor': v.label, 'status': 'done'} for v in [first, second]]}]}
        elif kwargs['query']['vendor'] == first.slug:
            raise httpx.ReadTimeout('portal output unavailable')
        else:
            body = {'jobs': [{'title': '', 'job_url': 'bad'}, {'title': 'Python Engineer', 'job_url': 'https://example.com/valid'}]}
        return httpx.Response(200, request=httpx.Request('GET', 'http://local'), json=body)
    monkeypatch.setattr(workspace, 'request_worker', request)
    class DB:
        def __enter__(self): return self
        def __exit__(self, *args): pass
    monkeypatch.setattr(workspace, 'SessionLocal', DB)
    delivered = []
    monkeypatch.setattr(workspace, 'sync_delivered_jobs_for_user', lambda db, user, jobs, **kw: delivered.extend(jobs))
    workspace.RUN_LOCK.acquire()
    workspace.finish_scrape(worker, 'run', 'owner', {})
    assert len(delivered) == 1
    assert delivered[0]['job_link'] == 'https://example.com/valid'
    assert worker['last_error']
    assert not workspace.RUN_LOCK.locked()


def test_unconfirmed_worker_shutdown_keeps_lock(monkeypatch):
    import pytest
    worker = {'process': SimpleNamespace(poll=lambda: None)}
    monkeypatch.setattr(workspace, 'RUN_TIMEOUT_SECONDS', -1)
    def fail(worker):
        raise OSError('Could not terminate process')
    monkeypatch.setattr(workspace, 'stop_worker', fail)
    workspace.RUN_LOCK.acquire()
    try:
        with pytest.raises(OSError):
            workspace.finish_scrape(worker, 'run', 'owner', {})
        assert workspace.RUN_LOCK.locked()
    finally:
        workspace.RUN_LOCK.release()
