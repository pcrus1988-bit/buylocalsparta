# DrinkStock POS Easy Connect — venue self-managed persistence (19 Oct 2026)

A venue owner or manager can now complete the POS preparation **without emailing
their software vendor**. Supplier outreach remains optional and appears only in
the final screen.

## What the operator can do independently
- Pick one of 10 Greek POS systems or enter a different brand.
- Choose an official cloud API, local connector or assisted path.
- Import only `code/name` from CSV on their device; nothing extracts
  passwords, invoices, customer data or financial transactions.
- Match each POS item to their existing venue DrinkStock menu, with
  exact-name suggestions and manual review.
- Receive live completeness, unmapped and duplicate-target warnings.
- Save draft to the venue automatically after a short debounce, save on
  demand, return another day, or export/import a JSON backup.
- Download both a spreadsheet-safe SKU mapping review and a Greek vendor
  requirements email **only when they actually need vendor assistance**.

## Isolation and concurrency
Only authenticated hospitality owner/manager sessions can GET or PUT drafts.
PUT is same-origin, CSRF-protected, bounded to 150 KB, validates strict
provider/menu/mapping schema and checks every DrinkStock target is active in
the caller's exact venue. An optimistic integer revision plus DB advisory
transaction lock prevents stale cross-device writes. The draft is keyed by
`(partner_id,venue_id)` and cascades on venue deletion.

`public.drinkstock_pos_setup_drafts` is RLS enabled; browser `anon`
and `authenticated` grants are revoked. The server uses the existing
private PostgreSQL runtime after checking hospitality membership and role.
Production migration:
`db/operations/20261019_drinkstock_pos_setup_drafts.sql` with the
independently versioned Supabase migration
`drinkstock_pos_setup_drafts_20261019`.
Do not use this table as connection authorization.

## Specifically not activated
Drafts never contain private provider credentials, webhook secrets,
OAuth tokens or endpoint URLs; any unexpected extra fields are discarded.
They do not represent approved integrations. There is no automatic sale
event ingestion, POS price write, fiscal receipt creation, online checkout,
signed payment event, or activation of the TV Actual feed.

A real provider connector still requires its own documented API/license,
verified credentials via a separate encrypted connection flow and
per-venue production acceptance. This owner-friendly draft feature makes
preparation self-service, not every Greek POS provider interoperable.

## Acceptance
- Unit test unsafe draft/provider/mapping cases
- Production CI and Browser acceptance
- Vercel build of final PR head
- Apply migration, inspect RLS/revoked grants, read-only smoke
- Merge reviewed branch and verify production deployment
