BEGIN;

-- Register official ΓΕΜΗ OpenData records as a distinct, auditable research source.
-- Historical `gemi_sample` evidence remains valid but is not equivalent to an
-- official OpenData record retrieved through the authenticated API.
ALTER TABLE public.vendor_research_source_records
  DROP CONSTRAINT IF EXISTS vendor_research_source_records_source_type_check;

ALTER TABLE public.vendor_research_source_records
  ADD CONSTRAINT vendor_research_source_records_source_type_check
  CHECK (
    source_type = ANY (
      ARRAY[
        'merchant_census'::text,
        'gemi_sample'::text,
        'active_online_shop'::text,
        'eshop_issue'::text,
        'gemi_opendata_official'::text
      ]
    )
  );

COMMIT;
