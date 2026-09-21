-- KONTA MOY — General Paint & Build guidance second research batch.
-- Extends source-backed Layer A guidance and Layer C stop rules without
-- introducing manufacturer-specific application values.
BEGIN;

INSERT INTO public.general_build_sources
(source_key, organization, source_type, title, url, jurisdiction, standard_identifier,
 publication_date, revision, retrieved_at, relevant_section_page, source_status, notes, active)
VALUES
('bsi_bs_8102_2022','British Standards Institution','standard',
 'BS 8102:2022 — Protection of below ground structures against water ingress — Code of practice',
 'https://knowledge.bsigroup.com/products/protection-of-below-ground-structures-against-water-ingress-code-of-practice',
 'United Kingdom / general below-ground waterproofing reference; not Greek law','BS 8102:2022',
 DATE '2022-03-31','2022',now(),
 'Public summary: site evaluation, groundwater conditions, risk assessment, drainage and Types A/B/C protection',
 'current',
 'Used for general below-ground water-ingress diagnosis and design-risk principles only. Exact construction design and product selection require project-specific evidence.',
 true),
('sherwin_peeling_general','Sherwin-Williams','manufacturer_general_practice',
 'Peeling — coating problem solver',
 'https://www.sherwin-williams.com/homeowners/how-to/problem-solver/peeling',
 'General professional practice',NULL,NULL,'current web guidance',now(),
 'Description, possible moisture/adhesion causes and corrective preparation',
 'reference_only',
 'Used only for general coating-failure principles: peeling is loss of adhesion, moisture can be a cause, and unstable paint must not simply be overcoated. Product suggestions on the page are not imported.',
 true),
('lrwa_warm_roof_systems','Liquid Roofing and Waterproofing Association (LRWA)','professional_guidance',
 'Warm Roof Systems',
 'https://www.lrwa.org.uk/technical/liquid-roofing/warm-roof-systems/',
 'United Kingdom / general roof-system reference; not Greek law',NULL,NULL,'current web guidance',now(),
 'General warm-roof build-up concept and relationship of insulation, deck, vapour-control layer and weatherproof covering',
 'current',
 'Used only to distinguish generic warm-roof arrangement from other roof constructions. Exact layers and materials remain system/design-specific.',
 true),
('lrwa_inverted_roof_systems','Liquid Roofing and Waterproofing Association (LRWA)','professional_guidance',
 'Inverted Roof Systems',
 'https://www.lrwa.org.uk/technical/liquid-roofing/inverted-roof-systems/',
 'United Kingdom / general roof-system reference; not Greek law',NULL,NULL,'current web guidance',now(),
 'General inverted-roof concept: insulation above the waterproof covering',
 'current',
 'Used only to show that roof insulation layer order is not universal. Exact layers and materials remain system/design-specific.',
 true)
ON CONFLICT (source_key) DO UPDATE SET
 organization=EXCLUDED.organization, source_type=EXCLUDED.source_type, title=EXCLUDED.title,
 url=EXCLUDED.url, jurisdiction=EXCLUDED.jurisdiction, standard_identifier=EXCLUDED.standard_identifier,
 publication_date=EXCLUDED.publication_date, revision=EXCLUDED.revision, retrieved_at=EXCLUDED.retrieved_at,
 relevant_section_page=EXCLUDED.relevant_section_page, source_status=EXCLUDED.source_status,
 notes=EXCLUDED.notes, active=true, updated_at=now();

INSERT INTO public.build_solution_types
(solution_key,module,title_el,title_en,description_el,active)
VALUES
('repainting_existing_coatings','painting','Επαναβαφή υπάρχουσας επίστρωσης','Repainting existing coatings','Έλεγχος, προετοιμασία και επαναβαφή υπάρχουσας επίστρωσης χωρίς υπόθεση συμβατότητας.',true),
('waterproofing_maintenance','waterproofing','Συντήρηση υπάρχουσας στεγάνωσης','Existing waterproofing maintenance','Έλεγχος και συντήρηση υπάρχοντος συστήματος στεγάνωσης με επιβεβαίωση κατάστασης και συμβατότητας.',true),
('waterproofing_details','waterproofing','Στεγάνωση κρίσιμων λεπτομερειών','Waterproofing details','Αρμοί, στηθαία, διελεύσεις, υδρορροές και λοιπές κρίσιμες λεπτομέρειες.',true),
('below_grade_waterproofing','waterproofing','Υγρασία και στεγάνωση κάτω από το έδαφος','Below-grade waterproofing','Διερεύνηση και γενική καθοδήγηση για υγρασία ή εισροή νερού σε χώρους κάτω από τη στάθμη εδάφους.',true),
('thermal_bridge_mitigation','thermal_insulation','Αντιμετώπιση θερμογέφυρας','Thermal bridge mitigation','Διερεύνηση ψυχρών επιφανειών και θερμογεφυρών με έλεγχο κινδύνου συμπύκνωσης.',true),
('roof_insulation','thermal_insulation','Θερμομόνωση δώματος / στέγης','Roof insulation','Γενική καθοδήγηση για θερμική αναβάθμιση δώματος χωρίς αυθαίρετη επιλογή διάταξης στρώσεων.',true)
ON CONFLICT (solution_key) DO UPDATE SET
 module=EXCLUDED.module,title_el=EXCLUDED.title_el,title_en=EXCLUDED.title_en,
 description_el=EXCLUDED.description_el,active=true,updated_at=now();

INSERT INTO public.build_problem_types
(problem_key,title_el,title_en,description_el,active)
VALUES
('high_humidity','Υψηλή υγρασία','High humidity','Υψηλή εσωτερική υγρασία ή συχνή συμπύκνωση, συχνά σε λουτρά και άλλους υγρούς χώρους.',true),
('peeling_coating','Ξεφλούδισμα βαφής','Peeling coating','Απώλεια πρόσφυσης υπάρχουσας επίστρωσης.',true),
('waterproofing_maintenance','Συντήρηση υπάρχουσας στεγάνωσης','Existing waterproofing maintenance','Έλεγχος τοπικών βλαβών, λεπτομερειών και απορροών πριν από επισκευή ή ανανέωση.',true),
('waterproofing_detail','Αστοχία σε λεπτομέρεια στεγάνωσης','Waterproofing detail','Πιθανή αστοχία σε αρμό, στηθαίο, διέλευση, υδρορροή ή άλλη λεπτομέρεια.',true),
('below_grade_moisture','Υγρασία υπογείου / κάτω από το έδαφος','Below-grade moisture','Υγρασία ή νερό σε κατασκευή που βρίσκεται πλήρως ή μερικώς κάτω από το έδαφος.',true),
('thermal_bridge','Θερμογέφυρα / ψυχρή επιφάνεια','Thermal bridge / cold surface','Τοπικά αυξημένη θερμική ροή ή χαμηλή εσωτερική επιφανειακή θερμοκρασία με πιθανό κίνδυνο συμπύκνωσης.',true),
('roof_thermal_insulation','Θερμομόνωση δώματος / στέγης','Roof thermal insulation','Ανάγκη θερμικής αναβάθμισης οριζόντιου ή κεκλιμένου στοιχείου στέγασης.',true),
('recurrent_or_large_crack','Μεγάλη ή επαναλαμβανόμενη ρωγμή','Large or recurrent crack','Ρωγμή που είναι μεγάλη, επανέρχεται, μεγαλώνει ή συνοδεύεται από άλλες ενδείξεις κίνησης.',true)
ON CONFLICT (problem_key) DO UPDATE SET
 title_el=EXCLUDED.title_el,title_en=EXCLUDED.title_en,description_el=EXCLUDED.description_el,
 active=true,updated_at=now();

-- 1. Bathroom / high-humidity painting.
INSERT INTO public.build_solution_profiles
(scenario_key,solution_type_id,problem_type_id,source_layer,substrate,interior_exterior,
 customer_title_el,technical_summary,customer_explanation_el,short_explanation_el,
 typical_causes,visual_symptoms,diagnostic_questions,required_prechecks,
 suitable_solution_types,unsuitable_solution_types,surface_preparation,repair_sequence,
 primer_role,basecoat_role,topcoat_role,required_system_layers,optional_system_layers,
 drying_dependencies,substrate_moisture_considerations,temperature_considerations,
 humidity_considerations,weather_considerations,uv_considerations,rain_considerations,
 condensation_considerations,ventilation_requirements,compatibility_principles,
 common_failure_modes,common_user_mistakes,warning_signs,inspection_after_application,
 maintenance_guidance,ppe_general,tool_categories_required,protection_materials_required,
 evidence_status,review_status,published,reviewed_at)
SELECT
 'paint_bathroom_high_humidity',st.id,pt.id,'GENERAL_GUIDANCE','painted/plastered interior wall','interior',
 'Βαφή μπάνιου ή χώρου με υψηλή υγρασία',
 'High humidity, condensation, plumbing leakage and other moisture mechanisms must be distinguished before repainting. A decorative or mould-resistant finish does not remove an unresolved moisture source.',
 'Πριν βαφτεί ένα μπάνιο, χρειάζεται να ξεκαθαριστεί αν η υγρασία προέρχεται κυρίως από υδρατμούς και ανεπαρκή αερισμό ή από διαρροή/εισροή νερού. Η βαφή γίνεται αφού αντιμετωπιστεί η αιτία, καθαριστεί η επιφάνεια και στεγνώσει.',
 'Πρώτα βρίσκουμε την πηγή της υγρασίας· μετά καθαρίζουμε, στεγνώνουμε και βάφουμε.',
 jsonb_build_array('υψηλή παραγωγή υδρατμών από ντους/μπάνιο','ανεπαρκής εξαερισμός','ψυχρές επιφάνειες και συμπύκνωση','πιθανή υδραυλική ή άλλη διαρροή'),
 jsonb_build_array('σταγονίδια ή συμπύκνωση','μούχλα σε γωνίες ή οροφή','ξεφλούδισμα ή φούσκωμα βαφής','επίμονη υγρασία'),
 jsonb_build_array('Η υγρασία εμφανίζεται κυρίως μετά από μπάνιο;','Υπάρχει λειτουργικός εξαερισμός ή απορροφητήρας;','Υπάρχουν ενδείξεις ενεργής διαρροής;','Η μούχλα επανέρχεται μετά τον καθαρισμό;'),
 jsonb_build_array('έλεγχος ενεργής διαρροής','εκτίμηση αν το πρόβλημα είναι κυρίως συμπύκνωση','έλεγχος σταθερότητας υπάρχουσας βαφής','πλήρες στέγνωμα πριν από νέα επίστρωση'),
 jsonb_build_array('έλεγχος/βελτίωση αερισμού','καθαρισμός και αποκατάσταση προσβεβλημένης επιφάνειας','επαναβαφή με σύστημα κατάλληλο για τον χώρο σύμφωνα με τον κατασκευαστή'),
 jsonb_build_array('βαφή πάνω σε ενεργή διαρροή','κάλυψη ενεργής μούχλας χωρίς έλεγχο υγρασίας'),
 jsonb_build_array('αφαίρεση σαθρής βαφής','καθαρισμός ρύπων/μούχλας με κατάλληλη μέθοδο','επισκευή τοπικών βλαβών','στέγνωμα'),
 jsonb_build_array('διάγνωση πηγής υγρασίας','έλεγχος αερισμού','καθαρισμός/αποκατάσταση','στέγνωμα','αστάρι μόνο αν απαιτείται από βάση/σύστημα','τελική επίστρωση σύμφωνα με οδηγίες προϊόντος'),
 jsonb_build_array('Υπόστρωμα ή υπάρχουσα βαφή μπορεί να χρειάζεται αστάρι· το αν και ποιο καθορίζεται από τη βάση και το επιλεγμένο σύστημα.'),
 jsonb_build_array('Δεν απαιτείται γενικά ανεξάρτητη ενδιάμεση στρώση εκτός αν το επιλεγμένο σύστημα το ορίζει.'),
 jsonb_build_array('Η τελική επίστρωση πρέπει να είναι κατάλληλη για το συγκεκριμένο υπόστρωμα και περιβάλλον σύμφωνα με τεκμηριωμένες οδηγίες κατασκευαστή.'),
 jsonb_build_array('σταθερό και στεγνό υπόστρωμα','τυχόν επισκευή','προϊόν προετοιμασίας όπου τεκμηριώνεται','τελική επίστρωση'),
 jsonb_build_array('ειδική αντιμετώπιση λεκέδων ή τοπικής μούχλας όπου τεκμηριώνεται'),
 jsonb_build_array('κάθε επόμενο στάδιο αρχίζει αφού το προηγούμενο έχει στεγνώσει/ωριμάσει σύμφωνα με το αντίστοιχο υλικό'),
 jsonb_build_array('ενεργή ή σημαντική άγνωστη υγρασία μπλοκάρει τη διακοσμητική επαναβαφή'),
 jsonb_build_array('οι επιτρεπόμενες θερμοκρασίες εφαρμογής είναι προϊόν-ειδικές'),
 jsonb_build_array('υψηλή σχετική υγρασία μπορεί να επιβραδύνει το στέγνωμα και αυξάνει τον κίνδυνο συμπύκνωσης'),
 jsonb_build_array('δεν εφαρμόζεται εξωτερικός κανόνας καιρού σε εσωτερική εργασία, αλλά απαιτείται ελεγχόμενο περιβάλλον'),
 jsonb_build_array(),
 jsonb_build_array(),
 jsonb_build_array('η συμπύκνωση σε ψυχρή επιφάνεια μπορεί να συνδέεται με υψηλή υγρασία, ανεπαρκή αερισμό ή θερμική γέφυρα· δεν αποδεικνύεται μία αιτία μόνο από την εικόνα'),
 jsonb_build_array('εξασφάλιση επαρκούς αερισμού κατά τη χρήση του χώρου και μετά από παραγωγή υδρατμών','αερισμός κατά τις εργασίες σύμφωνα με SDS/οδηγίες προϊόντος'),
 jsonb_build_array('η συμβατότητα με την υπάρχουσα επίστρωση πρέπει να επιβεβαιώνεται όταν είναι άγνωστη','τα προϊόν-ειδικά αστάρια και χρόνοι προέρχονται μόνο από τον κατασκευαστή'),
 jsonb_build_array('επανεμφάνιση μούχλας','φούσκωμα/ξεφλούδισμα από επίμονη υγρασία','κακή πρόσφυση σε μη καθαρή ή ασταθή βάση'),
 jsonb_build_array('βαφή πριν λυθεί η υγρασία','βαφή πάνω σε μούχλα','ανεπαρκές στέγνωμα','παράλειψη αερισμού'),
 jsonb_build_array('ενεργό νερό','έντονη ή επίμονη μούχλα','εκτεταμένο φούσκωμα/αποκόλληση','άγνωστη σημαντική πηγή υγρασίας'),
 jsonb_build_array('έλεγχος για ομοιόμορφη πρόσφυση και επανεμφάνιση υγρασίας/μούχλας μετά την πλήρη ξήρανση'),
 jsonb_build_array('διατήρηση λειτουργικού αερισμού','έγκαιρος έλεγχος διαρροών','καθαρισμός συμπύκνωσης και παρακολούθηση υποτροπής'),
 jsonb_build_array('γάντια/προστασία ματιών και αναπνευστική προστασία όταν απαιτείται από τον κίνδυνο και το SDS'),
 jsonb_build_array('scraper','abrasive','cleaning_tools','roller_or_brush','mixing_tool'),
 jsonb_build_array('floor_protection','masking','ventilation_or_dust_control'),
 'verified','approved',true,now()
