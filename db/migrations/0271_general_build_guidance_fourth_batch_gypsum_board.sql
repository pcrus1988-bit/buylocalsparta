-- Reconciled from the already-applied production gypsum-board guidance migration.
-- Keeps fresh environments reproducible without changing the verified production data.
BEGIN;
insert into public.general_build_sources
(source_key,organization,source_type,title,url,jurisdiction,standard_identifier,publication_date,revision,retrieved_at,relevant_section_page,source_status,notes,active)
values ('gypsum_association_new_board_painting','Gypsum Association','professional_guidance',
'Painting New Gypsum Board (GA-232-04), cross-checked with current Gypsum Association finishing FAQ',
'https://www.gypsum.org/wp-content/uploads/2011/11/232-04.pdf','General industry guidance (US; not Greek law)',
'GA-232-04; GA-214 cross-reference','2004-01-01','GA-232-04; current FAQ cross-check retrieved 2026-09-21',now(),
'Surface Preparation; General Recommendations; current FAQ: painting and finishing new gypsum wallboard',
'current','General substrate/finishing principles only. Exact coating product, application, coat count and drying remain manufacturer-layer data.',true)
on conflict (source_key) do update set retrieved_at=excluded.retrieved_at,revision=excluded.revision,notes=excluded.notes,active=true,updated_at=now();

insert into public.build_problem_types(problem_key,title_el,title_en,description_el)
values ('new_gypsum_board','Νέα γυψοσανίδα','New gypsum board','Νέα εσωτερική γυψοσανίδα που πρόκειται να βαφεί.')
on conflict (problem_key) do update set title_el=excluded.title_el,title_en=excluded.title_en,description_el=excluded.description_el,active=true,updated_at=now();

insert into public.build_solution_profiles(
 scenario_key,solution_type_id,problem_type_id,source_layer,substrate,interior_exterior,customer_title_el,technical_summary,customer_explanation_el,short_explanation_el,
 typical_causes,visual_symptoms,diagnostic_questions,required_prechecks,suitable_solution_types,unsuitable_solution_types,surface_preparation,repair_sequence,
 primer_role,basecoat_role,topcoat_role,required_system_layers,optional_system_layers,drying_dependencies,substrate_moisture_considerations,
 temperature_considerations,humidity_considerations,weather_considerations,uv_considerations,rain_considerations,condensation_considerations,
 ventilation_requirements,compatibility_principles,common_failure_modes,common_user_mistakes,warning_signs,inspection_after_application,
 maintenance_guidance,ppe_general,tool_categories_required,protection_materials_required,evidence_status,review_status,published,reviewed_at
)
select 'paint_interior_new_gypsum_board',p.solution_type_id,pt.id,'GENERAL_GUIDANCE','gypsum_board','interior',
'Βαφή νέας γυψοσανίδας',
'Gypsum board is a distinct substrate from mineral plaster. Joint/fastener finishing must be complete before decoration, and the prepared board is primed to equalise absorption before finish coating. Exact primer, coat count, film build, drying/recoat conditions and compatibility are controlled by the selected coating manufacturer.',
'Η γυψοσανίδα δεν αντιμετωπίζεται σαν νέος σοβάς. Πρώτα ολοκληρώνονται σωστά οι αρμοί και τα στοκαρίσματα, αφαιρείται η σκόνη και εφαρμόζεται κατάλληλο αστάρι γυψοσανίδας. Οι ακριβείς στρώσεις και οι χρόνοι θα προκύψουν από το επιλεγμένο προϊόν.',
'Ολοκλήρωση αρμών → καθαρισμός → κατάλληλο αστάρι → τελική βαφή με τις οδηγίες του προϊόντος.',
'["νέα εγκατάσταση γυψοσανίδας","νέοι αρμοί και στοκαρίσματα"]'::jsonb,
'["διαφορετική υφή/απορροφητικότητα σε αρμούς","σκόνη από τρίψιμο","ορατές κεφαλές ή ατέλειες φινιρίσματος"]'::jsonb,
'["Είναι γυψοσανίδα και όχι σοβάς;","Έχει ολοκληρωθεί το απαιτούμενο επίπεδο φινιρίσματος;","Είναι στεγνή και καθαρή;","Υπάρχει βρεγμένη, μαλακή ή διογκωμένη πλάκα;"]'::jsonb,
'["substrate confirmed as gypsum board","joint and fastener finishing complete","surface dry and dust-free","no active moisture damage"]'::jsonb,
'["compatible drywall primer","manufacturer-approved interior finish coating"]'::jsonb,
'["using mineral-plaster workflow without substrate confirmation","painting over unfinished joints","painting over moisture-damaged board"]'::jsonb,
'["complete appropriate finish level","lightly finish/sand where specified","remove dust and contamination"]'::jsonb,
'["diagnose substrate and moisture","complete joint finish","clean","prime prepared gypsum board","finish-coat per manufacturer","inspect"]'::jsonb,
'["Equalise absorption between face paper, joint compound and skimmed areas; exact primer product/application is manufacturer-controlled."]'::jsonb,
'[]'::jsonb,
'["Decorative finish; exact number of coats and film build are manufacturer-controlled."]'::jsonb,
'["completed gypsum-board finish","compatible drywall primer","manufacturer-defined finish coat"]'::jsonb,
'["additional skim/Level 5 treatment only when specified by project finish/lighting requirements"]'::jsonb,
'["Joint compounds and preparation must be dry/set before decoration; coating dry/recoat intervals come from manufacturer instructions."]'::jsonb,
'["Do not decorate actively wet or moisture-damaged board; resolve source first."]'::jsonb,
p.temperature_considerations,p.humidity_considerations,p.weather_considerations,p.uv_considerations,p.rain_considerations,
'["If dampness/condensation is present, diagnose that moisture condition before decorative coating."]'::jsonb,
'["Provide adequate air circulation while respecting selected product limits."]'::jsonb,
'["Primer and finish must be documented for gypsum board and compatible with each other; manufacturer documentation controls product-specific compatibility."]'::jsonb,
'["joint flashing/telegraphing","uneven sheen or absorption","finish defects caused by dust/incomplete preparation"]'::jsonb,
'["skipping primer","painting before joint finish is complete/dry","leaving sanding dust","assuming plaster instructions apply"]'::jsonb,
'["soft/swollen/wet board","persistent water staining or active dampness","movement or damage beyond cosmetic finishing"]'::jsonb,
'["inspect after drying under representative lighting for uniformity, flashing and joint telegraphing"]'::jsonb,
'["control moisture sources; future touch-up/recoat should preserve substrate integrity and follow selected coating instructions"]'::jsonb,
p.ppe_general,'["sanding_abrasive","dust_removal","roller_or_brush","tray_or_grid","stirring_tool"]'::jsonb,
'["masking","floor_and_fixture_protection"]'::jsonb,'verified','approved',true,now()
from public.build_solution_profiles p cross join public.build_problem_types pt
where p.scenario_key='paint_interior_new_plaster' and pt.problem_key='new_gypsum_board'
on conflict (scenario_key) do nothing;

