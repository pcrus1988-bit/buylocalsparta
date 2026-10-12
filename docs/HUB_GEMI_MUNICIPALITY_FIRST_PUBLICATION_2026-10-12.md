# Municipality-first GEMI HUB directory — 12 October 2026

## Owner decision
Exact business coordinates are an optional **later enrichment**, not a prerequisite for presenting an independently reviewed factual GEMI business profile.

Separate distinct assertions:
- **Registry verified**: independently matched legal identity/GEMI record and attributable registry source, with timestamp and recorded verifier (including explicitly named automation for deterministic matches).
- **Location**: reviewed municipality-to-HUB *directory classification*. This **never** verifies a physical address, distance from HUB centre, delivery coverage, or 25-km seller radius.
- **Ownership verified**: ONLY a successful CLAIM/PRESENCE/SHOP/GROWTH/PRO onboarding workflow. Registry presence does not convey representation, credentials, contract, or merchant status.
- **Privacy/editorial reviewed**: independent publication permission and factual-quality review. Sensitive sole-trader records require special attention; sources that are public do not automatically waive GDPR safeguards.
- **SEO reviewed**: independent explicit seo_approved, with minimum indexed directory quality controls.

## Schema and runtime
Migration 0447 adds municipality publication basis, separate directory_hub_slug, and official registry-verification evidence. The legacy verified-premise publication mode remains intact. The verified municipal publication path no longer requires latitude, longitude or a claimed 25-km business distance. It still requires reviewed municipality correspondence (trigger), identity provenance, owner/partner deduplication, privacy and editorial review.

Public queries project only published entries; they return the selected hub based on precise vs municipal publication mode, never research emails, tax numbers, addresses, participation lists, or private evidence. The business profile displays a conspicuous disclosure for municipality-only groupings, without pins or guessed coordinates.

## Private initial classification
Use scripts/stage-hub-gemi-municipality-directory.ts. Dry-run by default; --apply requires KM_GEMI_MUNICIPALITY_STAGE_APPROVED=true. Maximum 10,000 per batch; --after=GEMI is supported. This stages reviewed municipality-to-HUB associations **privately** without asserting verified identity, rights, or publication. Current review corpus has 86 municipality matches covering ~97,208 research records across approximately 60 HUB candidates.

## Release order
1. Commit migration + checksum + UI + script, run Production CI, security and browser acceptance.
2. Apply database migration, read back the new fields/check/policy/trigger.
3. Dry-run staging; apply bounded private municipality classification for reviewed matches.
4. Validate deterministic official GEMI identity references and exact legal-name matches; record verifier identity honestly.
5. Approve legal/privacy, editorial data quality, and SEO eligibility per governed publication policy, or by independently validated cohorts meeting that policy. Do not auto-approve solely because a municipality name was reviewed.
6. Publish only rows passing database gates; verify page canonical/robots/CLAIM path and active-partner suppression. Geographic enrichment remains asynchronous optional workflow but not condition of directory publication.

## Invariants
- A municipality centre never becomes the business latitude/longitude.
- No row receives a fake business_geo_verified_at or anonymous/human reviewer.
- No accidental publication from source import, owner approval of a municipality name alone, or a provisional directory grouping.
- No duplicate public record competing with a canonical active seller or converted CLAIM.
- Precise geo can later replace administrative basis following premise review without changing stable business slug or directory URLs.
