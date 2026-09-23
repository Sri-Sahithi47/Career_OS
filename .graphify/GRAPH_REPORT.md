# Graph Report - .  (2026-09-23)

## Corpus Check
- 458 files · ~0 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3607 nodes · 8894 edges · 117 communities detected
- Extraction: 78% EXTRACTED · 22% INFERRED · 0% AMBIGUOUS · INFERRED: 1997 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `User` - 266 edges
2. `MatchedJob` - 203 edges
3. `Job` - 190 edges
4. `TailorServiceError` - 154 edges
5. `ApplicationEvent` - 128 edges
6. `UserProfile` - 108 edges
7. `Resume` - 102 edges
8. `ScrapeRun` - 93 edges
9. `WorkspaceResumeGenerationError` - 75 edges
10. `AIMatchError` - 71 edges

## Surprising Connections (you probably didn't know these)
- `Authentication and session endpoints for the user-facing web app.` --uses--> `User`  [INFERRED]
  /Users/saisujan/Desktop/careeros/jobsearchplatform_contract/api/auth.py → /Users/saisujan/Desktop/careeros/src/models.py
- `Create a user account and initialize a cookie-backed session.` --uses--> `User`  [INFERRED]
  /Users/saisujan/Desktop/careeros/jobsearchplatform_contract/api/auth.py → /Users/saisujan/Desktop/careeros/src/models.py
- `Authenticate a user and initialize a cookie-backed session.` --uses--> `User`  [INFERRED]
  /Users/saisujan/Desktop/careeros/jobsearchplatform_contract/api/auth.py → /Users/saisujan/Desktop/careeros/src/models.py
- `Clear the current browser session.` --uses--> `User`  [INFERRED]
  /Users/saisujan/Desktop/careeros/jobsearchplatform_contract/api/auth.py → /Users/saisujan/Desktop/careeros/src/models.py
