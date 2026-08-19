# Admin Tax / myDATA Control Center

The production tax configuration boundary is `/admin/tax`.

Authorised Admin users with finance permissions manage:
- AADE environment, specification version and request timeout
- encrypted AADE credentials in Supabase Vault
- Accounting Policy revisions and fiscalisation route
- myDATA document mappings, income classifications and E3 codes
- payment-method mappings and ERP payment evidence requirements
- VAT category catalogue and product VAT profiles
- fiscal series, fiscal year and next-AA controls
- automatic paid-order fiscal capture
- governed invoice/receipt preparation
- AADE transmission and MARK/UID reconciliation
- customer fiscal-document email delivery

Approved Accounting Policy revisions are immutable. Changes require a new auditable revision. Live issuance remains fail-closed until the approved policy, product VAT profiles, payment evidence and the selected fiscal route all pass validation.

The built-in transmission route is AADE Direct ERP. Viva Fiscal provider selection may be represented in policy, but it cannot be marked operational until an actual provider integration exists.
