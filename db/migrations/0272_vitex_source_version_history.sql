-- KONTA MOY — preserve every observed Vitex official-source revision, including checksum reappearance.
--
-- A source can legitimately move A -> B -> A while keeping the same public URL
-- and document revision label. History must therefore be occurrence-based rather
-- than globally unique by checksum. At most one row per manufacturer/source URL
-- may be current at any moment.

BEGIN;

DROP INDEX IF EXISTS public.manufacturer_technical_sources_identity_uidx;

CREATE INDEX IF NOT EXISTS manufacturer_technical_sources_identity_idx
  ON public.manufacturer_technical_sources(
    manufacturer,
    source_url,
    COALESCE(document_revision,''),
    COALESCE(checksum_sha256,'')
  );

CREATE UNIQUE INDEX IF NOT EXISTS manufacturer_technical_sources_current_url_uidx
  ON public.manufacturer_technical_sources(manufacturer, source_url)
  WHERE is_current = true;

COMMIT;
