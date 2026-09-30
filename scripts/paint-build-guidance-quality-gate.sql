-- Paint & Build general-guidance production quality gate.
-- Run against the production database after guidance migrations.
-- Fails on:
--   1) any active customer-facing entity without a current source;
--   2) any retired Layer A quantity-governance rule becoming active again;
--   3) non-current/reference-only evidence escaping through build_guidance_evidence();
--   4) generic English terminology leaking into Greek customer-facing guidance.

do $$
declare
  missing_current_count integer;
  active_quantity_rule_count integer;
  runtime_noncurrent_count integer;
  english_copy_count integer;
begin
  with entities as (
    select 'profile'::text entity_type,id from build_solution_profiles where published=true
    union all select 'solution_rule',id from build_solution_rules where active=true
    union all select 'solution_step',id from build_solution_steps where active=true
    union all select 'diagnostic_rule',id from build_diagnostic_rules where active=true
    union all select 'failure_mode',id from build_failure_modes where active=true
    union all select 'tool_requirement',id from build_tool_requirements where active=true
    union all select 'project_kit_requirement',id from build_project_kit_requirements where active=true
    union all select 'stop_condition',id from build_stop_conditions where active=true
  ),
  ev as (
    select e.entity_type,e.entity_id,
      count(*) filter (where e.active and s.active and s.source_status='current') current_links
    from general_build_rule_evidence e
    join general_build_sources s on s.id=e.source_id
    group by e.entity_type,e.entity_id
  )
  select count(*) into missing_current_count
  from entities x
  left join ev on ev.entity_type=x.entity_type and ev.entity_id=x.id
  where coalesce(ev.current_links,0)=0;

  if missing_current_count > 0 then
    raise exception 'Paint Build guidance quality gate: % active entities have no current evidence source', missing_current_count;
  end if;

  select count(*) into active_quantity_rule_count
  from build_solution_rules
  where active=true
    and rule_key='quantity_uses_manufacturer_declared_consumption';

  if active_quantity_rule_count > 0 then
    raise exception 'Paint Build guidance quality gate: % duplicate Layer A quantity rules became active again', active_quantity_rule_count;
  end if;

  with entities as (
    select 'profile'::text entity_type,id from build_solution_profiles where published=true
    union all select 'solution_rule',id from build_solution_rules where active=true
    union all select 'solution_step',id from build_solution_steps where active=true
    union all select 'diagnostic_rule',id from build_diagnostic_rules where active=true
    union all select 'failure_mode',id from build_failure_modes where active=true
    union all select 'tool_requirement',id from build_tool_requirements where active=true
    union all select 'project_kit_requirement',id from build_project_kit_requirements where active=true
    union all select 'stop_condition',id from build_stop_conditions where active=true
  )
  select count(*) into runtime_noncurrent_count
  from entities x
  cross join lateral jsonb_array_elements(build_guidance_evidence(x.entity_type,x.id)) item
  join general_build_sources s on s.id=(item->>'source_id')::uuid
  where s.source_status <> 'current';

  if runtime_noncurrent_count > 0 then
    raise exception 'Paint Build guidance quality gate: % non-current evidence rows are exposed by build_guidance_evidence()', runtime_noncurrent_count;
  end if;

  with hits as (
    select coalesce(customer_explanation_el,'') txt from build_solution_profiles where published=true
    union all select coalesce(customer_explanation_el,'') from build_solution_rules where active=true
    union all select coalesce(customer_explanation_el,'') from build_solution_steps where active=true
    union all select coalesce(title_el,'') from build_failure_modes where active=true
    union all select coalesce(reason_el,'') from build_tool_requirements where active=true
    union all select coalesce(reason_el,'') from build_project_kit_requirements where active=true
  )
  select count(*) into english_copy_count
  from hits
  where txt ~* '\m(repair|repaired|primer|finish|coating|weathered|sound|substrate|curing|paint system|application tools)\M';

  if english_copy_count > 0 then
    raise exception 'Paint Build guidance quality gate: % Greek customer strings still contain generic English terminology', english_copy_count;
  end if;
end $$;

select
  (select count(*) from build_solution_profiles where published=true) as published_profiles,
  (select count(*) from build_solution_rules where active=true) as active_rules,
  (select count(*) from build_solution_steps where active=true) as active_steps,
  (select count(*) from general_build_rule_evidence e join general_build_sources s on s.id=e.source_id where e.active=true and s.active=true and s.source_status='current') as current_evidence_links;
