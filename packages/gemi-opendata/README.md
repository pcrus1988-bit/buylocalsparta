# Official GEMI OpenData integration

Server-side integration for the official ΓΕΜΗ OpenData API used by KONTA ΜΟΥ merchant research and legal-entity verification.

## Security

Set `GEMI_OPENDATA_API_KEY` only in a server-side secret store or local `.env`. Never expose it through a `NEXT_PUBLIC_*` variable, browser bundle, spreadsheet, log line, URL, fixture, commit or test snapshot. The package never logs the configured key.

## Wire contract

Default base URL: `https://opendata-api.businessportal.gr/api/opendata/v1`

Authentication: raw `api_key` request header.

Used endpoints:

- `GET /companies` — search by canonical identifiers or name/filter criteria.
- `GET /companies/{arGemi}` — official company record by ΓΕΜΗ number.
- `GET /companies/{arGemi}/documents` — publicity documents when explicitly required.
- `GET /metadata/*` — activities, prefectures, municipalities, statuses, legal forms, ΓΕΜΗ offices and assembly subjects.

The base URL is configurable with `GEMI_OPENDATA_BASE_URL` because upstream endpoint paths can evolve.

## Rate and failure policy

The issued account limit is 8 requests/minute. KONTA ΜΟΥ defaults to 7 requests/minute to retain operational headroom. The client uses a process-local sliding-window limiter, caches successful lookups, retries HTTP 429 and 5xx responses with backoff, and treats HTTP 401 as a hard configuration failure rather than retrying it.

Reference-data calls receive a minimum seven-day cache TTL. Company searches/details use the configured cache TTL (one day by default).

## Identity-resolution policy

`resolveProspectWithGemi()` intentionally separates storefront evidence from legal-entity evidence.

- Exact supplied ΓΕΜΗ number + matching official response → `VERIFIED_GEMI_OPENDATA`.
- Exact AFM with exactly one matching official record → `VERIFIED_GEMI_OPENDATA`.
- Name/geography search only → at most `CANDIDATE_MATCH`; never automatic legal-field promotion.
- Multiple plausible matches → `AMBIGUOUS_MATCH`.
- No official match → `NO_MATCH`.
- Retryable upstream/network issue → `API_RETRY`.
- Non-retryable or structurally suspicious result → `MANUAL_REVIEW`.

Official provenance uses source type `GEMI_OPENDATA_OFFICIAL`, an official record URL, retrieval timestamp, match method and rationale. Storefront address and phone must remain sourced from storefront/public business evidence and must not be overwritten by the registered legal seat.

## Live census workbook

The `GEMI_Verification_Queue` workflow uses explicit records and these controlled verification states:

`PENDING_GEMI_OPENDATA`, `SEARCHED`, `CANDIDATE_MATCH`, `VERIFIED_GEMI_OPENDATA`, `NO_MATCH`, `AMBIGUOUS_MATCH`, `API_RETRY`, `MANUAL_REVIEW`.

Historical `VERIFIED_PUBLIC_GEMI_DERIVED` rows remain valid as legacy corroboration but are not equivalent to official OpenData verification.

## Tests

Run directly with the repository's Node 24 toolchain:

```sh
node --experimental-strip-types --test packages/gemi-opendata/test/*.test.ts
```

The tests use mocked fetch responses and contain no real credential.
