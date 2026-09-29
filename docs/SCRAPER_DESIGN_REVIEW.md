# Scraper design review

The September 2026 sourcing-workbench redesign supersedes the earlier forest/mint scraper and shell direction in C2C_PRODUCT_REDESIGN.md. DESIGN.md now owns the visual rules.

## Applied guidance

UI/UX Pro Max supplied density/accessibility guidance. Its installed helper paths were broken, so the design-system query ran from the upstream source checkout. The generated landing-page suggestions were unsuitable for the operating workspace and were not applied.

Taste's general frontend skill excludes dashboards; its existing-project redesign skill was used instead. Impeccable's Operate guidance informed composition and review. Emil Kowalski's guidance informed drawer transitions and keyboard behavior. Google DESIGN.md provides the persistent token/rationale format.

## Changes

The 33-portal directory is now the primary surface, with keyword and exclusion criteria in a narrow rail. Portal search, views for portals with jobs and today's rotation, and ordering help find useful results. Most-jobs-first is the initial order. The original scraping, cancellation, TEKsystems All Days, AI cleanup/undo, selected-job opening, and legacy application controls remain connected.

| Before | After | Why |
| --- | --- | --- |
| Dark forest sidebar and bright rounded controls | Neutral shell, compact controls and one action accent | Make the results carry the hierarchy |
| Large filter cards above competing content | Persistent criteria rail; mobile disclosure | Give the portal list more space |
| Drawer without keyboard dismissal/focus return | Escape, focus containment, return to opener | Preserve the user's place |
| Same movement for all opening methods | 220ms pointer drawer transition, no keyboard/reduced-motion movement | Keep repeated keyboard actions immediate |
| Fixed 100vh embedded frame | Frame sized to available app viewport | Keep the mobile navigation from obscuring controls |

## Validation

- 33 upstream frontend tests, including selected portals across filtered views and Escape/focus return.
- 131 main frontend tests, lint, and production build.
- Browser review at 1500×1000 and 390×844: directory, expanded job detail and mobile criteria; search/view filtering and keyboard dismissal exercised.
- No browser page errors or document/iframe horizontal overflow in these checks.
- Google DESIGN.md lint: zero warnings/errors.
- Impeccable mechanical detector on changed scraper/shell sources: no findings. This is not a complete accessibility certification.
- No real scrape, AI cleanup charge, browser batch opening, or application submission was triggered by visual QA.

A separate Impeccable finish review found no blocking visual defects. Its two requested refinements—readable posting dates without timezone drift and mobile unsaved-state visibility—were implemented.