FROM public.build_solution_types st, public.build_problem_types pt
WHERE st.solution_key='interior_wall_painting' AND pt.problem_key='high_humidity'
ON CONFLICT (scenario_key) DO NOTHING;

-- 2. Peeling existing coatings.
INSERT INTO public.build_solution_profiles
(scenario_key,solution_type_id,problem_type_id,source_layer,substrate,interior_exterior,
 customer_title_el,technical_summary,customer_explanation_el,short_explanation_el,
 typical_causes,visual_symptoms,diagnostic_questions,required_prechecks,
 suitable_solution_types,unsuitable_solution_types,surface_preparation,repair_sequence,
 primer_role,basecoat_role,topcoat_role,required_system_layers,optional_system_layers,
 drying_dependencies,substrate_moisture_considerations,temperature_considerations,
 humidity_considerations,weather_considerations,uv_considerations,rain_considerations,
 condensation_considerations,ventilation_requirements,compatibility_principles,
 common_failure_modes,common_user_mistakes,warning_signs,inspection_after_application,
 maintenance_guidance,ppe_general,tool_categories_required,protection_materials_required,
 evidence_status,review_status,published,reviewed_at)
SELECT
 'paint_existing_peeling',st.id,pt.id,'GENERAL_GUIDANCE','previously coated wall or compatible building surface','both',
 'Ξεφλούδισμα υπάρχουσας βαφής',
 'Peeling is an adhesion failure symptom. Loose coating and contamination must be removed to a sound surface, while moisture and compatibility causes are checked before recoating.',
 'Το ξεφλούδισμα δείχνει ότι η υπάρχουσα βαφή δεν κρατά σωστά. Δεν αρκεί να καλυφθεί με νέο χρώμα: αφαιρούνται τα σαθρά σημεία και ελέγχονται υγρασία, καθαρότητα και συμβατότητα.',
 'Δεν βάφουμε πάνω σε βαφή που ξεφλουδίζει.',
 jsonb_build_array('υγρασία ή διαρροή','βαφή πάνω σε υγρή/βρώμικη/γυαλιστερή βάση','χαμηλή πρόσφυση παλιότερης στρώσης','ασυμβατότητα συστήματος'),
 jsonb_build_array('φλούδες','σηκωμένες άκρες','αποκόλληση έως την προηγούμενη στρώση ή το υπόστρωμα','τοπικό φούσκωμα'),
 jsonb_build_array('Υπάρχει υγρασία ή διαρροή πίσω από την περιοχή;','Είναι το ξεφλούδισμα τοπικό ή εκτεταμένο;','Η υπόλοιπη βαφή είναι σταθερά προσκολλημένη;','Γνωρίζουμε το είδος της υπάρχουσας επίστρωσης;'),
 jsonb_build_array('έλεγχος υγρασίας','έλεγχος πρόσφυσης/σταθερότητας της γύρω επίστρωσης','έλεγχος συμβατότητας όπου το παλιό σύστημα είναι άγνωστο'),
 jsonb_build_array('αφαίρεση ασταθούς επίστρωσης','καθαρισμός και εξομάλυνση','δοκιμή πρόσφυσης/συμβατότητας όπου χρειάζεται','επαναβαφή τεκμηριωμένου συστήματος'),
 jsonb_build_array('άμεση επαναβαφή πάνω σε αποκολλημένη επίστρωση','κάλυψη υγρασίας χωρίς αποκατάσταση αιτίας'),
 jsonb_build_array('ξύσιμο/αφαίρεση σαθρού υλικού','τρίψιμο/εξομάλυνση όπου είναι κατάλληλο','καθαρισμός','στέγνωμα'),
 jsonb_build_array('έλεγχος αιτίας','αφαίρεση ασταθούς βαφής','καθαρισμός/εξομάλυνση','επισκευή υποστρώματος','αστάρι όπου απαιτείται','τελική επίστρωση'),
 jsonb_build_array('αστάρι χρησιμοποιείται μόνο όταν απαιτείται από το υπόστρωμα ή το επιλεγμένο σύστημα, όχι ως γενική θεραπεία κάθε αποκόλλησης'),
 jsonb_build_array(),
 jsonb_build_array('η τελική επίστρωση εφαρμόζεται μόνο σε σταθερή, καθαρή, στεγνή και συμβατή βάση'),
 jsonb_build_array('σταθερό υπόστρωμα','προϊόν προετοιμασίας όπου τεκμηριώνεται','τελική επίστρωση'),
 jsonb_build_array('τοπικός στόκος/επισκευή','δοκιμαστικό πεδίο συμβατότητας'),
 jsonb_build_array('οι χρόνοι μεταξύ στρώσεων προέρχονται από τα επιλεγμένα υλικά'),
 jsonb_build_array('η πηγή υγρασίας πρέπει να αντιμετωπίζεται πριν την επαναβαφή'),
 jsonb_build_array('οι θερμοκρασιακοί περιορισμοί είναι προϊόν-ειδικοί'),
 jsonb_build_array('υψηλή υγρασία μπορεί να επηρεάσει στέγνωμα και πρόσφυση'),
 jsonb_build_array('σε εξωτερική χρήση αποφεύγονται συνθήκες που δεν επιτρέπονται από τον κατασκευαστή'),
 jsonb_build_array('εξωτερικές επιστρώσεις εκτίθενται σε UV· η αντοχή είναι προϊόν-ειδική'),
 jsonb_build_array('σε εξωτερική χρήση η επιφάνεια πρέπει να προστατεύεται από βροχή σύμφωνα με το σύστημα εφαρμογής'),
 jsonb_build_array('αν η αποκόλληση συνδέεται με συμπύκνωση, αντιμετωπίζεται η υγρασία πριν την επίστρωση'),
 jsonb_build_array('εξαερισμός κατά την εσωτερική εργασία και το στέγνωμα'),
 jsonb_build_array('άγνωστη παλιά επίστρωση χρειάζεται επιβεβαίωση πρόσφυσης/συμβατότητας','το νέο σύστημα δεν πρέπει να θεωρείται συμβατό χωρίς τεκμηρίωση'),
 jsonb_build_array('νέα αποκόλληση','φουσκάλες','αστοχία στην παλιά διεπιφάνεια'),
 jsonb_build_array('βάψιμο πάνω σε φλούδες','παράλειψη καθαρισμού','παράλειψη αιτίας υγρασίας','υπόθεση ότι κάθε αστάρι λύνει ασυμβατότητα'),
 jsonb_build_array('εκτεταμένη αποκόλληση υποστρώματος','ενεργή υγρασία','άγνωστη επίστρωση με αποτυχία δοκιμής πρόσφυσης'),
 jsonb_build_array('έλεγχος ορίων επισκευής και πρόσφυσης μετά την ωρίμανση'),
 jsonb_build_array('παρακολούθηση για νέα αποκόλληση ή υγρασία και έγκαιρη αντιμετώπιση'),
 jsonb_build_array('προστασία ματιών/δέρματος και έλεγχος σκόνης κατά το ξύσιμο/τρίψιμο· πρόσθετο PPE σύμφωνα με SDS'),
 jsonb_build_array('scraper','abrasive','dust_removal','roller_or_brush','adhesion_test_tools'),
 jsonb_build_array('floor_or_ground_protection','masking','dust_control'),
 'verified','approved',true,now()
FROM public.build_solution_types st, public.build_problem_types pt
WHERE st.solution_key='repainting_existing_coatings' AND pt.problem_key='peeling_coating'
ON CONFLICT (scenario_key) DO NOTHING;

-- 3. Existing waterproofing maintenance.
INSERT INTO public.build_solution_profiles
(scenario_key,solution_type_id,problem_type_id,source_layer,substrate,interior_exterior,
 customer_title_el,technical_summary,customer_explanation_el,short_explanation_el,
 typical_causes,visual_symptoms,diagnostic_questions,required_prechecks,
 suitable_solution_types,unsuitable_solution_types,surface_preparation,repair_sequence,
 primer_role,basecoat_role,topcoat_role,required_system_layers,optional_system_layers,
 drying_dependencies,substrate_moisture_considerations,temperature_considerations,
 humidity_considerations,weather_considerations,uv_considerations,rain_considerations,
 condensation_considerations,ventilation_requirements,compatibility_principles,
 common_failure_modes,common_user_mistakes,warning_signs,inspection_after_application,
 maintenance_guidance,ppe_general,tool_categories_required,protection_materials_required,
 evidence_status,review_status,published,reviewed_at)
SELECT
 'waterproof_existing_system_maintenance',st.id,pt.id,'GENERAL_GUIDANCE','existing roof/balcony waterproofing system','exterior',
 'Συντήρηση υπάρχουσας στεγάνωσης',
 'Existing waterproofing should be inspected as a system: membrane condition, details, penetrations, flashings, joints, outlets and drainage. Local repair is conditional on identifying a compatible repair method.',
 'Η συντήρηση στεγάνωσης ξεκινά με έλεγχο όλου του συστήματος και των λεπτομερειών του. Μια τοπική επάλειψη δεν είναι ασφαλής επιλογή αν δεν γνωρίζουμε τι υπάρχει ήδη ή αν το πρόβλημα είναι γενικευμένο.',
 'Ελέγχουμε πρώτα μεμβράνη, λεπτομέρειες και απορροές· μετά αποφασίζουμε αν αρκεί τοπική επισκευή.',
 jsonb_build_array('γήρανση/φθορά','τοπική μηχανική βλάβη','αστοχία λεπτομερειών','φραγμένες ή ανεπαρκείς απορροές','ασύμβατη προηγούμενη επισκευή'),
 jsonb_build_array('τοπικές ρωγμές/κοψίματα','αποκόλληση','φουσκάλες','φθορά γύρω από διελεύσεις','νερό κοντά σε απορροές'),
 jsonb_build_array('Είναι γνωστό το υπάρχον σύστημα;','Η βλάβη είναι τοπική ή εκτεταμένη;','Υπάρχει ενεργή διαρροή;','Οι απορροές είναι ελεύθερες και λειτουργικές;','Υπάρχουν λιμνάζοντα νερά;'),
 jsonb_build_array('ασφαλής πρόσβαση','έλεγχος όλης της επιφάνειας και λεπτομερειών','ταυτοποίηση υπάρχοντος συστήματος όπου απαιτείται','έλεγχος απορροών/κλίσεων'),
 jsonb_build_array('τοπική συμβατή επισκευή μετά από επιθεώρηση','συντήρηση λεπτομερειών','πλήρης ανανέωση όταν η φθορά είναι γενικευμένη και έχει σχεδιαστεί το σύστημα'),
 jsonb_build_array('τυχαία επάλειψη άγνωστης χημείας πάνω σε άγνωστο σύστημα','κάλυψη λιμναζόντων νερών χωρίς έλεγχο απορροών/κλίσεων'),
 jsonb_build_array('καθαρισμός','απομάκρυνση σαθρών/ασύνδετων υλικών όπου προβλέπεται','στέγνωμα υποστρώματος σύμφωνα με το σύστημα','προετοιμασία/αστάρωμα μόνο όπως ορίζει συμβατή τεκμηρίωση'),
 jsonb_build_array('επιθεώρηση','διάγνωση αιτίας','καθαρισμός/προετοιμασία','τοπικές κατασκευαστικές επισκευές','εφαρμογή συμβατού συστήματος','ωρίμανση','τελικός έλεγχος'),
 jsonb_build_array('το αστάρι είναι μέρος της επιλεγμένης επισκευής μόνο όταν το απαιτεί το συμβατό σύστημα'),
 jsonb_build_array('ενισχύσεις/ενδιάμεσες στρώσεις εφαρμόζονται μόνο όπου ορίζει το σύστημα'),
 jsonb_build_array('τελική/προστατευτική στρώση είναι σύστημα-ειδική'),
 jsonb_build_array('σταθερό/προετοιμασμένο υπόστρωμα','συμβατό σύστημα επισκευής','σωστά διαμορφωμένες λεπτομέρειες'),
 jsonb_build_array('τοπική ενίσχυση','προστατευτική τελική στρώση','στρώση κυκλοφορίας όπου απαιτείται και τεκμηριώνεται'),
 jsonb_build_array('καμία στρώση δεν καλύπτεται πριν επιτραπεί από το επιλεγμένο σύστημα'),
 jsonb_build_array('υγρό ή εγκλωβισμένο νερό μπορεί να καταστήσει ακατάλληλη μια επικάλυψη· απαιτείται αξιολόγηση'),
 jsonb_build_array('όρια εφαρμογής από τον κατασκευαστή'),
 jsonb_build_array('όρια εφαρμογής/στέγνωσης από τον κατασκευαστή'),
 jsonb_build_array('μην εφαρμόζεται όταν οι καιρικές συνθήκες παραβιάζουν τις οδηγίες του συστήματος'),
 jsonb_build_array('έκθεση UV απαιτεί κατάλληλο, τεκμηριωμένο σύστημα'),
 jsonb_build_array('η νέα εφαρμογή πρέπει να προστατεύεται από βροχή για όσο απαιτεί το σύστημα'),
 jsonb_build_array(),
 jsonb_build_array(),
 jsonb_build_array('χημική και μηχανική συμβατότητα με το υπάρχον σύστημα πρέπει να τεκμηριώνεται','δοκιμή πρόσφυσης μπορεί να απαιτείται'),
 jsonb_build_array('αποκόλληση επισκευής','επανεμφάνιση διαρροής','ρηγμάτωση στη λεπτομέρεια','αστοχία λόγω στάσιμου νερού ή κακής απορροής'),
 jsonb_build_array('μπάλωμα χωρίς επιθεώρηση','απόφραξη απορροής με υλικό','ανάμιξη άγνωστων συστημάτων','παράλειψη λεπτομερειών'),
 jsonb_build_array('ενεργή εισροή νερού άγνωστης διαδρομής','εκτεταμένη αποκόλληση','ασταθές υπόστρωμα','λιμνάζοντα νερά χωρίς αξιολόγηση','μη ασφαλής πρόσβαση'),
 jsonb_build_array('έλεγχος ομοιομορφίας εφαρμογής, λεπτομερειών, απορροών και τυχόν τοπικών ατελειών'),
 jsonb_build_array('περιοδική επιθεώρηση','καθαρισμός υπολειμμάτων και απορροών','έλεγχος upstands/flashings/cappings/joints/penetrations'),
 jsonb_build_array('PPE σύμφωνα με εργασία, SDS και κίνδυνο πτώσης'),
 jsonb_build_array('inspection_tools','cleaning_tools','detail_repair_tools','application_tools'),
 jsonb_build_array('adjacent_surface_protection','drain_protection','fall_protection_where_required'),
 'verified','approved',true,now()
FROM public.build_solution_types st, public.build_problem_types pt
WHERE st.solution_key='waterproofing_maintenance' AND pt.problem_key='waterproofing_maintenance'
ON CONFLICT (scenario_key) DO NOTHING;

