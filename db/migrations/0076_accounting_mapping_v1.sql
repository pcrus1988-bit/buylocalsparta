-- KONTA MOY — Accounting Mapping v1.0
-- Versioned, accountant-controlled myDATA tax policy. No row in this migration enables issuance.
BEGIN;

CREATE TABLE accounting_tax_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('taxpol_' || replace(gen_random_uuid()::text,'-','')),
  market_id uuid NOT NULL REFERENCES markets(id),
  version text NOT NULL,
  status text NOT NULL DEFAULT 'review'
    CHECK (status IN ('draft','review','approved','retired')),
  seller_of_record boolean NOT NULL DEFAULT true,
  seller_legal_name text NOT NULL,
  seller_tax_number text NOT NULL,
  compatibility_target text NOT NULL,
  production_published_schema text,
  fiscalisation_route text NOT NULL DEFAULT 'unselected'
    CHECK (fiscalisation_route IN ('unselected','viva_fiscal_provider','aade_direct_erp')),
  effective_from date,
  accountant_name text,
  approved_at timestamptz,
  approved_by uuid REFERENCES users(id),
  approval_notes text,
  policy_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(market_id, version)
);

CREATE TABLE accounting_tax_policy_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES accounting_tax_policies(id) ON DELETE CASCADE,
  check_code text NOT NULL,
  label text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','not_applicable')),
  evidence text,
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(policy_id, check_code)
);

CREATE TABLE mydata_document_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES accounting_tax_policies(id) ON DELETE CASCADE,
  event_code text NOT NULL,
  customer_kind text NOT NULL CHECK (customer_kind IN ('b2c','b2b','none')),
  item_kind text NOT NULL CHECK (item_kind IN ('goods','services','mixed','none')),
  geography text NOT NULL CHECK (geography IN ('domestic','eu','third_country','none')),
  direction text NOT NULL CHECK (direction IN ('sale','credit','platform_service','delivery')),
  invoice_type text NOT NULL,
  income_category text,
  e3_code text,
  series_code text NOT NULL,
  production_status text NOT NULL DEFAULT 'proposed'
    CHECK (production_status IN ('proposed','approved','future','exception')),
  negative_original_classification boolean NOT NULL DEFAULT false,
  correlation_required boolean NOT NULL DEFAULT false,
  notes text,
  UNIQUE(policy_id, event_code)
);

CREATE TABLE mydata_payment_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES accounting_tax_policies(id) ON DELETE CASCADE,
  processor text NOT NULL,
  processor_method text NOT NULL,
  mydata_payment_type integer NOT NULL CHECK (mydata_payment_type BETWEEN 1 AND 8),
  requires_transaction_id boolean NOT NULL DEFAULT false,
  erp_requires_ecr_token boolean NOT NULL DEFAULT false,
  provider_signature_route boolean NOT NULL DEFAULT false,
  production_status text NOT NULL DEFAULT 'proposed'
    CHECK (production_status IN ('proposed','approved','future','exception')),
  notes text,
  UNIQUE(policy_id, processor, processor_method)
);

CREATE TABLE mydata_fiscal_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES accounting_tax_policies(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES markets(id),
  series text NOT NULL,
  invoice_type text NOT NULL,
  purpose text NOT NULL,
  fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 2020 AND 2200),
  next_aa bigint NOT NULL DEFAULT 1 CHECK (next_aa > 0),
  last_issued_aa bigint,
  last_mark text,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(market_id, series)
);

CREATE TABLE mydata_vat_category_catalog (
  code integer PRIMARY KEY CHECK (code BETWEEN 1 AND 10),
  rate_bps integer NOT NULL CHECK (rate_bps >= 0),
  label text NOT NULL,
  special_category boolean NOT NULL DEFAULT false
);

