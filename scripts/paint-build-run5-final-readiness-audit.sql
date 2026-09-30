-- Paint & Build Run 5 final readiness audit.
-- Read-only. Expected healthy end-state:
--   * no primer/system-component role leaks into direct scenario rules
--   * direct + component reachability are separated
--   * product_matched commerce remains identity-review work
--   * waterproofing/insulation without sellable commerce is reported explicitly

select coverage_state,
       count(*)::bigint as commerce_rows,
       count(distinct manufacturer_product_id)::bigint as manufacturer_families
from public.admin_vitex_studio_coverage
where commerce_active
group by coverage_state
order by coverage_state;

select readiness_state,
       count(*)::bigint as manufacturer_families,
       sum(sellable_commerce_rows)::bigint as sellable_commerce_rows
from public.admin_vitex_studio_family_readiness
group by readiness_state
order by readiness_state;

select product_name,product_category,subcategory,
       sellable_commerce_rows,exact_sellable_commerce_rows,
       verification_status,has_verified_current_profile,
       direct_reviewed_scenario_rules,component_reviewed_scenarios,
       readiness_state
from public.admin_vitex_studio_family_readiness
where readiness_state in (
  'manufacturer_identity_review_required',
  'technical_profile_unverified',
  'verified_but_no_reviewed_pathway'
)
order by readiness_state,sellable_commerce_rows desc,product_name;

select product_name,product_category,subcategory,
       verification_status,has_verified_current_profile,
       sellable_commerce_rows,exact_sellable_commerce_rows,
       readiness_state
from public.admin_vitex_studio_family_readiness
where lower(coalesce(product_category,'')) ~ '(water|proof|insulat|roof)'
   or lower(coalesce(subcategory,'')) ~ '(water|proof|insulat|roof)'
order by readiness_state,product_name;

select mp.product_name,mp.product_category,r.rule_key,
       r.condition_expression->>'scenario_key' as scenario_key
from public.manufacturer_application_rules r
join public.manufacturer_products mp on mp.id=r.product_id
where r.active
  and r.result_status in ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component')
  and r.condition_expression ? 'scenario_key'
  and (
    lower(coalesce(mp.product_category,'')) like '%primer%'
    or lower(coalesce(mp.subcategory,'')) like '%primer%'
    or lower(coalesce(mp.product_category,'')) like '%preservative%'
    or lower(coalesce(mp.product_category,'')) like '%thinner%'
    or lower(coalesce(mp.product_category,'')) like '%accessory%'
  )
order by mp.product_name,r.rule_key;
