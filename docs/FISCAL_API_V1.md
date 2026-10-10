# KONTA MOY FISCAL — test-only draft API v1

The routes are hosted under /timologio. This is a preliminary, **uncertified** API. It cannot issue legal invoices, retail receipts, POS receipts or government invoices, nor submit to myDATA.

## Merchant authorization

1. Sign up for a distinct FISCAL account (separate from the marketplace).
2. Navigate to /timologio/developers.
3. Select an organization in which the user is an owner.
4. Create a labelled key for \`external_erp\` or \`marketplace\` traffic.
5. Copy the 30-day \`kmf_test_\` token once and store it in a secret vault, not in frontend code.
6. Revoke the credential from the same dashboard when no longer needed.

The token has no cross-tenant access and is never stored in plaintext. Its source system is inferred from the registered key kind, never from a caller-supplied request field. Organization AFM authorization is part of every draft mutation. Owner credentials are intentionally test-only and do **not** imply KYB or fiscal certification completion.

## Create draft

\`\`\`http
POST /timologio/api/v1/drafts
Content-Type: application/json
Authorization: Bearer kmf_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

{
  "lane": "b2c",
  "externalId": "ORDER-2026-000001",
  "reference": "ORDER-2026-000001",
  "currency": "EUR",
  "grossMinor": 12500,
  "issuerVatNumber": "123456789"
}
\`\`\`

Allowed lane values: \`b2c\`, \`pos\`, \`b2b\`, \`b2g\`. Monetary values are minor EUR units; \`12500\` means EUR 125.00. The issuer VAT number must exactly match the FISCAL organization's registered number; this record is not yet an authenticated official invoice.

Response: HTTP 201 on new draft, HTTP 200 on idempotent replay. Both include \`document\`, \`created\` and \`fiscalIssuanceEnabled:false\`. An externalId replay with conflicting normalized content yields HTTP 409 \`IDEMPOTENCY_CONFLICT\`.

The document's only status is \`draft\`. No signing, document number, MARK/UID, PDF or QR is generated. Caller cannot set \`status\` or \`source\`; unexpected fields are rejected. Request body has a maximum of 4096 characters.

## Query drafts

- \`GET /timologio/api/v1/drafts\` lists up to the latest 30 drafts for the client organization.
- \`GET /timologio/api/v1/drafts/{uuid}\` returns exactly one tenant-owned draft; cross-tenant access returns 404.

All endpoints use a \`Bearer\` test token and \`Cache-Control: no-store\`. API keys expire after 30 days and can be revoked immediately. Separate keys for each integrated external application are recommended.

## Marketplace bridge

The marketplace-only bridge module is \`apps/web/src/lib/fiscal-marketplace-connector.ts\` and is **not wired to live orders**. It requires all of the following environment variables to perform a test draft request:

- \`FISCAL_MARKETPLACE_DRAFT_SYNC_ENABLED=true\`
- \`FISCAL_SERVICE_BASE_URL=https://<independent-fiscal-host>\`
- \`FISCAL_MARKETPLACE_TEST_API_KEY=kmf_test_...\`
- \`FISCAL_MARKETPLACE_ISSUER_VAT=<approved actual seller-of-record AFM>\`

The bridge refuses calls for a different issuer identity and returns a draft ID only; it cannot turn a marketplace order into a legal invoice. The seller-of-record is the party contractually liable to the buyer; a vendor fulfilling the order is not automatically its fiscal issuer.

Real account linking, merchant verification, formal consent, production OAuth, independent web deployment, signed webhooks, reconciliation and certified provider-specific issuance are separate tracked milestones.