insert into public.build_solution_rules
(scenario_id,rule_key,source_layer,rule_category,technical_rule,customer_explanation_el,short_explanation_el,evidence_strength,applicability,context_dependent)
select p.id,v.rule_key,'GENERAL_GUIDANCE',v.cat,v.tech,v.el,v.short,v.strength,v.app::jsonb,v.ctx
from public.build_solution_profiles p join (values
('finish_complete','preparation','Joint treatment and the specified gypsum-board finish must be completed before painting.','Πριν από τη βαφή πρέπει να έχουν ολοκληρωθεί οι αρμοί και το φινίρισμα της γυψοσανίδας.','Ολοκλήρωσε πρώτα το φινίρισμα.','strong_consensus','{"substrate":"gypsum_board"}',false),
('prime_prepared_board','primer','Prepared gypsum board should receive a suitable drywall primer before finish decoration to reduce absorption differences between board face and joint compound.','Η προετοιμασμένη γυψοσανίδα χρειάζεται κατάλληλο αστάρι πριν από το τελικό χρώμα.','Αστάρι γυψοσανίδας πριν από τη βαφή.','strong_consensus','{"substrate":"gypsum_board"}',false),
('manufacturer_controls_finish','compatibility','Finish coat count, film build, drying/recoat conditions and product compatibility must follow the selected coating manufacturer.','Οι στρώσεις, οι χρόνοι και η συμβατότητα έρχονται από το επιλεγμένο προϊόν, όχι από γενική υπόθεση.','Οι ακριβείς οδηγίες είναι του κατασκευαστή.','strong_consensus','{"substrate":"gypsum_board"}',false)
) v(rule_key,cat,tech,el,short,strength,app,ctx) on true
where p.scenario_key='paint_interior_new_gypsum_board'
on conflict (scenario_id,rule_key) do nothing;

