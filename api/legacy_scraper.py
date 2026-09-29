"""Serve the original portal dashboard through Career OS authentication."""
import importlib.util
import sys
import threading
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from api.deps import get_current_user, require_csrf
from src.models import User
from src.portal_scraper import RUN_LOCK, normalize_job, portals
from src.crud import sync_delivered_jobs_for_user
from src.database import SessionLocal
from src.settings import settings

router = APIRouter(prefix="/api/legacy-scraper", tags=["portal dashboard"])
DASHBOARDS = {}
DASHBOARD_LOCK = threading.Lock()
ACTIONS = {'config', 'status', 'jobs', 'scrape', 'open', 'stop', 'open-job', 'open-new-jobs', 'applied', 'judge-apply'}


def dashboard_for(user_id):
    # The original UI uses module-level state. Give each account its own instance.
    with DASHBOARD_LOCK:
        if user_id not in DASHBOARDS:
            name = f"careeros_portal_dashboard_{user_id.replace('-', '_')}"
            spec = importlib.util.spec_from_file_location(name, portals.ROOT / 'job_portal_dashboard.py')
            module = importlib.util.module_from_spec(spec)
            sys.modules[name] = module
            spec.loader.exec_module(module)
            directory = settings.DATA_DIR / 'portal_dashboard' / user_id
            directory.mkdir(parents=True, exist_ok=True)
            module.STATE_ROOT = directory / 'workspace'
            for field in ['CONFIG', 'APPLIED', 'CLICKS', 'SEEN']:
                setattr(module, field + '_PATH', directory / (field.lower() + '.json'))
            DASHBOARDS[user_id] = module
        return DASHBOARDS[user_id]


@router.get('/ui')
def original_ui(user: User = Depends(get_current_user)):
    return {'html': dashboard_for(user.id).HTML}


def dispatch(module, action, method, payload, query, user_id):
    class Adapter(module.Handler):
        def __init__(self):
            self.path = '/api/' + action
            if method == 'GET' and query:
                self.path += '?' + urlencode(query)
            self.result = JSONResponse({'error': 'No response'}, status_code=500)

        def read_json(self):
            return payload

        def send_json(self, body, status=200):
            self.result = JSONResponse(body, status_code=status)

        def send_error(self, code, message=None):
            self.result = JSONResponse({'error': message or 'Unknown control'}, status_code=code)

        def on_scrape_success(self, vendor, rows):
            jobs = {job['job_link']: job for job in (normalize_job(row, vendor) for row in rows)}
            with SessionLocal() as db:
                sync_delivered_jobs_for_user(db, user_id, list(jobs.values()),
                                             replace_existing=False, preserve_user_state=True)

        def on_scrape_finished(self):
            RUN_LOCK.release()

    handler = Adapter()
    locked = method == 'POST' and action == 'scrape'
    if locked and not RUN_LOCK.acquire(blocking=False):
        return JSONResponse({'error': 'A scrape is already running. Wait for it to finish.'}, status_code=409)
    try:
        if method == 'GET':
            handler.do_GET()
        else:
            handler.do_POST()
    except Exception as exc:
        if locked:
            RUN_LOCK.release()
        return JSONResponse({'error': str(exc)}, status_code=400)
    if locked and handler.result.status_code != 200:
        RUN_LOCK.release()
    return handler.result


@router.api_route('/api/{action}', methods=['GET', 'POST'], dependencies=[Depends(require_csrf)])
async def dashboard_action(action: str, request: Request, user: User = Depends(get_current_user)):
    if action not in ACTIONS:
        raise HTTPException(404, 'Unknown dashboard control')
    payload = await request.json() if request.method == 'POST' else {}
    if not isinstance(payload, dict):
        raise HTTPException(422, 'Expected a JSON object')
    return await run_in_threadpool(dispatch, dashboard_for(user.id), action, request.method,
                                   payload, dict(request.query_params), user.id)