-- 4. Waterproofing details: parapets, joints, penetrations.
INSERT INTO public.build_solution_profiles
(scenario_key,solution_type_id,problem_type_id,source_layer,substrate,interior_exterior,
 customer_title_el,technical_summary,customer_explanation_el,short_explanation_el,
 typical_causes,visual_symptoms,diagnostic_questions,required_prechecks,
 suitable_solution_types,unsuitable_solution_types,surface_preparation,repair_sequence,
 primer_role,basecoat_role,topcoat_role,required_system_layers,optional_system_layers,
 drying_dependencies,substrate_moisture_considerations,temperature_considerations,
 humidity_considerations,weather_considerations,uv_considerations,rain_considerations,
 condensation_considerations,ventilation_requirements,compatibility_principles,
 common_failure_modes,common_user_mistakes,warning_signs,inspection_after_application,
 maintenance_guidance,ppe_general,tool_categories_required,protection_materials_required,
 evidence_status,review_status,published,reviewed_at)
SELECT
 'waterproof_details_parapets_joints_penetrations',st.id,pt.id,'GENERAL_GUIDANCE','roof/balcony waterproofing details','exterior',
 'Στηθαία, αρμοί και διελεύσεις στεγάνωσης',
 'Waterproofing continuity is often controlled by details such as upstands, parapets, flashings, movement joints, penetrations and outlets. Exact reinforcement, termination and sealant/membrane chemistry are system-specific.',
 'Στα στηθαία, στους αρμούς, γύρω από σωλήνες και στις απορροές η στεγάνωση χρειάζεται σωστή συνέχεια και λεπτομέρεια. Δεν υπάρχει μία γενική συνταγή για όλες τις μεμβράνες.',
 'Οι λεπτομέρειες στεγάνωσης ελέγχονται και λύνονται ως μέρος του ίδιου συμβατού συστήματος.',
 jsonb_build_array('ασυνέχεια στεγάνωσης','κίνηση αρμού','αστοχία flashing/capping','κακή διαμόρφωση γύρω από διέλευση','φραγμένη/κακή απορροή'),
 jsonb_build_array('ρωγμή ή άνοιγμα στη λεπτομέρεια','τοπική αποκόλληση','υγρασία κάτω από διέλευση','φθορά σε ένωση τοίχου/δώματος'),
 jsonb_build_array('Η λεπτομέρεια κινείται ή είναι στατική;','Υπάρχει μηχανικά σταθερό υπόβαθρο;','Είναι γνωστό το υπάρχον σύστημα;','Υπάρχει ενεργή διαρροή και έχει εντοπιστεί η διαδρομή;'),
 jsonb_build_array('ασφαλής πρόσβαση','έλεγχος μηχανικής σταθερότητας','έλεγχος υφιστάμενου συστήματος και γειτονικών λεπτομερειών'),
 jsonb_build_array('σύστημα-ειδική επισκευή λεπτομέρειας','ανακατασκευή flashing/capping όπου απαιτείται','συμβατή ενίσχυση όπου ορίζει το σύστημα'),
 jsonb_build_array('αυθαίρετη χρήση σφραγιστικού ως μοναδική λύση σε άγνωστο κινούμενο αρμό','επάλειψη πάνω σε ασταθές στηθαίο'),
 jsonb_build_array('καθαρισμός','αφαίρεση σαθρού υλικού','επισκευή υποστρώματος','διαμόρφωση λεπτομέρειας σύμφωνα με εγκεκριμένο σύστημα'),
 jsonb_build_array('επιθεώρηση','χαρακτηρισμός λεπτομέρειας/κίνησης','επισκευή υποβάθρου','σύστημα-ειδική προετοιμασία','εφαρμογή/ενίσχυση/τερματισμός','ωρίμανση','έλεγχος'),
 jsonb_build_array('σύστημα-ειδικό'),
 jsonb_build_array('ενίσχυση ή carrier/reinforcement μόνο όπου προβλέπεται από το επιλεγμένο σύστημα'),
 jsonb_build_array('τελική προστασία/finish μόνο όπως ορίζει το σύστημα'),
 jsonb_build_array('σταθερή λεπτομέρεια','συμβατό waterproofing detail build-up','σωστός τερματισμός'),
 jsonb_build_array('μηχανικό flashing/capping','reinforcement','προστατευτική στρώση'),
 jsonb_build_array('χρόνοι προϊόντος/συστήματος'),
 jsonb_build_array('στεγνό/κατάλληλο υπόστρωμα όπως απαιτεί το σύστημα'),
 jsonb_build_array('όρια προϊόντος'),
 jsonb_build_array('όρια προϊόντος'),
 jsonb_build_array('αποφυγή μη επιτρεπτών συνθηκών'),
 jsonb_build_array('εξωτερική έκθεση UV λαμβάνεται υπόψη στην επιλογή τελικής στρώσης'),
 jsonb_build_array('προστασία από βροχή κατά την εφαρμογή/ωρίμανση σύμφωνα με τον κατασκευαστή'),
 jsonb_build_array(),
 jsonb_build_array(),
 jsonb_build_array('όλα τα υλικά λεπτομέρειας πρέπει να είναι συμβατά με το κύριο σύστημα','κινούμενοι αρμοί απαιτούν λύση κατάλληλη για την αναμενόμενη κίνηση'),
 jsonb_build_array('διαρροή στη διεπιφάνεια','σχίσιμο σε αρμό','αποκόλληση γύρω από διέλευση'),
 jsonb_build_array('τοπικό μπάλωμα χωρίς σύνδεση με το κύριο σύστημα','κλείσιμο απορροής','παράβλεψη κίνησης αρμού'),
 jsonb_build_array('ασταθές στηθαίο','άγνωστη σημαντική κίνηση','ενεργή διαρροή άγνωστης διαδρομής','μη ασφαλής πρόσβαση'),
 jsonb_build_array('έλεγχος συνέχειας, τερματισμών, reinforcement, outlets και penetrations'),
 jsonb_build_array('τακτική οπτική επιθεώρηση λεπτομερειών και καθαρισμός απορροών'),
 jsonb_build_array('PPE και προστασία από πτώση σύμφωνα με κίνδυνο/SDS'),
 jsonb_build_array('detail_tools','cleaning_tools','application_tools','inspection_tools'),
 jsonb_build_array('adjacent_surface_protection','drain_protection','fall_protection_where_required'),
 'verified','approved',true,now()
FROM public.build_solution_types st, public.build_problem_types pt
WHERE st.solution_key='waterproofing_details' AND pt.problem_key='waterproofing_detail'
ON CONFLICT (scenario_key) DO NOTHING;

-- 5. Below-grade / basement moisture.
INSERT INTO public.build_solution_profiles
(scenario_key,solution_type_id,problem_type_id,source_layer,substrate,interior_exterior,
 customer_title_el,technical_summary,customer_explanation_el,short_explanation_el,
 typical_causes,visual_symptoms,diagnostic_questions,required_prechecks,
 suitable_solution_types,unsuitable_solution_types,surface_preparation,repair_sequence,
 primer_role,basecoat_role,topcoat_role,required_system_layers,optional_system_layers,
 drying_dependencies,substrate_moisture_considerations,temperature_considerations,
 humidity_considerations,weather_considerations,uv_considerations,rain_considerations,
 condensation_considerations,ventilation_requirements,compatibility_principles,
 common_failure_modes,common_user_mistakes,warning_signs,inspection_after_application,
 maintenance_guidance,ppe_general,tool_categories_required,protection_materials_required,
 evidence_status,review_status,published,reviewed_at)
SELECT
 'waterproof_basement_below_grade_moisture',st.id,pt.id,'GENERAL_GUIDANCE','below-grade wall/floor','interior',
 'Υγρασία σε υπόγειο ή τοίχο κάτω από το έδαφος',
 'Below-grade moisture can arise from external ground/surface water, drainage, service leaks, condensation or combinations. Visible damp does not by itself identify the mechanism; below-ground waterproofing is a design/risk problem, not a decorative coating choice.',
 'Η υγρασία σε υπόγειο δεν έχει μία μόνο αιτία. Πριν προταθεί στεγάνωση πρέπει να διερευνηθεί αν πρόκειται για νερό από το έδαφος, βροχή/αποστράγγιση, διαρροή σωλήνα ή συμπύκνωση.',
 'Στο υπόγειο πρώτα εντοπίζουμε τον μηχανισμό της υγρασίας· μετά σχεδιάζεται η λύση.',
 jsonb_build_array('νερό από έδαφος/υδροφόρο','επιφανειακά νερά ή ανεπαρκής αποστράγγιση','υδραυλική διαρροή','συμπύκνωση σε ψυχρές επιφάνειες','αστοχία υπάρχουσας στεγάνωσης'),
 jsonb_build_array('υγρές κηλίδες','άλατα/εξανθήματα','ξεφλούδισμα','μούχλα','νερό σε αρμούς ή δάπεδο'),
 jsonb_build_array('Εμφανίζεται μετά από βροχή;','Υπάρχει ενεργή ροή νερού;','Υπάρχουν σωληνώσεις κοντά;','Είναι ο χώρος ανεπαρκώς αεριζόμενος;','Βρίσκεται η υγρασία σε επαφή με έδαφος ή μόνο σε ψυχρές επιφάνειες;'),
 jsonb_build_array('διάκριση συμπύκνωσης από εισροή/διαρροή','έλεγχος εξωτερικής αποστράγγισης όπου είναι προσβάσιμη','έλεγχος υπηρεσιών/σωληνώσεων','εκτίμηση σοβαρότητας και έκτασης'),
 jsonb_build_array('τεχνική αξιολόγηση below-grade waterproofing','διόρθωση διαρροής/αποστράγγισης','έλεγχος συμπύκνωσης και αερισμού','σύστημα στεγάνωσης σχεδιασμένο για τις πραγματικές πιέσεις/συνθήκες'),
 jsonb_build_array('διακοσμητική βαφή ως λύση ενεργού νερού','υπόθεση ότι κάθε υγρασία χαμηλά είναι rising damp'),
 jsonb_build_array('η προετοιμασία εξαρτάται από τον επιλεγμένο σχεδιασμό· σαθρά/μολυσμένα υλικά δεν αποτελούν αποδεκτή βάση'),
 jsonb_build_array('διάγνωση μηχανισμού','εκτίμηση νερού/αποστράγγισης/κατασκευής','σχεδιασμός συστήματος','προετοιμασία','εφαρμογή τεκμηριωμένου συστήματος','έλεγχος'),
 jsonb_build_array('σύστημα-ειδικό και όχι γενικά υποχρεωτικό'),
 jsonb_build_array('πιθανές barrier/drained/integral λύσεις είναι σχεδιαστικές κατηγορίες, όχι εναλλάξιμες στρώσεις'),
 jsonb_build_array('τυχόν τελική επίστρωση ακολουθεί μόνο όταν το σύστημα το επιτρέπει'),
 jsonb_build_array('η διάταξη στρώσεων καθορίζεται από τον επιλεγμένο σχεδιασμό/σύστημα'),
 jsonb_build_array('αποστράγγιση ή cavity components όπου απαιτούνται από τον σχεδιασμό'),
 jsonb_build_array('χρόνοι εφαρμογής/ωρίμανσης μόνο από τα επιλεγμένα υλικά'),
 jsonb_build_array('η παρουσία ενεργού νερού ή υψηλής υγρασίας είναι βασική παράμετρος σχεδιασμού και μπορεί να μπλοκάρει επιφανειακή λύση'),
 jsonb_build_array('όρια προϊόντος'),
 jsonb_build_array('υψηλή εσωτερική υγρασία μπορεί να δημιουργεί συμπύκνωση ανεξάρτητα από ground-water ingress'),
 jsonb_build_array('βροχόπτωση/επιφανειακά νερά μπορεί να επηρεάζουν το μοτίβο εισροής'),
 jsonb_build_array(),
 jsonb_build_array('συσχέτιση με βροχή είναι διαγνωστική ένδειξη, όχι απόδειξη'),
 jsonb_build_array('συμπύκνωση πρέπει να αποκλείεται πριν αποδοθεί το σύμπτωμα σε εξωτερικό νερό'),
 jsonb_build_array('επαρκής αερισμός όπου η συμπύκνωση αποτελεί πιθανό μηχανισμό'),
 jsonb_build_array('below-grade systems δεν θεωρούνται αμοιβαία συμβατά χωρίς τεκμηρίωση','existing system identity matters for remedial work'),
 jsonb_build_array('συνέχιση εισροής','αποκόλληση εσωτερικής επίστρωσης','εγκλωβισμένη υγρασία','μούχλα από ανεπίλυτη συμπύκνωση'),
 jsonb_build_array('εσωτερική βαφή πριν τη διάγνωση','απόφραξη νερού χωρίς σχεδιασμό αποστράγγισης/πίεσης','υπόθεση αιτίας από το ύψος της κηλίδας'),
 jsonb_build_array('ενεργή ροή νερού','άγνωστη σημαντική πηγή υγρασίας','ρωγμές/παραμόρφωση κατασκευής','πιθανή υδροστατική πίεση'),
 jsonb_build_array('παρακολούθηση μετά από βροχή/υγρές περιόδους και έλεγχος για επανεμφάνιση'),
 jsonb_build_array('έλεγχος αποστράγγισης, διαρροών και εσωτερικής υγρασίας','περιοδικός έλεγχος συστήματος όπου υπάρχει'),
 jsonb_build_array('PPE σύμφωνα με κίνδυνο/SDS· αποφυγή εργασίας σε χώρο με μη ελεγχόμενη εισροή νερού ή άλλο κίνδυνο'),
 jsonb_build_array('inspection_and_moisture_assessment_tools','surface_preparation_tools','application_tools_if_design_confirmed'),
 jsonb_build_array('adjacent_surface_protection','water_management_or_containment_where_professionally_planned'),
 'verified','approved',true,now()
FROM public.build_solution_types st, public.build_problem_types pt
WHERE st.solution_key='below_grade_waterproofing' AND pt.problem_key='below_grade_moisture'
ON CONFLICT (scenario_key) DO NOTHING;

-- 6. Thermal bridge / cold surface.
INSERT INTO public.build_solution_profiles
(scenario_key,solution_type_id,problem_type_id,source_layer,substrate,interior_exterior,
 customer_title_el,technical_summary,customer_explanation_el,short_explanation_el,
 typical_causes,visual_symptoms,diagnostic_questions,required_prechecks,
 suitable_solution_types,unsuitable_solution_types,surface_preparation,repair_sequence,
 primer_role,basecoat_role,topcoat_role,required_system_layers,optional_system_layers,
 drying_dependencies,substrate_moisture_considerations,temperature_considerations,
 humidity_considerations,weather_considerations,uv_considerations,rain_considerations,
 condensation_considerations,ventilation_requirements,compatibility_principles,
 common_failure_modes,common_user_mistakes,warning_signs,inspection_after_application,
 maintenance_guidance,ppe_general,tool_categories_required,protection_materials_required,
 evidence_status,review_status,published,reviewed_at)
