-- Paint & Build Guidance run: current-source evidence hardening + Greek customer terminology cleanup.
-- Scope is deliberately bounded to three reviewed customer scenarios and customer-visible Greek text.

with active_entities as (
  select p.scenario_key, 'profile'::text as entity_type, p.id
  from build_solution_profiles p
  where p.published = true
  union all
  select p.scenario_key, 'solution_rule', r.id
  from build_solution_rules r join build_solution_profiles p on p.id=r.scenario_id
  where r.active = true
  union all
  select p.scenario_key, 'solution_step', s.id
  from build_solution_steps s join build_solution_profiles p on p.id=s.scenario_id
  where s.active = true
  union all
  select p.scenario_key, 'diagnostic_rule', d.id
  from build_diagnostic_rules d join build_solution_profiles p on p.id=d.scenario_id
  where d.active = true
  union all
  select p.scenario_key, 'failure_mode', f.id
  from build_failure_modes f join build_solution_profiles p on p.id=f.scenario_id
  where f.active = true
  union all
  select p.scenario_key, 'tool_requirement', t.id
  from build_tool_requirements t join build_solution_profiles p on p.id=t.scenario_id
  where t.active = true
  union all
  select p.scenario_key, 'project_kit_requirement', k.id
  from build_project_kit_requirements k join build_solution_profiles p on p.id=k.scenario_id
  where k.active = true
),
targets as (
  select distinct ae.scenario_key, ae.entity_type, ae.id
  from active_entities ae
  join general_build_rule_evidence e
    on e.entity_type=ae.entity_type and e.entity_id=ae.id and e.active=true
  join general_build_sources ref
    on ref.id=e.source_id and ref.active=true and ref.source_status='reference_only'
  where
    (ae.scenario_key='paint_existing_peeling' and ref.source_key='sherwin_peeling_general')
    or
    (ae.scenario_key='repair_small_holes_dents' and ref.source_key='british_gypsum_minor_wall_patch')
    or
    (ae.scenario_key='repair_weak_friable_wall_surface' and ref.source_key='british_gypsum_unstable_background')
),
mapped as (
  select t.*,
    case
      when t.scenario_key='paint_existing_peeling' then 'sherwin_surface_prep'
      else 'sherwin_wall_repair'
    end as source_key
  from targets t
)
insert into general_build_rule_evidence (
  entity_type, entity_id, source_id, supporting_passage,
  relevant_section_page, evidence_strength, applicability, active
)
select
  m.entity_type,
  m.id,
  src.id,
  case
    when m.scenario_key='paint_existing_peeling'
      then 'General surface-preparation guidance requires loose, peeling or otherwise unsound material to be removed and the remaining surface to be clean, sound and suitably prepared before repainting.'
    when m.scenario_key='repair_small_holes_dents'
      then 'General wall-repair guidance distinguishes minor from larger repairs and uses removal/preparation, patching or filling, drying and smoothing before subsequent finishing.'
    else
      'General wall-repair guidance requires loose or flaking material to be removed, the remaining background to be made sound, repairs to be completed on that sound base, and repair material to reach readiness before finishing.'
  end,
  case
    when m.scenario_key='paint_existing_peeling' then 'Previously painted surfaces / surface preparation'
    else 'Wall repair — preparation, patching and drying before finishing'
  end,
  'common_professional_practice',
  case
    when m.scenario_key='paint_existing_peeling'
      then 'Scenario: paint_existing_peeling. Supports generic diagnosis/preparation/repainting workflow only. Moisture causes and exact product-system requirements remain separately evidenced.'
    when m.scenario_key='repair_small_holes_dents'
      then 'Scenario: repair_small_holes_dents. Supports ordinary non-structural local-repair workflow. Exact repair depth, product limits, cure times, primer and finish requirements remain product-specific.'
    else
      'Scenario: repair_weak_friable_wall_surface. Supports removal of unstable material and repair only on a sound base. Moisture diagnosis and exact repair-product requirements remain separately evidenced.'
  end,
  true
