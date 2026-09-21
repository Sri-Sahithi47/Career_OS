"""Browser regression checks using synthetic responses; no real accounts or AI calls."""
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright, expect


def main():
    base = os.getenv('FRONTEND_URL', 'http://127.0.0.1:5175')
    output = Path('/tmp/careeros-browser-checks')
    output.mkdir(exist_ok=True)
    workspace = {'ats_score': 81, 'location': 'Remote', 'tech_stack': {}, 'suggested_tech_stack': {}, 'points': ['Built Python services']}
    jobs = [{'id': 'job-one', 'job_id': 'job-one', 'Title': 'Software Engineer', 'Company': 'Example', 'Location': 'Remote', 'Status': 'not_applied', 'Fit Score': 81, 'Skill Score': 81, 'Matched Skills': 'Python, SQL', 'Job Description': 'Build Python services', 'Analysis Data': workspace, 'Date Found': '2026-09-19T12:00:00Z'}]
    onboarding = {'user': {'id': 'test-user', 'username': 'browser-test', 'full_name': 'Alex Example'}, 'profile': {'onboarding_completed': True, 'target_roles': ['Engineer'], 'parsed_skills': ['Python'], 'full_profile': {}}, 'resume': {'filename': 'resume.txt', 'original_text': 'Alex Example\nEXPERIENCE\nBuilt Python services and SQL pipelines.\nEDUCATION\nComputer Science'}, 'search_presets': []}
    requests = []
    errors = []

    def respond(route):
        request = route.request
        path = urlparse(request.url).path
        requests.append((request.method, path, request.post_data))
        data = {}
        if path.endswith('/auth/me'):
            data = {'user': onboarding['user']}
        elif path == '/api/onboarding':
            data = onboarding
        elif path == '/api/jobs':
            data = {'jobs': jobs, 'stats': {'total': 1}}
        elif path.endswith('/tailor'):
            data = {'tailored_data': workspace}
        elif path.endswith('/analysis'):
            data = {'job': jobs[0]}
        elif path.endswith('/resumes'):
            data = {'resumes': []}
        elif path.endswith('/events'):
            data = {'events': []}
        elif path == '/api/jobs/keyword-bank':
            data = {'keywords': [], 'gaps': [], 'summary': {}}
        elif path == '/api/jobs/keyword-trends':
            data = {'periods': []}
        elif path == '/api/opportunities':
            data = {'threads': [], 'stats': {}, 'connection': {}}
        elif path == '/api/config':
            route.fulfill(status=410, json={'detail': 'Legacy endpoint retired'})
            return
        route.fulfill(json=data)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        page.route('**/api/**', respond)
        page.on('pageerror', lambda error: errors.append(str(error)))
        for route in ['/today', '/jobs', '/applied', '/saved', '/tracker', '/opportunities', '/tailor', '/keyword-bank', '/resume-check', '/settings']:
            page.goto(base + route)
            expect(page.locator('main')).to_be_visible()
            expect(page.locator('main')).not_to_be_empty()
            page.screenshot(path=str(output / (route[1:] + '.png')))
        page.goto(base + '/tailor?job=job-one')
        expect(page.get_by_label('Target Job')).to_have_value('job-one')
        page.get_by_role('button', name='Generate Preview', exact=True).first.click()
        expect(page.get_by_role('heading', name='Resume Editor')).to_be_visible()
        page.get_by_role('button', name='Save to Job Card').click()
        expect(page.locator('main').get_by_role('button', name='Saved', exact=False)).to_be_disabled()
        assert any(method == 'PATCH' and path.endswith('/analysis') and 'Built Python services' in body for method, path, body in requests)
        page.screenshot(path=str(output / 'resume-editor.png'))
        page.set_viewport_size({'width': 390, 'height': 844})
        for route in ['/jobs', '/today', '/tailor', '/settings']:
            page.goto(base + route)
            expect(page.locator('main')).to_be_visible()
            page.screenshot(path=str(output / ('mobile-' + route[1:] + '.png')))
            width = page.evaluate('({page: document.documentElement.scrollWidth, viewport: innerWidth})')
            assert width['page'] <= width['viewport'] + 1, (route, width)
        browser.close()
    assert not errors, errors
    print(json.dumps({'routes': 10, 'mobile_routes': 4, 'resume_save': 'passed', 'page_errors': errors, 'screenshots': str(output)}))


if __name__ == '__main__':
    main()
