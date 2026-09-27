"""Posting identity and description preservation regression tests; isolated DB."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from src.database import Base
from src.models import User, Job
from api.jobs import CreateJobRequest, create_job_manual

@pytest.fixture
def workspace(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'save.db'}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        user = User(id='save-test', username='save-test', hashed_password='not-a-login')
        db.add(user)
        db.commit()
        yield db, user
    engine.dispose()

def save(workspace, url, description):
    db, user = workspace
    return create_job_manual(CreateJobRequest(title='Python Developer', company='Staffing agency', url=url, description=description), db, user)

def test_distinct_requisitions_with_same_title_are_not_duplicates(workspace):
    assert save(workspace, 'https://example.com/jobs/101', 'First role')['created']
    assert save(workspace, 'https://example.com/jobs/102', 'Second role')['created']
    assert workspace[0].query(Job).count() == 2

def test_long_description_preserved_and_repeat_save_idempotent(workspace):
    description = 'Responsibilities\n' + ('Build reliable Python systems. ' * 400).rstrip() + '\nEND OF DESCRIPTION'
    assert save(workspace, 'https://example.com/jobs/101', description)['created']
    job = workspace[0].query(Job).one()
    assert job.job_description == description
    response = save(workspace, 'https://example.com/jobs/101', description)
    assert not response['created']
    assert not response['updated']
    assert workspace[0].query(Job).count() == 1

def test_resave_completes_description_without_losing_it_to_shorter_capture(workspace):
    url = 'https://example.com/jobs/101'
    save(workspace, url, 'Python role')
    response = save(workspace, url, 'Python role\nRemote, C2C accepted.')
    assert response['updated']
    save(workspace, url, 'Python')
    assert workspace[0].query(Job).one().job_description == 'Python role\nRemote, C2C accepted.'

def test_manual_records_do_not_collide_on_title(workspace):
    assert save(workspace, '', 'First client role')['created']
    assert save(workspace, '', 'Different client role')['created']
    assert not save(workspace, '', 'First client role')['created']


def test_orphan_source_job_is_repaired(workspace):
    from src.models import MatchedJob
    db, _ = workspace
    save(workspace, 'https://example.com/jobs/1', 'Brief')
    db.query(MatchedJob).delete()
    db.commit()
    assert save(workspace, 'https://example.com/jobs/1', 'Complete description')['created']
    assert db.query(Job).count() == db.query(MatchedJob).count() == 1
    assert db.query(Job).one().job_description == 'Complete description'


def test_archive_restore_preserves_notes_and_shortlists_atomically(workspace):
    from src.models import MatchedJob
    db, user = workspace
    save(workspace, 'https://example.com/jobs/1', 'Description')
    matched = db.query(MatchedJob).one()
    matched.delivery_status = 'archived'
    matched.notes = 'Contacted recruiter'
    matched.user_status = 'applied'
    db.commit()
    create_job_manual(CreateJobRequest(url='https://example.com/jobs/1', special_interest=True), db, user)
    db.expire_all()
    assert matched.delivery_status == 'active'
    assert matched.special_interest
    assert matched.notes == 'Contacted recruiter'
    assert matched.user_status == 'applied'


def test_tracking_urls_dedupe_but_requisition_ids_remain_distinct(workspace):
    assert save(workspace, 'https://example.com/job?req=1&utm_source=email', 'Description')['created']
    assert not save(workspace, 'https://example.com/job?req=1&utm_source=web', 'Description')['created']
    assert save(workspace, 'https://example.com/job?req=2', 'Description')['created']


def test_accounts_cannot_update_each_others_jobs(workspace):
    db, _ = workspace
    save(workspace, 'https://example.com/jobs/1', 'Original')
    other = User(id='other', username='other', hashed_password='not-a-login')
    db.add(other)
    db.commit()
    assert create_job_manual(CreateJobRequest(url='https://example.com/jobs/1', description='Other account full description'), db, other)['created']
    assert db.query(Job).filter_by(user_id='save-test').one().job_description == 'Original'


def test_simultaneous_saves_create_one_complete_record(workspace):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from sqlalchemy import event
    from src.models import MatchedJob
    db, _ = workspace
    engine = db.get_bind()
    barrier = Barrier(2)
    def before_insert(mapper, connection, target):
        barrier.wait(timeout=10)
    event.listen(Job, 'before_insert', before_insert)
    def submit(_):
        with Session(engine) as session:
            user = session.get(User, 'save-test')
            return create_job_manual(CreateJobRequest(url='https://example.com/concurrent', description='Full description', special_interest=True), session, user)
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(submit, range(2)))
    finally:
        event.remove(Job, 'before_insert', before_insert)
    assert sum(result['created'] for result in results) == 1
    assert db.query(Job).count() == db.query(MatchedJob).count() == 1
    assert db.query(MatchedJob).one().special_interest


def test_failed_delivery_insert_rolls_back_source_job(workspace):
    from sqlalchemy import event
    from src.models import MatchedJob
    db, _ = workspace
    def fail(*args):
        raise RuntimeError('Simulated interrupted save')
    event.listen(MatchedJob, 'before_insert', fail)
    try:
        with pytest.raises(RuntimeError):
            save(workspace, 'https://example.com/jobs/1', 'Description')
    finally:
        event.remove(MatchedJob, 'before_insert', fail)
    assert db.query(Job).count() == db.query(MatchedJob).count() == 0
    assert save(workspace, 'https://example.com/jobs/1', 'Description')['created']


def test_oversized_description_rejected_explicitly():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        CreateJobRequest(description='x' * 50001)
