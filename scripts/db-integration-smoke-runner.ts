import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for database integration smoke");

const pool = new Pool({ connectionString, application_name: "buy-local-sparta-db-smoke-fixture" });

const installFixture = `
CREATE OR REPLACE FUNCTION public.bls_db_smoke_vendor_agreement_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.public_id LIKE 'vendor_db_smoke_%' OR NEW.public_id LIKE 'vendor_rescue_db_smoke_%' THEN
    INSERT INTO public.vendor_commercial_agreements (
      market_id,
      vendor_id,
      agreement_code,
      agreement_version,
      status,
      starts_at,
      signed_at,
      commission_rate_bps,
      commission_tax_mode,
      commission_tax_rate_bps,
      commission_applies_to_shipping,
      listing_fee_minor,
      recurring_fee_minor,
      recurring_fee_period,
      source_document_reference,
      terms_snapshot
    ) VALUES (
      NEW.market_id,
      NEW.id,
      'db-smoke-fixture',
      1,
      'active',
      clock_timestamp() - interval '1 minute',
      clock_timestamp(),
      500,
      'included',
      2400,
      false,
      0,
      0,
      'term',
      'ci:db-integration-smoke',
      '{"fixture":true,"purpose":"checkout agreement enforcement"}'::jsonb
    );
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.bls_db_smoke_vendor_agreement_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.public_id LIKE 'vendor_db_smoke_%' OR OLD.public_id LIKE 'vendor_rescue_db_smoke_%' THEN
    DELETE FROM public.vendor_commercial_agreements
    WHERE vendor_id = OLD.id
      AND agreement_code = 'db-smoke-fixture';
  END IF;
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS bls_db_smoke_vendor_agreement_after_insert ON public.vendor_businesses;
CREATE TRIGGER bls_db_smoke_vendor_agreement_after_insert
AFTER INSERT ON public.vendor_businesses
FOR EACH ROW
EXECUTE FUNCTION public.bls_db_smoke_vendor_agreement_after_insert();

DROP TRIGGER IF EXISTS bls_db_smoke_vendor_agreement_before_delete ON public.vendor_businesses;
CREATE TRIGGER bls_db_smoke_vendor_agreement_before_delete
BEFORE DELETE ON public.vendor_businesses
FOR EACH ROW
EXECUTE FUNCTION public.bls_db_smoke_vendor_agreement_before_delete();
`;

const removeFixture = `
DROP TRIGGER IF EXISTS bls_db_smoke_vendor_agreement_after_insert ON public.vendor_businesses;
DROP TRIGGER IF EXISTS bls_db_smoke_vendor_agreement_before_delete ON public.vendor_businesses;
DROP FUNCTION IF EXISTS public.bls_db_smoke_vendor_agreement_after_insert();
DROP FUNCTION IF EXISTS public.bls_db_smoke_vendor_agreement_before_delete();
`;

try {
  await pool.query(installFixture);
  await import("./db-integration-smoke.ts");
} finally {
  try {
    await pool.query(removeFixture);
  } finally {
    await pool.end();
  }
}
