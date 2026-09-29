from detail_cache import cached_detail, MAX_AGE_SECONDS
import detail_cache
import pytest


def test_cache_reuses_good_details_but_not_failures(tmp_path, monkeypatch):
    monkeypatch.setenv('CAREEROS_DETAIL_CACHE', str(tmp_path))
    calls = []
    @cached_detail('test', 'job_id')
    def fetch(job_id):
        calls.append(job_id)
        return {'description': ('Full details ' * 30) if job_id == 'good' else ''}
    fetch('good'); fetch('good'); fetch('bad'); fetch('bad')
    assert calls == ['good', 'bad', 'bad']


def test_expiry_force_refresh_and_workspace_isolation(tmp_path, monkeypatch):
    monkeypatch.setenv('CAREEROS_DETAIL_CACHE', str(tmp_path / 'one'))
    clock = [1000]
    monkeypatch.setattr(detail_cache.time, 'time', lambda: clock[0])
    calls = []
    @cached_detail('test', 'url')
    def fetch(url):
        calls.append(url)
        return {'description': 'Full description ' * 30}
    fetch('https://example/1')
    fetch('https://example/1')
    clock[0] += MAX_AGE_SECONDS + 1
    fetch('https://example/1')
    monkeypatch.setenv('CAREEROS_FORCE_REFRESH', '1')
    fetch('https://example/1')
    monkeypatch.setenv('CAREEROS_FORCE_REFRESH', '0')
    monkeypatch.setenv('CAREEROS_DETAIL_CACHE', str(tmp_path / 'two'))
    fetch('https://example/1')
    assert len(calls) == 4


def test_disabled_cache_and_network_errors(tmp_path, monkeypatch):
    monkeypatch.delenv('CAREEROS_DETAIL_CACHE', raising=False)
    calls = []
    @cached_detail('test', 'job_id')
    def fetch(job_id):
        calls.append(job_id)
        raise ValueError('network')
    for _ in range(2):
        with pytest.raises(ValueError):
            fetch('1')
    assert len(calls) == 2
    assert not list(tmp_path.rglob('*.json'))


def test_listing_changes_invalidate_cached_details(tmp_path, monkeypatch):
    monkeypatch.setenv('CAREEROS_DETAIL_CACHE', str(tmp_path))
    calls = []
    @cached_detail('test', 'job_id')
    def fetch(job_id):
        calls.append(job_id)
        return {'description': 'Complete role details ' * 30}
    fetch('1', _cache_hint={'title': 'Engineer', 'rate': 60})
    fetch('1', _cache_hint={'title': 'Engineer', 'rate': 60})
    fetch('1', _cache_hint={'title': 'Engineer', 'rate': 70})
    assert len(calls) == 2


@pytest.mark.parametrize('broken', ['[1]', 'null', '{"stored_at": "invalid", "value": {}}', '{'])
def test_malformed_cache_is_replaced_after_fresh_fetch(tmp_path, monkeypatch, broken):
    monkeypatch.setenv('CAREEROS_DETAIL_CACHE', str(tmp_path))
    calls = []

    @cached_detail('test', 'job_id')
    def fetch(job_id):
        calls.append(job_id)
        return {'description': 'Complete role details ' * 30}

    expected = fetch('1')
    cache_file = next(tmp_path.rglob('*.json'))
    cache_file.write_text(broken)
    assert fetch('1') == expected
    assert fetch('1') == expected
    assert calls == ['1', '1']
