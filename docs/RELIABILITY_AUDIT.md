# Reliability audit — 2026-09-27

This is a local working-tree audit, not a production certification. Changes have not been committed or pushed. Automated tests use temporary databases and fixtures; they do not establish that every external job portal works today.

## Implemented and covered by automated checks

| Failure mode | Change / evidence |
|---|---|
| Full description becomes a snippet | Extension capture caps removed, including generic-page fallback; scraper Save prefers raw text; subsequent imports preserve longer descriptions. Long-text and reimport regression tests. |
| Same title/company incorrectly reports duplicate | Posting URL is identity; conservative marketing-parameter normalization preserves requisition parameters and URL fragments. Distinct requisition tests. |
| Simultaneous saves or retry after lost response | Database uniqueness conflicts roll back and retry against the committed record. Concurrent two-session test produces one Job and one MatchedJob. |
| Source job exists without user-facing record | Re-save repairs the missing MatchedJob instead of inserting a duplicate source row. |
| Save succeeds but shortlist fails | Scraper requests `special_interest` in the save transaction, eliminating the second network mutation. Rollback fault test. |
| Archived job is re-saved | Restores visibility and preserves notes/application status; can shortlist atomically. |
| Another user's data appears | Main and original scraper outputs, keywords, opener paths and seen history use account directories. Removed automatic cross-account legacy-job seeding. Account isolation fixtures. |
| Applied marks disappear over time | Removed original scraper's two-hour expiry; marks persist until explicitly cleared. Seven-day fixture. Already-expired marks cannot be reconstructed. |
| Extension saves stale displayed job | Re-detects at save, checks title and posting identity, refuses missing/changed selections. Site parser precedes JSON-LD; fixtures cover changed navigation and messaging failure. |
| One portal blocks all runs forever | Java process deadline 900 seconds per portal; output drained with a bounded 5,000-character tail. Timeout test verifies termination. |
| Lost start response / missing worker status | Kill worker process tree before unlocking; bounded monitor retries and four-hour run deadline. Lock retained if shutdown cannot be confirmed. Failure-injection tests. |
| One portal delivery failure discards other successes | Deliver successful portals independently; skip malformed rows; report partial delivery error. Fixture verifies next portal still delivers. |
| Settings/history files are half-written | Same-directory temporary writes and replacement for Java configuration/AI-hidden lists and original UI settings/history. Existing save/reload tests cover normal persistence. Power-loss/disk-full tests remain pending. |
| Corrupt config silently resets preferences | Java dashboard reports failure, preserves damaged file, and does not leave run flag set. Corrupt-file regression test. |
| Corrupt result file looks like zero jobs | Portal status reports read failure; Results requests the failed portal and surfaces loading error. Java corrupt-file test. |
| In-memory history/output grows forever | Java history capped at 50 runs, per-process captured output capped, backend log rotated on worker restart over 5 MB. Live multi-day resource behavior still needs soak testing. |
| Oversized descriptions silently cut | API validates a 50,000-character maximum and rejects larger payloads. Validation regression test. |
| Invalid DOC upload accepted inconsistently | Reject invalid legacy DOC signatures before platform converter invocation. Existing upload error test now passes. |
| Backup endpoint falsely claims success | Unimplemented endpoint returns 501 stating no backup was created. A backup/restore feature is still required. |

## Remaining release checks and limitations

