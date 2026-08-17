# Buy Local Sparta — Build 0.31.0 Report

**Release:** 0.31.0  
**Date:** 15 August 2026  
**Baseline:** Build 0.30.0

## Purpose

Build 0.31.0 completes the next production-web Admin governance slice while preserving the existing Core marketplace invariants. It also fixes a product-safety propagation inconsistency discovered during release review: the governed catalog could suppress/recall a canonical product while the older Next.js storefront projection could still treat that product as publicly available.

## Admin Command Centre expansion

New authenticated production Next.js Admin surfaces now cover:

- consolidated customer orders and platform-governed returns/remedies;
- verified-review moderation and vendor report resolution;
- processing of the same customer privacy-request queue used by the account workspace;
- category commerce-policy governance;
- CMS draft/create/publish/archive/restore lifecycle;
- product recalls and affected-customer operations;
- 30-day platform market analytics;
- preview maintenance/search reconciliation over the scheduled-job contracts.

All Admin mutations remain protected by the separate platform session, Core RBAC permission checks and CSRF validation. Vendor/customer principals cannot acquire these actions.

## Critical inconsistency fixed — recall/compliance propagation

### Problem

The Admin trust/catalog layer correctly marked a recalled or compliance-held canonical product as `suppressed`/`recalled`, but the production Next.js catalog/account/checkout adapters still derived availability from the older commerce demo projection. A governed safety hold could therefore fail to propagate to every customer-facing surface.

### Fix

Build 0.31 centralizes the production-web public-commerce admission rule in `canonicalIsPubliclyAllowed()` using the governed canonical record:

- canonical must exist;
- `active === true`;
- `suppressed === false`;
- `recalled === false`.

That rule is now consumed by:

- public catalog/search card resolution;
- product-detail metadata/lookup;
- vendor public catalog projection;
- customer canonical availability;
- saved-search matching;
- checkout admission.

Suppressed products are filtered before Fair Vendor Exposure selection, avoiding both unsafe sale and phantom fairness exposure. Checkout independently rejects held/recalled products as defense in depth. Resolving a notice does not silently republish the product: all blocking notices must be closed and the product must be explicitly restored.

The project consistency gate now fails if this propagation is removed from catalog, account or checkout paths.

## Verification

The exact versioned Build 0.31.0 source passed:

- **209/209 Core automated tests**;
- **28/28 immutable SQL migration checksum checks**;
- project consistency/security regression gate;
- **4/4** generated development UI syntax checks;
- **6/6** structural accessibility checks;
- complete dependency-free HTTP marketplace critical-journey smoke test;
- **119 production-web TypeScript/TSX files** dependency-free syntax transpilation with zero errors;
- relative-import resolution scan with zero missing local imports;
- direct Build 0.31 Admin governance integration proof covering category governance, CMS publication, shared privacy queue, Admin projections, maintenance scheduler and recall lifecycle;
- focused cross-layer product-safety proof: visible product → recall → catalog/account/saved-search suppression → explicit resolve/restore → visible again.

No immutable SQL migration was edited.

## Production boundaries retained

This release does **not** claim production infrastructure that is unavailable in the current execution environment:

- A genuine Node 24 `next build` remains a CI/deployment gate because the Next/React dependency tree cannot be freshly installed here due package-registry/DNS restrictions.
- PostgreSQL/PostGIS has not been live-executed in this container; production multi-instance state must cut over from the preview singletons to the already-prepared persistence contracts.
- S3-compatible object storage/malware processing, production search, durable workers, notification providers, PSP/payment, ERP/myDATA, courier and Google Calendar/Meet adapters remain provider/infrastructure gates.
- Real payment capture and tax-document activation remain gated on the documented legal/accounting/PSP approvals.

## Recommended next step

The project now has broad top-level customer, Vendor and Admin Next.js surfaces. The next highest-value phase is **production persistence/infrastructure cutover**, beginning with PostgreSQL-backed shared identity/catalog/commerce/account/vendor/Admin state and a real Node 24 Next.js build/CI pipeline. This should precede another large feature-expansion pass.
