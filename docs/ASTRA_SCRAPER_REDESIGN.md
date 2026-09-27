# Astra scraper redesign — September 22, 2026

The user rejected the previous sparse portal table and explicitly requested Astra. An Astra design agent implemented the scraper workspace; the parent implemented its matching application frame and performed integration verification. This revision supersedes the visual direction in SCRAPER_DESIGN_REVIEW.md.

## Research and decisions

Primary product references:
- [Ashby sourcing and CRM](https://www.ashbyhq.com/platform/recruiting/sourcing-crm) keeps sourcing, filtering, extension capture, and subsequent review connected. Adapt the continuity, while recognizing CareerOS searches jobs rather than candidates.
- [Attio lists](https://attio.com/help/reference/managing-your-data/lists/create-lists) separates records, list attributes, and working views. Adapt its stable list and contextual controls, without adding a CRM schema.
- [Gem CRM overview](https://help.gem.com/external/crm-overview) and [Gem CRM](https://www.gem.com/product/crm) show how a working prospect list connects to contextual review and activity.

The work retains the integrated scraper's real actions and data. Portal controls, job review, AI cleanup, the TEKsystems all-days action, browser opening settings, stop actions, and original application controls remain reachable. No invented C2C verification, sales metrics, subscription states, or activity are introduced.

## Visual and interaction review

| Before | After | Why |
| --- | --- | --- |
| Flat white table and a thin undifferentiated rail | White work surfaces on a cool-gray canvas with a clear search inspector | Make task boundaries and hierarchy visible |
| Plain portal names with repeated empty zeroes | Portal identity, differentiated result counts, and source state | Help people find useful results while scanning |
| Small nav labels and a generic briefcase mark | Consistent 13px navigation and a CareerOS mark | Give the product frame a deliberate identity |
| Two full-width legacy/workspace tabs above the page | Compact workspace switch in a slim context bar | Keep compatibility controls accessible with less prominence |
| Browser tab titled “dashboard” with Vite icon | CareerOS title, description, and matching favicon | Complete the surrounding product surface |
| Routine transitions mixed with older app styles | Explicit short color feedback, reduced-motion handling, and retained drawer focus behavior | Keep repeated operations responsive and predictable |

Public Sans remains self-hosted. Use one iris accent, midnight ink, neutral borders, 8px controls, and 12px principal surfaces. The canonical tokens and rationale live in DESIGN.md.

## Verification

- Main frontend: 131 tests pass; lint and production build pass.
- Scraper frontend: 33 tests pass; production build passes.
- Browser: all 33 portal rows, live search, empty search state, keyboard drawer opening/closing with focus restoration, mobile dirty-settings indicator, and reduced motion verified.
- Responsive widths: 1500, 1366, 1024, 390, 375, and 844px. No document or iframe horizontal overflow; no page errors.
- Visually inspected desktop, laptop, mobile, expanded mobile settings, and job details. Final mobile pass reduces nonessential header space. Corrected secondary text contrast on the gray canvas.
- Impeccable detector reports no findings on the changed workspace files.
- Screenshots: `/tmp/careeros-astra-review/`.

Functional checks did not launch real scrape runs, open batches of third-party pages, submit applications, or invoke paid AI cleanup. This is a local UI revision, not a claim that the underlying prototype is production-ready SaaS.
