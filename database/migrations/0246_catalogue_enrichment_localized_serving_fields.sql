-- Catalogue enrichment V4: localized serving fields
-- product_translations remains the sole customer-facing localized serving layer.

alter table public.product_translations
  add column if not exists short_description text;

alter table public.catalogue_enrichments
  add column if not exists display_seo_title_el text,
  add column if not exists display_seo_description_el text;

comment on column public.product_translations.short_description is
  'Customer-facing localized short merchandising copy. Promoted atomically from a validated catalogue enrichment; storefronts must read this table, not catalogue_enrichments.';
comment on column public.catalogue_enrichments.display_seo_title_el is
  'Validated Greek SEO title candidate. Internal enrichment layer only; customer serving occurs via product_translations.';
comment on column public.catalogue_enrichments.display_seo_description_el is
  'Validated Greek SEO description candidate. Internal enrichment layer only; customer serving occurs via product_translations.';
