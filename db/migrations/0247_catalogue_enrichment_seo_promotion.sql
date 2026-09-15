-- Catalogue enrichment V4: atomic localized promotion contract.
-- Internal enrichment data is copied into product_translations only after validation.

create or replace function public.promote_catalogue_enrichment_translation(
  p_enrichment_id uuid,
  p_canonical_variant_id uuid,
  p_locale text default 'el'
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  e public.catalogue_enrichments%rowtype;
  existing public.product_translations%rowtype;
begin
  select * into e
  from public.catalogue_enrichments
  where id = p_enrichment_id
  for update;

  if not found or e.status <> 'enriched' or coalesce(jsonb_array_length(e.validation_errors), 0) > 0 then
    return false;
  end if;

  select * into existing
  from public.product_translations
  where canonical_variant_id = p_canonical_variant_id and locale = p_locale
  for update;

  -- Existing manually protected/customer copy is deliberately left untouched.
  -- Specifications are merged only from a validated object and never replace existing keys.
  insert into public.product_translations (
    canonical_variant_id, locale, title, description, short_description,
    seo_title, seo_description, specifications
  ) values (
    p_canonical_variant_id, p_locale,
    e.display_title_el, e.display_description_el, e.display_short_description_el,
    e.display_seo_title_el, e.display_seo_description_el,
    coalesce(e.specifications_el, '{}'::jsonb)
  )
  on conflict (canonical_variant_id, locale) do update set
    title = coalesce(nullif(public.product_translations.title, ''), excluded.title),
    description = coalesce(nullif(public.product_translations.description, ''), excluded.description),
    short_description = coalesce(nullif(public.product_translations.short_description, ''), excluded.short_description),
    seo_title = coalesce(nullif(public.product_translations.seo_title, ''), excluded.seo_title),
    seo_description = coalesce(nullif(public.product_translations.seo_description, ''), excluded.seo_description),
    specifications = coalesce(public.product_translations.specifications, '{}'::jsonb) ||
      (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
       from jsonb_each(coalesce(excluded.specifications, '{}'::jsonb)) as x(k,v)
       where v is not null and v <> 'null'::jsonb
         and not (public.product_translations.specifications ? k));

  update public.catalogue_enrichments
  set published_at = coalesce(published_at, now())
  where id = p_enrichment_id;
  return true;
end;
$$;
