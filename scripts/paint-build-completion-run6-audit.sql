-- Paint & Build Completion Run 6 verification gate
-- Run after 20261004133000_paint_build_completion_run6.sql.

select completion_state,
       count(*)::int as commerce_rows,
       count(distinct manufacturer_product_id)::int as manufacturer_families
from public.admin_vitex_studio_completion_audit
group by completion_state
order by completion_state;

select mp.product_name,
       count(distinct r.condition_expression->>'scenario_key')::int as reviewed_positive_scenarios
from public.manufacturer_products mp
left join public.manufacturer_application_rules r
  on r.product_id=mp.id
 and r.active=true
 and r.source_layer='manufacturer'
 and r.result_status in ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component')
 and r.condition_expression ? 'scenario_key'
left join public.manufacturer_instruction_evidence ie
  on ie.id=r.source_evidence_id and ie.is_current=true
left join public.manufacturer_technical_sources ts
  on ts.id=ie.source_id and ts.is_current=true
where mp.product_name in ('Vito Eco','Vito Acrylic','Direct-3 in 1','Platinum PU')
group by mp.product_name
order by mp.product_name;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.vitex_commerce_products
  where active=true
    and match_status='product_matched'
    and match_confidence>=0.92
    and match_method in (
      'explicit_name_cluster',
      'explicit_function_alias',
      'explicit_family_alias',
      'explicit_name_colour',
      'explicit_alias'
    )
    and manufacturer_product_id in (
      'fb9a5f39-1996-4123-9e8d-bdae7a9fe722'::uuid,
      '051888a0-a3c4-44e0-930a-f1a7185427e9'::uuid,
      'ec5393da-ad5e-414a-8852-7fa0221f4ea3'::uuid,
      '17c74e5d-0ef0-4dc0-afb4-847e4b7ad173'::uuid,
      '7d5572ec-ea1c-45d2-94ef-2fb2a9fe3d96'::uuid,
      '558237e5-23c2-4cb9-83e8-6ac35e518cf8'::uuid
    );
  if v_count <> 0 then
    raise exception 'Paint Build completion run: % targeted explicit commerce identities remain unverified', v_count;
  end if;

  select count(*) into v_count
  from public.manufacturer_products mp
  where mp.product_name in ('Vito Eco','Vito Acrylic','Direct-3 in 1','Platinum PU')
    and not exists (
      select 1
      from public.manufacturer_application_rules r
      join public.manufacturer_instruction_evidence ie on ie.id=r.source_evidence_id and ie.is_current=true
      join public.manufacturer_technical_sources ts on ts.id=ie.source_id and ts.is_current=true
      join public.build_solution_profiles bsp on bsp.scenario_key=r.condition_expression->>'scenario_key'
      where r.product_id=mp.id
        and r.active=true
        and r.result_status in ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component')
        and r.condition_expression ? 'scenario_key'
        and bsp.published=true
        and bsp.review_status='approved'
        and bsp.evidence_status='verified'
    );
  if v_count <> 0 then
    raise exception 'Paint Build completion run: % promoted main family/families have no reviewed positive scenario', v_count;
  end if;

  select count(*) into v_count
  from public.manufacturer_application_rules
  where rule_revision='pb6-2026-10-04'
    and source_evidence_id is null;
  if v_count <> 0 then
    raise exception 'Paint Build completion run: % run6 rule(s) have null source evidence', v_count;
  end if;

  select count(*) into v_count
  from public.admin_vitex_studio_completion_audit
  where completion_state='manufacturer_identity_unresolved';
  if v_count > 5 then
    raise exception 'Paint Build completion run: identity unresolved rows regressed to %', v_count;
  end if;

  select count(*) into v_count
  from public.admin_vitex_studio_completion_audit
  where completion_state='reachable_verified';
  if v_count < 237 then
    raise exception 'Paint Build completion run: reachable verified rows only % (expected >= 237)', v_count;
  end if;
end $$;
