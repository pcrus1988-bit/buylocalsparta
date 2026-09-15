-- Tighten internal promotion access. Runtime workers use the existing privileged database role.
revoke all on function public.promote_catalogue_enrichment_translation(uuid, uuid, text) from public;
revoke all on function public.promote_catalogue_enrichment_translation(uuid, uuid, text) from anon;
revoke all on function public.promote_catalogue_enrichment_translation(uuid, uuid, text) from authenticated;
