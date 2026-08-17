# Legal / Tax / Payment Technical Gate — 14 August 2026

This is an engineering decision record, not legal or tax advice. Production checkout remains blocked until Greek professional confirmation aligns contracts, accounting and PSP underwriting with the same flow.

## Consumer-facing seller responsibility

The implemented product model makes Buy Local Sparta the customer-facing seller. The customer UI, terms, payment descriptor, tax document, return/refund workflow and support ownership therefore need to consistently identify the platform as the seller. EU consumer guidance confirms that online/distance sellers must provide clear pre-contract information, a 14-day withdrawal workflow where applicable, and at least the applicable minimum legal guarantee for faulty goods.

**Engineering consequence:** seller identity and terms version are immutable order snapshots; returns/refunds are platform-owned workflows rather than vendor-controlled decisions.

## Product safety

The General Product Safety Regulation includes specific obligations for online marketplaces around product-safety processes, notices and online-offer information.

**Engineering consequence:** canonical products include compliance documents, suppression/recall state, product notices and a recall fan-out path to affected orders. Restricted products are excluded from public search/checkout until policy gates pass.

## DSA / marketplace controls

EU guidance treats online marketplaces as regulated online platforms, with trader verification, illegal-content/product reporting and transparency/appeal duties depending on applicability and enterprise size.

**Engineering consequence:** vendor verification evidence, moderation reasons, suspension reasons, audit logs and appeal-ready records are first-class data rather than support notes.

## Greek digital tax records

AADE maintains the myDATA ERP transmission channel and separately evolves its Digital Goods Movement interfaces. Build 0.39 prepares the ERP transport boundary only; it does **not** decide the accounting treatment of the platform-as-seller model. The exact customer document types, VAT treatment, income/expense classifications, supplier-invoice/self-billing treatment, credit-note mapping and any Digital Goods Movement obligations must be approved by the Greek accountant/legal advisers before activation.

**Engineering consequence (Build 0.39):** the code can authenticate to the configured AADE ERP endpoint, transmit already-approved XML, persist MARK/UID/QR/error state, cancel/query records and route uncertain outcomes to manual reconciliation. Automatic issuance remains disabled unless `BLS_MYDATA_ISSUANCE_ENABLED=true`, and every prepared document must carry the exact accountant-approved `BLS_MYDATA_MAPPING_VERSION`. Production and test API/spec configuration are deliberately separate because AADE's test environment may advance ahead of production. Digital Goods Movement is a separate gated integration, not silently inferred from invoice submission.

## Payment-services boundary

The Bank of Greece confirms that Greek payment services operate under Law 4537/2018 (PSD2) and that providing regulated payment services requires the relevant authorization unless an exemption applies.

**Engineering consequence:** Buy Local Sparta does not implement an internal wallet/escrow. Customer payments and supplier payouts are handled through a licensed PSP/banking rail behind an abstraction layer.

## PSP feasibility observations

Stripe documents separate charges/transfers in Greece and states that, for indirect charges without `on_behalf_of`, the platform is the merchant/business of record and bears fees/refunds/chargebacks. Viva documents a multi-seller marketplace flow with one customer payment and multi-seller transfers, but describes the marketplace-owner/seller relationship as an intermediary marketplace model.

**Engineering consequence (Build 0.37):** Viva.com Smart Checkout is the selected prepared customer-acquiring adapter for the current seller-of-record design. Buy Local Sparta uses its own merchant account and retains supplier procurement/payable settlement as a separate B2B workflow; the code does not automatically transfer customer card receipts to vendors. Live activation still requires Viva underwriting/KYB and written legal/accounting confirmation that the reseller + supplier-invoice model, payment descriptor, refund ownership and VAT/myDATA treatment are aligned.


## Return/guarantee implementation defaults — Build 0.16

The executable development policy currently uses a 14-day withdrawal routing window, a 730-day guarantee-workflow window, a 14-day RMA authorization TTL and a 30-day operational repair SLA. These values are **engineering defaults derived from the project Blueprint, not legal advice and not an automated legal-rights engine**. A request outside a configured window is routed to manual review rather than silently denied. Before launch, Greek counsel must approve the exact withdrawal exceptions, guarantee/remedy sequencing, return-cost disclosures, timing language, seller obligations and durable customer notices; the settings and terms version then need to be snapshotted at purchase.

A consumer refund also cannot be made contingent on first recovering money from a supplier. Build 0.16 therefore keeps paid settlement batches immutable and records post-settlement supplier-return recovery as a separate B2B receivable/ledger event. The exact supplier credit-note, input-VAT adjustment, service-fee reversal and lawful settlement-netting treatment must be agreed with the platform accountant and represented in the AADE-compatible provider integration before production.
