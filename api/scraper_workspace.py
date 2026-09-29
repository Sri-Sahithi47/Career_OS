"""Authenticated bridge to the redesigned upstream Java/React scraper dashboard."""
import atexit
import json
import hashlib
import logging
import os
import signal
import re
import secrets
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from api.deps import get_current_user, require_csrf
from api.legacy_scraper import dashboard_for
from src.models import User
from src.portal_scraper import RUN_LOCK, normalize_job, portals
from src.crud import sync_delivered_jobs_for_user
from src.database import SessionLocal
from src.settings import settings

router = APIRouter(prefix='/api/scraper-workspace', tags=['scraper workspace'])
ROOT = portals.ROOT / 'java-dashboard'
WORKERS = {}
WORKER_LOCK = threading.Lock()
logger = logging.getLogger(__name__)
RUN_TIMEOUT_SECONDS = 4 * 60 * 60
MAX_STATUS_FAILURES = 5
GET_ACTIONS = {'config', 'status', 'jobs', 'collected'}
POST_ACTIONS = {'config', 'scrape', 'scrape/stop', 'open', 'open/stop',
                'jobs/ai-clean', 'jobs/ai-reset', 'jobs/open-urls', 'collected/review'}


def stop_worker(worker):
    """Stop the worker and its browser children before allowing another run."""
    process = worker['process']
    if os.name == 'posix':
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    elif process.poll() is None:
        subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                       check=True, capture_output=True, timeout=10)
    process.wait(timeout=10)


@atexit.register
def stop_workers():
    for worker in list(WORKERS.values()):
        try:
            stop_worker(worker)
        except Exception:
            logger.exception('Could not stop scraper worker')


def request_worker(worker, action, method='GET', payload=None, query=None, timeout=None):
    return httpx.request(method, worker['url'] + '/api/' + action,
                         headers={'X-Workspace-Token': worker['token']},
                         json=payload if method == 'POST' else None, params=query,
                         timeout=timeout if timeout is not None else (1800 if action == 'jobs/ai-clean' else 30))


def worker_for(user_id):
    with WORKER_LOCK:
        current = WORKERS.get(user_id)
        if current and current['process'].poll() is None:
            return current
        jar = ROOT / 'backend/target/dashboard-1.0.0.jar'
        if not jar.exists():
            raise HTTPException(503, 'Run bash scripts/build-scraper.sh to build the scraper workspace.')
        directory = settings.DATA_DIR / 'portal_dashboard' / user_id / 'workspace'
        directory.mkdir(parents=True, exist_ok=True)
        config = directory / 'job_portal_dashboard_config.json'
        if not config.exists():
            config.write_text(json.dumps(dashboard_for(user_id).load_config()))
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        token = secrets.token_urlsafe(32)
        log_path = directory / 'backend.log'
        if log_path.exists() and log_path.stat().st_size > 5_000_000:
            log_path.replace(directory / 'backend.previous.log')
        with log_path.open('a') as log:
            process = subprocess.Popen([
                'java', '-Xmx256m', f'-Ddashboard.state={directory.resolve()}',
                f'-Ddashboard.python={sys.executable}', f'-Ddashboard.token={token}',
                '-jar', str(jar), '--server.address=127.0.0.1', f'--server.port={port}',
            ], cwd=ROOT / 'backend', stdout=log, stderr=subprocess.STDOUT,
               start_new_session=os.name == 'posix')
        worker = {'process': process, 'url': f'http://127.0.0.1:{port}', 'token': token, 'directory': directory, 'last_error': current.get('error', '') if current else ''}
        for _ in range(150):
            if process.poll() is not None:
                raise HTTPException(503, 'Scraper backend could not start. Check its backend.log.')
            try:
                if request_worker(worker, 'status', timeout=1).status_code == 200:
                    WORKERS[user_id] = worker
                    return worker
            except httpx.HTTPError:
                pass
            time.sleep(.2)
        stop_worker(worker)
        raise HTTPException(503, 'Scraper backend startup timed out.')


