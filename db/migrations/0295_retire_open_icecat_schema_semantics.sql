-- Retire the final Open Icecat-specific schema semantics after runtime/provider removal.
-- The shared localization table remains in use by other catalogue sources.
ALTER TABLE public.catalog_source_product_localizations
  DROP CONSTRAINT IF EXISTS catalog_source_product_localizations_content_origin_check;

ALTER TABLE public.catalog_source_product_localizations
  ADD CONSTRAINT catalog_source_product_localizations_content_origin_check
  CHECK (content_origin IN ('translated_verified', 'mixed', 'manual_verified'));

COMMENT ON COLUMN public.catalog_sources.source_kind IS
  'Source role. data_provider covers governed catalogue providers; provider data remains provenance-bearing evidence and never automatic commerce truth.';

COMMENT ON TABLE public.catalog_source_product_localizations IS
  'Locale-specific source-product content with field-level provenance. Verified localization may fill language gaps, while identifiers and specification facts remain source-derived.';

COMMENT ON COLUMN public.catalog_source_product_localizations.field_provenance IS
  'Per-field derivation evidence. Provenance describes how localized content was produced and never replaces immutable raw source payloads.';

COMMENT ON TABLE public.catalog_intelligence_refresh_queue IS
  'Debounced lease-safe queue for deterministic catalogue intelligence. One row per snapshot makes repeated governed source writes converge idempotently.';
