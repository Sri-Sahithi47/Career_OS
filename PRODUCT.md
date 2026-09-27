# CareerOS
<!-- impeccable:product-schema 1 -->

## Platform
web

## Users and purpose
People finding C2C contract opportunities. The user wants to reduce repetitive sourcing effort and eventually sell the product as SaaS. Whether the primary buyer is an individual consultant or a staffing team remains an open decision.

## Operating context
The working app combines CareerOS job discovery, shortlist, application tracking, profile tools, a browser extension, and 33 staffing portal scrapers. The current task focuses on the scraper and its surrounding app shell. The latest upstream React scraper from commit b143a3f is integrated; its older application controls remain separately accessible.

## Capabilities and constraints
Keep all portal, filtering, scraping, stop, job selection, AI cleanup/undo, and browser-opening actions. Real backend values supply counts and dates. C2C eligibility needs verification with the recruiter; a matching job is not a confirmed C2C lead. AI cleanup uses the local Claude CLI. Local authentication and workers are present; hosted multi-tenant deployment and billing are not complete.

## Evidence
Existing source, working local application, authenticated demo account, upstream repository, and prior user instructions. Do not fabricate prospects, sourcing metrics, customers, pricing, or outcomes.
