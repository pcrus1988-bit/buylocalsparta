# KONTA MOY FISCAL — marketplace account pairing (draft integration)

## Scope

This milestone implements **consent-based account pairing**, not invoice issuance, not regulatory approval and not automatic order export.

All new user-visible FISCAL controls are rooted under `/timologio`, with the vendor already authenticated through the existing KONTA MOY vendor identity system. Existing `/timologio-admin` remains the independent provider operations view.

### Two-sided consent

1. The owner of an **approved FISCAL organization** signs into `/timologio/developers`, selects their organization and creates a random, one-time, ten-minute `kmfl_` pairing code. Generating a newer code invalidates older unconsumed codes for the same organization.
2. A verified, activated, contractually active **KONTA MOY vendor owner** signs into the marketplace and opens `/timologio/marketplace-link`. Administrator impersonation and vendor trial sessions cannot confirm a link.
3. The marketplace looks up vendor membership, verified business status, contract, and official registered 9-digit ΑΦΜ from **its own** database. The vendor never types an issuer ΑΦΜ into the confirmation form.
4. The marketplace signs a short-lived backchannel request with `FISCAL_MARKETPLACE_LINK_SECRET`, sends the code plus verified vendor identity to `FISCAL_SERVICE_BASE_URL` over HTTPS and receives a link identifier.
5. The FISCAL service verifies the HMAC, request freshness, one-time code and organizational approval. It only creates a link if the organization has exactly the same ΑΦΜ as the verified marketplace vendor. The pairing code is consumed in the same transaction that writes the auditable relationship.

The independent FISCAL database is the system of record for linking, approval and revocation. The marketplace does **not** query that database directly. No vendor session, payment token, taxpayer password or AADE credential is transmitted between systems. The link is merely an identity binding, not consent to issue documents or a delegation of seller-of-record legal responsibility.

### Technical endpoints

- `POST /timologio/api/marketplace-links`: FISCAL owner + session CSRF; create or revoke a link.
- `POST /timologio/api/marketplace-link/confirm`: vendor owner + session CSRF; verifies marketplace business from marketplace PostgreSQL and sends backchannel assertion.
- `POST /timologio/api/internal/marketplace-links/redeem`: signed internal service call, not a merchant browser endpoint.
- `/timologio/developers`: FISCAL pairing code, link history and revocation controls.
- `/timologio/marketplace-link`: vendor confirmation interface.

Backchannel payload contains only pairing code, verified vendor UUID, vendor public ID and verified business ΑΦΜ. It is HMAC-signed with a timestamp and expires after 60 seconds. The pairing code is a 256-bit unpredictable secret, stored only as SHA-256 and returned once to the merchant. Code lifetime is ten minutes; a successful redemption can occur only once.

### Runtime configuration (do not commit secrets)

`FISCAL_SERVICE_BASE_URL=https://<isolated-fiscal-host>`

`FISCAL_MARKETPLACE_LINK_SECRET=<same randomly generated minimum-32-character secret, held in separate secret stores at the two services>`

The marketplace and Fiscal services must be deployed separately before any production pairing is enabled. The two systems need not share sessions or databases; a temporarily shared monorepo does **not** mean shared production infrastructure is acceptable.

Do not set `FISCAL_SERVICE_BASE_URL` to a marketplace production domain merely to bypass independent deployment. Configure an explicit trust boundary, rate limits, monitored secret rotation, verification of secure server-to-server transport, and email/KYB/onboarding checks before enabling live customer pairing.

### Compliance and operational gates

- FISCAL `approved` is currently not attainable from public self-registration; provider staff must complete independent verification and a governed approval workflow.
- Vendor `active`, verified and contractual status is validated against authoritative marketplace rows, not supplied form fields.
- Marketplace seller-of-record may differ from the fulfilling vendor. An account link authorizes **no fiscal issuance** and changes no seller, payer, payee, issuer or commission rights.
- All fiscal issuance paths remain disabled and separate from the draft API.
- Revocation in FISCAL is permanent for the affected link row, but future new code pairing is possible under fresh verified consent.
- Account linking, tax authorization, contractual provider enrollment, certified B2C/POS/B2B/B2G APIs and signed settlement reconciliation are separately governed stages.

### Acceptance testing

Dedicated Fiscal CI tests prevent linking a pending Fiscal merchant and linking mismatched ΑΦΜ, forbid mutation of legal link identity, and prevent reactivation of revoked links. Typecheck covers the signed backchannel routes. A full two-browser end-to-end flow must be tested after an independently provisioned Fiscal environment and a safely approved **test** organization/vendor identity are available.