| Priority | Area | Required work / verification |
|---|---|---|
| P0 | Real-site extraction | Verify LinkedIn, Indeed, Dice and the user's reported sites with collapsed descriptions, loading panels, JSON-LD, iframes and signed-in state. Fixture coverage is not live-site coverage. |
| P0 | Existing saved data | No automatic repair of historical false merges/truncation. Reopen and re-save original postings; do not guess ownership of historical shared output files. |
| P0 | Durability/recovery | Test database backup and restoration, migrations, low disk space and interruption during output writes. Source scraper JSON writers are not all atomic yet. |
| P0 | SaaS account isolation | Scoped workspace routes and relevant DB paths tested; a full endpoint/file-download audit is still required. Legacy administrative helpers should be reviewed before exposing a hosted service. |
| P1 | URL identity | URL-less saves derive identity from text; edited text is treated as a new posting. Generic listing URLs, reposted requisitions and additional site-specific aliases require fixtures before changing matching rules. Existing noncanonical historical URLs are not migrated. |
| P1 | Description completeness | Longer text is a preservation heuristic, not proof of completeness. Equal-length corrected or shorter legitimate revisions are not auto-replaced. DOM text may still omit collapsed/unloaded content. |
| P1 | Concurrency across ingestion paths | Manual-save conflict recovery tested. Simultaneous manual saves and background imports, and concurrent edits to existing records, need more fault tests. |
| P1 | Portal failure classification | Check CAPTCHA, 429, blocked login and changed markup per portal. A portal script may still exit successfully with zero results for a blocked page. |
| P1 | Partial-output recovery | Failed delivery reports an error and keeps account files; no persisted background delivery retry queue. API restart during a run can require rerunning the search. |
| P1 | Original and scheduled runners | Original UI retains its own subprocess lifecycle; main Java timeout coverage must not be assumed to cover every scheduled/legacy runner. |
| P1 | Stop/restart and sleep | Verify real browser descendants, cancellation under load, laptop sleep/wake and API restart on each supported OS. Shutdown failure deliberately retains the shared lock; operator restart may be required. |
| P1 | Date filtering | Jobs outside saved date filters can disappear from scraper results while remaining saved in the app. Need clearer total-versus-filtered UI and timezone/DST fixtures. |
| P1 | AI cleanup | Verify concurrent cleanup/undo, interruption and mistaken exclusions. Saved hidden-list writes are atomic, but AI classification is not guaranteed correct. |
| P1 | Auth/network | Live expiry, CSRF refresh, logout in another tab and offline/reconnect checks across popup, content script and web app are pending. |
| P1 | Reproducible installation | JS lockfiles exist; Python dependency resolution is not fully locked. Validate a supported Python/Java/browser matrix and fresh install before publishing a release. |
| P1 | Extension update compatibility | Reload installed extension after updating. Verify old-extension/new-API compatibility and permissions on actual browser builds. |
| P2 | UI state | Saved markers in scraper Results are session-local. Check stale responses, rapid filters, accessibility, mobile forms and unsaved edits. C2C restrictions now inspect full available text, but wording variants need broader coverage. |
| P2 | Diagnostics | Worker errors are visible, logs exist; no complete sanitized diagnostic bundle with app/extension/runtime versions. Backend log rotation happens at worker restart, not continuously. |
| P2 | Soak | 72-hour test with repeated searches/saves, idle periods, sleep/wake and restarts has NOT been performed. Record memory, process count, log/disk growth, lock recovery and description integrity. |

## Rollout notes

- Restart the backend after updating and reload the unpacked browser extension. A rebuilt Java JAR does not replace a worker that is already running.
- Account-scoped scraper folders start empty if previous output was shared. Saved jobs in the database remain; run a fresh account search. Shared historical files are not copied into arbitrary accounts.
- Existing settings and saved records are not bulk rewritten. Original scraper marks that already expired are not recoverable from the new behavior.
- Do not announce a clean release until fresh-install, live-site and long-running checks above pass.

## Verification completed locally

- Python selected suites: 77 passed (save reliability, scraper workspace, original scraper, portal integration, API endpoints and resume reliability).
- Main dashboard: lint passed, 135 tests passed, production build passed. Includes four extension DOM/message fixtures.
- Scraper frontend: 36 tests passed; production build passed.
- Java backend: 33 tests passed; package/JAR build passed.
- Extension scripts: Node syntax checks passed.
- `git diff --check`: passed after removing whitespace emitted by graph generation.
- Requested `npx graphify hook-rebuild` cannot resolve its executable in this checkout. Fallback `npx --yes --package=graphifyy@0.3.29 graphify hook-rebuild` rebuilt `.graphify` successfully (4,013 nodes, 10,136 edges).

Total across these suites: 281 passing tests. This is selected-suite coverage, not every test in the repository. Existing dependency/deprecation warnings remain. No fresh install, production deployment, real-site extension session or 72-hour soak was performed during this pass.