- `Return the current session user and onboarding status.` --uses--> `User`  [INFERRED]
  /Users/saisujan/Desktop/careeros/jobsearchplatform_contract/api/auth.py → /Users/saisujan/Desktop/careeros/src/models.py

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (560): a(), a0(), a1(), Aa(), ac(), Ad(), add(), addObserver() (+552 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (382): AIMatchError, Raised when AI match enrichment cannot complete., LoginRequest, SignupRequest, Base, BaseModel, _apply_date_range(), _apply_fit_snapshot_to_matched_job() (+374 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (51): companyInitial(), DetailPanel(), getApplyUrl(), getConfidenceLabel(), getDescription(), getFitBullets(), getGapHints(), getSalary() (+43 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (119): AIEvaluator, AI Evaluator Module ------------------- Runs detailed AI-based resume evaluation, Orchestrates the AI evaluation process for a batch of jobs., Takes a DataFrame of jobs, runs AI evaluation on each., ATSScorer, ATSScorer Module ---------------- Handles scoring, ranking, and filtering of job, Rank all jobs by composite score.          Returns:             List of ScoredJo, Get top N jobs after ranking.          Returns:             List of top N Scored (+111 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (152): build_parser(), first_value(), main(), scrape_jobs(), authenticate(), build_parser(), main(), scrape_jobs() (+144 more)

### Community 5 - "Community 5"
Cohesion: 0.03
Nodes (62): ABC, BaseLLMProvider, LLMError, LLMResponse, BaseLLMProvider, Delete cache entries whose key was derived from keys starting with key_prefix., ResultCache, BreakerState (+54 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (96): applySmartValue(), attachPackagedKforceResume(), booleanish(), buildKforceProfile(), buildMatchSnapshot(), chooseCustomOption(), chooseRadioOption(), chooseSelectOption() (+88 more)

### Community 7 - "Community 7"
Cohesion: 0.04
Nodes (80): answer_application_question(), AnswerQuestionRequest, _classify_field(), CoverLetterRequest, generate_cover_letter(), AI endpoints: cover letter generation, question answering, and smart form fill., Generate a tailored cover letter using hybrid RAG context (pinned facts + releva, Answer a job application question using hybrid RAG (pinned facts + question-rele (+72 more)

### Community 8 - "Community 8"
Cohesion: 0.03
Nodes (61): ExcelManager, Excel Manager - Handles Excel file operations  SAFETY FEATURES: - Aborts on read, Normalize column names to handle different formats.         Maps old column name, Add new jobs to master Excel file.         Returns count of jobs actually added., Manages Excel operations for job listings with data safety., Acquire file lock to prevent concurrent writes., Create a backup before writing. CRITICAL for data safety., Load existing jobs from Excel file.         ABORTS on error to prevent data loss (+53 more)

### Community 9 - "Community 9"
Cohesion: 0.04
Nodes (48): load_config(), load_yaml(), export_csv(), format_duration(), is_priority_site(), max_duration_for_site(), ordered_sites(), priority_site_names() (+40 more)

### Community 10 - "Community 10"
Cohesion: 0.03
Nodes (57): _auth_headers(), authed_user(), _complete_onboarding(), _deliver_job(), _get_first_job_id(), job_id(), API endpoint tests for Checkpoints 17-19 new routes:   POST /api/jobs/{id}/resum, Complete onboarding (with resume) so /api/jobs is accessible. (+49 more)

### Community 11 - "Community 11"
Cohesion: 0.05
Nodes (25): make_job(), make_profile(), make_resume(), S9 — candidate years within job band → high score, S10 — senior candidate for intern role, S2 — no resume asset, uses profile seniority, Unit tests for the scoring and recommendation engine. Run: cd job-applications &, Resume has many of the same keywords as the JD (+17 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (55): BaseHTTPRequestHandler, active_pair_for(), active_processes(), baseline_keys_for_vendor(), command_for_open(), command_for_scrape(), default_config(), format_job_for_ui() (+47 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (44): EmailAccount, OpportunityThread, Read-only email account connection metadata for opportunity sync., Deduplicated, action-scored email thread for the Opportunity Inbox., ai_triage_opportunity_email(), analyze_opportunity_email(), _body_excerpt(), build_summary() (+36 more)

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (45): applyZipFilters(), buildFlagsHtml(), canonicalJobUrl(), cleanLinkedInDescription(), cleanText(), companyFromHost(), detectJob(), detectJobFlags() (+37 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (39): HTMLParser, akkodis_detail(), akkodis_job_url(), akkodis_jobs(), akkodis_row_to_job(), akkodis_search_payload(), akkodis_search_terms(), atom_jobs() (+31 more)

### Community 16 - "Community 16"
Cohesion: 0.12
Nodes (1): DashboardService

### Community 17 - "Community 17"
Cohesion: 0.12
Nodes (38): AkkodisJob, append_jobs_sheet(), clean_text(), contact_info(), disallowed_work_reasons(), excel_row(), excel_safe_sheet_name(), fetch_detail() (+30 more)

### Community 18 - "Community 18"
Cohesion: 0.13
Nodes (35): ai_filter_jobs(), append_jobs_sheet(), below_min_hourly(), build_filter(), clean_text(), combine_contact_info(), contact_info_from_text(), decode_kforce_id() (+27 more)

### Community 19 - "Community 19"
Cohesion: 0.1
Nodes (34): build_current_fit_snapshot(), clamp_score(), compute_experience_fit(), compute_freshness(), compute_industry_affinity(), compute_location_fit(), compute_resume_match(), compute_role_fit() (+26 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (33): ai_filter_jobs(), append_jobs_sheet(), CBTSJob, clean_text(), contact_info_from_text(), disallowed_work_reasons(), excel_row(), _extract_form_prefix() (+25 more)

### Community 21 - "Community 21"
Cohesion: 0.14
Nodes (32): append_jobs_sheet(), clean_text(), disallowed_work_reasons(), excel_row(), extract_contact_info(), extract_eager_search(), extract_json_object(), fetch_search_rows() (+24 more)

### Community 22 - "Community 22"
Cohesion: 0.14
Nodes (32): ApexJob, append_jobs_sheet(), below_min_hourly(), clean_text(), contact_info(), disallowed_work_reasons(), excel_row(), fetch_detail() (+24 more)

### Community 23 - "Community 23"
Cohesion: 0.15
Nodes (31): allowed_employment_type(), append_jobs_sheet(), BeaconHillJob, clean_text(), disallowed_work_reasons(), excel_row(), extract_contact_info(), fetch_jobs() (+23 more)

### Community 24 - "Community 24"
Cohesion: 0.09
Nodes (18): HttpTests, ig_page(), ig_row(), InsightGlobalTests, MitchellMartinTests, Regression tests for complete public vendor searches (no network required)., response(), rh_page() (+10 more)

### Community 25 - "Community 25"
Cohesion: 0.13
Nodes (29): append_jobs_sheet(), BrooksourceJob, clean_html(), clean_text(), disallowed_work_reasons(), excel_row(), extract_contact_info(), fetch_all_jobs() (+21 more)

### Community 26 - "Community 26"
Cohesion: 0.15
Nodes (29): append_jobs_sheet(), clean_text(), disallowed_work_reasons(), excel_row(), extract_contact_info(), fetch_jobs(), is_within_posted_days(), JudgeGroupJob (+21 more)

### Community 27 - "Community 27"
Cohesion: 0.14
Nodes (28): append_jobs_sheet(), clean_text(), disallowed_work_reasons(), excel_row(), extract_contact_info(), extract_route_data(), is_within_posted_days(), load_ignore_titles() (+20 more)

### Community 28 - "Community 28"
Cohesion: 0.16
Nodes (28): append_jobs_sheet(), clean_text(), disallowed_work_reasons(), EliassenJob, excel_row(), extract_contact_info(), extract_location(), extract_salary() (+20 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (13): main(), Update the location in the header if fully specified., Generate PDF from LaTeX content using Tectonic., Generates customized LaTeX resumes from job application data., Clean up temporary LaTeX files., Generate customized resumes for all jobs in the Excel file., Load the LaTeX template., Get the most recent Excel file from claude_generated_files. (+5 more)

### Community 30 - "Community 30"
Cohesion: 0.1
Nodes (3): latest_jobs_file(), load_jobs(), run_open_jobs()

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (1): DashboardServiceTest

### Community 32 - "Community 32"
Cohesion: 0.12
Nodes (18): clear_session_cookies(), create_access_token(), create_session(), _decode_session_token(), get_current_user(), get_session_payload(), FastAPI shared dependencies for auth-aware routes., Resolve the authenticated user from the bearer token or session cookie. (+10 more)

### Community 33 - "Community 33"
Cohesion: 0.15
Nodes (8): Retrieval-Augmented Generation for Resume Context.     Chunks the resume and ret, Build the always-included structured-facts block from full_profile.         Auth, Hybrid context = pinned structured facts (always) + RAG-retrieved resume snippet, Backward-compat wrapper around build_hybrid_context., Simple chunking by logical sections or fixed size., Fetch embeddings for a list of strings., Main entry point: find the best resume chunks for a given question/label., ResumeRAG

### Community 34 - "Community 34"
Cohesion: 0.23
Nodes (12): act(), apiErrorMessage(), apiRequest(), clearToken(), findBtn(), getApiBase(), getStoredToken(), handleMessage() (+4 more)

### Community 35 - "Community 35"
Cohesion: 0.13
Nodes (15): acquire_file_lock(), create_backup(), escape_latex(), load_excel_safe(), Shared Utilities ----------------- Consolidated utility functions used across mu, Sanitize company name for use in filenames., Normalize scraped job titles and remove common LinkedIn duplication artifacts., Load Excel with sheet name fallback.     Tries the named sheet first, falls back (+7 more)

### Community 36 - "Community 36"
Cohesion: 0.18
Nodes (2): DashboardControllerTest, FakeDashboardService

### Community 37 - "Community 37"
Cohesion: 0.18
Nodes (12): get_current_user_id(), get_session(), login(), logout(), Authentication and session endpoints for the user-facing web app., Dependency to extract user_id from JWT or request header.     For Phase 1/2 deve, Return the current session user and onboarding status., Create a user account and initialize a cookie-backed session. (+4 more)

### Community 38 - "Community 38"
Cohesion: 0.27
Nodes (13): Applicant, choose_radio_or_checkbox(), close_cookie_banner(), fill_main_application(), fill_self_identification(), main(), open_application(), parse_args() (+5 more)

### Community 39 - "Community 39"
Cohesion: 0.16
Nodes (1): DashboardController

### Community 40 - "Community 40"
Cohesion: 0.29
Nodes (1): TestCompactTailorPrompt

### Community 41 - "Community 41"
Cohesion: 0.29
Nodes (12): Applicant, close_cookie_banner(), fill_application(), fill_by_label(), latest_jobs_file(), load_jobs(), main(), parse_args() (+4 more)

### Community 42 - "Community 42"
Cohesion: 0.15
Nodes (1): ScraperLocationTest

### Community 43 - "Community 43"
Cohesion: 0.23
Nodes (2): page(), TEKsystemsSearchTests

### Community 44 - "Community 44"
Cohesion: 0.2
Nodes (3): escHtml(), showAnswerModal(), showCoverLetterModal()

### Community 45 - "Community 45"
Cohesion: 0.32
Nodes (11): auth_headers(), category_from_job(), fetch_detail(), fetch_term(), get_token(), location_from_job(), main(), normalize() (+3 more)

### Community 46 - "Community 46"
Cohesion: 0.18
Nodes (10): deliver_jobs(), DeliveredJobPayload, DeliveryRequest, LegacySyncRequest, Internal delivery API for ingestion and matching services., Upsert delivered jobs for one user from the internal matching pipeline., Upsert delivered jobs for one user from the internal matching pipeline., Explicitly rebuild a user's delivered feed from the legacy jobs source. (+2 more)

### Community 47 - "Community 47"
Cohesion: 0.27
Nodes (10): calculate_ats_score(), extract_jd_requirements(), get_location(), main(), Create tailored tech stack based on JD requirements, Create properly tailored points with meaningful changes, Extract specific requirements and keywords from JD, Calculate ATS score based on requirement matches (+2 more)

### Community 48 - "Community 48"
Cohesion: 0.22
Nodes (8): EmailExtraction, Schema for extracting job status events from emails., Simulates / Implements Gmail API scanning for job updates.     Uses Groq to clas, sync_notifications(), EmailNotification, Extracted notifications from job-related emails., list_notifications(), Fetch user-specific notifications extracted from emails.

### Community 49 - "Community 49"
Cohesion: 0.35
Nodes (10): Applicant, close_cookie_banner(), fill_application(), fill_input(), latest_jobs_file(), load_jobs(), main(), parse_args() (+2 more)

### Community 50 - "Community 50"
Cohesion: 0.29
Nodes (9): clear_screen(), main(), mark_as_applied(), Clear terminal screen, Display jobs that haven't been applied to, Mark specified jobs as Applied, Save DataFrame back to Excel, save_excel() (+1 more)

### Community 51 - "Community 51"
Cohesion: 0.28
Nodes (3): init(), loadRecentJobs(), showScreen()

### Community 52 - "Community 52"
Cohesion: 0.44
Nodes (8): build_ai_match_cache_key(), _build_compact_prompt(), _compact_skills(), _extract_json(), _get_client(), maybe_enrich_matched_job_with_ai(), Optimized AI match enrichment for single delivered jobs.  This module lives outs, _truncate()

### Community 53 - "Community 53"
Cohesion: 0.32
Nodes (7): generate_resume_from_workspace(), Workspace-driven resume generation helpers., Replace the most common problematic characters before LaTeX compilation., Recursively sanitize all strings in a JSON-like structure., Generate a PDF resume from the matched-job workspace and return path + download, _sanitize_data(), _sanitize_latex_string()

### Community 54 - "Community 54"
Cohesion: 0.32
Nodes (3): apiSignup(), authenticatedRequest(), uniqueUser()

### Community 55 - "Community 55"
Cohesion: 0.48
Nodes (1): JobFilter

### Community 56 - "Community 56"
Cohesion: 0.43
Nodes (1): JobFilterTest

### Community 57 - "Community 57"
Cohesion: 0.6
Nodes (5): fillElement(), fillPage(), getFieldSignature(), resolvePath(), setNativeValue()

### Community 58 - "Community 58"
Cohesion: 0.47
Nodes (3): fill(), load(), setField()

### Community 59 - "Community 59"
Cohesion: 0.33
Nodes (5): get_db(), init_db(), Database Configuration and Setup --------------------------------- SQLAlchemy OR, Dependency for FastAPI to inject DB session., Create all database tables.

### Community 60 - "Community 60"
Cohesion: 0.47
Nodes (5): normalize_job(), Run the imported portal scrapers and deliver their results to Career OS., Called in FastAPI's background thread; browser scraping runs in child processes., run_portals(), scrape_vendor()

### Community 61 - "Community 61"
Cohesion: 0.7
Nodes (4): cleanLinkedInDescription(), cleanText(), linkedInDescription(), parse()

### Community 62 - "Community 62"
Cohesion: 0.7
Nodes (4): latest_jobs_file(), load_jobs(), main(), parse_args()

### Community 63 - "Community 63"
Cohesion: 0.7
Nodes (4): latest_jobs_file(), load_jobs(), main(), parse_args()

### Community 64 - "Community 64"
Cohesion: 0.7
Nodes (4): latest_jobs_file(), load_jobs(), main(), parse_args()

### Community 65 - "Community 65"
Cohesion: 0.7
Nodes (4): latest_jobs_file(), load_jobs(), main(), parse_args()

### Community 66 - "Community 66"
Cohesion: 0.7
Nodes (4): latest_jobs_file(), load_jobs(), main(), parse_args()

### Community 67 - "Community 67"
Cohesion: 0.7
Nodes (4): latest_jobs_file(), load_jobs(), main(), parse_args()

### Community 68 - "Community 68"
Cohesion: 0.7
Nodes (4): latest_jobs_file(), load_jobs(), main(), parse_args()

### Community 69 - "Community 69"
Cohesion: 0.7
Nodes (4): latest_jobs_file(), load_jobs(), main(), parse_args()

### Community 70 - "Community 70"
Cohesion: 0.7
Nodes (4): latest_jobs_file(), load_jobs(), main(), parse_args()

### Community 71 - "Community 71"
Cohesion: 0.7
Nodes (4): latest_jobs_file(), load_jobs(), main(), parse_args()

### Community 72 - "Community 72"
Cohesion: 0.7
Nodes (4): latest_jobs_file(), load_jobs(), main(), parse_args()

### Community 73 - "Community 73"
Cohesion: 0.83
Nodes (3): find_jd_file(), main(), normalize_text()

### Community 74 - "Community 74"
Cohesion: 0.5
Nodes (0):

### Community 75 - "Community 75"
Cohesion: 0.83
Nodes (3): latest_jobs_file(), load_jobs(), main()

### Community 76 - "Community 76"
Cohesion: 0.83
Nodes (3): latest_jobs_file(), load_jobs(), main()

### Community 77 - "Community 77"
Cohesion: 0.83
Nodes (3): latest_jobs_file(), load_jobs(), main()

### Community 78 - "Community 78"
Cohesion: 0.83
Nodes (3): latest_jobs_file(), load_jobs(), main()

### Community 79 - "Community 79"
Cohesion: 0.83
Nodes (3): latest_jobs_file(), load_jobs(), main()

### Community 80 - "Community 80"
Cohesion: 0.83
Nodes (3): latest_jobs_file(), load_jobs(), main()

### Community 81 - "Community 81"
Cohesion: 0.5
Nodes (3): export_resume_pdf(), Export the active uploaded resume and reviewed tailoring without a LaTeX runtime, Preserve source facts and append reviewed highlights; never reuse another candid

### Community 82 - "Community 82"
Cohesion: 1
Nodes (2): findJobPosting(), parse()

### Community 83 - "Community 83"
Cohesion: 0.67
Nodes (1): # IMPORTANT: main.py currently writes to outputs/role_name/job...xlsx

### Community 84 - "Community 84"
Cohesion: 0.67
Nodes (0):

### Community 85 - "Community 85"
Cohesion: 1
Nodes (2): main(), normalize()

### Community 86 - "Community 86"
Cohesion: 1
Nodes (2): main(), normalize_for_match()

### Community 87 - "Community 87"
Cohesion: 0.67
Nodes (1): DashboardApplication

### Community 88 - "Community 88"
Cohesion: 0.67
Nodes (1): ResumeTest

### Community 89 - "Community 89"
Cohesion: 0.67
Nodes (1): Browser regression checks using synthetic responses; no real accounts or AI call

### Community 90 - "Community 90"
Cohesion: 1
Nodes (0):

### Community 91 - "Community 91"
Cohesion: 1
Nodes (0):

### Community 92 - "Community 92"
Cohesion: 1
Nodes (0):

### Community 93 - "Community 93"
Cohesion: 1
Nodes (0):

### Community 94 - "Community 94"
Cohesion: 1
Nodes (0):

### Community 95 - "Community 95"
Cohesion: 1
Nodes (0):

### Community 96 - "Community 96"
Cohesion: 1
Nodes (0):

### Community 97 - "Community 97"
Cohesion: 1
Nodes (0):

### Community 98 - "Community 98"
Cohesion: 1
Nodes (0):

### Community 99 - "Community 99"
Cohesion: 1
Nodes (0):

### Community 100 - "Community 100"
Cohesion: 1
Nodes (0):

### Community 101 - "Community 101"
Cohesion: 1
Nodes (0):

### Community 102 - "Community 102"
Cohesion: 1
Nodes (0):

### Community 103 - "Community 103"
Cohesion: 1
Nodes (0):

### Community 104 - "Community 104"
Cohesion: 1
Nodes (0):

### Community 105 - "Community 105"
Cohesion: 1
Nodes (0):

### Community 106 - "Community 106"
Cohesion: 1
Nodes (0):

### Community 107 - "Community 107"
Cohesion: 1
Nodes (0):

### Community 108 - "Community 108"
Cohesion: 1
Nodes (0):

### Community 109 - "Community 109"
Cohesion: 1
Nodes (0):

### Community 110 - "Community 110"
Cohesion: 1
Nodes (0):

### Community 111 - "Community 111"
Cohesion: 1
Nodes (0):

### Community 112 - "Community 112"
Cohesion: 1
Nodes (0):

### Community 113 - "Community 113"
Cohesion: 1
Nodes (0):

### Community 114 - "Community 114"
Cohesion: 1
Nodes (0):

### Community 115 - "Community 115"
Cohesion: 1
Nodes (0):

### Community 116 - "Community 116"
Cohesion: 1
Nodes (0):

## Knowledge Gaps
- **229 isolated node(s):** `Internal delivery API for ingestion and matching services.`, `Upsert delivered jobs for one user from the internal matching pipeline.`, `Explicitly rebuild a user's delivered feed from the legacy jobs source.`, `Upsert delivered jobs for one user from the internal matching pipeline.`, `Explicitly rebuild a user's delivered feed from the legacy jobs source.` (+224 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 90`** (2 nodes): `ashby.js`, `parse()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 91`** (2 nodes): `greenhouse.js`, `parse()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 92`** (2 nodes): `indeed.js`, `parse()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 93`** (2 nodes): `lever.js`, `parse()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 94`** (2 nodes): `workday.js`, `parse()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 95`** (2 nodes): `analyze_resume_rows.py`, `analyze_new_jobs()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 96`** (2 nodes): `update_excel_analysis.py`, `update_excel_smart()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 97`** (2 nodes): `dump_batch1.py`, `normalize()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 98`** (2 nodes): `clean_master_excel.py`, `clean_master_excel()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 99`** (2 nodes): `clean_recent_run.py`, `clean_recent_run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 100`** (2 nodes): `retroactive_tailor.py`, `main()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 101`** (2 nodes): `login_helper.py`, `login_and_save()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (2 nodes): `mass_update_tech_stack.py`, `main()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 103`** (2 nodes): `update_excel_with_json_paths.py`, `main()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 104`** (2 nodes): `onboarding.spec.js`, `signedInCtx()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 105`** (2 nodes): `test_save_job.py`, `test_save_job()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 106`** (1 nodes): `parse_html_again.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 107`** (1 nodes): `setup.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 108`** (1 nodes): `vite.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 109`** (1 nodes): `check_columns.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 110`** (1 nodes): `celery_app.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 111`** (1 nodes): `auth.spec.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 112`** (1 nodes): `playwright.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 113`** (1 nodes): `scoring.spec.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 114`** (1 nodes): `security.spec.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 115`** (1 nodes): `ui.spec.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 116`** (1 nodes): `setupTests.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Job` connect `Community 1` to `Community 13`, `Community 40`, `Community 9`, `Community 15`, `Community 42`, `Community 2`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `User` connect `Community 1` to `Community 7`, `Community 37`, `Community 32`, `Community 13`, `Community 40`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `MatchedJob` connect `Community 1` to `Community 13`, `Community 40`, `Community 2`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Are the 263 inferred relationships involving `User` (e.g. with `CoverLetterRequest` and `AnswerQuestionRequest`) actually correct?**
  _`User` has 263 INFERRED edges - model-reasoned connections that need verification._
- **Are the 200 inferred relationships involving `MatchedJob` (e.g. with `JobUpdate` and `Config`) actually correct?**
  _`MatchedJob` has 200 INFERRED edges - model-reasoned connections that need verification._
- **Are the 187 inferred relationships involving `Job` (e.g. with `JobUpdate` and `Config`) actually correct?**
  _`Job` has 187 INFERRED edges - model-reasoned connections that need verification._
- **Are the 150 inferred relationships involving `TailorServiceError` (e.g. with `JobUpdate` and `Config`) actually correct?**
  _`TailorServiceError` has 150 INFERRED edges - model-reasoned connections that need verification._
