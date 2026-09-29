# Incremental job collection

## Delivered behavior

The CareerOS scraper's **Collected jobs** tab is backed by the application database.
It imports existing account-owned portal output files in timestamp order and retains
postings when later outputs omit them. Loading or filtering the collection does not
start a scrape or require starting the Java worker.

- Portal + source ID is the preferred identity; normalized URL is the fallback.
  URL aliases handle a source adding/removing its identifier and changing URLs.
  Different portals and accounts remain distinct. Titles are never identities.
- First found, last seen, posting date, review state and material changes are stored.
- New to review, All collected, Updated, Reviewed and Dismissed views support
  server-side search, pagination, portal/company group, location, remote, engagement,
  and date filters.
- Date presets use the browser's local calendar boundaries converted to UTC.
  Custom ranges include the entire selected end date. Unknown posting dates can
  remain visible.
- Mark reviewed, dismiss and restore work individually or for the selected page.
  Saving uses the existing shortlist API; application state is read from that
  database rather than reset by imports.
- Files that cannot be decoded remain retryable. Each valid output imports in one
  transaction with a durable checkpoint. Previously imported files are skipped.
  Finished portal outputs can import while the rest of a run continues.
- Search settings and portal steps are stored separately from user-facing jobs.
  On restart, unfinished recorded runs become interrupted. Output replay recovers
  completed files; the existing retry queue can rerun unfinished portals.
- A shorter, apparently truncated description never replaces a substantially more
  complete collected description. Old observations cannot overwrite newer details.
- Missing from a search does **not** mean closed, and no automatic closure occurs.

## Fetch optimization

Listing/search requests remain live. There is deliberately no "stop at first known
job" shortcut or global date watermark: these could skip backdated jobs, new
keywords, reordered results or expanded date windows.

CAREEROS_DETAIL_CACHE is set by the Java workspace runner to an account-specific
directory. Parsed detail results are reused for six hours for Apex, Akkodis,
Artech, CBTS and Insight Global. The shared search-page adapter caches detail pages
only when valid JobPosting structured data includes a substantive description.
Listing metadata changes invalidate the named adapters' cache entries. Parser code
changes and the cache version also invalidate entries.

Several other portals return complete descriptions in their search/feed response;
there is no separate detail request to skip on those paths. This change does not
claim that every portal makes zero repeated HTTP requests.

Invalid, empty, incomplete and failed detail results are not cached. Cache writes
are atomic; cache failure does not prevent a live fetch. **Refresh portal details**
runs that portal with force_refresh enabled, bypassing detail caches. It refreshes
the portal under current search settings, not a single out-of-window posting.

AI title review decisions are reused for identical content, keywords, ignored
titles and rule version. Changed inputs produce a new cache key. Undo clears the
decision cache and hidden IDs. These are screening decisions, not confirmation of
C2C eligibility. Raw discoveries remain stored, but **Collected jobs only displays
AI-approved postings**. Every view, count, location facet and page uses this same
approval filter. Approval receipts must match the stored content and current search
criteria. Missing, corrupt, rejected or outdated receipts never grant approval.
Undo clears approval receipts. Older successful reviews can be recovered only
when their saved rejection file is newer than both the exact output and settings.

## Existing data and migration

init_db() creates four additive tables: collected_postings, collection_imports,
posting_observations and collection_runs. Existing job and shortlist tables
are not rewritten or removed.

Historical discovery times use the earliest available output file modification
time. We cannot reconstruct earlier discoveries if those outputs were deleted or
their timestamps changed. A first import labels historical jobs as unreviewed,
not as newly posted today. Collection dates and posted dates are separate.

The standalone upstream Java dashboard does not serve the collection endpoints;
use the integrated CareerOS application for Collected jobs.

## Limits and follow-up work

- An interrupted portal restarts its listing scan; page-level resume is not yet
  available. Completed imported postings/details survive.
- Portal adapters that silently return partial results need explicit coverage
  metadata before the UI can distinguish all forms of partial coverage.
- Cross-agency similarity suggestions, automatic closure verification, saved
  search profiles, schedules and notifications are not part of this change.
- The collection does not automatically apply an old AI title rejection to all
  future versions of a posting. Changed postings need AI review again before appearing.
- The per-process import lock matches the current single-API-worker setup.
  Database uniqueness protects identities; multi-worker import coordination
  would need database-level retries/locking.
- No full 33-portal live scrape or long-running soak was performed for this change.
  Offline adapter, storage, UI and Java tests cover repeat-run behavior.
