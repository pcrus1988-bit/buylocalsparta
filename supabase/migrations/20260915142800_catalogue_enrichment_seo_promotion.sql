-- Catalogue enrichment V4: atomic localized promotion contract.
-- Uses only validated persisted enrichment fields; SEO falls back deterministically
-- to validated Greek merchandising copy until dedicated SEO generation is persisted.

create or replace function public.promote_catalogue_enrichment_translation(
  p_enrichment_id uuid,
  p_canonical_variant_id uuid,
  p_locale text default 'el'
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare e public.catalogue_enrichments%rowtype;
begin
  select * into e from public.catalogue_enrichments where id = p_enrichment_id for update;
  if not found or e.status <> 'enriched' or coalesce(jsonb_array_length(e.validation_errors), 0) > 0 then return false; end if;
  if p_locale <> 'el' then return false; end if;
  insert into public.product_translations (canonical_variant_id, locale, title, description, short_description, seo_title, seo_description, specifications)
  values (p_canonical_variant_id,p_locale,e.display_title_el,e.display_description_el,e.display_short_description_el,nullif(btrim(e.display_title_el),''),nullif(btrim(coalesce(e.display_short_description_el,e.display_description_el)),''),'{}'::jsonb)
  on conflict (canonical_variant_id, locale) do update set
    title=coalesce(nullif(btrim(public.product_translations.title),''),excluded.title),
    description=coalesce(nullif(btrim(public.product_translations.description),''),excluded.description),
    short_description=coalesce(nullif(btrim(public.product_translations.short_description),''),excluded.short_description),
    seo_title=coalesce(nullif(btrim(public.product_translations.seo_title),''),excluded.seo_title),
    seo_description=coalesce(nullif(btrim(public.product_translations.seo_description),''),excluded.seo_description),
    specifications=coalesce(public.product_translations.specifications,'{}'::jsonb);
  update public.catalogue_enrichments set published_at=coalesce(published_at,now()) where id=p_enrichment_id;
  return true;
end; $$;

revoke all on function public.promote_catalogue_enrichment_translation(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.promote_catalogue_enrichment_translation(uuid,uuid,text) to service_role;