from mapped m
join general_build_sources src
  on src.source_key=m.source_key and src.active=true and src.source_status='current'
on conflict (entity_type, entity_id, source_id)
do update set
  supporting_passage=excluded.supporting_passage,
  relevant_section_page=excluded.relevant_section_page,
  evidence_strength=excluded.evidence_strength,
  applicability=excluded.applicability,
  active=true;

-- Add a current moisture-specific source only where the customer-facing claim includes damp/moisture diagnosis.
with moisture_targets as (
  select 'diagnostic_rule'::text entity_type, d.id
  from build_diagnostic_rules d
  join build_solution_profiles p on p.id=d.scenario_id
  where d.active=true and (
    (p.scenario_key='paint_existing_peeling' and d.diagnostic_key='moisture_behind_peeling')
    or
    (p.scenario_key='repair_small_holes_dents' and d.diagnostic_key='loose_edges_or_moisture')
    or
    (p.scenario_key='repair_weak_friable_wall_surface' and d.diagnostic_key='moisture_behind_failure')
  )
  union all
  select 'solution_step', s.id
  from build_solution_steps s
  join build_solution_profiles p on p.id=s.scenario_id
  where s.active=true
    and p.scenario_key='repair_weak_friable_wall_surface'
    and s.step_type='resolve_moisture'
  union all
  select 'profile', p.id
  from build_solution_profiles p
  where p.published=true
    and p.scenario_key in ('paint_existing_peeling','repair_weak_friable_wall_surface')
)
insert into general_build_rule_evidence (
  entity_type, entity_id, source_id, supporting_passage,
  relevant_section_page, evidence_strength, applicability, active
)
select
  mt.entity_type,
  mt.id,
  src.id,
  'Current damp/moisture guidance distinguishes different moisture mechanisms and requires the moisture source to be identified and addressed before choosing or completing cosmetic remediation.',
  'Different moisture mechanisms; find the moisture source before choosing remediation',
  'strong_consensus',
  'Supports moisture diagnosis/source-control only. It does not define product-specific coating, filler, primer, drying or cure values.',
  true
from moisture_targets mt
join general_build_sources src
  on src.source_key='rics_damp_mould' and src.active=true and src.source_status='current'
on conflict (entity_type, entity_id, source_id)
do update set
  supporting_passage=excluded.supporting_passage,
  relevant_section_page=excluded.relevant_section_page,
  evidence_strength=excluded.evidence_strength,
  applicability=excluded.applicability,
  active=true;

-- Retire the three older reference-only links only after a current active replacement exists.
with affected_entities as (
  select p.scenario_key, 'profile'::text entity_type, p.id from build_solution_profiles p where p.published
  union all select p.scenario_key,'solution_rule',r.id from build_solution_rules r join build_solution_profiles p on p.id=r.scenario_id where r.active
  union all select p.scenario_key,'solution_step',s.id from build_solution_steps s join build_solution_profiles p on p.id=s.scenario_id where s.active
  union all select p.scenario_key,'diagnostic_rule',d.id from build_diagnostic_rules d join build_solution_profiles p on p.id=d.scenario_id where d.active
  union all select p.scenario_key,'failure_mode',f.id from build_failure_modes f join build_solution_profiles p on p.id=f.scenario_id where f.active
  union all select p.scenario_key,'tool_requirement',t.id from build_tool_requirements t join build_solution_profiles p on p.id=t.scenario_id where t.active
  union all select p.scenario_key,'project_kit_requirement',k.id from build_project_kit_requirements k join build_solution_profiles p on p.id=k.scenario_id where k.active
)
update general_build_rule_evidence e
set active=false
from general_build_sources ref, affected_entities ae
where e.source_id=ref.id
  and e.entity_type=ae.entity_type
  and e.entity_id=ae.id
  and e.active=true
  and ref.active=true
  and ref.source_status='reference_only'
  and (
    (ae.scenario_key='paint_existing_peeling' and ref.source_key='sherwin_peeling_general')
    or
    (ae.scenario_key='repair_small_holes_dents' and ref.source_key='british_gypsum_minor_wall_patch')
    or
    (ae.scenario_key='repair_weak_friable_wall_surface' and ref.source_key='british_gypsum_unstable_background')
  )
  and exists (
    select 1
    from general_build_rule_evidence ce
    join general_build_sources cs on cs.id=ce.source_id
    where ce.entity_type=e.entity_type
      and ce.entity_id=e.entity_id
      and ce.active=true
      and cs.active=true
      and cs.source_status='current'
  );