CREATE TABLE product_tax_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('taxprof_' || replace(gen_random_uuid()::text,'-','')),
  market_id uuid NOT NULL REFERENCES markets(id),
  canonical_variant_id uuid REFERENCES canonical_variants(id),
  vendor_offer_id uuid REFERENCES vendor_offers(id),
  vat_category integer NOT NULL REFERENCES mydata_vat_category_catalog(code),
  vat_rate_bps integer NOT NULL CHECK (vat_rate_bps >= 0),
  vat_exemption_category integer,
  effective_from date NOT NULL,
  effective_until date,
  accountant_approved boolean NOT NULL DEFAULT false,
  approval_version text,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  supersedes_profile_id uuid REFERENCES product_tax_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((canonical_variant_id IS NOT NULL)::int + (vendor_offer_id IS NOT NULL)::int = 1),
  CHECK (effective_until IS NULL OR effective_until >= effective_from),
  CHECK ((vat_category <> 7) OR vat_exemption_category IS NOT NULL),
  CHECK ((accountant_approved = false AND approval_version IS NULL AND approved_at IS NULL) OR
         (accountant_approved = true AND approval_version IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE INDEX product_tax_profiles_variant_idx
  ON product_tax_profiles(canonical_variant_id, effective_from DESC)
  WHERE canonical_variant_id IS NOT NULL;
CREATE INDEX product_tax_profiles_offer_idx
  ON product_tax_profiles(vendor_offer_id, effective_from DESC)
  WHERE vendor_offer_id IS NOT NULL;
CREATE INDEX product_tax_profiles_approval_idx
  ON product_tax_profiles(accountant_approved, effective_from DESC);

ALTER TABLE tax_documents
  ADD COLUMN IF NOT EXISTS accounting_policy_id uuid REFERENCES accounting_tax_policies(id),
  ADD COLUMN IF NOT EXISTS fiscalisation_route text
    CHECK (fiscalisation_route IS NULL OR fiscalisation_route IN ('viva_fiscal_provider','aade_direct_erp')),
  ADD COLUMN IF NOT EXISTS payment_processor text,
  ADD COLUMN IF NOT EXISTS payment_processor_method text,
  ADD COLUMN IF NOT EXISTS mydata_payment_type integer
    CHECK (mydata_payment_type IS NULL OR mydata_payment_type BETWEEN 1 AND 8),
  ADD COLUMN IF NOT EXISTS payment_transaction_id text,
  ADD COLUMN IF NOT EXISTS payment_tid text,
  ADD COLUMN IF NOT EXISTS provider_payment_signature jsonb,
  ADD COLUMN IF NOT EXISTS ecr_token jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS accounting_tax_policies_one_approved_uidx
  ON accounting_tax_policies(market_id)
  WHERE status='approved';

ALTER TABLE accounting_tax_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_tax_policy_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE mydata_document_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE mydata_payment_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE mydata_fiscal_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE mydata_vat_category_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_tax_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounting_tax_policies_platform_only ON accounting_tax_policies
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY accounting_tax_policy_checks_platform_only ON accounting_tax_policy_checks
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY mydata_document_mappings_platform_only ON mydata_document_mappings
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY mydata_payment_mappings_platform_only ON mydata_payment_mappings
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY mydata_fiscal_series_platform_only ON mydata_fiscal_series
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY mydata_vat_category_catalog_platform_only ON mydata_vat_category_catalog
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY product_tax_profiles_platform_only ON product_tax_profiles
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

INSERT INTO mydata_vat_category_catalog(code,rate_bps,label,special_category) VALUES
  (1,2400,'24%',false),
  (2,1300,'13%',false),
  (3,600,'6%',false),
  (4,1700,'17%',false),
  (5,900,'9%',false),
  (6,400,'4%',false),
  (7,0,'0% / Άνευ ΦΠΑ',false),
  (8,0,'Χωρίς ΦΠΑ',true),
  (9,300,'3% ειδική κατηγορία',true),
  (10,400,'4% ειδική κατηγορία',true)
ON CONFLICT (code) DO UPDATE
  SET rate_bps=EXCLUDED.rate_bps,label=EXCLUDED.label,special_category=EXCLUDED.special_category;

WITH market AS (
  SELECT id FROM markets WHERE code='sparta' LIMIT 1
), policy AS (
  INSERT INTO accounting_tax_policies(
    market_id,version,status,seller_of_record,seller_legal_name,seller_tax_number,
    compatibility_target,production_published_schema,fiscalisation_route,approval_notes
  )
  SELECT id,'1.0','review',true,'SP BUSINESS LAB – ΠΟΛΙΑΚΟΦ ΣΤΑΝΙΣΛΑΒ','182294894',
         '2.0.2','2.0.1','unselected',
         'KONTA MOY seller-of-record baseline. Production card issuance remains gated until the fiscalisation channel and all required checks are approved.'
  FROM market
  ON CONFLICT (market_id,version) DO UPDATE SET updated_at=now()
  RETURNING id,market_id
)
INSERT INTO accounting_tax_policy_checks(policy_id,check_code,label,required,status)
SELECT policy.id,x.check_code,x.label,true,'pending'
FROM policy
CROSS JOIN (VALUES
  ('seller_of_record','Seller-of-record treatment: SP BUSINESS LAB'),
  ('product_vat_profiles','Product-level VAT profiles and exemptions'),
  ('shipping_handling','Shipping / handling VAT and revenue treatment'),
  ('vendor_charges','Vendor commission / subscription / advertising treatment'),
  ('fiscalisation_channel','Viva fiscalisation channel selection'),
  ('schema_validation','AADE schema/XML validation'),
  ('tax_calculation','Tax calculation validation'),
  ('payment_reconciliation','Viva/payment reconciliation test'),
  ('refund_test','Credit/refund fiscalisation test'),
  ('accountant_signoff','Final accountant sign-off')
) AS x(check_code,label)
ON CONFLICT (policy_id,check_code) DO NOTHING;

WITH p AS (
  SELECT id FROM accounting_tax_policies
  WHERE version='1.0' AND market_id=(SELECT id FROM markets WHERE code='sparta' LIMIT 1)
)
INSERT INTO mydata_document_mappings(
  policy_id,event_code,customer_kind,item_kind,geography,direction,invoice_type,income_category,e3_code,series_code,
  production_status,negative_original_classification,correlation_required,notes
)
SELECT p.id,m.event_code,m.customer_kind,m.item_kind,m.geography,m.direction,m.invoice_type,m.income_category,m.e3_code,m.series_code,
       m.production_status,m.negative_original_classification,m.correlation_required,m.notes
FROM p
CROSS JOIN (VALUES
  ('b2c_goods_gr','b2c','goods','domestic','sale','11.1','category1_1','E3_561_003','KMR26','proposed',false,false,'Primary domestic private-customer merchandise checkout'),
  ('b2b_goods_gr','b2b','goods','domestic','sale','1.1','category1_1','E3_561_001','KMB26','proposed',false,false,'Domestic business merchandise sale'),
  ('b2c_services_gr','b2c','services','domestic','sale','11.2','category1_3','E3_561_003','KMRS26','proposed',false,false,'Only where KONTA MOY sells a service to a private customer'),
  ('b2b_services_gr','b2b','services','domestic','sale','2.1','category1_3','E3_561_001','KMBS26','proposed',false,false,'Domestic B2B services including platform/vendor commercial services'),
  ('eu_goods_b2b','b2b','goods','eu','sale','1.2','category1_1','E3_561_005','KMEUG26','future',false,false,'Future; requires VAT/VIES validation before activation'),
  ('eu_services_b2b','b2b','services','eu','sale','2.2','category1_3','E3_561_005','KMEUS26','future',false,false,'Future; requires VAT/place-of-supply validation before activation'),
  ('third_country_goods_b2b','b2b','goods','third_country','sale','1.3','category1_1','E3_561_006','KMXG26','future',false,false,'Future'),
  ('third_country_services_b2b','b2b','services','third_country','sale','2.3','category1_3','E3_561_006','KMXS26','future',false,false,'Future'),
  ('b2c_credit','b2c','mixed','domestic','credit','11.4',NULL,NULL,'KMRC26','proposed',true,true,'Negative original income/E3 classification; retain original document and correlation'),
  ('b2b_credit_correlated','b2b','mixed','domestic','credit','5.1',NULL,NULL,'KMBC26','proposed',true,true,'Referenced credit note when original invoice is available'),
  ('b2b_credit_uncorrelated','b2b','mixed','domestic','credit','5.2',NULL,NULL,'KMBC26','exception',true,false,'Exception only when usable original correlation genuinely does not exist'),
  ('platform_vendor_service','b2b','services','domestic','platform_service','2.1','category1_3','E3_561_001','KMBS26','proposed',false,false,'Commission, subscription, onboarding or advertising service when contractually invoiced by KONTA MOY')
) AS m(event_code,customer_kind,item_kind,geography,direction,invoice_type,income_category,e3_code,series_code,production_status,negative_original_classification,correlation_required,notes)
ON CONFLICT (policy_id,event_code) DO NOTHING;

WITH p AS (
  SELECT id FROM accounting_tax_policies
  WHERE version='1.0' AND market_id=(SELECT id FROM markets WHERE code='sparta' LIMIT 1)
)
INSERT INTO mydata_payment_mappings(
  policy_id,processor,processor_method,mydata_payment_type,requires_transaction_id,erp_requires_ecr_token,provider_signature_route,production_status,notes
)
SELECT p.id,m.processor,m.processor_method,m.mydata_type,m.requires_transaction_id,m.erp_requires_ecr_token,m.provider_signature_route,m.production_status,m.notes
FROM p
CROSS JOIN (VALUES
  ('VIVA','CARD',7,true,true,true,'proposed','Card / e-POS. ERP route requires ECRToken; provider route uses provider signature.'),
  ('VIVA','APPLE_PAY',7,true,true,true,'proposed','Wallet backed by card/e-POS'),
  ('VIVA','GOOGLE_PAY',7,true,true,true,'proposed','Wallet backed by card/e-POS'),
  ('VIVA','IRIS',8,false,false,true,'proposed','Direct IRIS payment'),
  ('OFFLINE','CASH',3,false,false,false,'proposed','Cash'),
  ('OFFLINE','CHEQUE',4,false,false,false,'proposed','Cheque'),
  ('OFFLINE','CREDIT',5,false,false,false,'proposed','On credit / unpaid invoice'),
  ('OFFLINE','WEB_BANKING',6,false,false,false,'proposed','Web banking')
) AS m(processor,processor_method,mydata_type,requires_transaction_id,erp_requires_ecr_token,provider_signature_route,production_status,notes)
ON CONFLICT (policy_id,processor,processor_method) DO NOTHING;

WITH p AS (
  SELECT id,market_id FROM accounting_tax_policies
  WHERE version='1.0' AND market_id=(SELECT id FROM markets WHERE code='sparta' LIMIT 1)
)
INSERT INTO mydata_fiscal_series(policy_id,market_id,series,invoice_type,purpose,fiscal_year)
SELECT p.id,p.market_id,s.series,s.invoice_type,s.purpose,2026
FROM p
CROSS JOIN (VALUES
  ('KMR26','11.1','B2C retail goods'),
  ('KMRS26','11.2','B2C retail services'),
  ('KMB26','1.1','Domestic B2B goods'),
  ('KMBS26','2.1','Domestic B2B services'),
  ('KMRC26','11.4','Retail credits'),
  ('KMBC26','5.1/5.2','B2B credits'),
  ('KMEUG26','1.2','EU B2B goods'),
  ('KMEUS26','2.2','EU B2B services'),
  ('KMXG26','1.3','Third-country B2B goods'),
  ('KMXS26','2.3','Third-country B2B services')
) AS s(series,invoice_type,purpose)
ON CONFLICT (market_id,series) DO NOTHING;

COMMIT;
