-- Paint & Build Guidance: retire duplicate Layer A quantity governance and serve current evidence only.
-- Quantity calculation remains fail-closed in application runtime and depends exclusively on verified/current manufacturer data.

update public.build_solution_rules
set active = false,
    updated_at = now()
where active = true
  and rule_key = 'quantity_uses_manufacturer_declared_consumption'
  and rule_category = 'quantity';

update public.general_build_rule_evidence e
set active = false
from public.build_solution_rules r
where e.entity_type = 'solution_rule'
  and e.entity_id = r.id
  and e.active = true
  and r.rule_key = 'quantity_uses_manufacturer_declared_consumption'
  and r.rule_category = 'quantity'
  and r.active = false;

create or replace function public.build_guidance_evidence(
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'evidence_id', e.id,
        'source_id', s.id,
        'source_key', s.source_key,
        'organization', s.organization,
        'source_type', s.source_type,
        'title', s.title,
        'url', s.url,
        'jurisdiction', s.jurisdiction,
        'standard_identifier', s.standard_identifier,
        'publication_date', s.publication_date,
        'revision', s.revision,
        'relevant_section_page', coalesce(e.relevant_section_page, s.relevant_section_page),
        'supporting_passage', e.supporting_passage,
        'evidence_strength', e.evidence_strength,
        'applicability', e.applicability
      )
      order by s.organization, s.title
    ),
    '[]'::jsonb
  )
  from public.general_build_rule_evidence e
  join public.general_build_sources s on s.id = e.source_id
  where e.entity_type = p_entity_type
    and e.entity_id = p_entity_id
    and e.active
    and s.active
    and s.source_status = 'current';
$function$;
