-- KONTA MOU - vendor-scoped AADE connection metadata and invoice presentation settings.
-- AADE secrets stay in Supabase Vault; this table stores only non-secret configuration and status.
-- Preview VAT is intentionally not an accounting mapping and never overrides approved product tax profiles.

BEGIN;

CREATE TABLE public.vendor_fiscal_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('vfiscal_' || replace(gen_random_uuid()::text,'-','')),
  vendor_id uuid NOT NULL UNIQUE REFERENCES public.vendor_businesses(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES public.markets(id),
  aade_environment text NOT NULL DEFAULT 'production'
    CHECK (aade_environment IN ('test','production')),
  credentials_updated_at timestamptz,
  last_connection_check_at timestamptz,
  last_connection_status text
    CHECK (last_connection_status IS NULL OR last_connection_status IN ('succeeded','failed')),
  last_connection_error text
    CHECK (last_connection_error IS NULL OR length(last_connection_error) <= 700),
  document_series text NOT NULL DEFAULT ''
    CHECK (length(document_series) <= 20),
  branch_number integer
    CHECK (branch_number IS NULL OR (branch_number >= 0 AND branch_number <= 9999)),
  preview_vat_rate_bps integer
    CHECK (preview_vat_rate_bps IS NULL OR (preview_vat_rate_bps >= 0 AND preview_vat_rate_bps <= 10000)),
  tax_display_mode text NOT NULL DEFAULT 'gross_with_breakdown'
    CHECK (tax_display_mode IN ('gross_with_breakdown','net_plus_vat','summary_only')),
  pdf_template text NOT NULL DEFAULT 'clean'
    CHECK (pdf_template IN ('clean','classic','compact')),
  pdf_accent_hex text NOT NULL DEFAULT '#0F766E'
    CHECK (pdf_accent_hex ~ '^#[0-9A-Fa-f]{6}$'),
  show_logo boolean NOT NULL DEFAULT true,
  show_aade_qr boolean NOT NULL DEFAULT true,
  show_payment_details boolean NOT NULL DEFAULT true,
  footer_note text
    CHECK (footer_note IS NULL OR length(footer_note) <= 1200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vendor_fiscal_settings_market_vendor_idx
  ON public.vendor_fiscal_settings(market_id,vendor_id);

CREATE OR REPLACE FUNCTION bls_private.validate_vendor_fiscal_settings_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_market uuid;
BEGIN
  SELECT market_id INTO v_market
    FROM public.vendor_businesses
   WHERE id=NEW.vendor_id;
  IF v_market IS NULL OR v_market<>NEW.market_id THEN
    RAISE EXCEPTION 'vendor fiscal settings market scope mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vendor_fiscal_settings_scope_guard
BEFORE INSERT OR UPDATE ON public.vendor_fiscal_settings
FOR EACH ROW EXECUTE FUNCTION bls_private.validate_vendor_fiscal_settings_scope();

ALTER TABLE public.vendor_fiscal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_fiscal_settings_vendor_select
  ON public.vendor_fiscal_settings FOR SELECT TO bls_app_runtime
  USING (
    vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid
    AND market_id=nullif(current_setting('app.market_id',true),'')::uuid
  );

CREATE POLICY vendor_fiscal_settings_vendor_insert
  ON public.vendor_fiscal_settings FOR INSERT TO bls_app_runtime
  WITH CHECK (
    vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid
    AND market_id=nullif(current_setting('app.market_id',true),'')::uuid
  );

CREATE POLICY vendor_fiscal_settings_vendor_update
  ON public.vendor_fiscal_settings FOR UPDATE TO bls_app_runtime
  USING (
    vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid
    AND market_id=nullif(current_setting('app.market_id',true),'')::uuid
  )
  WITH CHECK (
    vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid
    AND market_id=nullif(current_setting('app.market_id',true),'')::uuid
  );

CREATE POLICY vendor_fiscal_settings_platform_all
  ON public.vendor_fiscal_settings FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

GRANT SELECT,INSERT,UPDATE ON public.vendor_fiscal_settings TO bls_app_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.vendor_fiscal_settings TO bls_platform_runtime;

COMMENT ON TABLE public.vendor_fiscal_settings IS
  'Vendor-owned HUB fiscal connection metadata and invoice presentation preferences. AADE credentials are stored separately in Supabase Vault.';
COMMENT ON COLUMN public.vendor_fiscal_settings.preview_vat_rate_bps IS
  'Draft/PDF preview VAT only. It never overrides approved accounting mappings or product tax profiles.';

COMMIT;
