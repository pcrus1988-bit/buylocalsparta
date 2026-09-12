-- Canonical brand logo provenance and the single public brand asset bucket.
ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Hosted Supabase projects expose the storage schema. The repository's plain
-- Postgres/PostGIS CI databases intentionally do not, so keep the canonical
-- brand schema portable while still creating the one approved public bucket
-- whenever Supabase Storage is available.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    EXECUTE $storage$
      INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
      VALUES ('brands','brands',true,2097152,ARRAY['image/svg+xml','image/png','image/webp'])
      ON CONFLICT (id) DO NOTHING
    $storage$;
  END IF;
END
$$;

-- Public reads are served by Supabase Storage. Uploads require the service role;
-- no anonymous or authenticated write policy is installed for this bucket.