-- Greek-first customer terminology cleanup. Internal keys and technical identifiers stay unchanged.
update build_tool_requirements set reason_el=case id
  when 'd3cc1759-27b6-46ac-b7e0-f3e9e596b2fb'::uuid then 'Μόνο για την επιλεγμένη επίστρωση και σύμφωνα με τις επιτρεπόμενες μεθόδους εφαρμογής.'
  when '4fa1b1c6-07ad-4cda-90e1-ddd3560fe9e5'::uuid then 'Για καθαρή βάση πριν από την επίστρωση.'
  when '29217bda-68f1-4356-963a-ca4a099ec1ee'::uuid then 'Για αφαίρεση ασταθούς επίστρωσης και εξομάλυνση.'
  when '1be71198-c8ea-4491-a4f8-42d5229788e4'::uuid then 'Σύμφωνα με το σύστημα επίστρωσης.'
  when 'c1a1cd8e-ec5d-4ddd-bb8c-bd186d3da713'::uuid then 'Για χαλαρή βαφή ή σκουριά και προετοιμασία της διατηρούμενης επίστρωσης.'
  when 'c0f1fa7b-fd9e-4aa3-8ac5-6f75e45c6199'::uuid then 'Σύμφωνα με το σύστημα επίστρωσης.'
  when '2d551a70-e6b2-48c5-8d75-f6b477287f73'::uuid then 'Για προετοιμασία της διατηρούμενης τελικής επίστρωσης και του εκτεθειμένου ξύλου.'
  when '107f2332-d507-44fe-bfd5-0c439085ff8d'::uuid then 'Για χαλαρή τελική επίστρωση.'
  when '3935b185-e222-4a13-931e-93bb5722b80d'::uuid then 'Σύμφωνα με την επιλεγμένη τελική επίστρωση.'
  when 'abc359fe-5371-4a26-a4e9-1842e962ee3b'::uuid then 'Για αποκατάσταση σταθερής επιφάνειας όπου είναι κατάλληλο.'
  when '874128f3-0075-473b-b591-acf179772737'::uuid then 'Για αποτυχημένη τελική επίστρωση ή χαλαρές ίνες.'
  when '3ac70c67-834b-4913-85f6-8bc07287de2c'::uuid then 'Για την επιλεγμένη εξωτερική τελική επίστρωση.'
  when '3c4d856d-530e-4ed3-bca2-786162056686'::uuid then 'Μόνο αφού επιτραπεί μη δομική διαδρομή επισκευής.'
  when '7d1e3436-ea4c-46b2-8a11-f250de32da27'::uuid then 'Για καθαρή περιοχή επισκευής.'
  else reason_el end
where id in (
'd3cc1759-27b6-46ac-b7e0-f3e9e596b2fb','4fa1b1c6-07ad-4cda-90e1-ddd3560fe9e5','29217bda-68f1-4356-963a-ca4a099ec1ee',
'1be71198-c8ea-4491-a4f8-42d5229788e4','c1a1cd8e-ec5d-4ddd-bb8c-bd186d3da713','c0f1fa7b-fd9e-4aa3-8ac5-6f75e45c6199',
'2d551a70-e6b2-48c5-8d75-f6b477287f73','107f2332-d507-44fe-bfd5-0c439085ff8d','3935b185-e222-4a13-931e-93bb5722b80d',
'abc359fe-5371-4a26-a4e9-1842e962ee3b','874128f3-0075-473b-b591-acf179772737','3ac70c67-834b-4913-85f6-8bc07287de2c',
'3c4d856d-530e-4ed3-bca2-786162056686','7d1e3436-ea4c-46b2-8a11-f250de32da27'
);

