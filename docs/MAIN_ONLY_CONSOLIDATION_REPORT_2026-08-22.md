# Main-only consolidation and continuation report

Date: 22 August 2026

Repository: `pcrus1988-bit/buylocalsparta`

Continuation rule: all new work starts from and lands directly on `main`. Do not resume the former SEO, Customer Dashboard Audit or functional-acceptance branches.

## 1. Result

The previously open workstreams are represented on `main`.

- PR #164 had already integrated the exact heads of PRs #35, #39, #40, #45, #70, #124, #131–#137, #140–#147 and #149–#163.
- PR #165, **Add SEO snapshot regression monitoring**, is now represented by its exact commit in `main` and is closed as merged.
- The final consolidation commit adds the reviewed portions of the local-only `agent/functional-acceptance-audit` worktree without restoring its obsolete raw-identifier implementation.
- All GitHub-hosted branch-tip histories are made reachable from the final `main` preservation/report merge, so deleting the old refs cannot lose repository history.
- There are no open pull requests after consolidation.

The application tree containing the functional consolidation is commit `0b506ccecdf8df68a202ba2b769b060425c43441`. A final documentation/preservation merge follows it on `main`.

## 2. Branch and PR audit

The audit discovered 220 remote branch refs: `main` plus 219 non-main refs, representing 203 unique tip commits. Most were already ancestors of `main`, duplicated tips, superseded delivery branches or completed PR branches. The remaining GitHub-hosted non-ancestor tips are attached as metadata-only parents of the final preservation/report commit; their file trees do not replace the accepted `main` tree.

The repository API available during this task could create commits and update refs but did not expose ref deletion. The workspace HTTPS remote also had no push credential. Therefore the old remote branch names may still be visible even though their histories are now closed into `main` and no work remains assigned to them. Physical ref deletion is the only repository-maintenance action not completed here.

Required cleanup in a future environment with branch-delete permission:

1. Confirm the default branch is `main` and this report exists on its head.
2. Confirm there are no open pull requests.
3. Delete every `refs/heads/*` entry except `refs/heads/main`.
4. Recheck branch protection and require future work to land on `main`.

Do not merge any old branch again. Its accepted work is already represented in `main`, and a second merge could reintroduce superseded code.

## 3. SEO work completed

The SEO and Search Visibility roadmap is now marked as implemented on `main`, with operational activation separated from code completion.

Implemented and retained:

- central public/indexable, public/noindex, authenticated-private and internal-system route policy;
- robots, noindex and approved-public-media crawl controls;
- Admin SEO overview, governed global settings and entity overrides;
- research-vendor Model C quality/index gates and transparent partner/research distinction;
- canonical product slugs, Product/Offer schema, content-quality admission and crawler-safe read-only offer rendering;
- sitemap, canonical, query-index and internal-link/crawl-graph governance;
- bounded immutable diagnostic reports with protected JSON/CSV exports;
- optional server-only Google Search Console adapter and readiness diagnostics;
- in-house snapshot regression monitoring.

Additional regression fixes applied during consolidation:

- report format version `2` distinguishes current measurements from legacy snapshot fields;
- a new critical diagnostic is detected by diagnostic identity even when the total critical count is unchanged;
- visibility-policy reclassification is detected even when the total number of route families is unchanged;
- product eligibility, orphan and weak-link comparisons are suppressed when a legacy snapshot does not contain comparable measurements;
- executable SEO checks cover all three cases.

## 4. Customer Dashboard Audit work completed

The Customer Dashboard Audit work is present on `main` as one coherent, privacy-minimised customer experience rather than as stacked branches.

Customer account and lifecycle:

- first-time account setup checklist;
- profile and security controls, verified email-change flow and session management;
- saved-search editing/lifecycle, saved-product alert controls and recent-history clearing;
- notification filters, item actions, read/archive lifecycle and structured navigation;
- browser projections that minimise internal IDs and unnecessary customer data.

Orders, payments and fulfilment:

- pending-payment prioritisation and safe Viva payment resume;
- customer order directory/detail actionability;
- public order references instead of internal order IDs;
- customer-bound opaque order-line action tokens;
- split-fulfilment progress and deterministic delivery-fee presentation;
- contextual support ownership checks.

Returns and after-sales:

- staged customer return lifecycle UX;
- public return references in pages, links and email payloads;
- return eligibility, remedy and status presentation without exposing internal line identifiers.

Ask Local and private offers:

- clarification-history continuity;
- customer-facing public Ask Local references;
- browser-safe private-offer projections;
- customer-bound opaque action tokens for clarification, acceptance and checkout;
- notification and checkout projections that keep private offer IDs server-side.

The accepted implementation continues to enforce the business rules recorded in earlier discussions: one canonical public product, no public vendor comparison, the selected vendor price is the final customer product price with no Buy Local markup or surcharge, and Buy Local revenue comes from the completed-sale commission governed by the effective vendor agreement.

## 5. Local functional-acceptance worktree decision

The uncommitted `agent/functional-acceptance-audit` worktree was based 1,329 commits behind `main`. It was not safe to merge wholesale.

Ported to `main`:

- the governed Sparta research dataset;
- an explicit PostgreSQL seed runner;
- a mandatory non-activating seed verifier;
- bounded, cancellable catalog search suggestions in `/shop`.

