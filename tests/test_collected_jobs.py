from datetime import datetime, timedelta
import json
from types import SimpleNamespace
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from src.database import Base
from src.models import User, CollectedPosting, PostingObservation, CollectionImport
from src.collected_jobs import ingest, import_outputs, canonical_url
from api import collected_jobs as endpoint


@pytest.fixture
def store(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'collection.db'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(endpoint, 'SessionLocal', factory)
    with factory() as db:
        db.add_all([User(id='one', username='one', hashed_password='x'), User(id='two', username='two', hashed_password='x')])
        db.commit()
    yield factory
    engine.dispose()


def posting(**updates):
    return {'job_id': '123', 'job_url': 'https://jobs.example/123?utm_source=one',
            'title': 'Java Engineer', 'raw_text': 'Full role description. ' * 30, **updates}



def approve_existing(store, directory):
    with store() as db:
        portals = {}
        for row in db.query(CollectedPosting).filter_by(user_id='one'):
            portals.setdefault(row.portal, {})[row.id] = {'job': row.payload, 'approved': True}
        for portal, jobs in portals.items():
            (directory / f'{portal}_ai_reviewed.json').write_text(json.dumps({
                'context': json.dumps(['title-review-v1', [], []]), 'jobs': jobs}))


def test_repeat_and_update_preserve_identity_state_and_full_description(store):
    now = datetime(2026, 9, 20)
    with store() as db:
        assert ingest(db, 'one', 'apex', 'Apex', [posting(), posting()], 'run1', now)['new'] == 1
        job = db.query(CollectedPosting).one()
        job.review_state = 'dismissed'
        db.commit()
        assert ingest(db, 'one', 'apex', 'Apex', [posting()], 'run1', now)['new'] == 1
        assert db.query(PostingObservation).count() == 1
        assert ingest(db, 'one', 'apex', 'Apex', [posting(raw_text='Partial')], 'run2', now + timedelta(days=1))['known'] == 1
        ingest(db, 'one', 'apex', 'Apex', [posting(location='Remote')], 'run3', now + timedelta(days=2))
        db.refresh(job)
        assert job.review_state == 'dismissed' and job.has_update
        assert job.payload['raw_text'] == posting()['raw_text']
        assert job.first_seen == now
        assert db.query(CollectedPosting).count() == 1
        assert db.query(PostingObservation).count() == 3


def test_identity_does_not_merge_same_titles_or_accounts(store):
    with store() as db:
        now = datetime.utcnow()
        ingest(db, 'one', 'apex', 'Apex', [posting(), posting(job_id='456', job_url='https://jobs.example/456')], 'a', now)
        ingest(db, 'two', 'apex', 'Apex', [posting()], 'a', now)
        ingest(db, 'one', 'other', 'Other', [posting()], 'b', now)
        assert db.query(CollectedPosting).count() == 4
        ingest(db, 'one', 'apex', 'Apex', [posting(job_url='https://jobs.example/new-url')], 'c', now)
        assert db.query(CollectedPosting).count() == 4


def test_history_replay_and_corrupt_file_recovery(store, tmp_path):
    vendor = SimpleNamespace(slug='apex', label='Apex', folder='apex', prefix='apex')
    folder = tmp_path / 'apex/output'
    folder.mkdir(parents=True)
    (folder / 'apex_jobs_1.json').write_text(json.dumps([posting()]))
    bad = folder / 'apex_jobs_2.json'
    bad.write_text('[')
    with store() as db:
        assert import_outputs(db, 'one', tmp_path, [vendor])
        assert db.query(CollectedPosting).count() == 1
        assert db.query(CollectionImport).count() == 1
        bad.write_text(json.dumps([posting(job_id='456', job_url='https://jobs.example/456')]))
        assert not import_outputs(db, 'one', tmp_path, [vendor])
        assert db.query(CollectedPosting).count() == 2
        import_outputs(db, 'one', tmp_path, [vendor])
        assert db.query(CollectionImport).count() == 2


def test_dates_unknown_posted_and_review_isolation(store, tmp_path):
    with store() as db:
        ingest(db, 'one', 'apex', 'Apex', [posting()], 'a', datetime(2026, 9, 20, 4))
        ingest(db, 'one', 'apex', 'Apex', [posting(job_id='456', job_url='https://jobs.example/456', posted_date='2026-09-19')], 'b', datetime(2026, 9, 21, 4))
    def get(query, user='one'):
        return endpoint.collection_action(user, 'collected', 'GET', None, query, tmp_path, [])
    approve_existing(store, tmp_path)
    result = get({'from': '2026-09-20T00:00:00-04:00', 'until': '2026-09-21T00:00:00-04:00'})
    assert result['total'] == 1
    key = result['jobs'][0]['key']
    assert get({'view': 'all'}, 'two')['total'] == 0
    with pytest.raises(Exception) as e:
        endpoint.collection_action('two', 'collected/review', 'POST', {'ids': [key], 'state': 'dismissed'}, {}, tmp_path, [])
    assert e.value.status_code == 404
    endpoint.collection_action('one', 'collected/review', 'POST', {'ids': [key], 'state': 'dismissed'}, {}, tmp_path, [])
    assert get({})['total'] == 1
    assert get({'view': 'dismissed'})['total'] == 1
    assert get({'view': 'all', 'date_field': 'posted_at', 'from': '2026-09-20', 'include_unknown': 'true'})['total'] == 1
    assert get({'view': 'all', 'date_field': 'posted_at', 'from': '2026-09-20', 'include_unknown': 'false'})['total'] == 0
    with pytest.raises(Exception):
        get({'page': '0'})


def test_old_output_never_overwrites_newer_details(store):
    with store() as db:
        ingest(db, 'one', 'apex', 'Apex', [posting(location='Remote')], 'new', datetime(2026, 9, 22))
        ingest(db, 'one', 'apex', 'Apex', [posting(location='NY')], 'old', datetime(2026, 9, 20))
        row = db.query(CollectedPosting).one()
        assert row.payload['location'] == 'Remote'
        assert row.first_seen == datetime(2026, 9, 20)


def test_canonical_urls_keep_identity_parameters():
    assert canonical_url('https://EXAMPLE.com/job?id=2&utm_source=x#role') == 'https://example.com/job?id=2#role'
    assert canonical_url('javascript:alert(1)') == ''


def test_server_side_filters_and_pagination(store, tmp_path):
    vendors = [SimpleNamespace(slug='apexsystems'), SimpleNamespace(slug='other')]
    with store() as db:
        ingest(db, 'one', 'apexsystems', 'Apex', [posting(location='Remote', raw_text='C2C accepted. ' * 30)], 'a', datetime(2026, 9, 20))
        ingest(db, 'one', 'other', 'Other', [posting(job_id='2', job_url='https://jobs.example/2', location='NY', raw_text='W2 only ' * 50)], 'b', datetime(2026, 9, 20))
    def get(**query):
        # No output folders exist in this test, but vendor metadata needs the scan fields.
        for v in vendors:
            v.folder = v.slug
            v.prefix = v.slug
        return endpoint.collection_action('one', 'collected', 'GET', None, {'view': 'all', **query}, tmp_path, vendors)
    approve_existing(store, tmp_path)
    assert get(group='important')['total'] == 1
    assert get(remote='true')['total'] == 1
    assert get(engagement='C2C mentioned')['total'] == 1
    assert get(location='NY')['total'] == 1
    assert len(get(limit='1')['jobs']) == 1
    assert get(q='Java')['total'] == 2
    assert get(q='%')['total'] == 0
    (tmp_path / 'job_portal_dashboard_config.json').write_text(json.dumps({'portal_categories': {'other': 'important'}}))
    assert get(group='important')['total'] == 2


def test_collection_only_shows_explicit_ai_approvals_across_all_views(store, tmp_path):
    with store() as db:
        ingest(db, 'one', 'apex', 'Apex', [posting(),
            posting(job_id='2', job_url='https://jobs.example/2', location='Rejected location'),
            posting(job_id='3', job_url='https://jobs.example/3', location='Unreviewed location')],
            'batch', datetime(2026, 9, 20))
    def get(view='all'):
        return endpoint.collection_action('one', 'collected', 'GET', None, {'view': view}, tmp_path, [])
    assert get()['total'] == 0
    manifest = tmp_path / 'apex_ai_reviewed.json'
    manifest.write_text(json.dumps({'context': json.dumps(['title-review-v1', [], []]), 'jobs': {
        'id:123': {'job': posting(), 'approved': True},
        'id:2': {'job': posting(job_id='2', job_url='https://jobs.example/2', location='Rejected location'), 'approved': False}}}))
    assert get()['total'] == 1
    assert get()['counts'] == {'new': 1}
    assert 'Rejected location' not in get()['locations']
    assert get('new')['total'] == 1
    with store() as db:
        ingest(db, 'one', 'apex', 'Apex', [posting(title='Changed role')], 'changed', datetime(2026, 9, 21))
    assert get()['total'] == 0
    with store() as db:
        assert db.query(CollectedPosting).count() == 3  # Hidden, never deleted.


def test_reset_missing_corrupt_or_outdated_ai_proof_never_approves_jobs(store, tmp_path):
    with store() as db:
        ingest(db, 'one', 'apex', 'Apex', [posting()], 'batch', datetime(2026, 9, 20))
    approve_existing(store, tmp_path)
    def get():
        return endpoint.collection_action('one', 'collected', 'GET', None, {'view': 'all'}, tmp_path, [])
    assert get()['total'] == 1
    config = tmp_path / 'job_portal_dashboard_config.json'
    config.write_text(json.dumps({'keywords': ['different search']}))
    assert get()['total'] == 0
    config.unlink()
    (tmp_path / 'apex_ai_reviewed.json').write_text('{broken')
    assert get()['total'] == 0
    (tmp_path / 'apex_ai_reviewed.json').unlink()
    assert get()['total'] == 0