update build_project_kit_requirements set reason_el=case id
  when 'bad1462f-ff67-4599-98b8-038083e803cd'::uuid then 'Τελική εξωτερική επίστρωση.'
  when 'f93d8a8f-7c01-4790-a281-2d38def8dafb'::uuid then 'Σύμφωνα με το σύστημα επισκευής και επίστρωσης.'
  when '847a55f0-bede-4e97-bafd-00d76b28c364'::uuid then 'Η τελική εξωτερική επίστρωση επιλέγεται μόνο αφού επιβεβαιωθεί η καταλληλότητά της για νέο τσιμεντοειδή σοβά.'
  when '34ff1207-0c9c-48d5-b223-8147b51093a5'::uuid then 'Κύρια εξωτερική επίστρωση.'
  when '3187a660-e13c-4bf3-830f-c5cc34724b76'::uuid then 'Για επιφανειακούς ρύπους πριν από την επίστρωση.'
  when 'adb5cdec-0690-444f-bbf1-4e537e05b24e'::uuid then 'Προστατευτική τελική επίστρωση κατάλληλη για τις πραγματικές συνθήκες έκθεσης.'
  when 'a1955e7e-d1cc-4893-bfa2-1bc27f8e8d0e'::uuid then 'Για αφαίρεση ρύπων πριν από την προετοιμασία και την επίστρωση.'
  when '93d3cf09-f648-4591-b173-6b688cd49147'::uuid then 'Συμβατή με τη διατηρούμενη σταθερή επίστρωση και τα γυμνά σημεία που επισκευάστηκαν.'
  when 'a4ec2375-3290-45b4-af8c-12be6feaf4d4'::uuid then 'Το αστάρι αποτελεί μέρος του συγκεκριμένου συστήματος προστασίας.'
  when '5b0e8cdb-09d5-4d01-b776-38633860acda'::uuid then 'Για μηχανική προετοιμασία και σύμφωνα με το ΔΔΑ (SDS) της επίστρωσης.'
  when '19f2603b-7285-4d01-a999-dfebcf3995bc'::uuid then 'Η διάβρωση και οι αστοχίες παλιάς βαφής χρειάζονται προετοιμασία πριν από την επίστρωση.'
  when 'c9ceeec2-6af8-41b3-981d-9f579f75ac85'::uuid then 'Μόνο αν ανήκει στο επιλεγμένο σύστημα τελικής επίστρωσης.'
  when '5d0c8fe9-947c-4284-b767-0cbb38e46553'::uuid then 'Μόνο όταν είναι κατάλληλο ή αναγκαίο για τη συγκεκριμένη χρήση και συμβατό με την τελική επίστρωση.'
  when '0cc549d1-609e-48f9-821d-d91fdbde2ba6'::uuid then 'Τελική επίστρωση συμβατή με το ξύλο.'
  when '4b5838a1-43a3-45ee-9c85-6e7fbbc52638'::uuid then 'Για τοπικές ατέλειες μόνο με υλικό επισκευής συμβατό με το ξύλο.'
  when 'c1ff6496-da2f-433a-9d2a-5b30158d4896'::uuid then 'Τελική επίστρωση κατάλληλη για εξωτερικό ξύλο και τις συνθήκες έκθεσης.'
  when '32114608-2403-4fed-80f9-b4f54d5ca7b9'::uuid then 'Για τοπικές επισκευές μόνο όταν το ξύλο παραμένει σταθερό.'
  when '97c1c3af-5046-42a6-9c89-ed5c5325fded'::uuid then 'Μόνο αν απαιτείται από το σύστημα επισκευής και τελικού φινιρίσματος.'
  when '8cf32eac-dc5a-4d9e-a110-691ebd3a0401'::uuid then 'Όπου τεκμηριώνεται για το σύστημα επισκευής.'
  when 'a5344894-b4bd-46f2-a0c0-bd19b2e43ab4'::uuid then 'Μόνο όπου το επισκευασμένο υπόστρωμα ή το σύστημα τελικής επίστρωσης το απαιτεί.'
  when '3a6334a2-1a15-4b9c-97a6-75f4f26efa1c'::uuid then 'Μόνο αν το σύστημα επισκευής το απαιτεί.'
  when '3a7debdd-35b7-4025-9286-619d843df591'::uuid then 'Μετά την ολοκλήρωση της επισκευής και της ωρίμανσης.'
  when '319f3045-2634-4087-a3ea-96c0a8e0f9b7'::uuid then 'Μετά την αφαίρεση ασταθών υλικών και μόνο σε σταθερό υπόστρωμα.'
  when '745b7008-70f4-4ec3-9108-30a3f27984bf'::uuid then 'Δεν υποκαθιστά την αφαίρεση σαθρών υλικών· μόνο όπου τεκμηριώνεται για τη σταθερή βάση.'
  else reason_el end