SELECT
 'insulation_thermal_bridge_condensation',st.id,pt.id,'GENERAL_GUIDANCE','building-envelope junction/interior surface','both',
 'Ψυχρό σημείο, θερμογέφυρα και συμπύκνωση',
 'A thermal bridge is a localized envelope condition with increased heat flow and potentially lower internal surface temperature. Surface mould/condensation can be associated with this but does not prove it; moisture sources and indoor humidity must also be considered.',
 'Ένα πολύ ψυχρό σημείο σε γωνία, κολόνα ή ένωση μπορεί να σχετίζεται με θερμογέφυρα. Αν εμφανίζεται μούχλα ή νερό, πρέπει να ελεγχθούν και η υγρασία του χώρου, ο αερισμός και άλλες πιθανές πηγές νερού.',
 'Η εικόνα μπορεί να δείχνει θερμογέφυρα, αλλά χρειάζεται έλεγχος πριν αποφασιστεί μόνωση.',
 jsonb_build_array('ασυνέχεια θερμομόνωσης','γεωμετρική ή υλική θερμογέφυρα','υψηλή εσωτερική υγρασία','ανεπαρκής αερισμός','άλλος μηχανισμός υγρασίας'),
 jsonb_build_array('τοπικά ψυχρή επιφάνεια','συμπύκνωση','μούχλα σε γωνίες/ενώσεις','επαναλαμβανόμενο μοτίβο σε κατασκευαστικό junction'),
 jsonb_build_array('Εμφανίζεται κυρίως σε γωνία/κολόνα/πλάκα;','Σχετίζεται με κρύο καιρό;','Υπάρχει υψηλή εσωτερική υγρασία;','Έχει αποκλειστεί διαρροή ή βροχή;','Υπάρχει υπάρχουσα μόνωση και είναι συνεχής;'),
 jsonb_build_array('έλεγχος άλλων πηγών υγρασίας','καταγραφή συνθηκών υγρασίας/θερμοκρασίας','εκτίμηση του κατασκευαστικού junction','έλεγχος αν απαιτείται υγροθερμικός υπολογισμός'),
 jsonb_build_array('βελτίωση συνέχειας θερμομόνωσης με τεχνικά σχεδιασμένη λύση','μείωση υπερβολικής εσωτερικής υγρασίας/βελτίωση αερισμού','έλεγχος junction/details'),
 jsonb_build_array('αντιμουχλικό χρώμα ως μοναδική λύση σε θερμογέφυρα','τυχαία εσωτερική μόνωση χωρίς έλεγχο συμπύκνωσης'),
 jsonb_build_array('δεν ορίζεται γενική προετοιμασία μέχρι να επιλεγεί ασφαλής θερμική λύση'),
 jsonb_build_array('διάγνωση πιθανών μηχανισμών','θερμική/υγροθερμική αξιολόγηση όπου απαιτείται','σχεδιασμός συνέχειας μόνωσης/junction','εγκατάσταση τεκμηριωμένου συστήματος','έλεγχος επιφανειακών συνθηκών'),
 jsonb_build_array('δεν αποτελεί γενικό βήμα· εξαρτάται από το σύστημα'),
 jsonb_build_array('η κύρια στρώση είναι η σχεδιασμένη θερμομονωτική λύση και τα συνοδά της στοιχεία'),
 jsonb_build_array('τελική επίστρωση/σοβάς είναι σύστημα-ειδικός'),
 jsonb_build_array('στρώσεις και συνέχεια καθορίζονται από το επιλεγμένο σύστημα και τη θέση μόνωσης'),
 jsonb_build_array('ατμοέλεγχος/air barrier όπου προκύπτει από υγροθερμικό σχεδιασμό'),
 jsonb_build_array('ωρίμανση επιχρισμάτων/συγκολλητικών σύμφωνα με σύστημα'),
 jsonb_build_array('υπάρχουσα υγρασία πρέπει να διαγνωστεί πριν εγκλωβιστεί από νέα στρώση'),
 jsonb_build_array('θερμοκρασιακές συνθήκες εφαρμογής από το σύστημα'),
 jsonb_build_array('εσωτερική υγρασία είναι κρίσιμη για surface-condensation risk'),
 jsonb_build_array('εξωτερικές εργασίες ακολουθούν περιορισμούς συστήματος καιρού'),
 jsonb_build_array('εξωτερικά τελειώματα απαιτούν UV-suitable system'),
 jsonb_build_array('εξωτερική εφαρμογή προστατεύεται από βροχή σύμφωνα με σύστημα'),
 jsonb_build_array('ο κίνδυνος εξαρτάται από εσωτερική επιφανειακή θερμοκρασία και υγρασία· απλοποιημένοι υπολογισμοί έχουν γνωστούς περιορισμούς'),
 jsonb_build_array('έλεγχος/βελτίωση αερισμού όταν η εσωτερική υγρασία είναι υψηλή'),
 jsonb_build_array('ETICS/internal-insulation components πρέπει να παραμένουν εντός τεκμηριωμένου συστήματος','μην αναμειγνύονται αυθαίρετα στρώσεις με διαφορετική συμπεριφορά υδρατμών'),
 jsonb_build_array('μεταφορά συμπύκνωσης μέσα στη δομή','παραμένουσα επιφανειακή μούχλα','ρηγμάτωση/αποκόλληση τελειώματος από ασύμβατο σύστημα'),
 jsonb_build_array('μόνωση μόνο του ορατού σημείου χωρίς junction design','κάλυψη μούχλας','παράλειψη αερισμού/υγρασίας'),
 jsonb_build_array('σημαντική υγρασία άγνωστης αιτίας','σχεδιαζόμενη εσωτερική μόνωση σε ευαίσθητο τοίχο χωρίς έλεγχο συμπύκνωσης','πολλαπλά σύνθετα junctions'),
 jsonb_build_array('έλεγχος για επίμονες ψυχρές ζώνες/συμπύκνωση και ακεραιότητα τελειώματος'),
 jsonb_build_array('παρακολούθηση εσωτερικής υγρασίας/αερισμού και συντήρηση εξωτερικών λεπτομερειών'),
 jsonb_build_array('PPE σύμφωνα με επιλεγμένο σύστημα και εργασίες κοπής/σκόνης'),
 jsonb_build_array('measurement_tools','insulation_cutting_tools','application_or_fixing_tools','detail_tools'),
 jsonb_build_array('dust_control','adjacent_surface_protection','fall_protection_where_required'),
 'verified','approved',true,now()
FROM public.build_solution_types st, public.build_problem_types pt
WHERE st.solution_key='thermal_bridge_mitigation' AND pt.problem_key='thermal_bridge'
ON CONFLICT (scenario_key) DO NOTHING;

-- 7. Roof thermal insulation.
INSERT INTO public.build_solution_profiles
(scenario_key,solution_type_id,problem_type_id,source_layer,substrate,interior_exterior,
 customer_title_el,technical_summary,customer_explanation_el,short_explanation_el,
 typical_causes,visual_symptoms,diagnostic_questions,required_prechecks,
 suitable_solution_types,unsuitable_solution_types,surface_preparation,repair_sequence,
 primer_role,basecoat_role,topcoat_role,required_system_layers,optional_system_layers,
 drying_dependencies,substrate_moisture_considerations,temperature_considerations,
 humidity_considerations,weather_considerations,uv_considerations,rain_considerations,
 condensation_considerations,ventilation_requirements,compatibility_principles,
 common_failure_modes,common_user_mistakes,warning_signs,inspection_after_application,
 maintenance_guidance,ppe_general,tool_categories_required,protection_materials_required,
 evidence_status,review_status,published,reviewed_at)
SELECT
 'insulation_roof_general',st.id,pt.id,'GENERAL_GUIDANCE','roof/terrace build-up','exterior',
 'Θερμομόνωση δώματος ή στέγης',
 'Roof insulation is a system-design task. Warm and inverted roof constructions use different generic layer positions, so Build Studio must not impose one universal sequence. Thermal adequacy, waterproofing, moisture control, drainage, load and details must be assessed together.',
 'Η θερμομόνωση ταράτσας δεν έχει μία σειρά στρώσεων για όλες τις περιπτώσεις. Άλλη διάταξη μπορεί να έχει ένα θερμό δώμα και άλλη ένα ανεστραμμένο. Πρώτα καταγράφεται η υπάρχουσα κατασκευή και μετά επιλέγεται τεκμηριωμένο σύστημα.',
 'Πρώτα αναγνωρίζουμε τον τύπο δώματος· δεν αντιγράφουμε μία γενική σειρά στρώσεων.',
 jsonb_build_array('ανεπαρκής θερμική προστασία','ασυνέχεια μόνωσης','παλιό/άγνωστο roof build-up','ανάγκη ενεργειακής αναβάθμισης'),
 jsonb_build_array('υψηλές εσωτερικές θερμοκρασίες/απώλειες','ψυχρές εσωτερικές επιφάνειες','συμπύκνωση σε junctions','φθορά υπάρχουσας στεγάνωσης'),
 jsonb_build_array('Ποια είναι η υπάρχουσα διάταξη στρώσεων;','Υπάρχει ενεργή διαρροή;','Είναι βατό το δώμα;','Υπάρχουν λιμνάζοντα νερά;','Υπάρχει θερμαινόμενος χώρος από κάτω;'),
 jsonb_build_array('έλεγχος στεγάνωσης/διαρροών','ασφαλής πρόσβαση','έλεγχος απορροών/κλίσεων','τεχνικός έλεγχος θερμικής επάρκειας','καταγραφή υφιστάμενου build-up'),
 jsonb_build_array('warm-roof system όπου είναι κατάλληλο','inverted-roof system όπου είναι κατάλληλο','άλλη τεχνικά σχεδιασμένη roof-insulation solution'),
 jsonb_build_array('γενική ίδια σειρά στρώσεων για κάθε δώμα','κάλυψη ενεργής διαρροής με θερμομόνωση'),
 jsonb_build_array('προετοιμασία/επισκευή υφιστάμενου deck και waterproofing σύμφωνα με τον επιλεγμένο σχεδιασμό'),
 jsonb_build_array('survey υπάρχοντος roof build-up','διάγνωση νερού/απορροής','θερμικός και υγροθερμικός σχεδιασμός','επιλογή roof-system type','εγκατάσταση σύμφωνα με system holder/manufacturer','inspection'),
 jsonb_build_array('δεν είναι καθολικό βήμα'),
 jsonb_build_array('θέση θερμομόνωσης, waterproofing και τυχόν AVCL εξαρτάται από τον τύπο συστήματος'),
 jsonb_build_array('τελική προστασία/βατή στρώση εξαρτάται από χρήση και σύστημα'),
 jsonb_build_array('δεν αποθηκεύεται μία καθολική σειρά· απαιτείται επιλεγμένο system build-up'),
 jsonb_build_array('AVCL/WFRL/drainage/protection layers μόνο όταν προβλέπονται από το συγκεκριμένο roof system'),
 jsonb_build_array('χρόνοι/ωρίμανση από κάθε επιλεγμένο υλικό/σύστημα'),
 jsonb_build_array('υγρή κατασκευή ή ενεργή διαρροή πρέπει να αντιμετωπιστεί πριν εγκλωβιστεί κάτω από νέα στρώση'),
 jsonb_build_array('θερμοκρασιακά όρια εφαρμογής από σύστημα'),
 jsonb_build_array('έλεγχος κινδύνου συμπύκνωσης όπου απαιτείται'),
 jsonb_build_array('άνεμος/βροχή/θερμοκρασία επηρεάζουν εργασίες εξωτερικού δώματος'),
 jsonb_build_array('εξωτερικά υλικά πρέπει να έχουν την απαιτούμενη έκθεση σύμφωνα με το σύστημα'),
 jsonb_build_array('στεγάνωση και προσωρινή προστασία από βροχή είναι κρίσιμες κατά την εργασία'),
 jsonb_build_array('υγροθερμικός έλεγχος μπορεί να απαιτείται ανάλογα με build-up και χρήση'),
 jsonb_build_array(),
 jsonb_build_array('χρησιμοποιούνται μόνο συμβατά roof-system components','warm και inverted roof details δεν αναμειγνύονται αυθαίρετα'),
 jsonb_build_array('εγκλωβισμένη υγρασία','αστοχία στεγάνωσης','θερμογέφυρες σε upstands/parapets','μετακίνηση ή ανεπαρκής συγκράτηση στρώσεων'),
 jsonb_build_array('μία γενική συνταγή για όλες τις ταράτσες','παράλειψη απορροών','μονωτική στρώση πάνω σε ενεργή διαρροή','ανάμιξη components από μη τεκμηριωμένα συστήματα'),
 jsonb_build_array('ενεργή εισροή νερού','μη ασφαλής πρόσβαση','άγνωστο build-up με κρυφές στρώσεις/υγρασία','στατικό/φορτίο αβέβαιο'),
 jsonb_build_array('έλεγχος στεγάνωσης, λεπτομερειών, απορροών, σταθερότητας και τελικής προστασίας'),
 jsonb_build_array('περιοδικός έλεγχος waterproofing/details/outlets και προστατευτικών στρώσεων'),
 jsonb_build_array('PPE και fall protection σύμφωνα με κίνδυνο/SDS'),
 jsonb_build_array('survey_tools','insulation_cutting_tools','fixing_or_adhesive_tools','waterproofing_detail_tools'),
 jsonb_build_array('weather_protection','drain_protection','fall_protection'),
 'verified','approved',true,now()
FROM public.build_solution_types st, public.build_problem_types pt
WHERE st.solution_key='roof_insulation' AND pt.problem_key='roof_thermal_insulation'
ON CONFLICT (scenario_key) DO NOTHING;

-- 8. Large/recurrent wall crack.
INSERT INTO public.build_solution_profiles
(scenario_key,solution_type_id,problem_type_id,source_layer,substrate,interior_exterior,
 customer_title_el,technical_summary,customer_explanation_el,short_explanation_el,
 typical_causes,visual_symptoms,diagnostic_questions,required_prechecks,
 suitable_solution_types,unsuitable_solution_types,surface_preparation,repair_sequence,
 primer_role,basecoat_role,topcoat_role,required_system_layers,optional_system_layers,
 drying_dependencies,substrate_moisture_considerations,temperature_considerations,
 humidity_considerations,weather_considerations,uv_considerations,rain_considerations,
 condensation_considerations,ventilation_requirements,compatibility_principles,
 common_failure_modes,common_user_mistakes,warning_signs,inspection_after_application,
 maintenance_guidance,ppe_general,tool_categories_required,protection_materials_required,
 evidence_status,review_status,published,reviewed_at)
