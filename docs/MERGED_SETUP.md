# Career OS + Job Scrapper

Career_OS is the primary application. Job_scrapper was imported with its Git history under `services/job_scrapper/`. Existing standalone scraper commands still work from that directory.

## Run locally

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m playwright install chromium
npm ci --prefix dashboard
./dev.sh
```

Open http://127.0.0.1:5174, create an account, and complete onboarding. In **Settings → Search config**, allow staffing agencies and recruiter posts and enable all sources. Adjust the minimum match score to your needs. Save those preferences, then open **Settings → Job portals**.

Choose portals, enter comma-separated keywords and a date window, and start a search. The current registry includes 33 portals. The imported filters target senior software/data contract roles; individual portals retain their original filters and capabilities. Some portals do not accept keyword overrides. These controls run scrapers only, never application submission helpers.

The panel polls for progress. Jobs appear in the normal job feed and can use Career OS's existing tracking and resume tools. AI features still require the corresponding provider configuration; scraping and importing do not require an AI key. Kforce requires its optional search key.

## Integration details

- Authenticated `/api/portals` and `/api/portals/scrape` endpoints control scraper subprocesses. Each portal gets a persisted `ScrapeRun` belonging to the signed-in user.
- `src/portal_scraper.py` maps portal JSON into the same delivery function used by `/internal/v1/jobs/deliver`. External workers can still use that endpoint with `X-Internal-Token`.
- URL normalization removes known tracking parameters while retaining query IDs and fragments. Deduplication is per user and normalized URL; equivalent listings at different URLs are not merged automatically.
- Imports preserve application status, notes, and saved flags. They update existing records without archiving jobs from other sources.
- Employment type and portal/contact metadata are retained. Long portal identifiers are stored in contact metadata to respect the existing source column length.
- Failed scrapes do not import old output. A failed portal does not prevent the remaining selected portals from running. Delivery commits per job, so retrying a partially delivered batch safely updates existing rows.
- One API process is supported for portal execution. It serializes searches because upstream scrapers share keyword/output files. Each scraper has a 15-minute timeout. Do not use multiple Uvicorn workers with this local runner.
- Run history persists; queued work does not survive an API restart. Interrupted runs are marked failed at startup so they can be started again.

## Docker

The existing `docker compose up --build` runs the same integrated backend and dashboard. Portal processes run inside the backend container. Job records and run history persist in the existing data volume; raw scraper output is disposable inside the container. Browser-opening helpers remain available through the standalone local scraper workflow.

## Verification

```sh
.venv/bin/python -m pip install pytest httpx
.venv/bin/python -m pytest tests/test_portal_integration.py tests/test_new_api_endpoints.py -q
(cd services/job_scrapper && PYTHONPATH=src ../../.venv/bin/python -m pytest tests -q)
npm run check --prefix dashboard
```

The integration tests use a temporary database and mocked scraping. They cover URL normalization, repeat imports, preserved application state, user isolation, authentication, portal validation, and stale-output rejection.

Known upstream test issue: `test_java_titles_are_excluded` fails in the unchanged Job_scrapper source as well as this merged checkout. Its shared filter currently admits those Java titles. The other 53 scraper tests pass; the resume-dependent test is skipped without a local resume.

## Original dashboard (temporary UI)

**Job Scraper** in the main sidebar now embeds the original Job Portal Control dashboard with its original styling and controls: scrape all/rotation/checked portals, stop, refresh, filters, keywords, open limits, start position, browser keep-open duration, job lists, new-job indicators, click counts, temporary applied marks, and Judge Group applicant settings and queue. The “Scrape All” label now reflects the actual 33 portals.

Requests pass through authenticated Career OS endpoints. Each account has separate saved controls, applied marks, seen/click state, and in-memory run history. Successful fresh scrapes are also imported into that account's All Jobs feed, preserving existing Career OS tracking state. Browser-opening and application helpers execute on the machine running the backend, just as in the original local dashboard. Queue submission still requires clicking the existing submission control; merely loading the dashboard never applies to jobs.

The original dashboard's applied badges retain their original two-hour lifetime and are separate from durable Career OS application tracking. Set durable application status in the Career OS job feed. Legacy dashboard run details are in memory and reset on server restart; the simpler `/api/portals` API retains its persisted run history.