where id in (
'bad1462f-ff67-4599-98b8-038083e803cd','f93d8a8f-7c01-4790-a281-2d38def8dafb','847a55f0-bede-4e97-bafd-00d76b28c364',
'34ff1207-0c9c-48d5-b223-8147b51093a5','3187a660-e13c-4bf3-830f-c5cc34724b76','adb5cdec-0690-444f-bbf1-4e537e05b24e',
'a1955e7e-d1cc-4893-bfa2-1bc27f8e8d0e','93d3cf09-f648-4591-b173-6b688cd49147','a4ec2375-3290-45b4-af8c-12be6feaf4d4',
'5b0e8cdb-09d5-4d01-b776-38633860acda','19f2603b-7285-4d01-a999-dfebcf3995bc','c9ceeec2-6af8-41b3-981d-9f579f75ac85',
'5d0c8fe9-947c-4284-b767-0cbb38e46553','0cc549d1-609e-48f9-821d-d91fdbde2ba6','4b5838a1-43a3-45ee-9c85-6e7fbbc52638',
'c1ff6496-da2f-433a-9d2a-5b30158d4896','32114608-2403-4fed-80f9-b4f54d5ca7b9','97c1c3af-5046-42a6-9c89-ed5c5325fded',
'8cf32eac-dc5a-4d9e-a110-691ebd3a0401','a5344894-b4bd-46f2-a0c0-bd19b2e43ab4','3a6334a2-1a15-4b9c-97a6-75f4f26efa1c',
'3a7debdd-35b7-4025-9286-619d843df591','319f3045-2634-4087-a3ea-96c0a8e0f9b7','745b7008-70f4-4ec3-9108-30a3f27984bf'
);

update build_solution_rules set customer_explanation_el=case id
  when '625c538c-e315-41da-b7e1-033f97a5bc36'::uuid then 'Στο ήδη βαμμένο μέταλλο αφαιρούμε χαλαρή βαφή, σκουριά και ρύπους και κρατάμε μόνο σταθερή επίστρωση.'
  when '4a68989f-b6e6-4e00-aee1-8134116ec283'::uuid then 'Αν δεν γνωρίζουμε την παλιά τελική επίστρωση, επιβεβαιώνουμε τη συμβατότητα πριν από γενική εφαρμογή.'
  when '7a7daf4e-9e0a-4a51-ba42-5d2ab8834a4a'::uuid then 'Κρατάμε την παλιά τελική επίστρωση μόνο όπου είναι σταθερή· ό,τι ξεφλουδίζει αφαιρείται.'
  when 'a96e0c87-3bb3-4ccd-aab5-b4389484cd9f'::uuid then 'Οι χαλαρές, υποβαθμισμένες ίνες από καιρική έκθεση αφαιρούνται πριν από νέα τελική επίστρωση.'
  else customer_explanation_el end