insert into public.build_diagnostic_rules
(scenario_id,diagnostic_key,source_layer,question_el,observable_indicators,condition_expression,possible_interpretations,uncertainty_flag,outcome,evidence_strength)
select p.id,v.k,'GENERAL_GUIDANCE',v.q,v.ind::jsonb,'{}'::jsonb,v.interp::jsonb,true,v.outcome::jsonb,'strong_consensus'
from public.build_solution_profiles p join (values
('confirm_substrate','Η νέα επιφάνεια είναι γυψοσανίδα ή σοβάς/τσιμεντοκονία;','["paper-faced board","joint compound bands"]','["gypsum_board","mineral_plaster_or_other"]','{"if_not_gypsum_board":"route_to_correct_substrate"}'),
('check_moisture_damage','Υπάρχουν μαλακά, διογκωμένα, λεκιασμένα ή υγρά σημεία;','["soft_or_swollen_board","water_stain","active_dampness"]','["sound_new_board","possible_water_damage"]','{"if_possible_water_damage":true,"next_action":"stop_and_assess_moisture_source"}')
) v(k,q,ind,interp,outcome) on true
where p.scenario_key='paint_interior_new_gypsum_board'
on conflict (scenario_id,diagnostic_key) do nothing;

insert into public.build_solution_steps
(scenario_id,source_layer,step_number,step_type,required,conditional_expression,prerequisite_step_numbers,next_allowed_step_numbers,technical_rule,customer_explanation_el,evidence_strength)
select p.id,'GENERAL_GUIDANCE',v.n,v.typ,true,'{}'::jsonb,
case when v.n=1 then '{}'::int[] else array[v.n-1] end,
case when v.n=6 then '{}'::int[] else array[v.n+1] end,
v.tech,v.el,v.strength
from public.build_solution_profiles p join (values
(1,'diagnose','Confirm gypsum-board substrate and check for moisture damage.','Επιβεβαίωσε ότι είναι γυψοσανίδα και ότι δεν υπάρχει ζημιά από υγρασία.','strong_consensus'),
(2,'prepare','Complete the required joint/fastener finish before decoration.','Ολοκλήρωσε αρμούς, βίδες και το απαιτούμενο φινίρισμα.','strong_consensus'),
(3,'clean','Remove sanding dust and contaminants.','Αφαίρεσε τη σκόνη και τους ρύπους.','common_professional_practice'),
(4,'prime','Apply a compatible drywall primer; exact product/application follows manufacturer instructions.','Εφάρμοσε κατάλληλο αστάρι γυψοσανίδας σύμφωνα με το επιλεγμένο προϊόν.','strong_consensus'),
(5,'finish','Apply finish coating only according to the selected manufacturer system.','Εφάρμοσε το τελικό χρώμα με τις επίσημες οδηγίες του προϊόντος.','strong_consensus'),
(6,'inspect','Inspect the dried finish for uniformity, flashing and visible joint telegraphing.','Μετά το στέγνωμα έλεγξε ομοιομορφία και αν «γράφουν» οι αρμοί.','common_professional_practice')
) v(n,typ,tech,el,strength) on true
where p.scenario_key='paint_interior_new_gypsum_board'
on conflict (scenario_id,step_number) do nothing;

insert into public.build_stop_conditions
(scenario_id,stop_key,source_layer,severity,condition_expression,reason_el,next_action_el,professional_assessment_required,evidence_basis)
select p.id,'gypsum_board_active_moisture_damage','KONTA_MOU_RULE','BLOCK','{"active_moisture_or_board_damage":true}'::jsonb,
'Μην προχωρήσεις σε διακοσμητική βαφή αν η γυψοσανίδα είναι ενεργά υγρή, διογκωμένη ή έχει σημαντική ζημιά από νερό.',
'Εντόπισε και αποκατάστησε την πηγή υγρασίας και αξιολόγησε την κατάσταση της πλάκας πριν από τη βαφή.',
true,'KONTA MOU safety workflow supported by Gypsum Association substrate-preparation guidance.'
from public.build_solution_profiles p where p.scenario_key='paint_interior_new_gypsum_board'
on conflict (scenario_id,stop_key) do nothing;

insert into public.build_failure_modes
(scenario_id,source_layer,failure_key,title_el,possible_causes,preventive_actions,observable_symptoms,severity,corrective_action_category,evidence_strength)
select p.id,'GENERAL_GUIDANCE','joint_flashing','Ανομοιομορφία / «γράψιμο» αρμών',
'["differential absorption","incomplete joint preparation","primer omitted or unsuitable"]'::jsonb,
'["complete required finish level","remove dust","use compatible drywall primer"]'::jsonb,
'["bands or sheen differences at joints/fasteners after drying"]'::jsonb,
'medium','surface_preparation_and_recoat','strong_consensus'
from public.build_solution_profiles p where p.scenario_key='paint_interior_new_gypsum_board'
on conflict (scenario_id,failure_key) do nothing;

