-- Fiscal certification engineering checklist. Internal tracking is NOT authority approval.
BEGIN;
CREATE TABLE IF NOT EXISTS fiscal_certification_controls (
 code text PRIMARY KEY CHECK(code ~ '^[a-z0-9_]{3,80}$'),
 lane text NOT NULL CHECK(lane IN ('core','b2c','pos','b2b','b2g')),
 title text NOT NULL CHECK(length(title) BETWEEN 5 AND 200),
 description text NOT NULL,
 state text NOT NULL DEFAULT 'planned'
 CHECK(state IN ('planned','in_progress','evidence_pending','internal_evidence_reviewed')),
 regulator_approved boolean NOT NULL DEFAULT false CHECK(regulator_approved=false),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fiscal_certification_lane ON fiscal_certification_controls(lane,state);
INSERT INTO fiscal_certification_controls(code,lane,title,description)
VALUES
 ('core_legal_entity','core','Provider legal entity and eligibility','Entity, personnel, compliance obligations, application dossier'),
 ('core_security','core','Information security certification','Information security program and external certification evidence'),
 ('core_authenticity','core','Fiscal authenticity and issuance lifecycle','Signing, authentication, numbering and legally correct fiscal provider route'),
 ('core_immutable','core','EU-hosted immutable fiscal archive','Retention, cryptographic integrity, access and disaster recovery'),
 ('core_aaade','core','AADE certified-provider interoperability','Provider interfaces and verified certification test corpus'),
 ('core_verification','core','Public authenticity verification','Authorized document lookup and safe public verification'),
 ('core_recovery','core','High availability and disaster recovery','Resilience, incident evidence, recovery drills, monitoring'),
 ('core_tenants','core','Merchant isolation and onboarding','Contract, legal identity, verified taxpayer AFM and tenant authorization'),
 ('b2c_receipts','b2c','Retail receipt issuance','Receipt types, payment evidence and lawful retail issuance route'),
 ('b2c_ecommerce','b2c','E-commerce event and tax mapping','Correct seller identity, tax rules and transaction timing'),
 ('b2c_returns','b2c','Retail credit and refund corrections','Cancellations, credits, returns and financial reconciliation'),
 ('b2c_delivery','b2c','Customer document retrieval and delivery','Accessible receipts, notices, verification and retention'),
 ('pos_terminals','pos','Acquirer and POS terminal protocol','Provider and terminal capabilities and authenticated payment events'),
 ('pos_allinone','pos','All-in-One software examination','Approved terminal configurations and applicable fiscal requirements'),
 ('pos_reversals','pos','POS reversal and cancellation lifecycle','Reversals, timeouts, reconciliation, duplicate prevention'),
 ('pos_lab','pos','POS end-to-end laboratory evidence','Payment and receipt joint-flow technical tests and evidence'),
 ('b2b_invoices','b2b','B2B invoice document coverage','Invoice and credit types with approved mapping and validations'),
 ('b2b_classification','b2b','VAT, E3 and myDATA classification','Accountant-approved mappings, issuer/counterparty rules'),
 ('b2b_integrations','b2b','ERP authorization and API contract','Per-merchant credentials, consent, idempotency and partner APIs'),
 ('b2b_reconciliation','b2b','B2B fiscal reconciliation','Accepted / rejected document lifecycle and error correction'),
 ('b2g_ubl','b2g','EN 16931 and Greek CIUS mapping','UBL document model and Greek public procurement extensions'),
 ('b2g_peppol','b2g','Peppol network readiness','Access Point certification, secure transport and discovery'),
 ('b2g_ked','b2g','Greek KED interoperability','Government integration tests and routing requirements'),
 ('b2g_ack','b2g','Government acknowledgements','Public sector responses, rejection and dispute handling')
ON CONFLICT(code) DO NOTHING;
COMMIT;
