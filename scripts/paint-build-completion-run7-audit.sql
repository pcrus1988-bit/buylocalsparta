-- Paint & Build Completion Run 7 verification gate
-- Run after 20261004152000_paint_build_completion_run7.sql.

select completion_state,
       count(*)::int as commerce_rows,
       count(distinct manufacturer_product_id)::int as manufacturer_families
from public.admin_vitex_studio_completion_audit
group by completion_state
order by completion_state;

select mp.product_name,
       mp.verification_status,
       mp.product_system_status,
       ap.verification_status as profile_status,
       ap.consumption_value_min,
       ap.consumption_value_max,
       ap.consumption_unit,
       count(distinct r.condition_expression->>'scenario_key') filter (
         where r.active
           and r.result_status in ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component')
           and r.condition_expression ? 'scenario_key'
       )::int as positive_scenarios
from public.manufacturer_products mp
left join public.manufacturer_application_profiles ap
  on ap.product_id=mp.id and ap.source_layer='manufacturer' and ap.is_current=true
left join public.manufacturer_application_rules r
  on r.product_id=mp.id
where mp.product_name in (
  'Vito Eco',
  'Acrylic Putty',
  'Visto',
  'Velatura Eco Water',
  'Heavy Metal Silicon Varnish',
  'Wooden Floor Varnish',
  'Wooden Floor Primer'
)
group by mp.id,mp.product_name,mp.verification_status,mp.product_system_status,
         ap.verification_status,ap.consumption_value_min,ap.consumption_value_max,ap.consumption_unit
order by mp.product_name;

do $$
declare
  v_count integer;
  v_rows integer;
begin
  select count(*) into v_count
  from public.admin_vitex_studio_completion_audit
  where completion_state='manufacturer_identity_unresolved';
  if v_count <> 0 then
    raise exception 'Run 7: % commerce identities remain unresolved', v_count;
  end if;

  select count(*) into v_count
  from public.admin_vitex_studio_completion_audit
  where completion_state='technical_profile_unverified';
  if v_count <> 0 then
    raise exception 'Run 7: % true technical-profile gaps remain unclassified', v_count;
  end if;

  select count(*) into v_count
  from public.admin_vitex_studio_completion_audit
  where completion_state='reachable_verified';
  if v_count < 246 then
    raise exception 'Run 7: reachable verified rows only % (expected >= 246)', v_count;
  end if;

  select count(*) into v_count
  from public.admin_vitex_studio_completion_audit
  where completion_state='reachable_system_component';
  if v_count < 27 then
    raise exception 'Run 7: reachable system component rows only % (expected >= 27)', v_count;
  end if;

  select count(*) into v_count
  from public.admin_vitex_studio_completion_audit
  where completion_state='portfolio_status_unresolved'
    and manufacturer_product_name='Wooden Floor Primer';
  if v_count <> 2 then
    raise exception 'Run 7: Wooden Floor Primer quarantine expected 2 commerce rows, got %', v_count;
  end if;

  select count(*) into v_count
  from public.admin_vitex_studio_completion_audit
  where completion_state='unmatched_insufficient_identity';
  if v_count <> 1 then
    raise exception 'Run 7: expected exactly one insufficient-identity commerce row, got %', v_count;
  end if;

  select count(*) into v_count
  from public.manufacturer_application_rules
  where rule_revision='pb7-2026-10-04'
    and (source_evidence_id is null or active=false);
  if v_count <> 0 then
    raise exception 'Run 7: % run-7 rule(s) lack active source evidence', v_count;
  end if;

  select count(*) into v_count
  from public.manufacturer_instruction_evidence
  where product_id='c75e3a20-7f5c-4780-bbd2-db89609163f5'::uuid
    and is_current=true
    and (
      (field_name='package_sizes' and normalized_value @> '{"sizes":[0.4]}'::jsonb)
      or (field_name='coverage_m2_per_kg' and normalized_value @> '{"min":2}'::jsonb)
      or (field_name='dry_to_touch_minutes' and normalized_value @> '{"min":30}'::jsonb)
    );
  if v_count <> 0 then
    raise exception 'Run 7: contaminated Visto evidence is still current';
  end if;

  select count(*) into v_count
  from public.manufacturer_package_sizes
  where product_id='c75e3a20-7f5c-4780-bbd2-db89609163f5'::uuid
    and active=true
    and amount in (0.4,0.8);
  if v_count <> 0 then
    raise exception 'Run 7: obsolete Visto 400g/800g package rows are still active';
  end if;

  select count(*) into v_rows
  from public.manufacturer_package_sizes
  where product_id='c75e3a20-7f5c-4780-bbd2-db89609163f5'::uuid
    and active=true
    and lower(unit)='kg'
    and amount in (5,20);
  if v_rows <> 2 then
    raise exception 'Run 7: Visto current package set incomplete (% rows)', v_rows;
  end if;

  select count(*) into v_rows
  from public.manufacturer_package_sizes
  where product_id='fb9a5f39-1996-4123-9e8d-bdae7a9fe722'::uuid
    and active=true
    and lower(unit)='kg'
    and amount in (0.4,0.8,5);
  if v_rows <> 3 then
    raise exception 'Run 7: Acrylic Putty current package set incomplete (% rows)', v_rows;
  end if;

  select count(*) into v_count
  from public.manufacturer_product_compatibility rel
  join public.manufacturer_products target on target.id=rel.target_product_id
  where rel.source_product_id='8f43f77b-c3cb-4be6-8fc7-dd6734a399be'::uuid
    and rel.relationship_strength='required'
    and rel.is_current=true
    and target.product_name='Wooden Floor Primer'
    and target.product_system_status='unknown';
  if v_count <> 1 then
    raise exception 'Run 7: Wooden Floor Varnish unresolved required-primer dependency not preserved';
  end if;
end $$;