insert into public.build_tool_requirements
(scenario_id,source_layer,tool_category,requirement_level,reason_el,condition_expression)
select p.id,'GENERAL_GUIDANCE',v.k,v.l,v.r,'{}'::jsonb
from public.build_solution_profiles p join (values
('sanding_abrasive','conditional','Για λείανση τελειωμένων αρμών όπου απαιτείται.'),
('dust_removal','required','Για απομάκρυνση σκόνης πριν από το αστάρι.'),
('roller_or_brush','required','Για εφαρμογή σύμφωνα με το επιλεγμένο TDS.'),
('floor_and_fixture_protection','required','Για προστασία γειτονικών επιφανειών.')
) v(k,l,r) on true
where p.scenario_key='paint_interior_new_gypsum_board'
on conflict (scenario_id,tool_category) do nothing;

insert into public.build_project_kit_requirements
(scenario_id,source_layer,requirement_type,requirement_level,reason_el,quantity_basis,compatibility_constraints,customer_can_replace,condition_expression)
select p.id,'GENERAL_GUIDANCE',v.k,v.l,v.r,v.q,v.c::jsonb,v.rep,'{}'::jsonb
from public.build_solution_profiles p join (values
('primer','required','Εξισορροπεί την απορροφητικότητα της προετοιμασμένης γυψοσανίδας.','Manufacturer-declared coverage/consumption only','{"must_be_documented_for":"prepared gypsum board"}',true),
('main_coating','required','Παρέχει το τελικό διακοσμητικό φινίρισμα.','Manufacturer-declared coverage, coat count and package sizes only','{"must_follow_selected_manufacturer_system":true}',true),
('surface_protection','required','Προστατεύει δάπεδα και γειτονικές επιφάνειες.','Project geometry / protected area','{}',true),
('ppe','required','PPE για σκόνη/εργασία και χημικό PPE σύμφωνα με το SDS του επιλεγμένου προϊόντος.','Task and SDS dependent','{"follow_product_sds":true}',true)
) v(k,l,r,q,c,rep) on true
where p.scenario_key='paint_interior_new_gypsum_board'
on conflict (scenario_id,requirement_type) do nothing;

with src as (
 select id,'Gypsum Association guidance requires completed gypsum-board finishing before decoration, priming of prepared board to equalise absorption, and defers finish-coat build/application details to the coating manufacturer.'::text passage
 from public.general_build_sources where source_key='gypsum_association_new_board_painting'
), entities as (
 select 'profile'::text et,p.id eid from public.build_solution_profiles p where p.scenario_key='paint_interior_new_gypsum_board'
 union all select 'solution_rule',x.id from public.build_solution_rules x join public.build_solution_profiles p on p.id=x.scenario_id where p.scenario_key='paint_interior_new_gypsum_board'
 union all select 'diagnostic_rule',x.id from public.build_diagnostic_rules x join public.build_solution_profiles p on p.id=x.scenario_id where p.scenario_key='paint_interior_new_gypsum_board'
 union all select 'solution_step',x.id from public.build_solution_steps x join public.build_solution_profiles p on p.id=x.scenario_id where p.scenario_key='paint_interior_new_gypsum_board'
 union all select 'failure_mode',x.id from public.build_failure_modes x join public.build_solution_profiles p on p.id=x.scenario_id where p.scenario_key='paint_interior_new_gypsum_board'
 union all select 'tool_requirement',x.id from public.build_tool_requirements x join public.build_solution_profiles p on p.id=x.scenario_id where p.scenario_key='paint_interior_new_gypsum_board'
 union all select 'project_kit_requirement',x.id from public.build_project_kit_requirements x join public.build_solution_profiles p on p.id=x.scenario_id where p.scenario_key='paint_interior_new_gypsum_board'
)
insert into public.general_build_rule_evidence(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
select e.et,e.eid,s.id,s.passage,'GA-232-04 Surface Preparation / General Recommendations; current GA finishing FAQ',
'strong_consensus','New interior gypsum board; general preparation/priming only. Product-specific application remains manufacturer-controlled.'
from entities e cross join src s
on conflict do nothing;

insert into public.general_build_rule_evidence(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
select 'stop_condition',sc.id,gov.id,
'KONTA MOU blocks decorative coating when active moisture or significant substrate damage is unresolved; this is an internal safety/workflow rule, not a manufacturer instruction.',
'KONTA MOU Build Studio governance','strong_consensus','Customer-facing decision safety for new gypsum-board painting.'
from public.build_stop_conditions sc
join public.build_solution_profiles p on p.id=sc.scenario_id
join public.general_build_sources gov on gov.source_key='konta_mou_build_studio_governance_v1'
where p.scenario_key='paint_interior_new_gypsum_board' and sc.stop_key='gypsum_board_active_moisture_damage'
on conflict do nothing;
COMMIT;
