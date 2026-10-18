-- NYXI exact snapshot PDF parser lease. Already applied to production on 2026-10-18.
-- Explicitly internal: neither anon nor signed-in customers may access these records/functions.
CREATE TABLE IF NOT EXISTS public.nyxi_pdf_extraction_leases (
  snapshot_id uuid PRIMARY KEY REFERENCES public.nyxi_source_snapshots(id) ON DELETE RESTRICT,
  lease_token uuid NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz NOT NULL
);
ALTER TABLE public.nyxi_pdf_extraction_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nyxi_pdf_extraction_leases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nyxi_pdf_extraction_leases TO service_role;

CREATE OR REPLACE FUNCTION public.nyxi_pdf_claim_v1(p_snapshot uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE new_token uuid := gen_random_uuid();
DECLARE claimed uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.nyxi_source_snapshots
    WHERE id=p_snapshot AND storage_bucket='nyxi-evidence' AND mime_type='application/pdf'
  ) THEN RETURN NULL; END IF;
  INSERT INTO public.nyxi_pdf_extraction_leases(snapshot_id,lease_token,acquired_at,lease_until)
  VALUES(p_snapshot,new_token,now(),now()+interval '3 minutes')
  ON CONFLICT (snapshot_id) DO UPDATE
    SET lease_token=EXCLUDED.lease_token, acquired_at=EXCLUDED.acquired_at, lease_until=EXCLUDED.lease_until
    WHERE public.nyxi_pdf_extraction_leases.lease_until < now()
  RETURNING lease_token INTO claimed;
  RETURN claimed;
END $$;
REVOKE ALL ON FUNCTION public.nyxi_pdf_claim_v1(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nyxi_pdf_claim_v1(uuid) TO service_role;
