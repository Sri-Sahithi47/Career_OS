"""Dashboard title exclusions must work at each affected scraper's CLI boundary."""
import importlib
import json
from contextlib import ExitStack
from dataclasses import fields
from unittest.mock import patch

import pytest

from shared_vendor_filters import VendorJob

AFFECTED = [
    'artech', 'ccsglobaltech', 'diverselynx', 'ettaingroup', 'harveynash',
    'hays', 'inspyr', 'matlensilver', 'motionrecruitment', 'nttdata',
    'oliverjames', 'opensystemstechnologies', 'optomi', 'ptrglobal',
    'pyramidconsulting', 'strategicstaffing', 'vaco', 'venturigroup',
]


def job(title, identifier):
    values = {field.name: '' for field in fields(VendorJob)}
    values.update(title=title, title_rank=12, job_id=identifier,
                  job_url=f'https://example.com/jobs/{identifier}')
    return VendorJob(**values)


@pytest.mark.parametrize('slug', AFFECTED)
@pytest.mark.parametrize('exclude_titles', [False, True])
def test_dashboard_command_saves_jobs_and_honors_title_file(tmp_path, slug, exclude_titles):
    module = importlib.import_module(f'{slug}_applying_script.{slug}_scraper')
    ignored = tmp_path / 'ignored.txt'
    ignored.write_text('  ARCHITECT  \n\n', encoding='utf-8')
    argv = ['scraper', '--term', 'java', '--posted-within-days', '0',
            '--out-dir', str(tmp_path), '--no-excel']
    if exclude_titles:
        argv += ['--ignore-titles-file', str(ignored)]
    jobs = [job('Java Developer', '1'), job('Java Architect', '2')]
    with ExitStack() as stack:
        stack.enter_context(patch('sys.argv', argv))
        if slug == 'artech':
            stack.enter_context(patch.object(module, 'get_token', return_value={}))
            stack.enter_context(patch.object(module, 'fetch_term', return_value=[{'id': '1'}, {'id': '2'}]))
            stack.enter_context(patch.object(module, 'fetch_detail', return_value={}))
            stack.enter_context(patch.object(module, 'normalize', side_effect=jobs))
            stack.enter_context(patch.object(module.time, 'sleep'))
        else:
            stack.enter_context(patch.object(module, 'scrape_jobs', return_value=jobs))
        assert module.main() == 0
    saved = json.loads(next(tmp_path.glob(f'{slug}_jobs_*.json')).read_text())
    assert [item['title'] for item in saved] == (
        ['Java Developer'] if exclude_titles else ['Java Developer', 'Java Architect'])


@pytest.mark.parametrize('wrap', [
    lambda item: item,
    lambda item: [{'@type': 'WebPage'}, item],
    lambda item: {'@graph': [{'@type': 'WebPage'}, item]},
    lambda item: [{ '@graph': [item]}],
])
def test_ettain_reads_job_posting_from_structured_data_containers(wrap):
    from ettaingroup_applying_script.ettaingroup_scraper import json_ld_job
    item = {'@type': ['Thing', 'JobPosting'], 'title': 'Java Developer',
            'description': '<p>Full contract description</p>'}
    html = '<script type="application/ld+json">invalid</script>'
    html += '<script type="application/ld+json">' + json.dumps(wrap(item)) + '</script>'
    assert json_ld_job(html) == item
