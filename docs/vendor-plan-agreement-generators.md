# KONTA MOY — Subscription agreement releases

## Release status

- Historical template **2026-10-11-v1**: legal-review DRAFT; do not relabel existing signed agreement records or claim prior acceptance of this version.
- New template **2026-10-20-v2**: approved for rollout on the basis of the platform operator's explicit confirmation that legal and accounting review are complete on 20 October 2026. This confirmation does **not** independently identify counsel, accountant or external signed approval documents; do not fabricate reviewer identities.
- Plans: expansion HUB CLAIM, PRESENCE, SHOP, GROWTH, PRO; Sparta monthly, annual and Founding Partner.
- Every new merchant agreement stores the approved plan, market, cycle, fees, commissions, entitlements, template version and legal-review state in immutable agreement snapshots. The governed PDF → signed gov.gr → verification → activation steps continue to apply. No simulated signature or retroactive approval.
- CLAIM directory-only acceptance is not a merchant contract. A verified owner must view their company-specific approved terms, accept the exact fingerprinted version and separately authorize public business-data publication. Both consents and the conversion are a single transaction. An immutable `vendor_directory_agreement_acceptances` row stores the identified owner, plan/cycle, version, SHA-256, terms, timestamp and publication consent.
- Previously converted CLAIM listings and legacy signed merchant contracts are preserved as historical, without any fictional backfill of signatures or acceptance events.
- PRESENCE is also a directory-only plan and has a dedicated generator. Paid PRESENCE subscription activation and any billing, invoicing and owner acceptance process require a separately implemented complete non-commerce entitlement workflow; it must not become a merchant checkout vendor.
- Paid HUB conversion and new Sparta final activation require matching plan/cycle, approved version and governed signing evidence. Provisioned trial/demo accounts are never commercial activation.

## Verification

Run `npm run test:vendor-plan-agreements`, `npm run check`, browser acceptance and production readiness checks. Schema 0454 introduces directory acceptance storage.
