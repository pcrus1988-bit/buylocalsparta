-- Layer A: brand-independent guidance for new exterior cement plaster/stucco before painting.
-- Numeric cure periods and product-specific primer/coating instructions deliberately remain Layer B.
BEGIN;

insert into public.general_build_sources
(source_key,organization,source_type,title,url,jurisdiction,standard_identifier,publication_date,revision,retrieved_at,relevant_section_page,source_status,notes,active)
values
('wbdg_ufgs_099000_paints_coatings_2026','U.S. Department of Defense / WBDG','government_guidance','UFGS 09 90 00 Paints and Coatings','https://www.wbdg.org/FFC/DOD/UFGS/UFGS%2009%2090%2000.pdf','General technical guidance (US; not Greek law)','UFGS 09 90 00',null,'2026-05',now(),'Surface preparation and exterior cementitious/stucco coating sections','current','Used only for general substrate preparation/curing principles. Specification-specific numeric limits and MPI product selections are not transferred into KONTA MOY general guidance.',true),
('va_099100_painting_2021','U.S. Department of Veterans Affairs / WBDG','government_guidance','VA 09 91 00 Painting','https://www.wbdg.org/FFC/VA/VAASC/VA%2009%2091%2000.pdf','General technical guidance (US; not Greek law)','VA 09 91 00','2021-01-01','01-01-21',now(),'3.4 Surface Preparation; masonry, concrete, cement plaster and stucco','current','Used for general cleanliness/defect-repair principles only. Product-specific coating systems remain Layer B.',true)
on conflict (source_key) do update set retrieved_at=excluded.retrieved_at,revision=excluded.revision,notes=excluded.notes,active=true,updated_at=now();

insert into public.build_problem_types(problem_key,title_el,title_en,description_el)
values ('new_exterior_plaster','Νέος εξωτερικός σοβάς','New exterior plaster','Νέα εξωτερική τσιμεντοειδής επιφάνεια/σοβάς που πρόκειται να βαφεί.')
on conflict (problem_key) do update set title_el=excluded.title_el,title_en=excluded.title_en,description_el=excluded.description_el,active=true,updated_at=now();

insert into public.build_solution_profiles(
 scenario_key,solution_type_id,problem_type_id,source_layer,substrate,interior_exterior,customer_title_el,technical_summary,customer_explanation_el,short_explanation_el,
 typical_causes,visual_symptoms,diagnostic_questions,required_prechecks,suitable_solution_types,unsuitable_solution_types,surface_preparation,repair_sequence,
 primer_role,basecoat_role,topcoat_role,required_system_layers,optional_system_layers,drying_dependencies,substrate_moisture_considerations,
 temperature_considerations,humidity_considerations,weather_considerations,uv_considerations,rain_considerations,condensation_considerations,
 ventilation_requirements,compatibility_principles,common_failure_modes,common_user_mistakes,warning_signs,inspection_after_application,
 maintenance_guidance,ppe_general,tool_categories_required,protection_materials_required,evidence_status,review_status,published,reviewed_at)
