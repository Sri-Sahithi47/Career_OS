"""Opt-in, per-workspace cache for parsed detail responses, never search listings."""
import functools
import hashlib
import inspect
import json
import os
from pathlib import Path
import tempfile
import time

CACHE_VERSION = 1
MAX_AGE_SECONDS = 6 * 60 * 60


def useful_detail(value):
    if not isinstance(value, dict):
        return False
    description = next((value.get(k) for k in ('description', 'jobDescription', 'jobdescription', 'jobDesc')
                        if isinstance(value.get(k), str) and len(value[k].strip()) >= 100), '')
    return bool(description) and not any(marker in description.lower() for marker in
                                        ('verify you are human', 'access denied', 'enable javascript and cookies'))


def cached_detail(namespace, key_arg, validator=useful_detail):
    """Cache only validated results. Incomplete/error responses are always retried."""
    def decorate(fn):
        signature = inspect.signature(fn)
        # Adapter code changes invalidate responses parsed by an older implementation.
        try:
            version = hashlib.sha256(inspect.getsource(fn).encode()).hexdigest()
        except (OSError, TypeError):
            version = str(CACHE_VERSION)
        @functools.wraps(fn)
        def wrapped(*args, **kwargs):
            hint = kwargs.pop('_cache_hint', None)
            root = os.environ.get('CAREEROS_DETAIL_CACHE')
            if not root:
                return fn(*args, **kwargs)
            bound = signature.bind(*args, **kwargs)
            identity = bound.arguments.get(key_arg)
            if not identity:
                return fn(*args, **kwargs)
            key = hashlib.sha256(json.dumps([namespace, str(identity), hint, version, CACHE_VERSION]).encode()).hexdigest()
            path = Path(root) / namespace / (key + '.json')
            cached = None
            try:
                cached = json.loads(path.read_text())
                if (os.environ.get('CAREEROS_FORCE_REFRESH') != '1'
                    and 0 <= time.time() - cached['stored_at'] < MAX_AGE_SECONDS
                    and validator(cached['value'])):
                    return cached['value']
            except (OSError, ValueError, KeyError, TypeError):
                cached = None
            value = fn(*args, **kwargs)
            if validator(value):
                # Do not cache a suspiciously truncated refresh over a known good response.
                if cached and validator(cached.get('value')):
                    old_size = len(json.dumps(cached['value']))
                    if len(json.dumps(value)) < old_size * .7:
                        return value
                temp = None
                try:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as out:
                        temp = out.name
                        json.dump({'stored_at': time.time(), 'value': value}, out)
                    os.replace(temp, path)
                except OSError:
                    pass  # A cache failure must not prevent fetching a posting.
                finally:
                    if temp:
                        try:
                            Path(temp).unlink(missing_ok=True)
                        except OSError:
                            pass
            return value
        return wrapped
    return decorate
