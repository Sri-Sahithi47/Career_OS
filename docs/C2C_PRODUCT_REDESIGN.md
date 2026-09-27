# CareerOS: C2C workspace redesign

## Product intent

The initial customer is an individual consultant seeking a C2C contract. This is a working assumption pending customer validation. The primary task is to collect opportunities, establish whether the engagement is suitable, prepare an application, and keep track of the next step. Bench-sales teams managing multiple consultants need an additional consultant/client data model; that is outside this UI release.

## Research and decisions

Reviewed primary product sources on September 22, 2026:

- [Teal browser extension](https://www.tealhq.com/tool/job-search-chrome-extension): connects job capture, fit information, and a central tracker. Decision: give the browser companion a visible home in the app and keep capture simple.
- [Huntr extension guide](https://help.huntr.co/en/articles/9859408-the-huntr-chrome-extension): saving jobs and reusing profile information are complementary browser tasks. Decision: retain save, autofill, and application preparation as distinct actions.
- [Simplify autofill settings](https://help.simplify.jobs/en/help/articles/8686025-manage-autofill-settings-in-the-simplify-extension): exposes control over individual autofill fields and automation. Decision: retain profile and voluntary disclosure settings; explain review before submission.
- [Simplify custom application tracking](https://help.simplify.jobs/articles/9861158-adding-custom-applications): supports collecting applications from outside its own database. Decision: preserve manual job capture alongside portal searches and extension capture.

These are observations of competitor workflows, not proof of demand or conversion performance. The C2C differentiation is a product hypothesis: users should be able to inspect engagement restrictions and recruiter context before investing in an application.

## Interface

Visual thesis: a calm, light working surface with a forest navigation rail and a restrained teal action color. Typography, separators, and alignment provide hierarchy rather than decorative cards.

Content plan: daily overview; discovery list and job inspector; shortlist and pipeline; sourcing and preparation tools; profile preferences and browser companion setup. Authentication explains the product without invented customer counts, testimonials, or subscription claims.

Interaction thesis: brief workspace entrance, quiet row hover/selection, and persistent inspector actions. Honor reduced-motion preferences. On small screens, a workspace menu exposes secondary tools and a bottom navigation keeps the core workflow accessible.

### Screens

- Overview: counts derived from loaded account jobs, latest opportunities, and next-step links.
- Find contracts: collected feed, contract-term filter, role/location/date filters, resizable inspector, recruiter contact when supplied, notes, and an editable pipeline stage.
- Shortlist: existing saved-role workflow, shared visual treatment.
- Application pipeline: restores the existing working stage board to the main navigation.
- Job Scraper: all 33 portal controls retained with the shared visual theme. Original queue and browser-opening behavior remains available.
- Keyword Bank and Resume Check: shared color and surface treatment; existing analysis flows retained.
- Settings/onboarding: shared styling; simpler profile-oriented language.
- Browser companion: actual popup, sign-in, options page, and injected controls restyled; local installation guide in the app.

## Contract evidence

The interface distinguishes explicit C2C mentions, detected restrictions, and unknown terms. This is a local text heuristic over title, employment type, and description. Restrictions take precedence over positive mentions. A generic contract, W2, or 1099 label is not treated as confirmed C2C. Labels require recruiter confirmation; they are not a verified eligibility or legal classification service. Source descriptions can be incomplete and text heuristics cannot recognize every negation.

## Before selling a hosted SaaS

This release changes the working product UI; it does not implement a hosted SaaS business. Follow-up engineering needs include tenant-safe configuration and worker isolation (including the legacy scraper), hosted authentication/account recovery, subscription and entitlement management, deployment and operational monitoring, and replacing local extension URLs with deployment configuration. Do not market these as delivered capabilities.

Product validation should measure time from capture to a qualified opportunity, rate of unsuitable contract results, repeat weekly use, and whether users keep their pipeline current. Interview consultants and bench-sales users separately before deciding whether to expand into multi-consultant account management.

## Validation

- Dashboard lint, unit/component tests, and production build passed (131 tests).
- Browser inspection covered all nine workspace routes and five mobile routes without page errors or document overflow.
- Real account data exercised the C2C filter; two opportunities contained positive mentions.
- The embedded scraper still rendered 33 portals and its Judge Group controls.
- The unpacked Chromium extension was loaded and signed in with the local demo account; popup and options rendered without page errors.
- Application submission was not exercised. Scraping, autofill providers, and generated cover letters were not revalidated across every external site in this UI release.
