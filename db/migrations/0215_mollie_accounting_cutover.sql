-- KONTA MOY — Mollie payment / AADE fiscalisation separation
-- Viva remains only in immutable historical migration/audit data after this migration.
BEGIN;

UPDATE accounting_tax_policies
SET fiscalisation_route='unselected',
    status=CASE WHEN status='approved' THEN 'review' ELSE status END,
    approved_at=CASE WHEN status='approved' THEN NULL ELSE approved_at END,
    approved_by=CASE WHEN status='approved' THEN NULL ELSE approved_by END,
    policy_hash=CASE WHEN status='approved' THEN NULL ELSE policy_hash END,
    approval_notes=concat_ws(E'\n',NULLIF(approval_notes,''),'Legacy Viva fiscal route retired during Mollie payment cutover; accountant must select AADE Direct ERP.'),
    updated_at=now()
WHERE fiscalisation_route='viva_fiscal_provider';

UPDATE accounting_tax_policy_checks c
SET label=CASE c.check_code
      WHEN 'fiscalisation_channel' THEN 'AADE Direct ERP fiscalisation channel selection'
      WHEN 'payment_reconciliation' THEN 'Mollie/payment reconciliation test'
      ELSE c.label
    END,
    status=CASE
      WHEN c.check_code='fiscalisation_channel'
           AND EXISTS (SELECT 1 FROM accounting_tax_policies p WHERE p.id=c.policy_id AND p.fiscalisation_route='unselected')
        THEN 'pending'
      ELSE c.status
    END,
    updated_at=now()
WHERE c.check_code IN ('fiscalisation_channel','payment_reconciliation');

ALTER TABLE accounting_tax_policies DROP CONSTRAINT IF EXISTS accounting_tax_policies_fiscalisation_route_check;
ALTER TABLE accounting_tax_policies ADD CONSTRAINT accounting_tax_policies_fiscalisation_route_check CHECK (fiscalisation_route IN ('unselected','aade_direct_erp'));
ALTER TABLE tax_documents DROP CONSTRAINT IF EXISTS tax_documents_fiscalisation_route_check;
ALTER TABLE tax_documents ADD CONSTRAINT tax_documents_fiscalisation_route_check CHECK (fiscalisation_route IS NULL OR fiscalisation_route='aade_direct_erp');

INSERT INTO mydata_payment_mappings(policy_id,processor,processor_method,mydata_payment_type,requires_transaction_id,erp_requires_ecr_token,provider_signature_route,production_status,notes)
SELECT policy_id,'MOLLIE','CREDITCARD',mydata_payment_type,requires_transaction_id,erp_requires_ecr_token,false,production_status,
       concat_ws(E'\n',NULLIF(notes,''),'Migrated from the legacy card processor to Mollie Hosted Checkout. Fiscalisation remains AADE Direct ERP; no payment-provider signature route.')
FROM mydata_payment_mappings WHERE processor='VIVA' AND processor_method='CARD'
ON CONFLICT (policy_id,processor,processor_method) DO UPDATE SET mydata_payment_type=EXCLUDED.mydata_payment_type,requires_transaction_id=EXCLUDED.requires_transaction_id,erp_requires_ecr_token=EXCLUDED.erp_requires_ecr_token,provider_signature_route=false,production_status=EXCLUDED.production_status,notes=EXCLUDED.notes;

INSERT INTO mydata_payment_mappings(policy_id,processor,processor_method,mydata_payment_type,requires_transaction_id,erp_requires_ecr_token,provider_signature_route,production_status,notes)
SELECT p.id,'MOLLIE','CREDITCARD',7,true,true,false,'proposed','Mollie Hosted Checkout card rail. Requires verified Mollie payment id; fiscalisation is AADE Direct ERP.'
FROM accounting_tax_policies p
WHERE NOT EXISTS (SELECT 1 FROM mydata_payment_mappings m WHERE m.policy_id=p.id AND m.processor='MOLLIE' AND m.processor_method='CREDITCARD');

DELETE FROM mydata_payment_mappings WHERE processor='VIVA';
COMMIT;