SELECT
 'repair_recurrent_or_large_wall_crack',st.id,pt.id,'GENERAL_GUIDANCE','plaster/render/masonry wall','both',
 'Μεγάλη ή επαναλαμβανόμενη ρωγμή',
 'A recurrent, expanding, displaced or otherwise significant crack must not be assumed cosmetic. The general pathway is screening and, when movement/structural indicators are present or the cause is uncertain, professional assessment before repair selection.',
 'Αν μια ρωγμή μεγαλώνει, επανέρχεται ή συνοδεύεται από άλλες ενδείξεις κίνησης, δεν τη θεωρούμε απλώς αισθητική. Πρώτα αξιολογείται η αιτία και η σταθερότητα και μετά επιλέγεται επισκευή.',
 'Μεγάλη ή επαναλαμβανόμενη ρωγμή: πρώτα έλεγχος, όχι απλό στοκάρισμα.',
 jsonb_build_array('κίνηση υποστρώματος ή κτιρίου','θερμικές/υγρομετρικές μετακινήσεις','αστοχία σοβά/render','τοπική μη δομική ρηγμάτωση','πιθανή δομική αιτία'),
 jsonb_build_array('ρωγμή που μεγαλώνει','ρωγμή που ξανανοίγει','μετατόπιση στις δύο πλευρές','ρωγμές γύρω από ανοίγματα','συνοδά κολλήματα κουφωμάτων ή παραμορφώσεις'),
 jsonb_build_array('Μεγαλώνει ή αλλάζει με τον χρόνο;','Έχει ξαναεπισκευαστεί και ξανανοίξει;','Υπάρχει μετατόπιση;','Υπάρχουν άλλες ρωγμές/παραμορφώσεις ή κουφώματα που κολλούν;','Υπάρχει νερό ή διάβρωση σκυροδέματος;'),
 jsonb_build_array('καταγραφή/παρακολούθηση όταν χρειάζεται','έλεγχος για μετατόπιση και συναφή συμπτώματα','έλεγχος υγρασίας','διάκριση επιφανειακού επιχρίσματος από πιθανό δομικό στοιχείο'),
 jsonb_build_array('επαγγελματική αξιολόγηση όταν υπάρχουν δείκτες κίνησης/δομικής αιτίας','μη δομική επισκευή μόνο αφού η ρωγμή χαρακτηριστεί σταθερή και κατάλληλη'),
 jsonb_build_array('απλό γέμισμα επαναλαμβανόμενης/κινούμενης ρωγμής χωρίς διάγνωση','ελαστικό coating ως υποκατάστατο δομικής αξιολόγησης'),
 jsonb_build_array('δεν ξεκινά επισκευή πριν περάσει το screening σταθερότητας'),
 jsonb_build_array('screening','professional assessment όταν ενεργοποιείται stop condition','επιλογή κατάλληλης μη δομικής επισκευής μόνο αν επιτρέπεται','προετοιμασία','repair system','finish'),
 jsonb_build_array('μόνο αν απαιτείται από το τεκμηριωμένο repair/finish system'),
 jsonb_build_array('repair/filler/reinforcement εξαρτώνται από τον χαρακτηρισμένο τύπο ρωγμής'),
 jsonb_build_array('τελικό coating μόνο μετά την ολοκλήρωση και ωρίμανση της επισκευής'),
 jsonb_build_array('δεν αποθηκεύεται καθολική repair layer sequence για άγνωστη ενεργή ρωγμή'),
 jsonb_build_array('reinforcement μόνο όπου τεκμηριώνεται'),
 jsonb_build_array('χρόνοι από repair products'),
 jsonb_build_array('νερό/υγρασία στη ρωγμή απαιτεί πρόσθετη διάγνωση'),
 jsonb_build_array('όρια προϊόντος'),
 jsonb_build_array('όρια προϊόντος'),
 jsonb_build_array('εξωτερικές επισκευές εξαρτώνται από καιρό'),
 jsonb_build_array('εξωτερικά finish προϊόν-ειδικό'),
 jsonb_build_array('εξωτερική προστασία από βροχή σύμφωνα με σύστημα'),
 jsonb_build_array(),
 jsonb_build_array('αερισμός για εσωτερικές εργασίες/σκόνη'),
 jsonb_build_array('repair material/filler/reinforcement must match substrate and expected movement; exact compatibility is manufacturer-specific'),
 jsonb_build_array('επανεμφάνιση ρωγμής','αποκόλληση repair patch','ρηγμάτωση τελικής βαφής'),
 jsonb_build_array('επισκευή χωρίς παρακολούθηση/διάγνωση','κάλυψη μετατόπισης με filler','αγνόηση συνοδών συμπτωμάτων'),
 jsonb_build_array('νέα/επεκτεινόμενη ρωγμή','μετατόπιση','πολλαπλές νέες ρωγμές','κόλλημα κουφωμάτων','πιθανή βλάβη σκυροδέματος'),
 jsonb_build_array('μετά την επισκευή ελέγχεται αν επανεμφανίζεται κίνηση ή ρηγμάτωση'),
 jsonb_build_array('παρακολούθηση και επανεκτίμηση αν η ρωγμή επανεμφανιστεί'),
 jsonb_build_array('προστασία ματιών/αναπνοής κατά προετοιμασία σκόνης και πρόσθετο PPE σύμφωνα με SDS'),
 jsonb_build_array('inspection_tools','scraper','filling_or_repair_tools','abrasive','dust_removal'),
 jsonb_build_array('floor_or_ground_protection','dust_control'),
 'verified','approved',true,now()
FROM public.build_solution_types st, public.build_problem_types pt
WHERE st.solution_key='wall_crack_repair' AND pt.problem_key='recurrent_or_large_crack'
ON CONFLICT (scenario_key) DO NOTHING;

-- Compact normalized rules for every new scenario.
INSERT INTO public.build_solution_rules
(scenario_id,rule_key,source_layer,rule_category,technical_rule,customer_explanation_el,short_explanation_el,evidence_strength,applicability,context_dependent,active)
SELECT p.id,x.rule_key,'GENERAL_GUIDANCE',x.category,x.technical,x.customer,x.short,x.strength,x.applicability::jsonb,x.context_dependent,true
FROM public.build_solution_profiles p
JOIN (VALUES
('paint_bathroom_high_humidity','diagnose_moisture_before_paint','diagnosis','Determine whether moisture is condensation/high indoor humidity or water ingress/leakage before selecting a coating.','Πρώτα ξεκαθαρίζουμε από πού έρχεται η υγρασία.','Διάγνωση πριν από βαφή.','strong_consensus','{}',true),
('paint_bathroom_high_humidity','dry_and_stable_before_finish','preparation','Decorative finishing proceeds only on a cleaned, stable and sufficiently dry substrate after the moisture source is controlled.','Η επιφάνεια καθαρίζεται, σταθεροποιείται και στεγνώνει πριν βαφτεί.','Σταθερή και στεγνή βάση.','strong_consensus','{}',false),
('paint_existing_peeling','remove_unsound_coating','preparation','Loose or peeling coating must be removed back to a sound edge/surface before recoating.','Τα ξεφλουδισμένα και σαθρά σημεία αφαιρούνται πριν τη νέα βαφή.','Αφαίρεσε ό,τι δεν κρατά.','common_professional_practice','{}',false),
('paint_existing_peeling','find_water_or_adhesion_cause','diagnosis','Check moisture, contamination, gloss and existing-coating adhesion/compatibility rather than treating peeling as an isolated cosmetic defect.','Ελέγχεται γιατί ξεφλούδισε πριν ξαναβαφτεί.','Βρες την αιτία της αποκόλλησης.','common_professional_practice','{}',true),
('waterproof_existing_system_maintenance','inspect_whole_system','inspection','Inspect membrane field, details, joints, penetrations, flashings, cappings and drainage before specifying local repair.','Η συντήρηση ξεκινά με έλεγχο όλου του συστήματος και των απορροών.','Έλεγχος όλου του συστήματος.','strong_consensus','{}',false),
('waterproof_existing_system_maintenance','compatibility_before_overlay','compatibility','An overlay or local repair must not be assumed compatible with an unidentified existing waterproofing system.','Δεν βάζουμε τυχαία νέο υλικό πάνω σε άγνωστη στεγάνωση.','Επιβεβαίωσε συμβατότητα.','strong_consensus','{}',true),
('waterproof_details_parapets_joints_penetrations','details_are_system_components','sequencing','Parapets, upstands, joints, penetrations and outlets are integral waterproofing details and must connect continuously with the selected system.','Οι λεπτομέρειες πρέπει να συνδέονται σωστά με το κύριο σύστημα στεγάνωσης.','Συνέχεια στις λεπτομέρειες.','strong_consensus','{}',false),
('waterproof_details_parapets_joints_penetrations','movement_requires_specific_detail','compatibility','Moving joints require a detail/system able to accommodate the expected movement; generic sealant selection is not universal.','Ένας κινούμενος αρμός χρειάζεται λύση κατάλληλη για την κίνησή του.','Ο αρμός θέλει σωστή λεπτομέρεια.','strong_consensus','{}',true),
('waterproof_basement_below_grade_moisture','diagnose_below_grade_water','diagnosis','Below-grade dampness requires source/risk evaluation including external water, drainage, services and condensation before waterproofing strategy selection.','Στο υπόγειο η πηγή νερού πρέπει να διερευνηθεί πριν επιλεγεί στεγάνωση.','Πρώτα πηγή και κίνδυνος νερού.','standard_based','{}',true),
('waterproof_basement_below_grade_moisture','no_decorative_fix_for_active_water','limitation','A decorative coating must not be represented as remediation for active below-grade water ingress.','Η διακοσμητική βαφή δεν είναι λύση για ενεργό νερό στο υπόγειο.','Όχι απλή βαφή σε ενεργό νερό.','strong_consensus','{}',false),
('insulation_thermal_bridge_condensation','symptom_not_proof','diagnosis','Cold spots, mould or condensation may be consistent with a thermal bridge but do not prove one cause without considering humidity, ventilation and other moisture sources.','Η μούχλα σε ψυχρό σημείο μπορεί να σχετίζεται με θερμογέφυρα, αλλά δεν το αποδεικνύει μόνη της.','Το σύμπτωμα δεν αποδεικνύει την αιτία.','standard_based','{}',true),
('insulation_thermal_bridge_condensation','assess_surface_condensation_risk','design','Where needed, assess internal surface temperature/critical humidity and junction heat flow rather than relying on appearance alone.','Σε σύνθετες περιπτώσεις χρειάζεται θερμικός/υγροθερμικός έλεγχος της λεπτομέρειας.','Έλεγχος θερμοκρασίας και υγρασίας.','standard_based','{}',true),
('insulation_roof_general','no_universal_layer_order','design','Do not prescribe one universal roof-insulation layer order; warm and inverted roof systems place insulation and waterproofing differently.','Δεν υπάρχει μία σωστή σειρά στρώσεων για κάθε ταράτσα.','Η σειρά στρώσεων εξαρτάται από το σύστημα.','strong_consensus','{}',false),
('insulation_roof_general','waterproofing_and_thermal_design_together','design','Roof thermal insulation, waterproofing, drainage, moisture control and details must be considered as one build-up.','Μόνωση, στεγάνωση, απορροές και λεπτομέρειες σχεδιάζονται μαζί.','Σχεδιασμός ως ενιαίο σύστημα.','standard_based','{}',true),
('repair_recurrent_or_large_wall_crack','screen_for_movement','diagnosis','Recurrent, expanding or displaced cracks require movement/structural screening before cosmetic repair.','Αν η ρωγμή μεγαλώνει ή ξανανοίγει, προηγείται έλεγχος πριν από στοκάρισμα.','Έλεγχος πριν από επισκευή.','strong_consensus','{}',true),
('repair_recurrent_or_large_wall_crack','repair_only_after_classification','sequencing','Select a non-structural repair method only after the crack has been classified as stable and suitable for that repair category.','Η επισκευή επιλέγεται αφού επιβεβαιωθεί ότι η ρωγμή είναι κατάλληλη για μη δομική αποκατάσταση.','Πρώτα χαρακτηρισμός, μετά υλικό.','strong_consensus','{}',true)
) AS x(scenario_key,rule_key,category,technical,customer,short,strength,applicability,context_dependent)
ON p.scenario_key=x.scenario_key
ON CONFLICT (scenario_id,rule_key) DO NOTHING;

-- Diagnostic questions / outcomes.
INSERT INTO public.build_diagnostic_rules
(scenario_id,diagnostic_key,source_layer,question_el,observable_indicators,condition_expression,
 possible_interpretations,uncertainty_flag,outcome,evidence_strength,active)
SELECT p.id,x.dkey,'GENERAL_GUIDANCE',x.question,x.indicators::jsonb,x.cond::jsonb,
 x.interpretations::jsonb,true,x.outcome::jsonb,x.strength,true