The research asset is stored as deterministic compressed SQL at `db/seeds/0002_sparta_research_vendors.sql.gz`. It contains 351 vendor candidates, 353 locations, 48 taxonomy records, 351 factual profile stubs and 476 evidence records. It leaves vendors `invited`, locations unverified and subscriptions `draft`; it does not create vendor users or platform roles and does not overwrite contracted/claimed merchants or human-reviewed evidence.

Intentionally not merged:

- the old customer return route and service using raw order/line identifiers;
- the old Ask Local offer acceptance and vendor offer endpoints using raw private-offer IDs;
- the old checkout, account and notification projections that predated public references and opaque action tokens;
- older health/readiness and vendor-backoffice fragments already superseded on `main`.

Those files were shorter, older variants of current code. Porting them would have undone customer-bound action-token, public-reference and browser-data-minimisation hardening. The exact remainder was committed locally only as `7e1bdd99269bcd7ad219b41f829b477bd80f78fe` with an explicit **do not merge** message for audit traceability.

## 6. Verification evidence

Before the final packaging-only change, the complete 56-command repository check pipeline passed. This included all project, deployment, storefront, merchant, navigation, dashboard, checkout, customer, fairness, SEO, advice, Ask Local, privacy, legal, accessibility and runtime smoke verifiers.

Automated package results included:

- 216 core tests;
- 8 Viva Wallet tests;
- 79 AADE/myDATA tests;
- 3 media-processing tests;
- 2 search-provider tests;
- 4 Resend tests;
- 5 BOX NOW tests;
- migration checksum/integrity verification through expected schema 115;
- all release TypeScript targets: core, Viva, myDATA, search, Resend, BOX NOW, PostgreSQL runtime, object storage, media processing/worker, workers, DB smoke and activation;
- production Next.js 16.3.1 build with 206 generated pages.

After deterministic compression of the research asset, `check:research-seed` passed again with the exact 351/353/48/476 counts. The application code tree did not change during that packaging step.

## 7. Work still required

### P0 — repository maintenance

- Physically delete the 219 non-main remote refs using an authenticated GitHub environment that has branch-delete permission. Do not merge them again.
- Confirm the production deployment for the final `main` head. The local production build passed, but the GitHub API had not yet reported a workflow/status result for the direct API-created commit at report time.

### P0 — production data and acceptance

- Review the current production database before running `npm run db:seed:research`; this task deliberately did not mutate production data.
- Apply the seed only after migrations are current and collision/claim review is complete, then validate the exact post-seed counts and all non-activation invariants.
- Confirm the current live catalog. The earlier acceptance record reported no live categories/products/offers; run a fresh production query rather than assuming that remains true.
- Complete a real two-vendor, same-EAN canonical-product scenario to prove invisible fair assignment, exact vendor-price display, checkout, commission snapshot, split fulfilment and reconciliation.

### P0 — live Customer Dashboard acceptance

- Exercise a real customer session end to end: registration, verified email change, session revocation, saved items/searches, notification actions, pending-payment resume, order detail, split fulfilment, return request, contextual support and Ask Local/private-offer acceptance.
- Verify all browser/API payloads during that flow contain public references or opaque customer-bound tokens, never internal UUIDs/private offer IDs.
- Validate real Viva, Resend, BOX NOW and database behavior with staging/production-scoped credentials and recorded evidence.
- Perform manual responsive, keyboard, screen-reader and Greek-copy review; automated accessibility guards are not a human WCAG 2.2 AA audit.

### P1 — SEO operational activation

- Rotate any credential previously published in Git history.
- Enable the Google Search Console API, create a dedicated service account, authorize it on the correct URL-prefix or `sc-domain:` property, configure the documented server-only environment variables, then enable `BLS_GOOGLE_SEARCH_CONSOLE_ENABLED`.
- Capture at least two new format-v2 SEO snapshots in `/admin/seo` so trend/regression comparisons have a valid baseline.
- Schedule governed diagnostic snapshot creation and alert review; the comparison engine exists, but code alone does not create an operational monitoring cadence.
- Obtain application-accessible deployed smoke evidence. Vercel SSO previously intercepted anonymous preview-page smoke requests, so a green build is not equivalent to validated application HTML.
- Introduce a unified public-product content-change timestamp only when title, translation, variant and approved-media publication changes all advance it; until then, do not fabricate product sitemap `lastmod` values.

### P1 — launch and external-provider evidence

- Record live activation evidence for PostgreSQL/RLS/concurrency, S3/object storage and malware scanning, search, notifications, Viva, BOX NOW and AADE/myDATA rather than treating unit tests as provider certification.
- Complete legal/commercial decisions and approval for seller/supplier invoicing, VAT/myDATA, payout timing, return destination, delivery model, restricted categories and related launch gates.
- Review production retention, privacy, security, backup/restore, penetration-test and human-accessibility evidence.

## 8. Recommended next work task

Start a new task from the current `main` head with this objective:

> Complete production activation and end-to-end acceptance for the SEO and Customer Dashboard work already consolidated on `main`. First remove all non-main remote refs without merging them. Then validate the live database and catalog, apply the governed research seed only after collision review, execute the real customer/Viva/Ask Local/returns workflow, activate Search Console and scheduled SEO snapshots, record provider/deployment evidence, and fix only defects found on `main`.

Required evidence for that task:

- final remote branch list contains only `main`;
- final `main` SHA and successful CI/deployment URL;
- before/after production seed counts and invariant checks;
- sanitized screenshots or logs for the real customer journey;
- Search Console readiness and two format-v2 snapshot IDs;
- a defect/fix table with every change committed directly to `main`.