@router.get('/ui')
def workspace_ui(user: User = Depends(get_current_user)):
    dist = ROOT / 'frontend/dist'
    index = dist / 'index.html'
    if not index.exists():
        raise HTTPException(503, 'Run bash scripts/build-scraper.sh to build the scraper workspace.')
    verify_ui_build(ROOT / 'frontend')
    html = index.read_text()
    def script(match):
        source = (dist / match[1].lstrip('/')).read_text().replace('</script', '<\\/script')
        return '<script type="module">' + source + '</script>'
    html = re.sub(r'<script[^>]+src="([^"]+)"[^>]*></script>', script, html)
    html = re.sub(r'<link[^>]+href="([^"]+\.css)"[^>]*>',
                  lambda m: '<style>' + (dist / m[1].lstrip('/')).read_text() + '</style>', html)
    return JSONResponse({'html': html}, headers={'Cache-Control': 'no-store'})


def verify_ui_build(frontend):
    """Never silently serve a local build left behind by an earlier checkout."""
    def hashes(base, paths):
        return {path.relative_to(base).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
                for path in paths if path.is_file()}
    try:
        manifest = json.loads((frontend / 'dist/build-integrity.json').read_text())
        inputs = [path for folder in ('src', 'public') for path in (frontend / folder).rglob('*')]
        inputs += [frontend / name for name in ('index.html', 'package.json', 'package-lock.json',
                                               'vite.config.js', 'build-integrity.js')]
        output = frontend / 'dist'
        assets = [path for path in output.rglob('*') if path.name != 'build-integrity.json']
        if manifest['sources'] == hashes(frontend, inputs) and manifest['assets'] == hashes(output, assets):
            return
    except (OSError, ValueError, KeyError, TypeError):
        pass
    raise HTTPException(503, 'The scraper UI build is outdated or incomplete. Stop the app, run '
                        'bash scripts/build-scraper.sh, then restart with bash dev.sh. '
                        'On Windows, run npm ci and npm run build in services/job_scrapper/java-dashboard/frontend.')


def output_stamp(vendor, worker):
    directory = worker['directory'] / vendor.folder / 'output'
    path = max(directory.glob(f'{vendor.prefix}_jobs_*.json'),
               key=lambda p: p.stat().st_mtime_ns, default=None)
    return (str(path), path.stat().st_mtime_ns) if path else None