FROM public.build_solution_profiles p
JOIN (VALUES
('paint_bathroom_high_humidity','active_leak_check','Υπάρχει ενεργή διαρροή ή νερό που συνεχίζει να εμφανίζεται;','["τρέχον νερό","νέα υγρασία χωρίς χρήση μπάνιου"]','{"active_water_ingress":true}','["πιθανή διαρροή/εισροή","όχι απλή συμπύκνωση"]','{"set_fact":{"active_water_ingress":true}}','strong_consensus'),
('paint_bathroom_high_humidity','condensation_pattern','Η υγρασία εμφανίζεται κυρίως μετά από ντους και σε ψυχρές επιφάνειες;','["σταγονίδια","γωνίες/οροφή","σχέση με χρήση μπάνιου"]','{"bathroom_condensation_pattern":true}','["συμπύκνωση πιθανή","θερμογέφυρα/αερισμός μπορεί επίσης να συμβάλλει"]','{"recommend":"ventilation_and_moisture_assessment"}','strong_consensus'),
('paint_existing_peeling','moisture_behind_peeling','Υπάρχει υγρασία, λεκές ή πρόσφατη διαρροή πίσω από το ξεφλούδισμα;','["υγρή βάση","λεκές","φούσκωμα"]','{"significant_moisture":true}','["moisture-related adhesion failure possible"]','{"set_fact":{"source_known":false}}','common_professional_practice'),
('paint_existing_peeling','unknown_old_coating','Γνωρίζουμε τι επίστρωση υπάρχει και αν κρατά καλά;','["άγνωστο coating","γυαλιστερή/σκληρή επιφάνεια","εύκολη αποκόλληση"]','{"existing_coating_known_compatible":false}','["compatibility/adhesion uncertain"]','{"recommend":"adhesion_compatibility_check"}','common_professional_practice'),
('waterproof_existing_system_maintenance','local_or_widespread','Η βλάβη είναι σαφώς τοπική ή υπάρχουν πολλές περιοχές αστοχίας;','["πολλαπλές αποκολλήσεις","εκτεταμένες ρωγμές","γενικευμένη φθορά"]','{"waterproofing_failure":"widespread"}','["local repair may be inappropriate","system renewal assessment may be needed"]','{"recommend":"technical_assessment"}','strong_consensus'),
('waterproof_existing_system_maintenance','ponding_check','Μένει νερό μετά τη βροχή ή υπάρχουν προβλήματα απορροής;','["ponding","blocked outlets","poor falls suspected"]','{"standing_water":true}','["drainage/falls problem possible"]','{"set_fact":{"drainage_or_falls_assessed":false}}','strong_consensus'),
('waterproof_details_parapets_joints_penetrations','movement_detail','Πρόκειται για αρμό ή λεπτομέρεια που αναμένεται να κινείται;','["movement joint","recurrent split at same line"]','{"detail_movement":"unknown_or_significant"}','["movement-capable detail may be required"]','{"recommend":"system_detail_review"}','strong_consensus'),
('waterproof_details_parapets_joints_penetrations','substrate_stability','Είναι σταθερό το στηθαίο/υπόβαθρο γύρω από τη λεπτομέρεια;','["loose render","unstable capping","detached substrate"]','{"substrate_stable":false}','["waterproofing overlay not suitable until repaired"]','{"set_fact":{"substrate_stable":false}}','strong_consensus'),
('waterproof_basement_below_grade_moisture','rain_ground_pattern','Η υγρασία αυξάνεται μετά από βροχή ή εμφανίζεται από τοίχο/δάπεδο σε επαφή με έδαφος;','["rain correlation","wet wall-floor junction","ground-contact area"]','{"below_grade_external_water_possible":true}','["ground/surface-water ingress possible","does not exclude plumbing"]','{"recommend":"below_grade_water_risk_assessment"}','standard_based'),
('waterproof_basement_below_grade_moisture','condensation_or_leak','Υπάρχει υψηλή υγρασία αέρα, ψυχρή επιφάνεια ή πιθανή σωλήνωση κοντά;','["surface condensation","poor ventilation","nearby services"]','{"below_grade_source_uncertain":true}','["condensation possible","service leak possible","external water possible"]','{"set_fact":{"significant_moisture":true,"source_known":false}}','strong_consensus'),
('insulation_thermal_bridge_condensation','other_moisture_sources','Έχουν αποκλειστεί διαρροή, βροχή και άλλη σημαντική πηγή υγρασίας;','["water staining","rain correlation","service leak signs"]','{"source_known":false,"significant_moisture":true}','["thermal bridge cannot be assumed"]','{"recommend":"moisture_source_assessment"}','strong_consensus'),
('insulation_thermal_bridge_condensation','junction_pattern','Το ψυχρό/μουχλιασμένο σημείο συμπίπτει με γωνία, πλάκα, κολόνα ή άλλη ένωση;','["localized junction pattern","seasonal cold-weather recurrence"]','{"thermal_bridge_suspected":true}','["thermal bridge possible","calculation/inspection may be needed"]','{"recommend":"thermal_hygrothermal_assessment"}','standard_based'),
('insulation_roof_general','active_roof_leak','Υπάρχει ενεργή διαρροή ή βρεγμένο roof build-up;','["active drip","wet layers","recent ingress"]','{"active_water_ingress":true}','["insulation work should not conceal unresolved water"]','{"set_fact":{"active_water_ingress":true}}','strong_consensus'),
('insulation_roof_general','roof_type_known','Είναι γνωστή η υπάρχουσα διάταξη και ο τύπος συστήματος δώματος;','["drawings/inspection available","warm or inverted roof identified"]','{"roof_build_up_known":false}','["universal layer sequence unsafe"]','{"recommend":"roof_build_up_survey"}','strong_consensus'),
('repair_recurrent_or_large_wall_crack','progression_check','Μεγαλώνει, ξανανοίγει ή έχει μετατόπιση;','["expanding crack","recurrent crack","offset"]','{"crack_progressive_or_displaced":true}','["movement/structural cause possible"]','{"set_fact":{"crack_progressive_or_displaced":true}}','strong_consensus'),
('repair_recurrent_or_large_wall_crack','associated_movement_signs','Υπάρχουν νέα κολλήματα κουφωμάτων, κλίσεις ή πολλαπλές νέες ρωγμές;','["sticking doors/windows","new sloping","multiple expanding cracks"]','{"associated_movement_signs":true}','["building movement possible"]','{"recommend":"professional_assessment"}','strong_consensus')
) AS x(scenario_key,dkey,question,indicators,cond,interpretations,outcome,strength)
ON p.scenario_key=x.scenario_key
ON CONFLICT (scenario_id,diagnostic_key) DO NOTHING;

-- Ordered steps. Exact product application remains Layer B.
INSERT INTO public.build_solution_steps
(scenario_id,source_layer,step_number,step_type,required,conditional_expression,
 prerequisite_step_numbers,next_allowed_step_numbers,technical_rule,customer_explanation_el,evidence_strength,active)
SELECT p.id,'GENERAL_GUIDANCE',x.n,x.step_type,x.required,x.cond::jsonb,x.pre,x.next,
 x.technical,x.customer,x.strength,true
FROM public.build_solution_profiles p
JOIN (VALUES
('paint_bathroom_high_humidity',1,'diagnose_moisture',true,'{}','{}'::int[],'{2}'::int[],'Distinguish condensation/high humidity from active leakage or other moisture.','Έλεγξε πρώτα από πού έρχεται η υγρασία.','strong_consensus'),
('paint_bathroom_high_humidity',2,'control_source_and_ventilation',true,'{}','{1}'::int[],'{3}'::int[],'Control the moisture source and provide appropriate ventilation before decorative work.','Διόρθωσε την αιτία και τον αερισμό πριν τη βαφή.','strong_consensus'),
('paint_bathroom_high_humidity',3,'clean_repair_dry',true,'{}','{2}'::int[],'{4}'::int[],'Clean/remediate affected surface, remove unsound coating, repair and allow to dry.','Καθάρισε, αφαίρεσε τα σαθρά, επισκεύασε και άφησε να στεγνώσει.','strong_consensus'),
('paint_bathroom_high_humidity',4,'apply_verified_paint_system',true,'{}','{3}'::int[],'{5}'::int[],'Use the selected verified manufacturer preparation/primer/finish instructions.','Εφάρμοσε το επιλεγμένο σύστημα ακριβώς όπως ορίζει ο κατασκευαστής.','strong_consensus'),
('paint_bathroom_high_humidity',5,'inspect',true,'{}','{4}'::int[],'{}'::int[],'Inspect for adhesion and recurrence of moisture/mould after drying.','Έλεγξε την πρόσφυση και αν επανέρχεται υγρασία ή μούχλα.','strong_consensus'),

('paint_existing_peeling',1,'diagnose_failure',true,'{}','{}'::int[],'{2}'::int[],'Check moisture, contamination and existing-coating adhesion/compatibility.','Έλεγξε γιατί ξεφλούδισε η παλιά βαφή.','common_professional_practice'),
('paint_existing_peeling',2,'remove_unsound_coating',true,'{}','{1}'::int[],'{3}'::int[],'Remove loose/peeling coating to a sound edge/surface.','Αφαίρεσε ό,τι ξεφλουδίζει ή δεν κρατά.','common_professional_practice'),
('paint_existing_peeling',3,'clean_repair_dry',true,'{}','{2}'::int[],'{4}'::int[],'Clean, repair, smooth as appropriate and dry the substrate.','Καθάρισε, επισκεύασε και άφησε τη βάση να στεγνώσει.','common_professional_practice'),
('paint_existing_peeling',4,'compatibility_or_test',true,'{}','{3}'::int[],'{5}'::int[],'Confirm compatibility/adhesion where the existing coating is uncertain.','Αν δεν γνωρίζεις την παλιά βαφή, έλεγξε συμβατότητα/πρόσφυση.','common_professional_practice'),
('paint_existing_peeling',5,'apply_verified_paint_system',true,'{}','{4}'::int[],'{6}'::int[],'Apply exact primer/coats/recoat times only from verified manufacturer guidance.','Ακολούθησε τις επαληθευμένες οδηγίες του επιλεγμένου προϊόντος.','common_professional_practice'),
('paint_existing_peeling',6,'inspect',true,'{}','{5}'::int[],'{}'::int[],'Inspect repaired boundaries and coating adhesion after cure.','Έλεγξε αν η νέα βαφή κρατά σωστά στα όρια της επισκευής.','common_professional_practice'),

('waterproof_existing_system_maintenance',1,'inspect_system',true,'{}','{}'::int[],'{2}'::int[],'Inspect membrane, details, joints, penetrations, flashings, cappings and outlets.','Έλεγξε μεμβράνη, αρμούς, διελεύσεις, στηθαία και απορροές.','strong_consensus'),
('waterproof_existing_system_maintenance',2,'diagnose_damage_and_drainage',true,'{}','{1}'::int[],'{3}'::int[],'Determine whether damage is local, widespread, moisture-related or drainage/falls-related.','Ξεχώρισε αν είναι τοπική βλάβη ή γενικότερο πρόβλημα στεγάνωσης/απορροής.','strong_consensus'),
('waterproof_existing_system_maintenance',3,'identify_compatibility',true,'{}','{2}'::int[],'{4}'::int[],'Identify the existing system sufficiently to select a compatible repair or escalate.','Επιβεβαίωσε τι σύστημα υπάρχει πριν προστεθεί νέο υλικό.','strong_consensus'),
('waterproof_existing_system_maintenance',4,'prepare_and_repair',true,'{}','{3}'::int[],'{5}'::int[],'Clean, prepare and repair substrate/details as required by the compatible system.','Καθάρισε και προετοίμασε τη βάση και τις λεπτομέρειες σύμφωνα με το συμβατό σύστημα.','strong_consensus'),
('waterproof_existing_system_maintenance',5,'apply_verified_system',true,'{}','{4}'::int[],'{6}'::int[],'Apply exact waterproofing layers, reinforcement, rates and curing only from the selected system documentation.','Εφάρμοσε τις ακριβείς στρώσεις και χρόνους μόνο από το τεκμηριωμένο σύστημα.','strong_consensus'),
('waterproof_existing_system_maintenance',6,'inspect_and_maintain',true,'{}','{5}'::int[],'{}'::int[],'Inspect finished work and keep outlets/details under periodic maintenance.','Έλεγξε την επισκευή και συνέχισε περιοδική συντήρηση απορροών και λεπτομερειών.','strong_consensus'),

('waterproof_details_parapets_joints_penetrations',1,'inspect_detail',true,'{}','{}'::int[],'{2}'::int[],'Inspect the detail, adjacent waterproofing, substrate stability and evidence of movement.','Έλεγξε τη λεπτομέρεια, τη γύρω στεγάνωση και αν υπάρχει κίνηση.','strong_consensus'),
('waterproof_details_parapets_joints_penetrations',2,'classify_detail',true,'{}','{1}'::int[],'{3}'::int[],'Classify as upstand/parapet/joint/penetration/outlet and determine system-specific detailing needs.','Καθόρισε τι είδους λεπτομέρεια είναι και τι απαιτεί το σύστημα.','strong_consensus'),
('waterproof_details_parapets_joints_penetrations',3,'repair_substrate',true,'{}','{2}'::int[],'{4}'::int[],'Repair unstable or defective construction before waterproofing treatment.','Επισκεύασε πρώτα ασταθή ή κατεστραμμένα σημεία.','strong_consensus'),
('waterproof_details_parapets_joints_penetrations',4,'execute_system_detail',true,'{}','{3}'::int[],'{5}'::int[],'Execute reinforcement, termination, sealant or membrane detail exactly as the verified system requires.','Κάνε την ενίσχυση/τερματισμό όπως ακριβώς προβλέπει το τεκμηριωμένο σύστημα.','strong_consensus'),
('waterproof_details_parapets_joints_penetrations',5,'inspect_detail',true,'{}','{4}'::int[],'{}'::int[],'Inspect continuity and the finished detail after curing.','Έλεγξε τη συνέχεια και το τελικό αποτέλεσμα μετά την ωρίμανση.','strong_consensus'),

('waterproof_basement_below_grade_moisture',1,'diagnose_moisture_mechanism',true,'{}','{}'::int[],'{2}'::int[],'Differentiate external ground/surface water, service leakage and condensation as far as reasonably possible.','Διερεύνησε αν το νερό έρχεται από έδαφος/βροχή, σωλήνωση ή συμπύκνωση.','standard_based'),
('waterproof_basement_below_grade_moisture',2,'assess_water_risk_and_structure',true,'{}','{1}'::int[],'{3}'::int[],'Assess below-grade water risk, drainage and construction before choosing waterproofing strategy.','Αξιολόγησε τον κίνδυνο νερού, την αποστράγγιση και την κατασκευή.','standard_based'),
('waterproof_basement_below_grade_moisture',3,'select_designed_strategy',true,'{}','{2}'::int[],'{4}'::int[],'Select an appropriate designed protection strategy; do not default to an interior decorative coating.','Επίλεξε τεχνικά σχεδιασμένη λύση και όχι απλή εσωτερική βαφή.','standard_based'),
('waterproof_basement_below_grade_moisture',4,'prepare_and_execute_verified_system',true,'{}','{3}'::int[],'{5}'::int[],'Prepare and execute the chosen system using its verified project/manufacturer instructions.','Προετοίμασε και εφάρμοσε το επιλεγμένο σύστημα με τις τεκμηριωμένες οδηγίες του.','standard_based'),
('waterproof_basement_below_grade_moisture',5,'monitor',true,'{}','{4}'::int[],'{}'::int[],'Monitor after wet weather/use for recurrence and drainage performance.','Παρακολούθησε την περιοχή για επανεμφάνιση μετά από βροχές ή χρήση.','strong_consensus'),

('insulation_thermal_bridge_condensation',1,'exclude_other_moisture',true,'{}','{}'::int[],'{2}'::int[],'Exclude or flag other significant moisture sources before attributing the symptom to a thermal bridge.','Απέκλεισε πρώτα διαρροές και άλλες πηγές υγρασίας.','strong_consensus'),
('insulation_thermal_bridge_condensation',2,'assess_junction_and_indoor_conditions',true,'{}','{1}'::int[],'{3}'::int[],'Assess the junction pattern plus indoor humidity/ventilation and, where needed, hygrothermal risk.','Έλεγξε τη λεπτομέρεια μαζί με υγρασία και αερισμό του χώρου.','standard_based'),
('insulation_thermal_bridge_condensation',3,'design_continuous_solution',true,'{}','{2}'::int[],'{4}'::int[],'Design an insulation/detail solution that improves continuity without creating unmanaged condensation risk.','Σχεδίασε συνέχεια μόνωσης χωρίς να μεταφερθεί το πρόβλημα συμπύκνωσης μέσα στη δομή.','standard_based'),
('insulation_thermal_bridge_condensation',4,'install_verified_system',true,'{}','{3}'::int[],'{5}'::int[],'Install only a documented compatible insulation system/detail.','Εγκατέστησε τεκμηριωμένο και συμβατό σύστημα.','strong_consensus'),
('insulation_thermal_bridge_condensation',5,'inspect_conditions',true,'{}','{4}'::int[],'{}'::int[],'Inspect for recurrence of surface condensation/mould and finish defects.','Έλεγξε αν επανεμφανίζεται συμπύκνωση ή μούχλα.','standard_based'),

('insulation_roof_general',1,'survey_roof_build_up',true,'{}','{}'::int[],'{2}'::int[],'Identify existing roof build-up, use, waterproofing condition, drainage and access.','Κατέγραψε την υπάρχουσα κατασκευή, τη στεγάνωση, τις απορροές και την πρόσβαση.','strong_consensus'),
('insulation_roof_general',2,'resolve_water_and_safety',true,'{}','{1}'::int[],'{3}'::int[],'Resolve active leakage/unsafe access and assess wet layers before adding insulation.','Μην καλύψεις ενεργή διαρροή ή υγρές στρώσεις με νέα μόνωση.','strong_consensus'),
('insulation_roof_general',3,'thermal_hygrothermal_design',true,'{}','{2}'::int[],'{4}'::int[],'Determine thermal performance and moisture-control needs for the actual roof build-up.','Καθόρισε τη θερμική και υγροθερμική λύση για τη συγκεκριμένη ταράτσα.','standard_based'),
('insulation_roof_general',4,'select_roof_system_type',true,'{}','{3}'::int[],'{5}'::int[],'Select an appropriate roof-system build-up; do not merge warm/inverted layer orders.','Επίλεξε συγκεκριμένο τύπο συστήματος χωρίς να αναμειγνύεις αυθαίρετα τις στρώσεις.','strong_consensus'),
('insulation_roof_general',5,'install_verified_build_up',true,'{}','{4}'::int[],'{6}'::int[],'Install the documented compatible system including details and drainage provisions.','Εφάρμοσε το τεκμηριωμένο σύστημα μαζί με τις λεπτομέρειες και τις απορροές.','strong_consensus'),
('insulation_roof_general',6,'inspect',true,'{}','{5}'::int[],'{}'::int[],'Inspect waterproofing, details, outlets, stability and protection layers.','Έλεγξε στεγάνωση, λεπτομέρειες, απορροές και προστατευτικές στρώσεις.','strong_consensus'),

('repair_recurrent_or_large_wall_crack',1,'screen_crack',true,'{}','{}'::int[],'{2}'::int[],'Screen for progression, recurrence, displacement and associated movement signs.','Έλεγξε αν η ρωγμή μεγαλώνει, επανέρχεται ή έχει μετατόπιση.','strong_consensus'),
('repair_recurrent_or_large_wall_crack',2,'escalate_if_movement',true,'{}','{1}'::int[],'{3}'::int[],'Obtain professional assessment when movement/structural indicators or significant uncertainty are present.','Ζήτησε τεχνική αξιολόγηση αν υπάρχουν ενδείξεις κίνησης ή αβεβαιότητα.','strong_consensus'),
('repair_recurrent_or_large_wall_crack',3,'classify_non_structural_path',true,'{}','{2}'::int[],'{4}'::int[],'Only after screening, classify whether a non-structural repair path is appropriate.','Μόνο μετά τον έλεγχο αποφασίζεται αν είναι κατάλληλη μια μη δομική επισκευή.','strong_consensus'),
('repair_recurrent_or_large_wall_crack',4,'prepare_and_repair',true,'{}','{3}'::int[],'{5}'::int[],'Prepare and repair using a material/system documented for the substrate and expected movement.','Επισκεύασε με σύστημα κατάλληλο για τη βάση και την αναμενόμενη κίνηση.','strong_consensus'),
('repair_recurrent_or_large_wall_crack',5,'inspect_and_monitor',true,'{}','{4}'::int[],'{}'::int[],'Inspect and monitor for recurrence after repair.','Παρακολούθησε αν η ρωγμή επανεμφανίζεται.','strong_consensus')
) AS x(scenario_key,n,step_type,required,cond,pre,next,technical,customer,strength)
ON p.scenario_key=x.scenario_key
ON CONFLICT (scenario_id,step_number) DO NOTHING;