select 'paint_exterior_new_plaster',p.solution_type_id,pt.id,'GENERAL_GUIDANCE','cement_plaster_stucco','exterior',
'Βαφή νέου εξωτερικού σοβά',
'New exterior cement plaster/stucco must be adequately cured, sound and free of contaminants or loose material before coating. Defects that affect coating performance are repaired before coating. Exact cure acceptance, primer, coating system, dilution, coverage, coat count and weather limits are controlled by the selected manufacturer documentation.',
'Πριν βαφτεί νέος εξωτερικός σοβάς, επιβεβαίωσε ότι έχει ωριμάσει επαρκώς, είναι σταθερός και καθαρός και ότι δεν υπάρχουν ατέλειες ή ενεργή υγρασία που πρέπει πρώτα να αντιμετωπιστούν. Οι ακριβείς χρόνοι, το αστάρι και οι στρώσεις προκύπτουν από το επιλεγμένο προϊόν.',
'Έλεγχος ωρίμανσης/υγρασίας → καθαρισμός και επισκευές → συμβατό σύστημα προϊόντων → εφαρμογή μόνο στις επιτρεπτές συνθήκες.',
'["νέα εξωτερική τσιμεντοειδής επιφάνεια","νέος σοβάς ή stucco"]'::jsonb,
'["σκόνη ή χαλαρά σωματίδια","ατέλειες ή ρωγμές","πιθανή επιφανειακή υγρασία"]'::jsonb,
'["Είναι πράγματι νέος τσιμεντοειδής σοβάς;","Έχει ολοκληρωθεί η απαιτούμενη ωρίμανση;","Είναι σταθερός, καθαρός και χωρίς ενεργή υγρασία;","Υπάρχουν ρωγμές, σαθρά σημεία ή άλλες ατέλειες;"]'::jsonb,
'["confirm substrate","confirm adequate cure using applicable system requirements","surface sound and clean","no unresolved active moisture","repair coating-relevant defects before coating"]'::jsonb,
'["manufacturer-approved exterior coating system for the confirmed substrate"]'::jsonb,
'["painting uncured or unsound plaster","generic primer substitution without compatibility evidence"]'::jsonb,
'["remove dust, dirt, loose matter and adhesion-deterring contaminants","repair coating-relevant defects before coating"]'::jsonb,
'["confirm substrate and condition","resolve moisture/defects","prepare and clean","apply manufacturer-approved system","inspect after cure"]'::jsonb,
'["Primer role and exact primer selection are product/system-specific and therefore Layer B."]'::jsonb,'[]'::jsonb,
'["Exterior finish coat protects/decorates the prepared substrate; exact product and film build remain Layer B."]'::jsonb,
'["sound adequately cured substrate","manufacturer-documented compatible coating system"]'::jsonb,'[]'::jsonb,
'["Do not infer a universal cure duration; use the applicable substrate/system and selected manufacturer requirements."]'::jsonb,
'["Active moisture or unresolved water ingress must be diagnosed before decorative coating."]'::jsonb,
p.temperature_considerations,p.humidity_considerations,p.weather_considerations,p.uv_considerations,p.rain_considerations,p.condensation_considerations,
p.ventilation_requirements,
'["Primer/topcoat compatibility and substrate suitability must be documented by the selected coating system; product-specific compatibility is Layer B."]'::jsonb,
'["poor adhesion from contamination or unsound substrate","premature failure where moisture/defects were not resolved","failure from application outside product weather limits"]'::jsonb,
'["painting before cure/condition is verified","coating over loose material or defects","guessing primer or weather limits"]'::jsonb,
'["active dampness or water ingress","widespread cracking or movement","soft/friable/detached plaster","unknown substrate or incompatible existing treatment"]'::jsonb,
'["after drying/curing inspect adhesion, uniformity and signs of blistering, cracking or moisture-related distress"]'::jsonb,
'["investigate recurring moisture or cracking rather than repeatedly overcoating symptoms"]'::jsonb,
p.ppe_general,p.tool_categories_required,p.protection_materials_required,'verified','approved',true,now()
from public.build_solution_profiles p cross join public.build_problem_types pt
where p.scenario_key='paint_interior_new_plaster' and pt.problem_key='new_exterior_plaster'
on conflict (scenario_key) do nothing;

insert into public.build_solution_rules
(scenario_id,rule_key,source_layer,rule_category,technical_rule,customer_explanation_el,short_explanation_el,evidence_strength,applicability,context_dependent)
select p.id,v.k,'GENERAL_GUIDANCE',v.cat,v.tech,v.el,v.short,v.strength,v.app::jsonb,v.ctx
from public.build_solution_profiles p join (values
('cure_before_coating','sequence','New cement plaster/stucco must be adequately cured before painting; no universal cure duration is asserted because acceptance depends on the substrate/system and selected coating requirements.','Ο νέος εξωτερικός σοβάς πρέπει να έχει ωριμάσει επαρκώς πριν βαφτεί. Δεν χρησιμοποιούμε έναν αυθαίρετο ίδιο χρόνο για όλα τα συστήματα.','Επιβεβαίωσε την ωρίμανση πριν τη βαφή.','strong_consensus','{"substrate":"cement_plaster_stucco"}',true),
('clean_sound_surface','preparation','Before coating, cement plaster/stucco must be clean and free of loose matter and adhesion-deterring contamination.','Πριν τη βαφή, η επιφάνεια πρέπει να είναι καθαρή, σταθερή και χωρίς σαθρά υλικά ή ρύπους που εμποδίζουν την πρόσφυση.','Καθαρή και σταθερή επιφάνεια.','strong_consensus','{"substrate":"cement_plaster_stucco"}',false),
('repair_before_coating','sequence','Coating-relevant cracks, holes, depressions, loose material or other defects are repaired or otherwise resolved before coating application.','Ρωγμές, οπές, σαθρά σημεία και ατέλειες που επηρεάζουν τη βαφή αντιμετωπίζονται πριν από το χρώμα.','Πρώτα επισκευή, μετά βαφή.','strong_consensus','{"substrate":"cement_plaster_stucco"}',false),
('manufacturer_controls_system','compatibility','Exact primer, finish coating, dilution, coverage, coat count, drying/recoat intervals and application limits must come from the selected manufacturer system, not from Layer A.','Το ακριβές αστάρι, οι στρώσεις, οι αραιώσεις, οι χρόνοι και τα όρια εφαρμογής έρχονται από τις επίσημες οδηγίες του επιλεγμένου προϊόντος.','Οι ακριβείς οδηγίες είναι Layer B.','strong_consensus','{"substrate":"cement_plaster_stucco"}',true)
) v(k,cat,tech,el,short,strength,app,ctx) on true where p.scenario_key='paint_exterior_new_plaster'
on conflict (scenario_id,rule_key) do nothing;

