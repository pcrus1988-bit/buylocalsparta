-- Paint & Build general-guidance production quality gate.
-- Run against the production database after guidance migrations.
-- Fails on:
--   1) any active customer-facing entity with no evidence;
--   2) any entity whose evidence is reference-only, except the explicitly quarantined
--      quantity_uses_manufacturer_declared_consumption rule;
--   3) generic English terminology leaking into Greek customer-facing guidance.

do $$
declare
  missing_count integer;
  unexpected_reference_only_count integer;
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
      count(*) filter (where e.active and s.active) links
    from general_build_rule_evidence e
    join general_build_sources s on s.id=e.source_id
    group by e.entity_type,e.entity_id
  )
  select count(*) into missing_count
  from entities x
  left join ev on ev.entity_type=x.entity_type and ev.entity_id=x.id
  where coalesce(ev.links,0)=0;

  if missing_count > 0 then
    raise exception 'Paint Build guidance quality gate: % active entities have no evidence', missing_count;
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
  ),
  ev as (
    select e.entity_type,e.entity_id,
      count(*) filter (where e.active and s.active and s.source_status='current') current_links,
      count(*) filter (where e.active and s.active and s.source_status='reference_only') reference_links
    from general_build_rule_evidence e
    join general_build_sources s on s.id=e.source_id
    group by e.entity_type,e.entity_id
  )
  select count(*) into unexpected_reference_only_count
  from entities x
  join ev on ev.entity_type=x.entity_type and ev.entity_id=x.id
  left join build_solution_rules r
    on x.entity_type='solution_rule' and r.id=x.id
  where ev.current_links=0
    and ev.reference_links>0
    and not (
      x.entity_type='solution_rule'
      and r.rule_key='quantity_uses_manufacturer_declared_consumption'
      and exists (
        select 1
        from general_build_rule_evidence qe
        join general_build_sources qs on qs.id=qe.source_id
        where qe.entity_type=x.entity_type
          and qe.entity_id=x.id
          and qe.active=true
          and qs.active=true
          and qs.source_key='hempel_coverage_general'
          and qs.source_status='reference_only'
      )
    );

  if unexpected_reference_only_count > 0 then
    raise exception 'Paint Build guidance quality gate: % unexpected reference-only entities remain', unexpected_reference_only_count;
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
  (select count(*) from general_build_rule_evidence e join general_build_sources s on s.id=e.source_id where e.active=true and s.active=true) as active_evidence_links;