def finish_scrape(worker, run_id, user_id, before):
    """Keep the shared output lock until the Java run ends, then deliver fresh results."""
    started = time.monotonic()
    failures = 0
    last_collection_state = None
    try:
        while worker['process'].poll() is None:
            if time.monotonic() - started > RUN_TIMEOUT_SECONDS:
                raise TimeoutError('Scrape exceeded the four-hour run limit.')
            try:
                response = request_worker(worker, 'status')
                response.raise_for_status()
                run = next((r for r in response.json()['runs'] if r['id'] == run_id), None)
                if run is None:
                    raise ValueError('The scraper lost its active run status.')
                failures = 0
                collection_state = json.dumps(run.get('steps', []), sort_keys=True) + run['status']
                if worker.get('directory') and collection_state != last_collection_state:
                    try:
                        from src.collected_jobs import import_outputs, record_run
                        with SessionLocal() as collection_db:
                            import_outputs(collection_db, user_id, worker['directory'], portals.VENDORS)
                            record_run(collection_db, user_id, run)
                        last_collection_state = collection_state
                    except Exception:
                        logger.exception('Collection will retry importing run %s', run_id)
                        worker['last_error'] = 'Collection import delayed. Saved output files will be retried.'
                if run['status'] not in {'running', 'stopping'}:
                    for step in run.get('steps', []):
                        slug = step.get('vendor')
                        vendor = next((v for v in portals.VENDORS if v.slug == slug or v.label == slug), None)
                        if not vendor or step.get('status') != 'done' or output_stamp(vendor, worker) == before.get(vendor.slug):
                            continue
                        try:
                            result = request_worker(worker, 'jobs', query={'vendor': vendor.slug})
                            result.raise_for_status()
                            jobs = {}
                            for row in result.json().get('jobs', []):
                                try:
                                    job = normalize_job(row, vendor)
                                    jobs[job['job_link']] = job
                                except (ValueError, TypeError, AttributeError):
                                    logger.warning('Skipped malformed job from portal %s', vendor.slug)
                            with SessionLocal() as db:
                                sync_delivered_jobs_for_user(db, user_id, list(jobs.values()),
                                                             replace_existing=False, preserve_user_state=True)
                        except Exception:
                            logger.exception('Could not deliver portal %s for run %s', vendor.slug, run_id)
                            worker['last_error'] = 'Some portal results could not be delivered. They remain in scraper results; retry saving them.'
                    return
            except (httpx.HTTPError, ValueError, KeyError) as exc:
                failures += 1
                if failures >= MAX_STATUS_FAILURES:
                    raise RuntimeError('Scraper monitoring failed repeatedly. Retry the search.') from exc
                time.sleep(2)
                continue
            time.sleep(1)
        raise RuntimeError('Scraper worker exited before delivery completed.')
    except Exception as exc:
        worker['error'] = str(exc)
        logger.exception('Scraper run %s failed', run_id)
        stop_worker(worker)
    finally:
        # Never unlock while an unresponsive process may still be writing results.
        if 'error' not in worker or worker['process'].poll() is not None:
            RUN_LOCK.release()


def forward(user_id, action, method, payload, query):
    if action in {'collected', 'collected/review'}:
        from api.collected_jobs import collection_action
        directory = settings.DATA_DIR / 'portal_dashboard' / str(user_id) / 'workspace'
        return collection_action(str(user_id), action, method, payload, query, directory, portals.VENDORS)
    worker = worker_for(user_id)
    locked = action == 'scrape' and method == 'POST'
    if locked and not RUN_LOCK.acquire(blocking=False):
        return JSONResponse({'error': 'A scrape is already running. Wait for it to finish.'}, status_code=409)
    try:
        before = {v.slug: output_stamp(v, worker) for v in portals.VENDORS} if locked else {}
        response = request_worker(worker, action, method, payload, query)
        body = response.json()
        if action == 'status' and worker.get('last_error'):
            body['last_error'] = worker['last_error']
        if locked and response.is_success and body.get('run_id'):
            if worker.get('directory'):
                try:
                    from src.collected_jobs import record_run
                    snapshot = json.loads((worker['directory'] / 'job_portal_dashboard_config.json').read_text())
                    with SessionLocal() as db:
                        record_run(db, user_id, {'id': body['run_id'], 'status': 'running'}, snapshot)
                except Exception:
                    logger.exception('Could not record search settings for run')
            threading.Thread(target=finish_scrape, args=(worker, body['run_id'], user_id, before), daemon=True).start()
            locked = False
        return JSONResponse(body, status_code=response.status_code)
    except (httpx.HTTPError, ValueError) as exc:
        if locked:
            locked = False
            stop_worker(worker)
            RUN_LOCK.release()
        raise HTTPException(502, 'Scraper backend request failed.') from exc
    finally:
        if locked:
            RUN_LOCK.release()


@router.api_route('/api/{action:path}', methods=['GET', 'POST'], dependencies=[Depends(require_csrf)])
async def workspace_action(action: str, request: Request, user: User = Depends(get_current_user)):
    if action not in (GET_ACTIONS if request.method == 'GET' else POST_ACTIONS):
        raise HTTPException(404, 'Unknown scraper control')
    payload = await request.json() if request.method == 'POST' else None
    if request.method == 'POST' and not isinstance(payload, dict):
        raise HTTPException(422, 'Expected a JSON object')
    return await run_in_threadpool(forward, user.id, action, request.method, payload, dict(request.query_params))