where id in (
'625c538c-e315-41da-b7e1-033f97a5bc36','4a68989f-b6e6-4e00-aee1-8134116ec283',
'7a7daf4e-9e0a-4a51-ba42-5d2ab8834a4a','a96e0c87-3bb3-4ccd-aab5-b4389484cd9f'
);

update build_solution_steps set customer_explanation_el=case id
  when '7d46ec1b-9b6b-4d28-bc02-2325f21411c7'::uuid then 'Μετά την ωρίμανση έλεγξε τη συνέχεια της επίστρωσης και σημεία πρώιμης σκουριάς.'
  when '46cb014b-c458-4f9c-bc3c-26c8a3dbe5f9'::uuid then 'Εφάρμοσε τη συμβατή επίστρωση σύμφωνα με τον κατασκευαστή.'
  when 'dfbbf35e-6ea5-4a7f-9016-0d394a04542b'::uuid then 'Εφάρμοσε τη συμβατή τελική επίστρωση σύμφωνα με τον κατασκευαστή.'
  when '347f8de1-0217-4414-a357-182eca5357e9'::uuid then 'Αφαίρεσε τη χαλαρή τελική επίστρωση και αποκατάστησε τυχόν υποβαθμισμένο ξύλο.'
  when '0b6ec8ba-8cae-4908-b555-6f11b5b764a1'::uuid then 'Καθάρισε και προετοίμασε τη σταθερή παλιά τελική επίστρωση.'
  when '8de28753-da76-4ea4-937f-140e52cb3f49'::uuid then 'Έλεγξε την πρόσφυση της παλιάς τελικής επίστρωσης, την κατάσταση και την υγρασία του ξύλου και τη συμβατότητα.'
  when '74ae6200-2fe5-43bc-87d3-0578f719a14e'::uuid then 'Αφαίρεσε την αποτυχημένη τελική επίστρωση και τις χαλαρές ίνες που έχουν φθαρεί από καιρική έκθεση.'
  else customer_explanation_el end
where id in (
'7d46ec1b-9b6b-4d28-bc02-2325f21411c7','46cb014b-c458-4f9c-bc3c-26c8a3dbe5f9','dfbbf35e-6ea5-4a7f-9016-0d394a04542b',
'347f8de1-0217-4414-a357-182eca5357e9','0b6ec8ba-8cae-4908-b555-6f11b5b764a1','8de28753-da76-4ea4-937f-140e52cb3f49',
'74ae6200-2fe5-43bc-87d3-0578f719a14e'
);

update build_failure_modes set title_el=case id
  when '218ccee6-28e1-47eb-9f05-bab2a7f82441'::uuid then 'Αποκόλληση νέας επίστρωσης ή διάβρωση από κάτω'
  when '8295f4b2-785d-4c64-9fad-a33385d8425e'::uuid then 'Αποκόλληση νέας τελικής επίστρωσης από την παλιά'
  when '65c965be-fd75-4991-9dcf-22d33b1db036'::uuid then 'Πρόωρη αστοχία τελικής επίστρωσης σε ξύλο φθαρμένο από καιρική έκθεση'
  when 'ce19a21d-be23-4751-a3fb-cb7ed2311489'::uuid then 'Βύθιση ή αποκόλληση τοπικής επισκευής'
  else title_el end
where id in (
'218ccee6-28e1-47eb-9f05-bab2a7f82441','8295f4b2-785d-4c64-9fad-a33385d8425e',
'65c965be-fd75-4991-9dcf-22d33b1db036','ce19a21d-be23-4751-a3fb-cb7ed2311489'
);
