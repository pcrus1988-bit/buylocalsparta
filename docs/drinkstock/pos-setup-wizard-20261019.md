# DrinkStock: Greek POS setup wizard (19 Oct 2026)

## User experience delivered
The venue owner/manager opens **Trading Floor → POS Integrations**.
Staff can view a read-only access message but cannot enter the owner wizard.
The server validates current partner membership, active app and exact venue
before supplying the venue's product names.

The wizard is Greek-first, mobile-friendly and uses **four steps**:
1. **Select POS:** Search the ten candidate Greek restaurant products or enter
   an unknown product name.
2. **Choose connection route:** Provider-appropriate default: authorized
   Cloud API, certified local bridge or supplier-assisted integration.
   Users can change the preparation route; that does *not* enable the route.
3. **Prepare product mapping:** Optional browser-only POS CSV import
   (Greek or English code/name columns, comma or semicolon separated, UTF-8,
   max 500 rows/500 KB), safe exact-name candidate mapping to the venue's
   DrinkStock menu, manual corrections and a review-only mapping CSV export.
   Spreadsheet formula cells are escaped and no file is sent to the server.
4. **Review + supplier request:** A prefilled Greek supplier approval request,
   copy and downloadable text fallback, and explicit go-live requirements.

No account credentials are solicited. No merchant- or customer-sensitive CSV,
receipts, fiscal actions, payment status, order creation, price changes or
server-side POS mapping writes are performed. Switching selected vendors
resets pending mappings. Browser page refresh discards draft data — the
operator should download the review CSV before leaving.

## Scope and honest status
This is a **functional onboarding preparation experience**, not a commercial
integration: **zero of the ten brands are yet verified live**. The Oracle
read-only menu API-shaped adapter exists but requires licensed credentials
and merchant certification before actual external calls.

A cloud API / vendor bridge / CSV-import path cannot be labeled 'connected'
without legal vendor and merchant permission, per-venue authorization,
idempotent real paid-sale reconciliation, refund and tax/fiscal validation,
reliable market price handling, and supervised acceptance tests.
AADE payment-terminal/ERP interoperability cannot be repurposed as a
universal unauthorized bar POS sales feed.

## Future activation workflow
- Store encrypted, tenant-scoped connection authorizations and review state.
- Build official, credentialed per-vendor connectors and receive final sales.
- Separate 'catalogue read', 'paid sales read', 'outbound orders',
  'price updates', 'terminal payment' and 'fiscal issuance' capabilities.
- Implement admin approval, sandbox test results, health/reconciliation
  visibility, vendor support and switchback controls.
- Enable a capability only after provider-specific CI + real pilot
  validation. Any denied/unknown integration remains visibly unavailable.

## Checks
Run `npm run test:hospitality`, type checking, Production CI,
Browser acceptance, SEO guard and Vercel preview at the final SHA.
Never merge if required checks are failing/pending.