-- Scenario-specific Layer C stop/escalation rules; global stops remain active too.
INSERT INTO public.build_stop_conditions
(scenario_id,stop_key,source_layer,severity,condition_expression,reason_el,next_action_el,
 professional_assessment_required,evidence_basis,active)
SELECT p.id,x.stop_key,'KONTA_MOU_RULE',x.severity,x.cond::jsonb,x.reason,x.next_action,x.pro,x.basis,true
FROM public.build_solution_profiles p
JOIN (VALUES
('paint_bathroom_high_humidity','bathroom_active_or_uncertain_moisture','BLOCK','{"significant_moisture":true,"source_known":false}','Η σημαντική υγρασία δεν έχει ακόμη σαφή αιτία.','Διερεύνησε την πηγή υγρασίας πριν από διακοσμητική βαφή.',true,'WHO/RICS moisture-control principle plus KONTA MOU governance'),
('paint_existing_peeling','peeling_over_active_moisture','BLOCK','{"active_water_ingress":true}','Υπάρχει ενεργό νερό πίσω ή κοντά στην αποκόλληση.','Διόρθωσε και επιβεβαίωσε την πηγή νερού πριν από επαναβαφή.',true,'Surface-preparation/moisture guidance plus KONTA MOU governance'),
('waterproof_existing_system_maintenance','unknown_waterproofing_incompatible','BLOCK','{"existing_waterproofing_compatible":false}','Η συμβατότητα της νέας επισκευής με την υπάρχουσα στεγάνωση δεν είναι τεκμηριωμένη.','Ταυτοποίησε το σύστημα ή ζήτησε τεχνική επιβεβαίωση συμβατότητας.',true,'LRWA refurbishment/compatibility guidance plus KONTA MOU governance'),
('waterproof_details_parapets_joints_penetrations','moving_detail_not_designed','BLOCK','{"detail_movement":"unknown_or_significant"}','Η λεπτομέρεια μπορεί να κινείται και δεν έχει επιλεγεί κατάλληλος τεκμηριωμένος τρόπος διαμόρφωσης.','Απαιτείται τεχνική επιλογή detail/system πριν από εφαρμογή.',true,'LRWA detailing guidance plus KONTA MOU governance'),
('waterproof_basement_below_grade_moisture','below_grade_source_uncertain','BLOCK','{"significant_moisture":true,"source_known":false}','Η πηγή σημαντικής υγρασίας σε χώρο κάτω από το έδαφος δεν έχει εξακριβωθεί.','Απαιτείται τεχνική διερεύνηση νερού/αποστράγγισης/κατασκευής πριν από επιλογή συστήματος.',true,'BS 8102 risk/site-evaluation principle plus KONTA MOU governance'),
('insulation_thermal_bridge_condensation','thermal_bridge_unconfirmed_with_moisture','BLOCK','{"thermal_bridge_suspected":true,"source_known":false,"significant_moisture":true}','Υπάρχει σημαντική υγρασία αλλά η αιτία δεν έχει αποσαφηνιστεί.','Έλεγξε πρώτα άλλες πηγές υγρασίας και την υγροθερμική συμπεριφορά.',true,'T.O.T.E.E./ISO 13788 diagnostic limits plus KONTA MOU governance'),
('insulation_roof_general','roof_build_up_unknown','BLOCK','{"roof_build_up_known":false}','Η υπάρχουσα διάταξη στρώσεων του δώματος είναι άγνωστη.','Κατέγραψε/επιβεβαίωσε το roof build-up πριν επιλεγεί νέα μόνωση.',true,'Roof-system differences plus KONTA MOU governance'),
('repair_recurrent_or_large_wall_crack','associated_movement_requires_assessment','BLOCK','{"associated_movement_signs":true}','Υπάρχουν συνοδά σημάδια πιθανής κίνησης του κτιρίου.','Ζήτησε επαγγελματική αξιολόγηση πριν από επισκευή της ρωγμής.',true,'RICS crack/movement screening plus KONTA MOU governance')
) AS x(scenario_key,stop_key,severity,cond,reason,next_action,pro,basis)
ON p.scenario_key=x.scenario_key
ON CONFLICT (scenario_id,stop_key) DO NOTHING;

-- Failure modes.
INSERT INTO public.build_failure_modes
(scenario_id,source_layer,failure_key,title_el,possible_causes,preventive_actions,
 observable_symptoms,severity,corrective_action_category,evidence_strength,active)
SELECT p.id,'GENERAL_GUIDANCE',x.fkey,x.title,x.causes::jsonb,x.preventive::jsonb,
 x.symptoms::jsonb,x.severity,x.corrective,x.strength,true
FROM public.build_solution_profiles p
JOIN (VALUES
('paint_bathroom_high_humidity','mould_recurrence','Επανεμφάνιση μούχλας','["ανεπίλυτη υγρασία","ανεπαρκής αερισμός","ψυχρή επιφάνεια"]','["έλεγχος πηγής υγρασίας","λειτουργικός αερισμός","στέγνωμα πριν από coating"]','["νέα μαύρα/πράσινα σημεία","οσμή υγρασίας"]','medium','moisture_diagnosis','strong_consensus'),
('paint_existing_peeling','recurrent_peeling','Νέο ξεφλούδισμα','["υγρασία","ανεπαρκής αφαίρεση σαθρού coating","ασυμβατότητα","ρύποι"]','["σταθερή καθαρή στεγνή βάση","compatibility/adhesion check"]','["σηκωμένες άκρες","φλούδες","φουσκάλες"]','medium','surface_preparation_and_diagnosis','common_professional_practice'),
('waterproof_existing_system_maintenance','repair_delamination','Αποκόλληση τοπικής επισκευής','["ασυμβατότητα","υγρό/βρώμικο υπόστρωμα","λανθασμένη προετοιμασία"]','["ταυτοποίηση συστήματος","προετοιμασία και εφαρμογή σύμφωνα με σύστημα"]','["ξεφλούδισμα/φούσκα στη νέα επισκευή"]','high','waterproofing_system_review','strong_consensus'),
('waterproof_details_parapets_joints_penetrations','detail_leak_recurrence','Επανεμφάνιση διαρροής στη λεπτομέρεια','["ασυνέχεια membrane","μη αντιμετωπισμένη κίνηση","αστοχία flashing/termination"]','["system-specific detail","continuity inspection"]','["υγρασία δίπλα σε αρμό/διέλευση","άνοιγμα/σχίσιμο"]','high','detail_redesign_or_repair','strong_consensus'),
('waterproof_basement_below_grade_moisture','below_grade_water_recurrence','Επανεμφάνιση νερού/υγρασίας','["λάθος διάγνωση πηγής","ανεπαρκής στρατηγική νερού/αποστράγγισης","ενεργή διαρροή"]','["site/water risk assessment","designed system"]','["νέες υγρές κηλίδες","νερό σε αρμούς","αποκόλληση finish"]','high','professional_waterproofing_assessment','standard_based'),
('insulation_thermal_bridge_condensation','condensation_shift_or_recurrence','Επιμονή ή μετατόπιση συμπύκνωσης','["ασυνέχεια μόνωσης","υψηλή εσωτερική υγρασία","μη ελεγχόμενη υγροθερμική συμπεριφορά"]','["junction design","humidity/ventilation control","hygrothermal assessment where needed"]','["νέα συμπύκνωση","μούχλα σε διπλανή ζώνη"]','high','thermal_hygrothermal_review','standard_based'),
('insulation_roof_general','roof_build_up_moisture_failure','Υγρασία μέσα στη διάταξη δώματος','["ενεργή διαρροή","λάθος layer order","ανεπαρκής moisture control","ασυμβατό build-up"]','["survey","system-specific design","waterproofing integrity"]','["υγρασία","φούσκωμα","θερμική υποβάθμιση"]','high','roof_system_review','strong_consensus'),
('repair_recurrent_or_large_wall_crack','crack_reopens','Η ρωγμή ξανανοίγει','["ενεργή κίνηση","λάθος χαρακτηρισμός","repair material not suited to movement"]','["movement screening","appropriate repair category"]','["νέα ρωγμή στην ίδια γραμμή","μετατόπιση patch"]','high','professional_reassessment','strong_consensus')
) AS x(scenario_key,fkey,title,causes,preventive,symptoms,severity,corrective,strength)
ON p.scenario_key=x.scenario_key
ON CONFLICT (scenario_id,failure_key) DO NOTHING;

-- Tool and project-kit requirement categories.
INSERT INTO public.build_tool_requirements
(scenario_id,source_layer,tool_category,requirement_level,reason_el,condition_expression,active)
SELECT p.id,'GENERAL_GUIDANCE',x.tool,x.level,x.reason,x.cond::jsonb,true
FROM public.build_solution_profiles p
JOIN (VALUES
('paint_bathroom_high_humidity','surface_preparation_tools','required','Για καθαρισμό και αφαίρεση σαθρής βαφής.','{}'),
('paint_bathroom_high_humidity','roller_or_brush','conditional','Μόνο για το επιλεγμένο coating και σύμφωνα με τις επιτρεπόμενες μεθόδους εφαρμογής.','{}'),
('paint_bathroom_high_humidity','ventilation_and_ppe','required','Για ελεγχόμενη εργασία και αερισμό σύμφωνα με τον κίνδυνο/SDS.','{}'),
('paint_existing_peeling','scraper_and_abrasive','required','Για αφαίρεση ασταθούς coating και εξομάλυνση.','{}'),
('paint_existing_peeling','dust_removal','required','Για καθαρή βάση πριν από coating.','{}'),
('paint_existing_peeling','application_tools','conditional','Ανάλογα με το επιλεγμένο προϊόν.','{}'),
('waterproof_existing_system_maintenance','inspection_and_cleaning_tools','required','Για έλεγχο και καθαρισμό μεμβράνης/λεπτομερειών/απορροών.','{}'),
('waterproof_existing_system_maintenance','waterproofing_application_tools','conditional','Μόνο όσα επιτρέπει το επιλεγμένο σύστημα.','{}'),
('waterproof_existing_system_maintenance','fall_protection','conditional','Όταν η εργασία έχει κίνδυνο πτώσης.','{"work_at_height":true}'),
('waterproof_details_parapets_joints_penetrations','detail_preparation_tools','required','Για καθαρισμό/προετοιμασία της λεπτομέρειας.','{}'),
('waterproof_details_parapets_joints_penetrations','system_application_tools','conditional','Σύμφωνα με την τεκμηρίωση του επιλεγμένου συστήματος.','{}'),
('waterproof_details_parapets_joints_penetrations','fall_protection','conditional','Όταν η λεπτομέρεια βρίσκεται σε ύψος.','{"work_at_height":true}'),
('waterproof_basement_below_grade_moisture','inspection_and_moisture_assessment_tools','required','Για τεκμηρίωση του μοτίβου υγρασίας πριν από σύστημα.','{}'),
('waterproof_basement_below_grade_moisture','surface_preparation_tools','conditional','Μετά την επιλογή σχεδιασμένης λύσης.','{}'),
('waterproof_basement_below_grade_moisture','application_tools','conditional','Καθορίζονται από το επιλεγμένο σύστημα.','{}'),
('insulation_thermal_bridge_condensation','measurement_and_inspection_tools','required','Για καταγραφή συνθηκών και junction.','{}'),
('insulation_thermal_bridge_condensation','insulation_installation_tools','conditional','Μόνο μετά από επιλογή συστήματος.','{}'),
('insulation_thermal_bridge_condensation','dust_control_ppe','required','Για κοπή/προετοιμασία όπου παράγεται σκόνη.','{}'),
('insulation_roof_general','roof_survey_tools','required','Για αποτύπωση build-up, details και outlets.','{}'),
('insulation_roof_general','insulation_installation_tools','conditional','Ανάλογα με το τεκμηριωμένο system build-up.','{}'),
('insulation_roof_general','fall_protection','conditional','Για εργασία σε ύψος/δώμα όπου υπάρχει σχετικός κίνδυνος.','{"work_at_height":true}'),
('repair_recurrent_or_large_wall_crack','inspection_tools','required','Για παρακολούθηση/καταγραφή πριν την επισκευή.','{}'),
('repair_recurrent_or_large_wall_crack','repair_tools','conditional','Μόνο αφού επιτραπεί μη δομική repair path.','{}'),
('repair_recurrent_or_large_wall_crack','dust_control_ppe','required','Για ασφαλή προετοιμασία.','{}')
) AS x(scenario_key,tool,level,reason,cond)
ON p.scenario_key=x.scenario_key
ON CONFLICT (scenario_id,tool_category) DO NOTHING;

