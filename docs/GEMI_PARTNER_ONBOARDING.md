# ΓΕΜΗ-backed partner onboarding

## Purpose

`/join/apply` uses the official ΓΕΜΗ OpenData API as a server-side enrichment and legal-business identity source. The browser never receives the API key and ΓΕΜΗ matching never grants vendor access by itself.

## Flow

1. Applicant enters a Greek ΑΦΜ.
2. `POST /api/gemi/company-by-afm` validates the 9-digit ΑΦΜ checksum and performs a server-side ΓΕΜΗ lookup.
3. A successful match pre-fills legal name, trade name, ΓΕΜΗ number, registered address/postcode and public email when published.
4. Missing email/phone are requested from the applicant. Published contact fields remain editable because the preferred marketplace contact may differ from the registry contact.
5. The physical shop address remains editable because it may differ from the legal registered seat.
6. On final submission, the server resolves the ΑΦΜ again from the trusted cache/source and does not trust browser-supplied legal identity fields.
7. The application remains `verification_pending`. Ownership/representation, contact verification, catalog onboarding, test readiness and Admin activation remain required.
8. Existing research-profile claims use the same application pipeline, preserving the indexed vendor URL after successful verification/activation.

## Production environment

Configure these values only in the server environment (for example Vercel production environment variables). Never expose them with a `NEXT_PUBLIC_` prefix.

```text
GEMI_OPENDATA_API_KEY=<server-only key>
GEMI_OPENDATA_BASE_URL=https://opendata-api.businessportal.gr/api/opendata/v1
GEMI_REQUEST_TIMEOUT_MS=8000
GEMI_CACHE_TTL_HOURS=168
```

Only `GEMI_OPENDATA_API_KEY` is required. The other values have the defaults shown above.

## Quota and cache controls

- Successful and not-found lookups are cached in PostgreSQL.
- The cache stores only onboarding-relevant published business fields plus a SHA-256 payload hash; representatives and documents are deliberately not persisted.
- Public lookup attempts are visitor-rate-limited.
- Uncached upstream lookups also pass through a global provider limiter so the application cannot exhaust the ΓΕΜΗ allowance under concurrent traffic.
- When the upstream service is unavailable, the form can continue through a clearly marked manual-verification path instead of losing the application.

## Provenance captured on applications

`vendor_applications` records:

- `registry_lookup_status`: `matched`, `not_found`, `unavailable` (or legacy/default `not_checked`)
- `registry_checked_at`
- registry legal/trade name, status, legal type, address, city, postcode and published email
- `contact_email_source`: `gemi` or `applicant`
- `phone_source`: `gemi` or `applicant`

Admin Applications surfaces this provenance so a ΓΕΜΗ legal-identity match can be distinguished from ownership/contact verification. A match is evidence, not approval.
