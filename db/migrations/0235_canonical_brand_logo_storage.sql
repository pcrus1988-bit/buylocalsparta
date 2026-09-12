-- Canonical brand logo provenance and the single public brand asset bucket.
ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('brands','brands',true,2097152,ARRAY['image/svg+xml','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Public reads are served by Supabase Storage. Uploads require the service role;
-- no anonymous or authenticated write policy is installed for this bucket.
