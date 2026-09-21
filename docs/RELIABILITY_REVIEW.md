# CareerOS Reliability Review

Date: 2026-09-20

## Scope and Workflow

Applied ECC's `ecc-guide`, `verification-loop`, `code-review`, and `build-fix`
workflows from the live affaan-m/ecc repository. Inspected the dashboard, API,
resume pipeline, scoring, alternate server entry point, startup configuration,
tests, dependency audit, and knowledge graph. Prioritized resume uploads and
tailoring based on the user's feedback.

## Repairs

- Pasted resumes now reach the upload API. DOCX extraction includes table cells;
  empty, oversized, unreadable, and legacy DOC uploads receive explicit errors.
- Settings and Keyword Bank uploads propagate the new resume to the app state.
- The resume editor persists bullets, skills, score, and location to job analysis.
  It no longer replaces personal job notes with a generated summary. PDF export
  saves edits first; failed saves remain retryable. Switching target jobs clears
  stale suggestions, and job links preselect the intended tailoring target.
- Editable job descriptions are sent to tailoring. Requests use an appropriate
  timeout, provider calls have explicit timeouts, candidate cache keys include
  the full resume context, and AI JSON is validated before persistence.
- PDF export uses the active uploaded text and reviewed highlights, with unique
  output filenames. It does not require the missing Tectonic executable or use
  the fixed personal LaTeX template. This produces a clean text-based document;
  original upload layout is not preserved. The legacy LaTeX generator remains.
- PDF downloads require authentication and ownership. Resume history filters
  out versions belonging to other users of a shared job.
- Today Feed uses the app's authenticated jobs rather than the obsolete port
  8000 mock-user client. Recommendations use actual scores and metadata. Empty
  activity charts no longer contain fabricated applications.
- Resume-match scoring no longer multiplies percentages by 100. Missing resumes
  score zero. Existing stored scores are not bulk rewritten by this repair.
- Failed note writes do not appear saved. Background refreshes are prevented
  from overwriting pending writes or restoring stale data after logout.
- Frontend API calls and downloads use the same origin by default. Vite proxies
  `/api` to the local backend. `VITE_API_URL` remains an explicit override.
- Server startup no longer resets a default password or rewrites the spreadsheet.
  Legacy unscoped mutation routes are retired. `src.main` now points to the same
  authenticated application as `api.server`.
- Fixed frontend lint failures, browser-storage test setup, router wrappers,
  outdated UI assertions, accessible onboarding radios, and validation error text.
- Old Python endpoint tests now use an isolated database and in-process API with
  effective AI mocks. They no longer create test accounts in the live database.
- Updated compatible npm dependencies, including Axios and React Router.

## Verification

- Frontend: 109 tests passed; lint and production build passed.
- Backend: 161 tests passed, covering scoring, uploads, tailoring, persistence,
  actual PDF text extraction, versioning, authentication, and ownership.
- Playwright: all 10 main routes rendered; 4 mobile routes checked at 390px;
  resume generation preview and save exercised; no uncaught page errors or
  horizontal document overflow in those mobile checks.
- Browser tests use synthetic API responses. Backend integration tests use real
  temporary SQLite databases and PDF generation, with mocked AI responses.
- Production npm audit: zero known vulnerabilities after updates.
- Compatible updates reduced all npm advisories to 8 development-only findings.
  Remaining Vite/Graphify/test-tool advisories need separate tooling upgrades.
- Graphify hook rebuild ran from both dashboard and project roots. Its current
  extraction is shallow (3 dashboard nodes and 43 root nodes), not a full source
  dependency graph.

## Remaining Work and Limits

1. Live AI generation is blocked: the inspected runtime configuration contains
   no Groq, Gemini, or Anthropic credentials. The current tailoring service needs
   `GROQ_API_KEYS` in the project `.env`, followed by a backend restart. No real
   provider generation was attempted, and no credentials were printed.
2. Gmail OAuth/synchronization, external scraping, browser-extension autofill,
   and scheduled workers were inspected only in part and were not exercised
   against external services. Alternate worker code still includes mock emails.
3. Settings still exposes legacy Environment/Blacklist/Skills tabs whose old
   config API returns 410. These need migration to explicit supported settings.
   Several other pre-existing UI controls remain placeholders (social sign-in,
   password recovery, saved-search persistence across views).
4. Python 3.9, PyPDF2, and the old Google SDK emit deprecation warnings. Upgrade
   those runtimes independently with integration coverage. Production JS bundle
   size also still triggers the existing chunk-size warning.
5. The project directory is not an independent Git checkout; Git resolves to the
   user's home repository and treats this project as untracked. Establish a
   project repository and baseline before further large architectural changes.
6. Authentication uses both bearer tokens and cookies. Cross-device session
   revocation and persistent background-job orchestration are not implemented
   by this stabilization work.

## Repeatable Checks

From `dashboard/`:

```sh
npm run check
npm audit --omit=dev
```

From the project root, using the project's Python environment:

```sh
python -m pytest tests -q
FRONTEND_URL=http://127.0.0.1:5175 python tests/browser_smoke.py
npx --prefix dashboard graphify hook-rebuild
```

The browser smoke test requires the frontend to be running and uses a fresh
browser context with synthetic network responses. Screenshots go to
`/tmp/careeros-browser-checks/`.

PDF implementation reference: [ReportLab paragraphs](https://docs.reportlab.com/reportlab/userguide/ch6_paragraphs/).