INSERT INTO public.build_project_kit_requirements
(scenario_id,source_layer,requirement_type,requirement_level,reason_el,quantity_basis,
 compatibility_constraints,customer_can_replace,condition_expression,active)
SELECT p.id,'GENERAL_GUIDANCE',x.req,x.level,x.reason,x.qty,x.compat::jsonb,x.replaceable,x.cond::jsonb,true
FROM public.build_solution_profiles p
JOIN (VALUES
('paint_bathroom_high_humidity','main_coating','required','Τελική επίστρωση μετά την επίλυση υγρασίας.','manufacturer_declared_coverage_and_coats','["substrate","interior_high_humidity_use","manufacturer_verified"]',true,'{}'),
('paint_bathroom_high_humidity','primer','conditional','Μόνο αν απαιτείται από τη βάση/επιλεγμένο σύστημα.','manufacturer_declared_consumption','["compatible_with_substrate_and_topcoat"]',true,'{}'),
('paint_bathroom_high_humidity','cleaner_or_mould_remediation','conditional','Για καθαρισμό/αποκατάσταση πριν από βαφή.','affected_area_and_method','["appropriate_for_surface_and_hazard"]',true,'{}'),
('paint_bathroom_high_humidity','ppe','required','PPE ανά κίνδυνο και SDS.','task_based','["selected_product_sds"]',true,'{}'),
('paint_existing_peeling','main_coating','required','Νέα τελική επίστρωση μόνο μετά από σωστή προετοιμασία.','manufacturer_declared_coverage_and_coats','["existing_coating_compatibility","substrate","manufacturer_verified"]',true,'{}'),
('paint_existing_peeling','primer','conditional','Μόνο όταν τεκμηριώνεται ανάγκη πρόσφυσης/σφράγισης.','manufacturer_declared_consumption','["compatible_with_existing_surface_and_topcoat"]',true,'{}'),
('paint_existing_peeling','repair_filler','conditional','Για τοπική εξομάλυνση μετά την αφαίρεση αστάθειας.','repair_area_volume_or_manufacturer_consumption','["non_structural","substrate_compatible"]',true,'{}'),
('paint_existing_peeling','surface_protection','required','Προστασία από ξύσιμο/σκόνη/βαφή.','work_area_based','[]',true,'{}'),
('waterproof_existing_system_maintenance','waterproofing_repair_system','conditional','Μόνο όταν το υπάρχον σύστημα και η συμβατότητα έχουν επιβεβαιωθεί.','manufacturer_declared_consumption_and_detail_area','["existing_system_compatible","manufacturer_verified"]',false,'{}'),
('waterproof_existing_system_maintenance','detail_material','conditional','Για joints/penetrations/upstands μόνο όπως ορίζει το σύστημα.','detail_length_or_area','["same_or_documented_compatible_system"]',false,'{}'),
('waterproof_existing_system_maintenance','cleaning_preparation_material','required','Για σωστή προετοιμασία της υπάρχουσας επιφάνειας.','surface_condition_based','["compatible_with_existing_membrane"]',true,'{}'),
('waterproof_existing_system_maintenance','ppe_and_access_protection','required','Ασφάλεια εργασίας/πρόσβασης.','task_based','[]',true,'{}'),
('waterproof_details_parapets_joints_penetrations','waterproofing_detail_system','required','Η λεπτομέρεια πρέπει να ανήκει σε τεκμηριωμένο waterproofing system.','detail_area_length_and_manufacturer_consumption','["main_system_compatible","movement_requirement","manufacturer_verified"]',false,'{}'),
('waterproof_details_parapets_joints_penetrations','reinforcement','conditional','Όπου το ορίζει το επιλεγμένο detail.','detail_length_or_area','["system_specific"]',false,'{}'),
('waterproof_details_parapets_joints_penetrations','sealant_or_flashing_component','conditional','Ανάλογα με τον τύπο λεπτομέρειας και την κίνηση.','detail_geometry','["system_specific","movement_compatible"]',false,'{}'),
('waterproof_details_parapets_joints_penetrations','ppe_and_access_protection','required','Ασφάλεια εφαρμογής και πρόσβασης.','task_based','[]',true,'{}'),
('waterproof_basement_below_grade_moisture','waterproofing_system','conditional','Μόνο μετά από σχεδιασμό για τον πραγματικό μηχανισμό νερού.','project_design_and_manufacturer_consumption','["below_grade_design","water_pressure_or_drainage_conditions","manufacturer_verified"]',false,'{}'),
('waterproof_basement_below_grade_moisture','drainage_or_cavity_components','conditional','Όπου τα απαιτεί η επιλεγμένη στρατηγική.','project_design','["designed_system"]',false,'{}'),
('waterproof_basement_below_grade_moisture','repair_material','conditional','Για σταθεροποίηση κατάλληλης βάσης πριν το σύστημα.','repair_extent','["substrate_compatible"]',true,'{}'),
('waterproof_basement_below_grade_moisture','professional_assessment','conditional','Για σημαντική/άγνωστη/ενεργή υγρασία.','case_based','[]',false,'{"significant_moisture":true}'),
('insulation_thermal_bridge_condensation','insulation_system','conditional','Μετά από τεχνικό σχεδιασμό junction και moisture risk.','thermal_design','["system_compatible","junction_continuity","hygrothermal_risk_checked"]',false,'{}'),
('insulation_thermal_bridge_condensation','air_or_vapour_control_component','conditional','Μόνο όταν προκύπτει από τον σχεδιασμό.','project_design','["system_specific"]',false,'{}'),
('insulation_thermal_bridge_condensation','finish_system','conditional','Συμβατό με το επιλεγμένο insulation system.','manufacturer_declared_consumption','["system_specific"]',true,'{}'),
('insulation_thermal_bridge_condensation','professional_assessment','conditional','Όταν η αιτία υγρασίας ή το junction είναι σύνθετο.','case_based','[]',false,'{}'),
('insulation_roof_general','roof_insulation_system','required','Η μόνωση επιλέγεται ως μέρος συγκεκριμένου roof build-up.','thermal_design_and_package_geometry','["roof_system_type","thermal_requirement","manufacturer_verified"]',false,'{}'),
('insulation_roof_general','waterproofing_system','required','Στεγάνωση και μόνωση συντονίζονται στο ίδιο build-up.','manufacturer_declared_consumption','["roof_system_compatible"]',false,'{}'),
('insulation_roof_general','vapour_or_water_flow_control_layer','conditional','Μόνο όταν προβλέπεται από τον συγκεκριμένο τύπο roof system.','roof_area_and_system_design','["system_specific"]',false,'{}'),
('insulation_roof_general','protection_or_ballast_layer','conditional','Ανάλογα με inverted/warm roof και χρήση.','roof_area_and_system_design','["system_specific","structural_load_checked"]',false,'{}'),
('repair_recurrent_or_large_wall_crack','professional_assessment','conditional','Για recurring/progressive/displaced cracks ή συναφή συμπτώματα.','case_based','[]',false,'{}'),
('repair_recurrent_or_large_wall_crack','repair_material','conditional','Μόνο αφού χαρακτηριστεί ως μη δομική, σταθερή επισκευή.','crack_geometry_and_manufacturer_consumption','["substrate","movement_capability","manufacturer_verified"]',true,'{}'),
('repair_recurrent_or_large_wall_crack','reinforcement','conditional','Όπου τεκμηριώνεται για το repair system.','repair_length_or_area','["system_specific"]',true,'{}'),
('repair_recurrent_or_large_wall_crack','finish_coating','conditional','Μετά την ολοκλήρωση/ωρίμανση επισκευής.','manufacturer_declared_coverage_and_coats','["repair_compatible","manufacturer_verified"]',true,'{}')
) AS x(scenario_key,req,level,reason,qty,compat,replaceable,cond)
ON p.scenario_key=x.scenario_key
ON CONFLICT (scenario_id,requirement_type) DO NOTHING;

-- Evidence: each active entity introduced by this migration receives at least one
-- external technical source. Layer C stop conditions also receive internal
-- governance evidence separately.
WITH scenario_source(scenario_key,source_key,evidence_strength,passage,section,applicability) AS (
 VALUES
 ('paint_bathroom_high_humidity','who_damp_mould_2009','strong_consensus','Persistent dampness and microbial growth are fundamentally moisture-control problems; prevention/minimisation of persistent dampness is central.','Overview / executive guidance','General indoor damp/mould and moisture-control principle; not a coating instruction.'),
 ('paint_existing_peeling','sherwin_peeling_general','common_professional_practice','Peeling is an adhesion failure that can be associated with moisture, dirty/wet/glossy surfaces or marginal adhesion; loose/failed coating must be dealt with before repainting.','Description, possible causes and solution','General coating-failure practice only; product recommendations are excluded.'),
 ('waterproof_existing_system_maintenance','lrwa_design_guide_specifiers_2020','strong_consensus','Waterproofing maintenance/inspection considers membrane condition, details, flashings, joints, penetrations, outlets and drainage; local repair must restore a compatible system.','Sections 5.5 and 6','General liquid-waterproofing inspection/maintenance practice; UK regulatory references excluded.'),
 ('waterproof_details_parapets_joints_penetrations','lrwa_design_guide_specifiers_2020','strong_consensus','Waterproofing performance depends on correctly executed details such as upstands, joints, penetrations, flashings and outlets; detail treatment belongs to the system specification.','Design details and Sections 5–6','General detailing practice; exact dimensions/components are not imported as universal Greek rules.'),
 ('waterproof_basement_below_grade_moisture','bsi_bs_8102_2022','standard_based','Below-ground protection requires site/water evaluation, risk assessment, drainage consideration and selection of an appropriate protection strategy.','Public standard summary','General below-ground design/risk principle; not Greek law and not a product installation recipe.'),
 ('insulation_thermal_bridge_condensation','tee_totee_20701_2_2021','standard_based','Greek T.O.T.E.E. thermal guidance treats thermal bridges through junction-specific heat-flow/transmittance assessment and links thermal protection to limiting surface-condensation risk.','Thermal-bridge methodology and thermal-protection scope','Greek building-physics context; does not prescribe a DIY product or exact retrofit detail.'),
 ('insulation_roof_general','tee_totee_20701_2_2021','standard_based','Greek T.O.T.E.E. requires thermal-insulation adequacy to be assessed for building elements/envelope; roof build-up must meet project thermal requirements rather than a generic product rule.','Thermal-insulation adequacy methodology','Greek thermal-design context; exact roof construction remains project/system-specific.'),
 ('repair_recurrent_or_large_wall_crack','rics_subsidence_crack_screening','strong_consensus','New or expanding cracks and associated movement indicators may require monitoring and specialist assessment; appearance alone does not establish cause.','Consumer guide — identifying possible movement','General screening only; UK numeric consumer thresholds are not imported as universal Greek rules.')
)
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability,active)
SELECT e.entity_type,e.entity_id,s.id,ss.passage,ss.section,ss.evidence_strength,ss.applicability,true
FROM scenario_source ss
JOIN public.build_solution_profiles p ON p.scenario_key=ss.scenario_key
JOIN public.general_build_sources s ON s.source_key=ss.source_key
CROSS JOIN LATERAL (
 SELECT 'profile'::text AS entity_type,p.id AS entity_id
 UNION ALL SELECT 'solution_rule',r.id FROM public.build_solution_rules r WHERE r.scenario_id=p.id AND r.active
 UNION ALL SELECT 'diagnostic_rule',d.id FROM public.build_diagnostic_rules d WHERE d.scenario_id=p.id AND d.active
 UNION ALL SELECT 'solution_step',st.id FROM public.build_solution_steps st WHERE st.scenario_id=p.id AND st.active
 UNION ALL SELECT 'failure_mode',f.id FROM public.build_failure_modes f WHERE f.scenario_id=p.id AND f.active
 UNION ALL SELECT 'tool_requirement',t.id FROM public.build_tool_requirements t WHERE t.scenario_id=p.id AND t.active
 UNION ALL SELECT 'project_kit_requirement',k.id FROM public.build_project_kit_requirements k WHERE k.scenario_id=p.id AND k.active
) e
ON CONFLICT (entity_type,entity_id,source_id) DO UPDATE SET
 supporting_passage=EXCLUDED.supporting_passage,
 relevant_section_page=EXCLUDED.relevant_section_page,
 evidence_strength=EXCLUDED.evidence_strength,
 applicability=EXCLUDED.applicability,
 active=true;

-- Add secondary evidence where it materially strengthens diagnosis/design.
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability,active)
SELECT 'profile',p.id,s.id,
 'RICS distinguishes condensation from penetrating moisture and other sources and emphasizes finding the moisture source before selecting remediation.',
 'Damp and mould consumer guidance','strong_consensus',
 'Supports diagnostic uncertainty for bathroom/below-grade moisture; not a Greek legal requirement.',true
FROM public.build_solution_profiles p
JOIN public.general_build_sources s ON s.source_key='rics_damp_mould'
WHERE p.scenario_key IN ('paint_bathroom_high_humidity','waterproof_basement_below_grade_moisture')
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability,active)
SELECT 'profile',p.id,s.id,
 'ISO 13788 provides simplified methods for evaluating internal surface temperature/critical humidity and interstitial condensation risk, with explicit limits to the simplified method.',
 'Scope / abstract','standard_based',
 'Supports condensation-risk assessment and uncertainty; does not itself prescribe an insulation product or exact retrofit construction.',true
FROM public.build_solution_profiles p
JOIN public.general_build_sources s ON s.source_key='iso_13788_2012'
WHERE p.scenario_key='insulation_thermal_bridge_condensation'
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability,active)
SELECT 'profile',p.id,s.id,
 CASE WHEN s.source_key='lrwa_warm_roof_systems'
      THEN 'Warm-roof guidance places principal insulation below the weatherproof covering and above the deck/any necessary vapour-control layer.'
      ELSE 'Inverted-roof guidance places principal insulation above the waterproof covering, showing why a universal roof layer sequence is unsafe.' END,
 'System overview','strong_consensus',
 'Used only to distinguish generic roof-system arrangements; exact build-up is system/design-specific.',true
FROM public.build_solution_profiles p
JOIN public.general_build_sources s ON s.source_key IN ('lrwa_warm_roof_systems','lrwa_inverted_roof_systems')
WHERE p.scenario_key='insulation_roof_general'
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- Layer C provenance for the new scenario-specific stop conditions.
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability,active)
SELECT 'stop_condition',sc.id,s.id,
 'KONTA MOU governance blocks recommendation pathways when the symptom could conceal unresolved water, structural/movement risk, unsafe compatibility or an unverified system decision.',
 'Layer separation and stop/escalation governance',
 'strong_consensus',
 'Internal workflow/safety rule; it is deliberately not presented as an external construction standard.',true
FROM public.build_stop_conditions sc
JOIN public.build_solution_profiles p ON p.id=sc.scenario_id
JOIN public.general_build_sources s ON s.source_key='konta_mou_build_studio_governance_v1'
WHERE p.scenario_key IN (
 'paint_bathroom_high_humidity','paint_existing_peeling',
 'waterproof_existing_system_maintenance','waterproof_details_parapets_joints_penetrations',
 'waterproof_basement_below_grade_moisture','insulation_thermal_bridge_condensation',
 'insulation_roof_general','repair_recurrent_or_large_wall_crack'
)
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

COMMIT;
