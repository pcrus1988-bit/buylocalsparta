# Direct official GEMI identity verification — 12 October 2026

## Why
313,911 private GEMI research profiles, of which 97,206 have municipality-level HUB grouping across 60 HUBs. The official lookup cache has only 14 rows and currently supplies no eligible exact matches.

Official GET https://opendata-api.businessportal.gr/api/opendata/v1/companies/{arGemi} provides individual published registry details. Technical docs: https://opendata-api.businessportal.gr/opendata/docs/ and https://opendata.businessportal.gr/techdocs/.

## Implementation
scripts/verify-hub-gemi-official-direct.ts and a pure tested policy. Default is database-only preview with no GEMI network call or write. Live verification requires KM_GEMI_OFFICIAL_IDENTITY_VERIFY_APPROVED=true plus --apply. Default limit 3, maximum 12; --hub=volos and --after=GEMI allow scoped, resumable verification.

The verifier uses direct GET by GEMI ID, sequentially paced at 30.5s or longer between starts, stopping on provider rate-limit (429), credentials error, timeout or server error. A database advisory lock prevents concurrent direct runner processes. The application also uses a separate DB-backed provider limiter; coordinate workloads and respect provider quotas.

Credentials are loaded from GEMI_OPENDATA_API_KEY environment or existing private bls_private.get_gemi_opendata_api_key() Vault bridge. No secrets in URLs/logs. Exact match requires GEMI number, legal name, five-digit postcode, municipality ID and active status (Ενεργή), with no explicitly incomplete registration. Store only official-response SHA-256 ref, automated verifier provenance, verification timestamp; never store the source payload or personal contacts in this runner.

Updates only registry_verified_at, registry_verification_ref, registry_verified_by and updated_at. No owner/marketplace activation, editorial/privacy signoff, SEO or publication writes.

## Commands

Database-only preview, no network and no writes:

    POSTGRES_URL=... node --experimental-strip-types scripts/verify-hub-gemi-official-direct.ts --hub=volos --limit=3

Explicitly approved, private source-identity verification:

    KM_GEMI_OFFICIAL_IDENTITY_VERIFY_APPROVED=true POSTGRES_URL=... node --experimental-strip-types scripts/verify-hub-gemi-official-direct.ts --hub=volos --limit=3 --apply

A record is a candidate only if an approved municipality/HUB name mapping exists, source was checked within 90 days, registry identity and postcode are well formed, no verified partner or CLAIM replaces it, and identity has not previously been verified. Existing publication constraints continue to apply. Without --after, future runs can retry records previously unmatched.

## Acceptance
Run npm run test:hub-gemi-assignment, Production CI, browser acceptance and confirm migration 0447. Preview one HUB, then process at most three private identities. Review only aggregate outcomes. Do not describe all 131 HUBs as publicly populated. Publication still requires independent legal/privacy, editorial and SEO decisions, plus canonical partner suppression as enforced by the PR #1500 release runner.

The provider has independent API licensing, rate-limit, security and attribution conditions. Registry identity verification is distinct from verifying owner authority and lawful public directory presentation.