insert into public.build_solution_steps
(scenario_id,source_layer,step_number,step_type,required,conditional_expression,prerequisite_step_numbers,next_allowed_step_numbers,technical_rule,customer_explanation_el,evidence_strength)
select p.id,'GENERAL_GUIDANCE',v.n,v.typ,true,'{}'::jsonb,case when v.n=1 then '{}'::int[] else array[v.n-1] end,case when v.n=6 then '{}'::int[] else array[v.n+1] end,v.tech,v.el,v.strength
from public.build_solution_profiles p join (values
(1,'diagnose','Confirm the substrate is new cement plaster/stucco and assess cure, soundness, defects and moisture.','Επιβεβαίωσε τον τύπο του σοβά και έλεγξε ωρίμανση, σταθερότητα, ατέλειες και υγρασία.','strong_consensus'),
(2,'repair','Resolve coating-relevant defects and unresolved moisture causes before decorative coating.','Αντιμετώπισε ατέλειες και αιτίες υγρασίας πριν από τη διακοσμητική βαφή.','strong_consensus'),
(3,'prepare','Remove dust, dirt, loose matter and adhesion-deterring contamination.','Αφαίρεσε σκόνη, ρύπους και σαθρά υλικά.','strong_consensus'),
(4,'verify','Verify that cure/condition and forecast meet the selected coating manufacturer requirements.','Έλεγξε ότι η επιφάνεια και ο καιρός πληρούν τις επίσημες απαιτήσεις του επιλεγμένου προϊόντος.','strong_consensus'),
(5,'coat','Apply only the documented compatible manufacturer coating system.','Εφάρμοσε μόνο το τεκμηριωμένα συμβατό σύστημα προϊόντων.','strong_consensus'),
(6,'inspect','Inspect the cured finish for adhesion, uniformity and signs of moisture- or defect-related distress.','Μετά την ωρίμανση έλεγξε πρόσφυση, ομοιομορφία και τυχόν ενδείξεις αστοχίας.','common_professional_practice')
) v(n,typ,tech,el,strength) on true where p.scenario_key='paint_exterior_new_plaster'
on conflict (scenario_id,step_number) do nothing;

insert into public.general_build_rule_evidence(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
select 'solution_rule',r.id,s.id,
case r.rule_key
 when 'cure_before_coating' then 'UFGS requires concrete, stucco and masonry surfaces to cure before painting; KONTA MOY deliberately does not transfer the specification numeric duration as a universal rule.'
 when 'clean_sound_surface' then 'UFGS and VA require plaster/stucco/cementitious surfaces to be clean and free of loose matter, dirt and other deterrents to paint adhesion.'
 when 'repair_before_coating' then 'UFGS requires cosmetic repair of minor defects before coating; VA requires repair/filling of joints, holes, cracks, depressions and spalled areas before painting.'
 else 'UFGS coating tables and preparation clauses are system-specific; KONTA MOY therefore reserves exact product selection/application parameters for manufacturer instructions.' end,
case when s.source_key='va_099100_painting_2021' then '3.4 Surface Preparation' else 'UFGS 09 90 00, surface preparation / cementitious and stucco sections' end,
r.evidence_strength,'Applies to new exterior cement plaster/stucco; numeric/project-specific specification values are excluded.'
from public.build_solution_rules r join public.build_solution_profiles p on p.id=r.scenario_id
join public.general_build_sources s on s.source_key in ('wbdg_ufgs_099000_paints_coatings_2026','va_099100_painting_2021')
where p.scenario_key='paint_exterior_new_plaster'
on conflict (entity_type,entity_id,source_id) do nothing;

COMMIT;
