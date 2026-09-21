
BEGIN;

INSERT INTO public.general_build_sources
(source_key, organization, source_type, title, url, jurisdiction, standard_identifier,
 publication_date, revision, retrieved_at, relevant_section_page, source_status, notes, active)
VALUES
('british_gypsum_minor_wall_patch','British Gypsum','manufacturer_general_practice',
 'Gyproc EasiFill 20 Installation Instructions',
 'https://www.british-gypsum.com/installation/installation-guidance-and-support/installation-guides/gyproc-easifill-20-installation-instructions',
 'United Kingdom / general repair-practice reference; not Greek law',NULL,NULL,'current web guidance',now(),
 'General sequence: remove loose material, clean, fill local holes/cracks, allow deeper fills to set/dry in stages, sand after full drying, confirm background suitability.',
 'reference_only',
 'Only general minor-patch workflow is imported. Product-specific mixing ratios, setting times, thickness limits and brand claims are excluded.',
 true),
('british_gypsum_unstable_background','British Gypsum','manufacturer_general_practice',
 'Preparing a damaged, partially de-papered plasterboard wall before skimming',
 'https://www.british-gypsum.com/technical-support/self-help-tools/faqs/how-should-a-damaged-partially-de-papered-plasterboard-wall-be-prepared-ensure-a-sound-keyed-and',
 'United Kingdom / general repair-practice reference; not Greek law',NULL,NULL,'current web guidance',now(),
 'Make the substrate sound; remove loose/flaking/unstable material; clean dust; use a trial area where compatibility/adhesion is uncertain; if significant portions remain friable or delaminate, use a more substantial repair rather than coating over them.',
 'reference_only',
 'Used only for the general principle that unstable backgrounds must be brought back to a sound base. Product-specific bonding-agent and plaster instructions are excluded.',
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
('exterior_wall_waterproofing','waterproofing','Διερεύνηση και προστασία εξωτερικού τοίχου από βροχή','Exterior wall rain-penetration guidance',
 'Διάγνωση διαδρομής νερού και αποκατάσταση εξωτερικού τοίχου πριν από τελική προστατευτική επίστρωση.',true),
('wall_surface_repair','wall_repair','Τοπική επισκευή επιφάνειας τοίχου','Local wall-surface repair',
 'Επισκευή οπών, χτυπημάτων και αδύναμων/σαθρών επιφανειακών στρώσεων πριν από φινίρισμα.',true)
ON CONFLICT (solution_key) DO UPDATE SET
 module=EXCLUDED.module,title_el=EXCLUDED.title_el,title_en=EXCLUDED.title_en,
 description_el=EXCLUDED.description_el,active=true,updated_at=now();

INSERT INTO public.build_problem_types
(problem_key,title_el,title_en,description_el,active)
VALUES
('rain_penetration','Διείσδυση βρόχινου νερού','Rain penetration','Υγρασία ή εισροή που μπορεί να συνδέεται με εξωτερική έκθεση στη βροχή και αστοχίες του κελύφους.',true),
('holes_dents','Τρύπες / χτυπήματα','Holes / dents','Τοπική μη δομική απώλεια ή βαθούλωμα επιφανειακού υλικού.',true),
('weak_friable_substrate','Αδύναμη / σαθρή βάση','Weak / friable substrate','Επιφάνεια που τρίβεται, αποσαθρώνεται, ξεφλουδίζει ή δεν παρέχει σταθερή βάση.',true),
('weathered_wood','Ταλαιπωρημένο ξύλο','Weathered wood','Ξύλο με επιφανειακή φθορά από ήλιο, νερό ή καιρική έκθεση.',true),
('bare_ferrous_metal','Άβαφο σιδηρούχο μέταλλο','Bare ferrous metal','Γυμνή επιφάνεια ανθρακούχου/χαμηλού κραματικού χάλυβα ή σιδηρούχου μετάλλου χωρίς τελικό coating.',true)
ON CONFLICT (problem_key) DO UPDATE SET
 title_el=EXCLUDED.title_el,title_en=EXCLUDED.title_en,description_el=EXCLUDED.description_el,
 active=true,updated_at=now();

-- Exterior wall / rain penetration.
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
 'waterproof_exterior_wall_rain_penetration',st.id,pt.id,'GENERAL_GUIDANCE',
 'exterior masonry/render/façade and associated openings/details','exterior',
 'Εξωτερικός τοίχος με υγρασία ή νερό από βροχή',
 'Visible dampness does not by itself prove the entry point or moisture mechanism. Exterior rain penetration should be investigated at façade cracks/render, joints, openings, parapets, gutters/downpipes and adjoining roof/details before a coating or water-repellent treatment is selected.',
 'Το σημάδι υγρασίας δεν δείχνει πάντα το σημείο από όπου μπαίνει το νερό. Πριν από βαφή ή στεγανωτικό έλεγξε ρωγμές, αρμούς, κουφώματα, στηθαία, υδρορροές και τις γειτονικές λεπτομέρειες.',
 'Πρώτα βρίσκουμε τη διαδρομή του νερού και μετά επιλέγουμε επισκευή ή προστατευτικό σύστημα.',
 jsonb_build_array('ρωγμές ή αστοχίες εξωτερικού επιχρίσματος','αστοχίες αρμών/σφραγίσεων γύρω από ανοίγματα','προβλήματα υδρορροών ή απορροής','αστοχίες σε στηθαία/flashings/συναρμογές','άλλη πηγή υγρασίας που δεν σχετίζεται με βροχή'),
 jsonb_build_array('λεκέδες που εμφανίζονται ή επιδεινώνονται μετά από βροχή','ξεφλούδισμα/φούσκωμα','ρωγμές ή ανοικτοί αρμοί','τοπική υγρασία γύρω από παράθυρα/πόρτες','εξάνθηση ή υγρές ζώνες'),
 jsonb_build_array('Εμφανίζεται ή επιδεινώνεται το πρόβλημα μετά από βροχή και άνεμο;','Υπάρχουν ρωγμές, χαλασμένοι αρμοί ή σφραγίσεις;','Υδρορροές και σωλήνες ομβρίων λειτουργούν χωρίς υπερχείλιση;','Το ορατό σημάδι βρίσκεται κοντά σε άνοιγμα, στηθαίο, στέγη ή άλλη λεπτομέρεια;','Υπάρχει πιθανότητα εσωτερικής υδραυλικής διαρροής ή συμπύκνωσης;'),
 jsonb_build_array('έλεγχος πηγής/διαδρομής νερού','έλεγχος σταθερότητας επιχρίσματος/βαφής','έλεγχος λεπτομερειών και απορροής','επιβεβαίωση ότι η βάση μπορεί να στεγνώσει πριν από τελικό σύστημα'),
 jsonb_build_array('επισκευή αποδεδειγμένων τοπικών αστοχιών','αποκατάσταση αρμών/ρωγμών με κατάλληλο τεκμηριωμένο σύστημα','προστατευτική επίστρωση μόνο όταν ταιριάζει στη βάση και στον μηχανισμό υγρασίας'),
 jsonb_build_array('διακοσμητική επαναβαφή ως λύση σε ενεργή ή ανεξακρίβωτη εισροή','τυχαία υδροαπωθητική επίστρωση χωρίς έλεγχο πηγής και συμβατότητας'),
 jsonb_build_array('αφαίρεση σαθρού/αποκολλημένου υλικού','καθαρισμός','επισκευή τεκμηριωμένων ατελειών/λεπτομερειών','στέγνωμα σε κατάσταση αποδεκτή για το επιλεγμένο σύστημα'),
 jsonb_build_array('διάγνωση','επισκευή πηγής/λεπτομερειών','σταθεροποίηση βάσης','στέγνωμα','προϊόν προετοιμασίας μόνο αν απαιτείται','τελική προστασία μόνο με τεκμηριωμένη συμβατότητα'),
 jsonb_build_array('Το αν χρειάζεται αστάρι και ποιο είναι προϊόν- και υπόστρωμα-ειδικό.'),
 jsonb_build_array('Δεν υπάρχει μία γενική ενδιάμεση στρώση για κάθε τύπο όψης ή μηχανισμό υγρασίας.'),
 jsonb_build_array('Η τελική προστασία επιλέγεται μόνο αφού είναι γνωστή η βάση, η αιτία και οι απαιτήσεις του συγκεκριμένου συστήματος.'),
 jsonb_build_array('σταθερή βάση','επισκευασμένες κρίσιμες λεπτομέρειες','τεκμηριωμένο σύστημα προστασίας όπου απαιτείται'),
 jsonb_build_array('αστάρι','ελαστικό repair/detail component','υδροαπωθητική ή coating λύση μόνο όπου τεκμηριώνεται'),
 jsonb_build_array('οι επισκευές και η βάση πρέπει να έχουν φτάσει στην κατάσταση ξήρανσης/ωρίμανσης που απαιτεί το επόμενο προϊόν'),
 jsonb_build_array('ενεργή ή σημαντική άγνωστη υγρασία μπλοκάρει επιλογή τελικού coating'),
 jsonb_build_array('όρια εφαρμογής προέρχονται από τον κατασκευαστή του επιλεγμένου υλικού'),
 jsonb_build_array('υψηλή υγρασία και βρεγμένη βάση μπορούν να εμποδίσουν ασφαλή εφαρμογή/στέγνωμα'),
 jsonb_build_array('μην εφαρμόζεις όταν οι συνθήκες παραβιάζουν τις τεκμηριωμένες απαιτήσεις του συστήματος'),
 jsonb_build_array('εξωτερική έκθεση σε UV είναι μέρος της επιλογής κατάλληλου τελικού συστήματος'),
 jsonb_build_array('βροχή κατά την εφαρμογή ή πριν από την απαιτούμενη ωρίμανση μπορεί να προκαλέσει αστοχία· ακολουθούνται οι προϊόν-ειδικοί χρόνοι'),
 jsonb_build_array('εσωτερική συμπύκνωση μπορεί να συνυπάρχει και δεν αποκλείεται μόνο από την παρουσία εξωτερικής βροχής'),
 jsonb_build_array('όπου υπάρχει εσωτερική συμπύκνωση αξιολογείται και ο αερισμός ξεχωριστά'),
 jsonb_build_array('συμβατότητα νέου συστήματος με υπάρχουσα βαφή/επίχρισμα','συμβατότητα repair/sealant/coating μεταξύ τους','άγνωστη παλιά επίστρωση απαιτεί δοκιμή ή τεχνική επιβεβαίωση'),
 jsonb_build_array('επανεμφάνιση υγρασίας επειδή δεν διορθώθηκε η πηγή','αποκόλληση coating σε υγρή/ασταθή βάση','αστοχία γύρω από αρμούς και ανοίγματα'),
 jsonb_build_array('κάλυψη συμπτώματος χωρίς διάγνωση','βαφή πάνω σε ενεργή υγρασία','παράλειψη επισκευής λεπτομερειών','υπόθεση ότι το ορατό σημάδι είναι το σημείο εισόδου'),
 jsonb_build_array('ενεργό νερό','άγνωστη σημαντική πηγή υγρασίας','εκτεταμένο αποκολλημένο επίχρισμα','μεγάλες/επαναλαμβανόμενες ρωγμές','μη ασφαλής πρόσβαση σε ύψος'),
 jsonb_build_array('έλεγχος μετά από επόμενα επεισόδια βροχής','έλεγχος αρμών/λεπτομερειών και πρόσφυσης τελικού συστήματος'),
 jsonb_build_array('τακτικός έλεγχος υδρορροών, αρμών, σφραγίσεων, ρωγμών και εξωτερικών λεπτομερειών'),
 jsonb_build_array('γάντια, προστασία ματιών/αναπνοής ανά εργασία και SDS','κατάλληλα μέτρα εργασίας σε ύψος όταν απαιτείται'),
 jsonb_build_array('inspection_tools','surface_preparation_tools','repair_detail_tools','coating_application_tools','safe_access_equipment'),
 jsonb_build_array('masking_and_adjacent_surface_protection','dust_or_debris_control','fall_protection_where_required'),
 'verified','approved',true,now()
FROM public.build_solution_types st, public.build_problem_types pt
WHERE st.solution_key='exterior_wall_waterproofing' AND pt.problem_key='rain_penetration'
ON CONFLICT (scenario_key) DO NOTHING;

-- Small holes / dents.
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
 'repair_small_holes_dents',st.id,pt.id,'GENERAL_GUIDANCE','plaster/render/plasterboard finish','both',
 'Μικρές τρύπες και χτυπήματα στον τοίχο',
 'Minor non-structural holes and dents are repaired by removing loose edges/material, cleaning the repair area, selecting a repair material suitable for the background and depth, filling in stages where the selected material requires it, allowing full drying/setting, then smoothing and finishing.',
 'Για μικρές μη δομικές φθορές: αφαιρούμε ό,τι είναι χαλαρό, καθαρίζουμε, γεμίζουμε με υλικό κατάλληλο για τη βάση και το βάθος και λειαίνουμε μόνο αφού στεγνώσει/ωριμάσει.',
 'Καθαρή και σταθερή βάση → κατάλληλο γέμισμα → στέγνωμα → λείανση → τελικό φινίρισμα.',
 jsonb_build_array('μηχανικό χτύπημα','αφαίρεση βίδας/στερέωσης','τοπική απώλεια στόκου ή επιχρίσματος'),
 jsonb_build_array('τοπική τρύπα','βαθούλωμα','σπασμένες ή χαλαρές ακμές'),
 jsonb_build_array('Η ζημιά είναι μόνο επιφανειακή ή συνεχίζεται βαθύτερα;','Υπάρχει χαλαρό υλικό γύρω από την τρύπα;','Η βάση είναι σοβάς, γυψοσανίδα, κονίαμα ή άλλο υλικό;','Υπάρχει υγρασία, ρωγμή που κινείται ή δομικό στοιχείο μέσα/γύρω από τη ζημιά;'),
 jsonb_build_array('ταυτοποίηση υποστρώματος','απομάκρυνση χαλαρών ακμών','έλεγχος ότι η ζημιά είναι μη δομική και στεγνή'),
 jsonb_build_array('τοπικό κατάλληλο filler/repair material','ενίσχυση μόνο όταν απαιτείται από το repair system','τοπική προετοιμασία και τελικό φινίρισμα'),
 jsonb_build_array('γέμισμα πάνω σε σαθρή βάση','χρήση επιφανειακού filler σε βλάβη που απαιτεί βαθύτερο/δομικό repair'),
 jsonb_build_array('αφαίρεση χαλαρού υλικού','καθαρισμός σκόνης','διαμόρφωση σταθερών ακμών όπου απαιτείται'),
 jsonb_build_array('προετοιμασία','γέμισμα με κατάλληλο υλικό','πρόσθετο στάδιο μόνο αν το βάθος/υλικό το απαιτεί','στέγνωμα/πήξη','λείανση','αστάρι/φινίρισμα όπου απαιτείται'),
 jsonb_build_array('αστάρι μόνο αν το υπόστρωμα, το repair material ή το τελικό coating το απαιτεί'),
 jsonb_build_array('repair/filler layer κατάλληλη για το υπόστρωμα και το βάθος'),
 jsonb_build_array('τελικό coating μόνο αφού το repair έχει στεγνώσει/ωριμάσει σύμφωνα με τις οδηγίες του'),
 jsonb_build_array('σταθερή βάση','repair/filler material','τελικό φινίρισμα εφόσον αποτελεί μέρος του έργου'),
 jsonb_build_array('ενίσχυση/mesh ή primer μόνο όταν το τεκμηριωμένο repair system το απαιτεί'),
 jsonb_build_array('βαθιές επισκευές μπορεί να απαιτούν περισσότερα στάδια και πλήρη ξήρανση/πήξη πριν τη λείανση'),
 jsonb_build_array('υγρασία μέσα ή γύρω από τη βλάβη πρέπει να διερευνηθεί πριν από γέμισμα'),
 jsonb_build_array('όρια θερμοκρασίας είναι υλικό-ειδικά'),
 jsonb_build_array('υψηλή υγρασία μπορεί να επηρεάσει το στέγνωμα ορισμένων υλικών'),
 jsonb_build_array('εξωτερική επισκευή προστατεύεται από καιρό σύμφωνα με το υλικό'),
 jsonb_build_array(),jsonb_build_array(),jsonb_build_array(),jsonb_build_array('εξασφάλιση αερισμού/ελέγχου σκόνης όταν απαιτείται'),
 jsonb_build_array('repair material συμβατό με υπόστρωμα, βάθος και τελικό coating','δεν υποθέτουμε ότι ένα filler είναι κατάλληλο για κάθε βάθος ή υπόστρωμα'),
 jsonb_build_array('συρρίκνωση/βύθιση','αποκόλληση repair','ορατό περίγραμμα μετά το βάψιμο'),
 jsonb_build_array('γέμισμα πάνω σε σκόνη/χαλαρές ακμές','πολύ παχύ γέμισμα χωρίς να το επιτρέπει το υλικό','λείανση ή βαφή πριν από πλήρη ξήρανση'),
 jsonb_build_array('εκτεταμένη βλάβη','υγρασία','κίνηση/μεγάλες ρωγμές','ύποπτη βλάβη δομικού στοιχείου'),
 jsonb_build_array('έλεγχος επιπεδότητας, πρόσφυσης και ρωγμών μετά την ξήρανση','έλεγχος ότι το τελικό coating δεν εμφανίζει βύθιση/outline'),
 jsonb_build_array('τοπικός έλεγχος για επαναρρηγμάτωση ή χαλάρωση'),
 jsonb_build_array('προστασία ματιών/αναπνοής κατά τρίψιμο και γάντια σύμφωνα με εργασία/SDS'),
 jsonb_build_array('scraper','filling_knife_or_trowel','abrasive','dust_removal','mixing_tool_if_required'),
 jsonb_build_array('floor_and_adjacent_surface_protection','dust_control'),
 'verified','approved',true,now()
FROM public.build_solution_types st, public.build_problem_types pt
WHERE st.solution_key='wall_surface_repair' AND pt.problem_key='holes_dents'
ON CONFLICT (scenario_key) DO NOTHING;

-- Weak / friable wall surface.
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
 'repair_weak_friable_wall_surface',st.id,pt.id,'GENERAL_GUIDANCE','plaster/render/painted mineral wall finish','both',
 'Σαθρή ή αδύναμη επιφάνεια τοίχου',
 'A friable, flaking or delaminating surface is not a sound base for filler, plaster or coating. Unstable material should be removed back to a firm background, the cause of deterioration checked, and the remaining background assessed before a repair or finishing system is selected.',
 'Αν η επιφάνεια τρίβεται, ξεφλουδίζει ή αποκολλάται, δεν τη «δένουμε» αυτόματα με ένα νέο υλικό. Αφαιρούμε τα ασταθή σημεία μέχρι σταθερή βάση και ελέγχουμε γιατί χάλασε.',
 'Δεν χτίζουμε νέο σύστημα πάνω σε σαθρή βάση.',
 jsonb_build_array('παλιά αστοχημένη βαφή/επίχρισμα','υγρασία','ανεπαρκής αρχική πρόσφυση','γήρανση/μηχανική φθορά'),
 jsonb_build_array('σκόνη ή υλικό που φεύγει με τρίψιμο','κούφιος ή αποκολλημένος σοβάς','φλούδες/ασταθείς ακμές','εκτεταμένη αποσάθρωση'),
 jsonb_build_array('Η επιφάνεια τρίβεται ή αποκολλάται με ελαφριά μηχανική δοκιμή;','Η αστάθεια είναι τοπική ή εκτεταμένη;','Υπάρχει υγρασία ή διαρροή;','Μετά την αφαίρεση των σαθρών σημείων παραμένει σταθερή βάση;'),
 jsonb_build_array('έλεγχος έκτασης αστάθειας','έλεγχος υγρασίας','αφαίρεση χαλαρού υλικού μέχρι σταθερό υπόστρωμα'),
 jsonb_build_array('τοπική repair path μόνο όταν αποκαλύπτεται σταθερή βάση','μεγαλύτερη αποκατάσταση/αντικατάσταση επιχρίσματος όταν η αστάθεια είναι εκτεταμένη'),
 jsonb_build_array('στόκος, σοβάς ή βαφή πάνω σε σαθρή/σκονισμένη βάση','απλή επικάλυψη χωρίς απομάκρυνση αποκολλημένου υλικού'),
 jsonb_build_array('αφαίρεση ασταθούς υλικού','καθαρισμός σκόνης','έλεγχος υπολειπόμενης συνοχής','στέγνωμα/αντιμετώπιση υγρασίας όπου υπάρχει'),
 jsonb_build_array('διάγνωση','αφαίρεση','αξιολόγηση βάσης','repair system ανά υπόστρωμα/έκταση','ωρίμανση','φινίρισμα'),
 jsonb_build_array('σταθεροποιητικό/primer δεν αντικαθιστά την αφαίρεση υλικού που ήδη αποκολλάται· χρήση μόνο όταν τεκμηριώνεται για τη συγκεκριμένη βάση'),
 jsonb_build_array('repair/base layer κατάλληλη για την εναπομένουσα σταθερή βάση'),
 jsonb_build_array('τελικό coating μόνο πάνω σε σταθερή, προετοιμασμένη και επαρκώς στεγνή βάση'),
 jsonb_build_array('σταθερή βάση','repair layer όπου απαιτείται','τελικό σύστημα'),
 jsonb_build_array('primer/conditioning product μόνο με τεκμηριωμένη καταλληλότητα'),
 jsonb_build_array('repair και primer/coating πρέπει να έχουν στεγνώσει/ωριμάσει όπως ορίζει το αντίστοιχο προϊόν'),
 jsonb_build_array('ενεργή υγρασία πρέπει να λυθεί πριν από τελικό σύστημα'),
 jsonb_build_array('προϊόν-ειδικά όρια'),jsonb_build_array('προϊόν-ειδικές απαιτήσεις'),jsonb_build_array('εξωτερική προστασία από βροχή κατά repair/curing όπου απαιτείται'),
 jsonb_build_array(),jsonb_build_array('βροχή/υγρασία μπορούν να συντηρούν αποσάθρωση εξωτερικού επιχρίσματος'),jsonb_build_array(),jsonb_build_array('έλεγχος σκόνης και αερισμός κατά τις εργασίες'),
 jsonb_build_array('repair/primer/topcoat πρέπει να είναι συμβατά με την πραγματική σταθερή βάση, όχι με το σαθρό στρώμα που αφαιρέθηκε'),
 jsonb_build_array('αποκόλληση νέου repair μαζί με την παλιά αδύναμη στρώση','ξεφλούδισμα τελικής βαφής','επανεμφάνιση βλάβης από υγρασία'),
 jsonb_build_array('primer ως υποκατάστατο αφαίρεσης σαθρού υλικού','επισκευή πριν λυθεί η υγρασία','μη έλεγχος έκτασης αποκόλλησης'),
 jsonb_build_array('εκτεταμένη αποκόλληση','κίνδυνος πτώσης υλικών','ενεργή υγρασία','ορατός οπλισμός ή βλάβη σκυροδέματος'),
 jsonb_build_array('έλεγχος πρόσφυσης/σταθερότητας repair και τελικού finish'),
 jsonb_build_array('παρακολούθηση για νέα αποσάθρωση ή υγρασία'),
 jsonb_build_array('γυαλιά, γάντια, έλεγχος σκόνης/αναπνευστική προστασία ανά εργασία'),
 jsonb_build_array('scraper','hammer_or_tapping_inspection_tool','abrasive','dust_removal','repair_tools'),
 jsonb_build_array('debris_and_floor_protection','dust_control','safe_access_where_required'),
 'verified','approved',true,now()
FROM public.build_solution_types st, public.build_problem_types pt
WHERE st.solution_key='wall_surface_repair' AND pt.problem_key='weak_friable_substrate'
ON CONFLICT (scenario_key) DO NOTHING;

-- Existing sound wood coating.
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
 'paint_wood_existing_sound',st.id,pt.id,'GENERAL_GUIDANCE','previously coated wood','both',
 'Επαναβαφή ήδη βαμμένου ξύλου',
 'Previously coated wood should be checked for coating adhesion, contamination, moisture/decay and compatibility. Sound retained coating is cleaned and prepared to provide a suitable surface; loose coating and degraded wood are not simply overcoated.',
 'Αν το παλιό φινίρισμα είναι σταθερό, καθαρίζεται και προετοιμάζεται πριν από νέα βαφή. Ό,τι ξεφλουδίζει ή το ξύλο που έχει υποβαθμιστεί χρειάζεται πρώτα αποκατάσταση.',
 'Κρατάμε μόνο σταθερό παλιό φινίρισμα και επιβεβαιώνουμε συμβατότητα πριν την επαναβαφή.',
 jsonb_build_array('φυσιολογική γήρανση finish','UV/νερό σε εξωτερικό ξύλο','μηχανική φθορά','ασυμβατότητα ή χαμηλή πρόσφυση παλαιών στρώσεων'),
 jsonb_build_array('θαμπό ή φθαρμένο αλλά σταθερό coating','τοπικές γυμνές περιοχές','ξεφλούδισμα ή ρωγμές coating όπου υπάρχει αστοχία'),
 jsonb_build_array('Το παλιό φινίρισμα είναι σταθερά προσκολλημένο;','Γνωρίζουμε τον τύπο ή τουλάχιστον τη συμβατότητα του παλιού finish;','Υπάρχει υγρασία, σήψη ή μαλακό ξύλο;','Είναι εσωτερική ή εξωτερική χρήση;'),
 jsonb_build_array('έλεγχος πρόσφυσης','καθαρισμός ρύπων','έλεγχος υγρασίας/βιολογικής φθοράς','έλεγχος συμβατότητας νέου συστήματος'),
 jsonb_build_array('επαναβαφή πάνω σε σταθερό, καθαρό και κατάλληλα προετοιμασμένο finish','τοπική απογύμνωση/επισκευή όπου υπάρχει αστοχία'),
 jsonb_build_array('κάλυψη ξεφλουδισμένου finish','βαφή πάνω σε σήψη/υγρό ξύλο','υπόθεση συμβατότητας άγνωστου coating'),
 jsonb_build_array('αφαίρεση σαθρού finish','καθαρισμός','λείανση/θαμπάρισμα όπου κατάλληλο','αφαίρεση σκόνης','τοπική επισκευή γυμνού ξύλου'),
 jsonb_build_array('έλεγχος','προετοιμασία','repair/primer σε γυμνές περιοχές όπου απαιτείται','τελικό finish σύμφωνα με το επιλεγμένο προϊόν'),
 jsonb_build_array('primer/undercoat μόνο όπου απαιτείται από το επιλεγμένο wood-coating system ή από γυμνές περιοχές'),
 jsonb_build_array('ενδιάμεση στρώση είναι προϊόν-ειδική'),
 jsonb_build_array('τελικό finish επιλέγεται για το είδος ξύλου, έκθεση και συμβατότητα'),
 jsonb_build_array('σταθερό/στεγνό ξύλο ή sound retained coating','τεκμηριωμένο σύστημα τελικού finish'),
 jsonb_build_array('primer/undercoat/local repair ανά κατασκευαστή'),
 jsonb_build_array('οι στρώσεις εφαρμόζονται μόνο μετά από τους προϊόν-ειδικούς χρόνους'),
 jsonb_build_array('ξύλο με σημαντική υγρασία ή ενεργή διαρροή δεν καλύπτεται πριν αποκατασταθεί/στεγνώσει'),
 jsonb_build_array('όρια εφαρμογής προϊόντος'),jsonb_build_array('υγρασία επηρεάζει ξύλο και curing'),
 jsonb_build_array('για εξωτερικό ξύλο λαμβάνονται υπόψη βροχή/ήλιος και οι απαιτήσεις του finish'),
 jsonb_build_array('UV είναι σημαντικός μηχανισμός weathering στο εξωτερικό ξύλο'),
 jsonb_build_array('προστασία από βροχή σύμφωνα με τις οδηγίες προϊόντος'),jsonb_build_array(),jsonb_build_array('αερισμός σε εσωτερική εργασία σύμφωνα με SDS/finish'),
 jsonb_build_array('νέο finish συμβατό με retained coating','δοκιμαστική περιοχή όταν η συμβατότητα είναι άγνωστη','διαφορετικά είδη ξύλου/finishes μπορεί να απαιτούν διαφορετική προετοιμασία'),
 jsonb_build_array('ξεφλούδισμα λόγω χαμηλής πρόσφυσης','ρηγμάτωση/φθορά από weathering','παγίδευση υγρασίας'),
 jsonb_build_array('βαφή πάνω σε χαλαρό finish','παράλειψη καθαρισμού/προετοιμασίας','εφαρμογή σε υγρό ή υποβαθμισμένο ξύλο'),
 jsonb_build_array('σήψη/μαλακό ξύλο','άγνωστη έκταση βιολογικής προσβολής','ενεργή υγρασία','άγνωστο coating με αποτυχία δοκιμής συμβατότητας'),
 jsonb_build_array('έλεγχος ομοιομορφίας/πρόσφυσης μετά την ωρίμανση'),
 jsonb_build_array('περιοδικός έλεγχος εξωτερικών επιφανειών για ρωγμές, ξεφλούδισμα και εκτεθειμένο ξύλο'),
 jsonb_build_array('γάντια/μάτια/αναπνευστική προστασία όπου απαιτείται από sanding/παλιό coating/SDS'),
 jsonb_build_array('scraper','abrasive','dust_removal','brush_or_roller','mixing_tool'),
 jsonb_build_array('masking','floor_or_adjacent_surface_protection','dust_control'),
 'verified','approved',true,now()
FROM public.build_solution_types st, public.build_problem_types pt
WHERE st.solution_key='wood_coating' AND pt.problem_key='sound_existing_coating'
ON CONFLICT (scenario_key) DO NOTHING;

-- Weathered wood.
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
 'paint_wood_weathered',st.id,pt.id,'GENERAL_GUIDANCE','weather-exposed wood','exterior',
 'Ταλαιπωρημένο ξύλο εξωτερικού χώρου',
 'Weathering changes wood surfaces through moisture, sunlight and other exposure. Degraded surface fibres and failed coating reduce adhesion and must be removed/prepared back to a sound surface before a compatible exterior finish is applied.',
 'Ο ήλιος, το νερό και ο καιρός μπορούν να αποδυναμώσουν την επιφάνεια του ξύλου. Πριν από νέο φινίρισμα αφαιρούνται οι σαθρές ίνες και τα αποτυχημένα coatings μέχρι να υπάρχει σταθερή, στεγνή βάση.',
 'Η ταλαιπωρημένη επιφάνεια πρέπει να επανέλθει σε σταθερή βάση πριν από νέο finish.',
 jsonb_build_array('UV','βροχή/διαβροχή','εναλλαγές υγρασίας και ξήρανσης','γήρανση finish'),
 jsonb_build_array('γκριζάρισμα/τραχιά επιφάνεια','χαλαρές ίνες','ρωγμές/ξεφλούδισμα finish','τοπικά μαλακό ή σάπιο ξύλο'),
 jsonb_build_array('Η φθορά είναι μόνο επιφανειακή ή το ξύλο είναι μαλακό/σαθρό σε βάθος;','Υπάρχει παλιό coating και είναι σταθερό;','Υπάρχει επαναλαμβανόμενη διαβροχή από κατασκευαστική λεπτομέρεια;','Το ξύλο μπορεί να στεγνώσει πριν από finishing;'),
 jsonb_build_array('έλεγχος δομικής/βιολογικής κατάστασης','έλεγχος παλιού finish','απομάκρυνση degraded surface','στέγνωμα'),
 jsonb_build_array('mechanical preparation to sound wood/coating','compatible exterior wood-finishing system after preparation'),
 jsonb_build_array('coating πάνω σε χαλαρές weathered fibres','κάλυψη σήψης ή συνεχιζόμενης διαβροχής'),
 jsonb_build_array('αφαίρεση χαλαρού finish/ινών','λείανση όπου κατάλληλο','καθαρισμός σκόνης/ρύπων','επισκευή πηγής νερού όπου υπάρχει','στέγνωμα'),
 jsonb_build_array('διάγνωση','προετοιμασία μέχρι sound surface','προϊόν προετοιμασίας όπου απαιτείται','εξωτερικό finish σύμφωνα με κατασκευαστή'),
 jsonb_build_array('primer/preservative/undercoat δεν θεωρείται καθολικά απαραίτητο· ακολουθείται το τεκμηριωμένο system'),
 jsonb_build_array('ανά system'),jsonb_build_array('finish κατάλληλο για exterior wood και πραγματική έκθεση'),
 jsonb_build_array('sound dry wood','selected exterior finishing system'),
 jsonb_build_array('repair/primer/preservative μόνο όταν τεκμηριώνεται'),
 jsonb_build_array('στεγνό/ωριμασμένο substrate και product-specific recoat/cure'),
 jsonb_build_array('διαβρεγμένο ξύλο πρέπει να στεγνώσει· συνεχής πηγή νερού αντιμετωπίζεται πρώτα'),
 jsonb_build_array('προϊόν-ειδικά'),jsonb_build_array('προϊόν-ειδικά'),
 jsonb_build_array('εφαρμογή μόνο σε κατάλληλο weather window σύμφωνα με manufacturer'),
 jsonb_build_array('η UV έκθεση είναι βασικός παράγοντας weathering'),
 jsonb_build_array('η βροχή/νερό είναι βασικός παράγοντας weathering και μπορεί να επηρεάζει adhesion/curing'),
 jsonb_build_array(),jsonb_build_array('όπου εργασία σε κλειστό χώρο ακολουθείται SDS/αερισμός'),
 jsonb_build_array('finish selected for wood type, retained coating and exterior exposure'),
 jsonb_build_array('πρόωρο ξεφλούδισμα πάνω σε degraded fibres','cracking/erosion finish','επανεμφάνιση decay από νερό'),
 jsonb_build_array('finish χωρίς αφαίρεση degraded surface','κάλυψη μαλακού/σάπιου ξύλου','εργασία πριν στεγνώσει το ξύλο'),
 jsonb_build_array('μαλακό/σάπιο ξύλο σε βάθος','δομική απώλεια','άγνωστη επαναλαμβανόμενη πηγή νερού'),
 jsonb_build_array('έλεγχος adhesion/coverage μετά curing','έλεγχος ότι δεν παραμένουν loose fibres/coating'),
 jsonb_build_array('συχνότερος έλεγχος εκτεθειμένων όψεων/οριζόντιων λεπτομερειών και έγκαιρη συντήρηση πριν από εκτεταμένη αποτυχία'),
 jsonb_build_array('γάντια, γυαλιά, dust control/respiratory protection ανά εργασία και SDS'),
 jsonb_build_array('scraper','abrasive','brush','dust_removal','application_tools'),
 jsonb_build_array('masking','adjacent_surface_protection','dust_control'),
 'verified','approved',true,now()
FROM public.build_solution_types st, public.build_problem_types pt
WHERE st.solution_key='wood_coating' AND pt.problem_key='weathered_wood'
ON CONFLICT (scenario_key) DO NOTHING;

-- Bare ferrous steel/iron.
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
 'paint_metal_bare_ferrous',st.id,pt.id,'GENERAL_GUIDANCE','bare carbon/low-alloy steel or ferrous iron surface','both',
 'Βαφή άβαφου σιδηρούχου μετάλλου',
 'For carbon/low-alloy steel, surface preparation is selected according to surface condition, contamination, corrosion and the protective coating system. Oil/grease, loose rust, mill scale and other detrimental matter are removed to the preparation level required by the selected system; primer/topcoat details are manufacturer-specific.',
 'Σε άβαφο σίδερο/χάλυβα πρώτα καθαρίζουμε και προετοιμάζουμε τη μεταλλική βάση ανάλογα με σκουριά, ρύπους και το σύστημα που θα επιλεγεί. Το ακριβές αστάρι, οι στρώσεις και οι χρόνοι έρχονται από τον κατασκευαστή.',
 'Καθαρό και σωστά προετοιμασμένο σιδηρούχο μέταλλο πριν από το τεκμηριωμένο αντιδιαβρωτικό σύστημα.',
 jsonb_build_array('έκθεση γυμνού χάλυβα σε οξυγόνο/υγρασία','ρύποι/λάδια από κατασκευή ή χρήση','mill scale ή αρχόμενη διάβρωση'),
 jsonb_build_array('γυμνή μεταλλική επιφάνεια','λάδια/ρύποι','mill scale','τοπική σκουριά'),
 jsonb_build_array('Είναι πράγματι ανθρακούχος/χαμηλού κραματικού χάλυβας ή άλλο μέταλλο/γαλβανιζέ;','Υπάρχει σκουριά ή mill scale;','Υπάρχουν λάδια/γράσα/άλατα ή άλλοι ρύποι;','Ποιο περιβάλλον έκθεσης θα έχει η επιφάνεια;'),
 jsonb_build_array('ταυτοποίηση μεταλλικού υποστρώματος','εκτίμηση corrosion/contamination','επιλογή preparation method συμβατού με το coating system'),
 jsonb_build_array('surface preparation appropriate to steel condition','documented corrosion-protection coating system'),
 jsonb_build_array('χρήση steel workflow σε άγνωστο/μη σιδηρούχο υπόστρωμα','τελικό coating πάνω σε loose rust/contamination'),
 jsonb_build_array('απολίπανση/καθαρισμός ρύπων όπου υπάρχουν','αφαίρεση loose rust/mill scale στον απαιτούμενο βαθμό','dust removal','άμεση συνέχεια με system όταν το απαιτεί η τεκμηρίωση'),
 jsonb_build_array('ταυτοποίηση','καθαρισμός','mechanical/other documented preparation','primer where system requires','intermediate/topcoat per manufacturer','inspection'),
 jsonb_build_array('primer role and chemistry are system-specific; bare steel commonly forms part of a corrosion-protection system but no generic product is assumed'),
 jsonb_build_array('intermediate coats only as required by selected system'),
 jsonb_build_array('topcoat selected for exposure and compatibility'),
 jsonb_build_array('prepared ferrous substrate','manufacturer-documented protective coating system'),
 jsonb_build_array('additional intermediate coats only per system'),
 jsonb_build_array('respect manufacturer overcoat/cure windows'),
 jsonb_build_array('surface must not carry water/condensation during application unless selected product explicitly permits it'),
 jsonb_build_array('manufacturer limits'),jsonb_build_array('manufacturer limits'),jsonb_build_array('manufacturer weather limits for exterior work'),
 jsonb_build_array('exterior system selected for UV where relevant'),jsonb_build_array('protect application from rain as required by manufacturer'),
 jsonb_build_array('condensation on cool metal is a surface-moisture risk'),jsonb_build_array('ventilation during cleaning/coating according to hazard/SDS'),
 jsonb_build_array('primer/intermediate/topcoat form a compatible system','do not generalise steel preparation to galvanized/aluminium/non-ferrous substrates'),
 jsonb_build_array('underfilm corrosion','poor adhesion from contamination','premature rust breakthrough'),
 jsonb_build_array('painting over grease or loose corrosion','assuming all metals use same primer','leaving prepared steel exposed longer than system permits'),
 jsonb_build_array('severe section loss/perforation','unknown metal type','unsafe old coating removal hazards'),
 jsonb_build_array('check for uniform coating, defects and early rust points after curing'),
 jsonb_build_array('periodic inspection for coating damage/rust and timely local maintenance'),
 jsonb_build_array('eye/hand/respiratory/hearing protection as required by preparation method and SDS'),
 jsonb_build_array('degreasing_tools','abrasive_or_wire_tool','dust_removal','brush_or_roller_or_system_applicator'),
 jsonb_build_array('spark_or_debris_control_where_relevant','masking','ventilation'),
 'verified','approved',true,now()
FROM public.build_solution_types st, public.build_problem_types pt
WHERE st.solution_key='metal_painting' AND pt.problem_key='bare_ferrous_metal'
ON CONFLICT (scenario_key) DO NOTHING;

-- Previously painted sound ferrous steel.
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
 'paint_metal_existing_sound_ferrous',st.id,pt.id,'GENERAL_GUIDANCE','previously coated carbon/low-alloy steel or ferrous iron','both',
 'Επαναβαφή ήδη βαμμένου σιδηρούχου μετάλλου',
 'Previously coated ferrous steel should be assessed for adhesion, corrosion, contamination and compatibility. Sound retained coating can remain only after appropriate cleaning/preparation; loose paint, rust and contamination are removed, bare spots are treated according to the selected compatible system.',
 'Στο ήδη βαμμένο σίδερο κρατάμε μόνο τη βαφή που είναι σταθερή. Αφαιρούμε σκουριά, χαλαρή βαφή και ρύπους και επιβεβαιώνουμε ότι το νέο σύστημα είναι συμβατό με το παλιό.',
 'Σταθερή παλιά βαφή + σωστή προετοιμασία + επιβεβαιωμένη συμβατότητα.',
 jsonb_build_array('γήρανση coating','μηχανική φθορά','τοπική διάβρωση','ρύποι/γράσα','ασυμβατότητα νέου/παλιού coating'),
 jsonb_build_array('sound coating με τοπικές φθορές','rust spots','glossy retained film','peeling όπου υπάρχει αστοχία'),
 jsonb_build_array('Η παλιά βαφή είναι σταθερά προσκολλημένη;','Υπάρχει σκουριά κάτω ή δίπλα στο coating;','Γνωρίζουμε αν το νέο σύστημα είναι συμβατό;','Υπάρχουν γυμνά μεταλλικά σημεία;'),
 jsonb_build_array('έλεγχος adhesion/condition','απολίπανση/καθαρισμός','αφαίρεση loose paint/rust','compatibility check/test area where uncertain'),
 jsonb_build_array('maintenance repaint over sound retained coating after preparation','local bare-metal treatment per compatible system'),
 jsonb_build_array('recoat over loose paint/rust','automatic overcoating of unknown incompatible coating'),
 jsonb_build_array('remove contamination','remove loose paint/rust','dull/abrade sound glossy coating where appropriate','dust removal','prepare bare spots per selected system'),
 jsonb_build_array('inspect','clean/degrease','remove defects','compatibility test if needed','treat bare spots','apply compatible finish system','inspect'),
 jsonb_build_array('primer/spot-primer only as required by the selected compatible system'),
 jsonb_build_array('system-specific'),jsonb_build_array('compatible protective topcoat system'),
 jsonb_build_array('sound retained coating','compatible new system'),
 jsonb_build_array('spot primer/intermediate layers per manufacturer'),
 jsonb_build_array('manufacturer overcoat/cure windows'),
 jsonb_build_array('surface dry/condensation-free as required by product'),
 jsonb_build_array('manufacturer limits'),jsonb_build_array('manufacturer limits'),jsonb_build_array('exterior manufacturer weather limits'),
 jsonb_build_array('exterior topcoat suitable for UV where relevant'),jsonb_build_array('protect curing coating from rain as required'),
 jsonb_build_array('condensation can form on metal and interfere with coating application'),jsonb_build_array('adequate ventilation per cleaning/coating hazard and SDS'),
 jsonb_build_array('new coating compatible with retained old coating','bare spots compatible with primer/topcoat system','test area/technical confirmation when old coating is unknown'),
 jsonb_build_array('delamination between old/new coating','corrosion continuing under coating','edge lifting around repaired spots'),
 jsonb_build_array('ignoring rust under apparently sound coating','painting glossy/contaminated surface without required prep','assuming compatibility'),
 jsonb_build_array('widespread hidden corrosion','severe section loss','unknown coating that fails compatibility test','hazardous legacy coating removal'),
 jsonb_build_array('inspect adhesion, edges and rust points after cure'),
 jsonb_build_array('periodic inspection and prompt repair of coating damage'),
 jsonb_build_array('PPE for abrasion/cleaning/coating and hazard-specific respiratory protection per SDS/risk'),
 jsonb_build_array('degreasing_tools','abrasive_or_wire_tool','dust_removal','application_tools'),
 jsonb_build_array('masking','debris_control','ventilation'),
 'verified','approved',true,now()
FROM public.build_solution_types st, public.build_problem_types pt
WHERE st.solution_key='metal_painting' AND pt.problem_key='sound_existing_coating'
ON CONFLICT (scenario_key) DO NOTHING;

-- General rules for the new scenarios.
INSERT INTO public.build_solution_rules
(scenario_id,rule_key,source_layer,rule_category,technical_rule,customer_explanation_el,short_explanation_el,
 evidence_strength,applicability,context_dependent,active)
SELECT p.id,x.rule_key,'GENERAL_GUIDANCE',x.category,x.technical,x.customer,x.short,x.strength,x.applicability::jsonb,x.context_dependent,true
FROM public.build_solution_profiles p
JOIN (VALUES
('waterproof_exterior_wall_rain_penetration','visible_damp_not_entry_point','diagnosis',
 'The visible internal or external damp area does not by itself identify the water entry point or moisture mechanism.',
 'Το ορατό σημάδι υγρασίας δεν αποδεικνύει από πού μπαίνει το νερό.','Το σημάδι δεν είναι πάντα το σημείο εισόδου.','strong_consensus','{}',true),
('waterproof_exterior_wall_rain_penetration','repair_source_before_finish','system_sequence',
 'Known defects and the moisture source/path are addressed before a decorative or protective coating is treated as the solution.',
 'Πρώτα διορθώνεται η πηγή/διαδρομή του νερού και μετά επιλέγεται τελικό σύστημα.','Πρώτα η αιτία, μετά το coating.','strong_consensus','{}',false),
('repair_small_holes_dents','minor_patch_requires_sound_clean_base','surface_preparation',
 'Minor patch repairs require loose material to be removed and the repair area cleaned before filling.',
 'Πριν από το γέμισμα αφαιρούνται οι χαλαρές ακμές και η σκόνη.','Σταθερή και καθαρή βάση πριν το filler.','common_professional_practice','{}',false),
('repair_small_holes_dents','repair_material_depth_substrate_specific','compatibility',
 'Repair/filler material selection depends on the background and repair depth; no universal filler or maximum depth is inferred.',
 'Το υλικό επισκευής επιλέγεται ανά βάση και βάθος· δεν υπάρχει ένας στόκος για όλες τις περιπτώσεις.','Υλικό ανά βάση και βάθος.','common_professional_practice','{}',true),
('repair_weak_friable_wall_surface','unstable_material_removed_to_sound_base','surface_preparation',
 'Loose, flaking, friable or delaminating material is removed back to a sound background before a new repair or finish is applied.',
 'Τα σαθρά και αποκολλημένα σημεία αφαιρούνται μέχρι να βρεθεί σταθερή βάση.','Αφαίρεση σαθρών μέχρι σταθερή βάση.','common_professional_practice','{}',false),
('repair_weak_friable_wall_surface','primer_not_substitute_for_unstable_substrate','primer_role',
 'A primer/conditioner is not treated as a substitute for removing material that is already loose or delaminating.',
 'Το αστάρι δεν αντικαθιστά την αφαίρεση υλικού που ήδη ξεκολλά ή αποσαθρώνεται.','Το αστάρι δεν «σώζει» αποκολλημένη βάση.','common_professional_practice','{}',false),
('paint_wood_existing_sound','retain_only_sound_existing_finish','surface_preparation',
 'Existing wood finish may be retained only where it is sound after cleaning/preparation; loose finish is removed.',
 'Κρατάμε το παλιό finish μόνο όπου είναι σταθερό· ό,τι ξεφλουδίζει αφαιρείται.','Μόνο σταθερό παλιό finish παραμένει.','strong_consensus','{}',false),
('paint_wood_existing_sound','unknown_wood_finish_compatibility_check','compatibility',
 'Compatibility with an unknown retained wood finish should be confirmed before full-area recoating.',
 'Αν δεν γνωρίζουμε το παλιό finish, επιβεβαιώνουμε συμβατότητα πριν από γενική εφαρμογή.','Έλεγχος συμβατότητας άγνωστου finish.','common_professional_practice','{}',true),
('paint_wood_weathered','remove_degraded_wood_surface_before_finish','surface_preparation',
 'Weather-degraded loose surface fibres are prepared back to a sound wood surface before finishing.',
 'Οι χαλαρές, υποβαθμισμένες ίνες από καιρική έκθεση αφαιρούνται πριν από νέο finish.','Sound wood before finishing.','strong_consensus','{}',false),
('paint_wood_weathered','weathering_is_moisture_uv_exposure_problem','diagnosis',
 'Exterior wood weathering is influenced by moisture, sunlight and other environmental exposure; coating alone does not correct a continuing water-detail defect.',
 'Η φθορά εξωτερικού ξύλου συνδέεται με νερό, ήλιο και έκθεση· μια νέα βαφή δεν διορθώνει συνεχή διαβροχή από λάθος λεπτομέρεια.','Ελέγχουμε και την αιτία διαβροχής.','strong_consensus','{}',true),
('paint_metal_bare_ferrous','steel_prep_depends_on_surface_and_system','surface_preparation',
 'Preparation of carbon/low-alloy steel depends on the surface condition and selected protective paint system; contamination and detrimental loose corrosion products are removed to the required preparation level.',
 'Η προετοιμασία σιδήρου/χάλυβα εξαρτάται από την κατάστασή του και το επιλεγμένο σύστημα προστασίας.','Preparation ανά κατάσταση και σύστημα.','standard_based','{"metal_type":"ferrous_steel"}',true),
('paint_metal_bare_ferrous','do_not_generalise_steel_to_other_metals','compatibility',
 'A ferrous-steel preparation/coating pathway must not be generalized to galvanized, aluminium or other non-ferrous substrates.',
 'Η διαδικασία για σίδερο/χάλυβα δεν εφαρμόζεται αυτόματα σε γαλβανιζέ, αλουμίνιο ή άλλα μέταλλα.','Άλλο μέταλλο = άλλος έλεγχος.','standard_based','{}',false),
('paint_metal_existing_sound_ferrous','retain_only_sound_old_metal_coating','surface_preparation',
 'On previously painted steel, loose paint, rust and contamination are removed; only sound retained coating is considered for overcoating.',
 'Στο ήδη βαμμένο μέταλλο αφαιρούμε χαλαρή βαφή, σκουριά και ρύπους και κρατάμε μόνο σταθερό coating.','Μόνο sound coating παραμένει.','strong_consensus','{}',false),
('paint_metal_existing_sound_ferrous','metal_recoat_requires_compatibility','compatibility',
 'A new coating system over retained old paint requires documented or tested compatibility.',
 'Η νέα βαφή πάνω σε παλιά χρειάζεται επιβεβαιωμένη συμβατότητα.','Επιβεβαίωση συμβατότητας πριν την επαναβαφή.','common_professional_practice','{}',true)
) AS x(scenario_key,rule_key,category,technical,customer,short,strength,applicability,context_dependent)
ON p.scenario_key=x.scenario_key
ON CONFLICT (scenario_id,rule_key) DO NOTHING;

-- Diagnostic questions.
INSERT INTO public.build_diagnostic_rules
(scenario_id,diagnostic_key,source_layer,question_el,observable_indicators,condition_expression,
 possible_interpretations,uncertainty_flag,outcome,evidence_strength,active)
SELECT p.id,x.key,'GENERAL_GUIDANCE',x.question,x.indicators::jsonb,x.cond::jsonb,x.interpretations::jsonb,true,x.outcome::jsonb,x.strength,true
FROM public.build_solution_profiles p
JOIN (VALUES
('waterproof_exterior_wall_rain_penetration','rain_correlation','Το σημάδι εμφανίζεται ή χειροτερεύει μετά από βροχή;','["χρονική συσχέτιση με βροχή","πλευρά έκθεσης"]','{}','["πιθανή rain penetration","άλλη πηγή δεν αποκλείεται"]','{"next":"inspect_envelope_and_details"}','strong_consensus'),
('waterproof_exterior_wall_rain_penetration','façade_details','Υπάρχουν ρωγμές, χαλασμένοι αρμοί, σφραγίσεις, υδρορροές ή αστοχίες γύρω από ανοίγματα;','["cracks","open joints","failed seals","overflowing gutters/downpipes"]','{}','["πιθανή διαδρομή νερού","χρειάζεται επιβεβαίωση"]','{"next":"repair_confirmed_defect_before_finish"}','strong_consensus'),
('repair_small_holes_dents','repair_depth_and_background','Ποιο είναι το υπόστρωμα και πόσο βαθιά είναι η τοπική βλάβη;','["plaster","plasterboard","render","depth/extent"]','{}','["minor filler path","deeper repair system may be required"]','{"next":"select_repair_material_by_background_and_depth"}','common_professional_practice'),
('repair_small_holes_dents','loose_edges_or_moisture','Υπάρχουν χαλαρές ακμές ή υγρασία γύρω από τη βλάβη;','["loose edge","powder","damp mark"]','{}','["prepare to sound base","moisture diagnosis may be required"]','{"next":"stabilize_or_diagnose_before_fill"}','common_professional_practice'),
('repair_weak_friable_wall_surface','extent_of_friability','Μετά την αφαίρεση των χαλαρών σημείων, παραμένει σταθερή βάση;','["powdering","delamination","hollow areas","firm exposed substrate"]','{}','["local repair possible","large-area repair may be required"]','{"next":"proceed_only_on_sound_background"}','common_professional_practice'),
('repair_weak_friable_wall_surface','moisture_behind_failure','Υπάρχει υγρασία ή διαρροή πίσω από τη σαθρή περιοχή;','["dampness","staining","efflorescence","blistering"]','{}','["moisture may be contributing","dry deterioration may have another cause"]','{"next":"resolve_moisture_if_present"}','strong_consensus'),
('paint_wood_existing_sound','wood_old_finish_condition','Η παλιά βαφή/βερνίκι είναι σταθερά προσκολλημένη και το ξύλο από κάτω σκληρό;','["sound coating","peeling","soft wood","decay"]','{}','["maintenance recoat","strip/repair","possible wood deterioration"]','{"next":"retain_only_sound_areas"}','strong_consensus'),
('paint_wood_weathered','wood_decay_screen','Η φθορά είναι επιφανειακή ή το ξύλο είναι μαλακό/σάπιο σε βάθος;','["surface greying","loose fibres","softness","deep decay"]','{}','["surface weathering","possible deeper biodeterioration"]','{"next":"do_not_coat_over_significant_decay"}','strong_consensus'),
('paint_metal_bare_ferrous','confirm_metal_type','Είναι η επιφάνεια σίδερο/ανθρακούχος χάλυβας και όχι γαλβανιζέ, αλουμίνιο ή άλλο μέταλλο;','["known fabrication","magnetic/visual clues are not definitive"]','{}','["ferrous pathway","different substrate pathway required"]','{"next":"confirm_substrate_before_system"}','standard_based'),
('paint_metal_bare_ferrous','steel_contamination_corrosion','Υπάρχουν λάδια, γράσα, mill scale ή σκουριά;','["oil","grease","mill scale","rust"]','{}','["cleaning/preparation required before coating"]','{"next":"prepare_to_selected_system_requirement"}','standard_based'),
('paint_metal_existing_sound_ferrous','old_metal_coating_condition','Η παλιά μεταλλική βαφή είναι σταθερή ή υπάρχουν ξεφλούδισμα/σκουριά;','["adhesion","peeling","rust spots","bare edges"]','{}','["sound retained coating","local/full preparation required"]','{"next":"remove_failed_material_and_prepare"}','strong_consensus'),
('paint_metal_existing_sound_ferrous','old_metal_coating_compatibility','Είναι γνωστή ή δοκιμασμένη η συμβατότητα του νέου coating με το παλιό;','["known system","test patch","adhesion response"]','{}','["compatible recoat","review/test required"]','{"next":"confirm_compatibility_before_full_area"}','common_professional_practice')
) AS x(scenario_key,key,question,indicators,cond,interpretations,outcome,strength)
ON p.scenario_key=x.scenario_key
ON CONFLICT (scenario_id,diagnostic_key) DO NOTHING;

-- Ordered project steps.
INSERT INTO public.build_solution_steps
(scenario_id,source_layer,step_number,step_type,required,conditional_expression,prerequisite_step_numbers,
 next_allowed_step_numbers,technical_rule,customer_explanation_el,evidence_strength,active)
SELECT p.id,'GENERAL_GUIDANCE',x.n,x.type,x.required,x.cond::jsonb,
 CASE WHEN x.n=1 THEN '{}'::int[] ELSE ARRAY[x.n-1] END,
 CASE WHEN x.n=x.last_n THEN '{}'::int[] ELSE ARRAY[x.n+1] END,
 x.technical,x.customer,x.strength,true
FROM public.build_solution_profiles p
JOIN (VALUES
('waterproof_exterior_wall_rain_penetration',1,9,'diagnose',true,'{}','Distinguish likely rain penetration from other moisture mechanisms and identify probable envelope/detail paths.','Συσχέτισε το πρόβλημα με βροχή και έλεγξε πιθανές διαδρομές νερού.','strong_consensus'),
('waterproof_exterior_wall_rain_penetration',2,9,'safe_access',false,'{"work_at_height":true}','Establish safe access before façade inspection/repair at height.','Οργάνωσε ασφαλή πρόσβαση αν η εργασία είναι σε ύψος.','regulatory'),
('waterproof_exterior_wall_rain_penetration',3,9,'inspect_details',true,'{}','Inspect cracks/render, joints, openings, parapets, gutters/downpipes and adjoining details.','Έλεγξε ρωγμές, αρμούς, κουφώματα, στηθαία και απορροές.','strong_consensus'),
('waterproof_exterior_wall_rain_penetration',4,9,'repair_source',true,'{}','Repair confirmed defects/source before treating a finish coating as the solution.','Διόρθωσε πρώτα τις επιβεβαιωμένες αιτίες/λεπτομέρειες.','strong_consensus'),
('waterproof_exterior_wall_rain_penetration',5,9,'remove_unstable_material',true,'{}','Remove loose/delaminated coating or render to a sound background.','Αφαίρεσε σαθρές ή αποκολλημένες στρώσεις μέχρι σταθερή βάση.','strong_consensus'),
('waterproof_exterior_wall_rain_penetration',6,9,'clean_and_dry',true,'{}','Clean and allow the substrate/repairs to reach the moisture condition required by the selected system.','Καθάρισε και άφησε βάση/επισκευές να στεγνώσουν όσο απαιτεί το σύστημα.','strong_consensus'),
('waterproof_exterior_wall_rain_penetration',7,9,'prepare_system',false,'{"protective_system_selected":true}','Apply only the documented preparation/primer required for the selected compatible system.','Χρησιμοποίησε μόνο την προετοιμασία/αστάρι που απαιτεί το επιλεγμένο σύστημα.','context_dependent'),
('waterproof_exterior_wall_rain_penetration',8,9,'apply_protective_finish',false,'{"protective_system_selected":true}','Apply the selected protective/waterproofing finish according to manufacturer instructions.','Εφάρμοσε το τελικό σύστημα σύμφωνα με τις οδηγίες κατασκευαστή.','context_dependent'),
('waterproof_exterior_wall_rain_penetration',9,9,'inspect_after_rain',true,'{}','Reinspect repaired details and signs of ingress after appropriate curing and subsequent rain exposure.','Μετά την ωρίμανση, επανέλεγξε τα σημεία και την επόμενη βροχή.','strong_consensus'),

('repair_small_holes_dents',1,7,'diagnose',true,'{}','Confirm the damage is local/non-structural and identify background and repair depth.','Επιβεβαίωσε βάση, βάθος και ότι η βλάβη είναι τοπική/μη δομική.','common_professional_practice'),
('repair_small_holes_dents',2,7,'remove_loose_material',true,'{}','Remove loose edges/material around the repair.','Αφαίρεσε χαλαρές ακμές και σαθρό υλικό.','common_professional_practice'),
('repair_small_holes_dents',3,7,'clean',true,'{}','Remove dust and contamination from the repair area.','Καθάρισε τη σκόνη και τους ρύπους.','common_professional_practice'),
('repair_small_holes_dents',4,7,'fill',true,'{}','Fill with a repair material documented as suitable for the background and depth.','Γέμισε με υλικό κατάλληλο για τη βάση και το βάθος.','common_professional_practice'),
('repair_small_holes_dents',5,7,'additional_fill_if_required',false,'{"additional_repair_layer_required":true}','Where the selected system requires staged/deeper filling, allow the preceding layer to set/dry before the next.','Αν χρειάζονται στάδια, άφησε το προηγούμενο να πήξει/στεγνώσει πριν το επόμενο.','common_professional_practice'),
('repair_small_holes_dents',6,7,'sand_smooth',true,'{}','After full drying/setting, smooth the repair as appropriate for the finish.','Μετά την πλήρη ξήρανση/πήξη, λείανε την επισκευή.','common_professional_practice'),
('repair_small_holes_dents',7,7,'finish',false,'{"finish_required":true}','Prime/finish only as required by the repair substrate and selected coating system.','Αστάρωσε/βάψε μόνο όπως απαιτεί η επισκευασμένη βάση και το τελικό σύστημα.','context_dependent'),

('repair_weak_friable_wall_surface',1,7,'diagnose_extent',true,'{}','Map the extent of friability/delamination and check for moisture.','Έλεγξε πόσο εκτεταμένη είναι η αστάθεια και αν υπάρχει υγρασία.','common_professional_practice'),
('repair_weak_friable_wall_surface',2,7,'remove_unstable_material',true,'{}','Remove loose, flaking and delaminated material back to a sound background.','Αφαίρεσε ό,τι είναι σαθρό ή αποκολλημένο μέχρι σταθερή βάση.','common_professional_practice'),
('repair_weak_friable_wall_surface',3,7,'reassess_background',true,'{}','Reassess whether the exposed background is sound enough for local repair.','Ξαναέλεγξε αν η βάση που αποκαλύφθηκε είναι αρκετά σταθερή για τοπική επισκευή.','common_professional_practice'),
('repair_weak_friable_wall_surface',4,7,'resolve_moisture',false,'{"significant_moisture":true}','Resolve the moisture source before rebuilding/finishing the surface.','Αν υπάρχει σημαντική υγρασία, λύσε πρώτα την αιτία.','strong_consensus'),
('repair_weak_friable_wall_surface',5,7,'repair',false,'{"substrate_stable":true}','Apply a repair system suitable for the sound substrate and repair extent.','Εφάρμοσε repair system κατάλληλο για τη σταθερή βάση και την έκταση.','context_dependent'),
('repair_weak_friable_wall_surface',6,7,'cure_dry',true,'{}','Allow repair materials to cure/dry according to their manufacturer instructions.','Άφησε τα υλικά επισκευής να ωριμάσουν/στεγνώσουν όπως ορίζει ο κατασκευαστής.','context_dependent'),
('repair_weak_friable_wall_surface',7,7,'finish',false,'{"finish_required":true}','Finish only over a sound, prepared and sufficiently dry repaired surface.','Κάνε τελικό φινίρισμα μόνο σε σταθερή και επαρκώς στεγνή βάση.','strong_consensus'),

('paint_wood_existing_sound',1,7,'inspect',true,'{}','Check retained finish adhesion, wood soundness/moisture and compatibility.','Έλεγξε πρόσφυση παλιού finish, κατάσταση ξύλου/υγρασία και συμβατότητα.','strong_consensus'),
('paint_wood_existing_sound',2,7,'remove_failed_finish',true,'{}','Remove loose or failed coating and address any degraded wood.','Αφαίρεσε χαλαρό finish και αποκατάστησε τυχόν υποβαθμισμένο ξύλο.','strong_consensus'),
('paint_wood_existing_sound',3,7,'clean_prepare',true,'{}','Clean and prepare retained sound finish to receive the selected system.','Καθάρισε και προετοίμασε το σταθερό παλιό finish.','common_professional_practice'),
('paint_wood_existing_sound',4,7,'compatibility_check',false,'{"existing_coating_known_compatible":false}','Use a documented compatibility assessment or test area before full recoating.','Αν η συμβατότητα είναι άγνωστη, κάνε τεχνική επιβεβαίωση ή δοκιμή.','common_professional_practice'),
('paint_wood_existing_sound',5,7,'spot_prepare_bare_wood',false,'{"bare_wood_spots":true}','Prepare bare wood spots according to the selected wood-coating system.','Προετοίμασε τα γυμνά σημεία όπως ορίζει το επιλεγμένο σύστημα ξύλου.','context_dependent'),
('paint_wood_existing_sound',6,7,'apply_finish',true,'{}','Apply the selected compatible finish strictly to manufacturer instructions.','Εφάρμοσε το συμβατό finish σύμφωνα με τον κατασκευαστή.','context_dependent'),
('paint_wood_existing_sound',7,7,'inspect',true,'{}','Inspect adhesion, continuity and defects after curing.','Μετά την ωρίμανση έλεγξε πρόσφυση και ομοιομορφία.','common_professional_practice'),

('paint_wood_weathered',1,7,'inspect',true,'{}','Distinguish surface weathering from significant decay/softness and continuing water exposure.','Ξεχώρισε επιφανειακή φθορά από βαθύτερη σήψη/μαλάκωμα και συνεχή διαβροχή.','strong_consensus'),
('paint_wood_weathered',2,7,'remove_failed_finish',true,'{}','Remove failed coating and loose weather-degraded fibres.','Αφαίρεσε αποτυχημένο finish και χαλαρές weathered ίνες.','strong_consensus'),
('paint_wood_weathered',3,7,'sand_to_sound_surface',true,'{}','Prepare/sand as appropriate until a sound surface is available for finishing.','Προετοίμασε/τρίψε όσο χρειάζεται μέχρι να υπάρχει σταθερή επιφάνεια.','strong_consensus'),
('paint_wood_weathered',4,7,'clean_dry',true,'{}','Remove dust/contamination and allow the wood to dry appropriately.','Καθάρισε σκόνη/ρύπους και άφησε το ξύλο να στεγνώσει.','strong_consensus'),
('paint_wood_weathered',5,7,'repair_water_detail',false,'{"continuing_water_exposure":true}','Correct a continuing water-entry/detail defect before finishing.','Αν το ξύλο βρέχεται συνεχώς από κάποια λεπτομέρεια, διόρθωσέ την πρώτα.','strong_consensus'),
('paint_wood_weathered',6,7,'apply_documented_system',true,'{}','Apply the selected exterior wood-finishing system according to manufacturer instructions.','Εφάρμοσε το επιλεγμένο εξωτερικό σύστημα ξύλου σύμφωνα με τον κατασκευαστή.','context_dependent'),
('paint_wood_weathered',7,7,'inspect_maintain',true,'{}','Inspect after curing and plan periodic maintenance for exposed wood.','Έλεγξε μετά την ωρίμανση και προγραμμάτισε περιοδική συντήρηση.','strong_consensus'),

('paint_metal_bare_ferrous',1,7,'confirm_substrate',true,'{}','Confirm the substrate is carbon/low-alloy ferrous steel before using this pathway.','Επιβεβαίωσε ότι είναι σίδερο/χάλυβας και όχι άλλο μέταλλο.','standard_based'),
('paint_metal_bare_ferrous',2,7,'inspect_condition',true,'{}','Assess oil/grease, rust, mill scale and other contamination.','Έλεγξε λάδια, σκουριά, mill scale και άλλους ρύπους.','standard_based'),
('paint_metal_bare_ferrous',3,7,'degrease_clean',true,'{}','Remove oil/grease and other contamination by an appropriate method.','Αφαίρεσε λάδια/γράσα και ρύπους με κατάλληλη μέθοδο.','common_professional_practice'),
('paint_metal_bare_ferrous',4,7,'prepare_steel',true,'{}','Prepare the steel to the cleanliness/profile required by the selected protective system.','Προετοίμασε το μέταλλο στον βαθμό που απαιτεί το επιλεγμένο σύστημα.','standard_based'),
('paint_metal_bare_ferrous',5,7,'remove_dust',true,'{}','Remove preparation debris/dust before coating.','Αφαίρεσε σκόνη και υπολείμματα προετοιμασίας.','common_professional_practice'),
('paint_metal_bare_ferrous',6,7,'apply_protective_system',true,'{}','Apply primer/intermediate/topcoat only as defined by the selected manufacturer system.','Εφάρμοσε αστάρι/ενδιάμεσες/τελικές στρώσεις μόνο όπως ορίζει το επιλεγμένο σύστημα.','context_dependent'),
('paint_metal_bare_ferrous',7,7,'inspect',true,'{}','Inspect coating continuity and early corrosion defects after curing.','Μετά την ωρίμανση έλεγξε συνέχεια coating και σημεία πρώιμης σκουριάς.','common_professional_practice'),

('paint_metal_existing_sound_ferrous',1,7,'inspect',true,'{}','Inspect old coating adhesion, corrosion and contamination.','Έλεγξε πρόσφυση παλιάς βαφής, σκουριά και ρύπους.','strong_consensus'),
('paint_metal_existing_sound_ferrous',2,7,'clean_degrease',true,'{}','Remove oil/grease and contamination.','Καθάρισε και απολίπανε την επιφάνεια.','common_professional_practice'),
('paint_metal_existing_sound_ferrous',3,7,'remove_loose_paint_rust',true,'{}','Remove loose paint and loose/detrimental corrosion products.','Αφαίρεσε χαλαρή βαφή και προβληματική σκουριά.','strong_consensus'),
('paint_metal_existing_sound_ferrous',4,7,'prepare_retained_coating',true,'{}','Prepare the retained sound coating as required for adhesion of the selected system.','Προετοίμασε τη σταθερή παλιά βαφή ώστε να δεχτεί το νέο σύστημα.','common_professional_practice'),
('paint_metal_existing_sound_ferrous',5,7,'confirm_compatibility',false,'{"existing_coating_known_compatible":false}','Confirm compatibility/test before full-area recoating.','Επιβεβαίωσε συμβατότητα πριν από γενική επαναβαφή.','common_professional_practice'),
('paint_metal_existing_sound_ferrous',6,7,'apply_system',true,'{}','Apply the compatible coating system according to manufacturer instructions.','Εφάρμοσε το συμβατό coating σύμφωνα με τον κατασκευαστή.','context_dependent'),
('paint_metal_existing_sound_ferrous',7,7,'inspect',true,'{}','Inspect adhesion, edges and rust points after curing.','Έλεγξε πρόσφυση, ακμές και σημεία σκουριάς μετά την ωρίμανση.','common_professional_practice')
) AS x(scenario_key,n,last_n,type,required,cond,technical,customer,strength)
ON p.scenario_key=x.scenario_key
ON CONFLICT (scenario_id,step_number) DO NOTHING;

-- Scenario-specific stops/warnings in Layer C.
INSERT INTO public.build_stop_conditions
(scenario_id,stop_key,source_layer,severity,condition_expression,reason_el,next_action_el,
 professional_assessment_required,evidence_basis,active)
SELECT p.id,x.key,'KONTA_MOU_RULE',x.severity,x.cond::jsonb,x.reason,x.next_action,x.professional,
 'KONTA MOU workflow rule supported by linked technical evidence',true
FROM public.build_solution_profiles p
JOIN (VALUES
('waterproof_exterior_wall_rain_penetration','rain_source_unresolved','BLOCK','{"significant_moisture":true,"source_known":false}',
 'Η σημαντική υγρασία στον εξωτερικό τοίχο δεν έχει σαφή πηγή.','Διερεύνησε βροχή, αρμούς/ρωγμές, απορροές και άλλες πιθανές πηγές πριν από coating.',true),
('repair_small_holes_dents','damage_not_minor','WARN','{"repair_extent":"extensive"}',
 'Η βλάβη δεν είναι πλέον μικρή/τοπική.','Χρησιμοποίησε workflow μεγάλης επισκευής και έλεγξε αν χρειάζεται τεχνική αξιολόγηση πριν αγοραστούν υλικά.',false),
('repair_weak_friable_wall_surface','large_area_friable','BLOCK','{"friable_area":"widespread"}',
 'Μεγάλο τμήμα της επιφάνειας παραμένει σαθρό ή αποκολλάται.','Απαιτείται αξιολόγηση της βάσης και σχεδιασμός μεγαλύτερης αποκατάστασης αντί για απλό τοπικό στόκο/αστάρι.',true),
('paint_wood_existing_sound','significant_wood_decay','BLOCK','{"wood_decay_or_softness":"significant"}',
 'Το ξύλο είναι σημαντικά μαλακό/σάπιο και δεν αποτελεί σταθερή βάση για απλή επαναβαφή.','Αξιολόγησε και επισκεύασε/αντικατάστησε το υποβαθμισμένο ξύλο πριν από finishing.',true),
('paint_wood_weathered','significant_wood_decay','BLOCK','{"wood_decay_or_softness":"significant"}',
 'Η φθορά δεν φαίνεται μόνο επιφανειακή· υπάρχει σημαντικό μαλάκωμα/σήψη.','Μην κρύψεις το πρόβλημα με coating. Χρειάζεται αξιολόγηση και αποκατάσταση του ξύλου.',true),
('paint_metal_bare_ferrous','metal_type_unknown','BLOCK','{"metal_type_known":false}',
 'Δεν έχει επιβεβαιωθεί ότι το υπόστρωμα είναι σιδηρούχος χάλυβας/σίδερο.','Ταυτοποίησε το μέταλλο πριν εφαρμοστεί steel-specific primer/coating workflow.',false),
('paint_metal_existing_sound_ferrous','severe_section_loss','BLOCK','{"metal_section_loss":"severe"}',
 'Υπάρχει σοβαρή απώλεια διατομής/διάτρηση από διάβρωση.','Μην αντιμετωπίσεις το θέμα ως απλή βαφή. Χρειάζεται τεχνική αξιολόγηση του μεταλλικού στοιχείου.',true)
) AS x(scenario_key,key,severity,cond,reason,next_action,professional)
ON p.scenario_key=x.scenario_key
ON CONFLICT (scenario_id,stop_key) DO NOTHING;

-- Failure modes.
INSERT INTO public.build_failure_modes
(scenario_id,source_layer,failure_key,title_el,possible_causes,preventive_actions,observable_symptoms,
 severity,corrective_action_category,evidence_strength,active)
SELECT p.id,'GENERAL_GUIDANCE',x.key,x.title,x.causes::jsonb,x.prevent::jsonb,x.symptoms::jsonb,
 x.severity,x.corrective,x.strength,true
FROM public.build_solution_profiles p
JOIN (VALUES
('waterproof_exterior_wall_rain_penetration','water_ingress_recurs','Επανεμφάνιση νερού/υγρασίας',
 '["πηγή ή διαδρομή νερού δεν αποκαταστάθηκε","λεπτομέρεια/αρμός παραμένει αστοχημένος","coating εφαρμόστηκε σε υγρή/ασταθή βάση"]',
 '["διάγνωση πριν από coating","επισκευή λεπτομερειών","στέγνωμα και συμβατότητα"]',
 '["λεκέδες μετά από βροχή","φούσκωμα/ξεφλούδισμα","υγρές ζώνες"]','high','reinspect_moisture_source','strong_consensus'),
('repair_small_holes_dents','patch_shrink_or_detach','Βύθιση ή αποκόλληση τοπικού repair',
 '["χαλαρή/σκονισμένη βάση","ακατάλληλο υλικό ή πάχος","ανεπαρκές στέγνωμα μεταξύ σταδίων"]',
 '["sound clean base","repair material suitable for depth/background","respect setting/drying"]',
 '["βύθιση","ρωγμή περιμέτρου","ξεκόλλημα"]','medium','remove_failed_patch_and_repair','common_professional_practice'),
('repair_weak_friable_wall_surface','repair_detaches_with_old_layer','Νέα επισκευή αποκολλάται μαζί με την παλιά βάση',
 '["friable material remained","moisture unresolved","repair bonded to weak layer"]',
 '["remove unstable material to sound base","resolve moisture","reassess extent"]',
 '["delamination","hollow/loose areas","powdering"]','high','return_to_sound_substrate','common_professional_practice'),
('paint_wood_existing_sound','wood_finish_delamination','Αποκόλληση νέου finish από παλιό',
 '["unknown incompatibility","retained finish not sound","contamination/gloss not prepared"]',
 '["compatibility check","retain only sound finish","proper cleaning/preparation"]',
 '["peeling","edge lifting","poor adhesion"]','medium','reprepare_and_recoat','common_professional_practice'),
('paint_wood_weathered','finish_failure_over_degraded_fibres','Πρόωρη αστοχία finish σε weathered ξύλο',
 '["degraded surface fibres retained","continuing moisture exposure","finish on unsound wood"]',
 '["prepare back to sound wood","correct water exposure","finish only dry sound substrate"]',
 '["peeling","cracking","wood fibres on back of failed coating"]','high','remove_failed_finish_and_restore_surface','strong_consensus'),
('paint_metal_bare_ferrous','early_corrosion_breakthrough','Πρώιμη επανεμφάνιση σκουριάς',
 '["inadequate surface preparation","contamination","incompatible/incomplete coating system"]',
 '["prepare steel to selected system requirement","remove contamination","use documented complete system"]',
 '["rust spots","blistering","underfilm corrosion"]','high','corrosion_repair_and_recoat','standard_based'),
('paint_metal_existing_sound_ferrous','intercoat_delamination_or_corrosion','Αποκόλληση νέου coating ή διάβρωση από κάτω',
 '["old coating not sound","incompatibility","rust/contamination remained"]',
 '["adhesion/compatibility check","remove failed paint/rust","clean and prepare retained coating"]',
 '["peeling between layers","rust at defects","edge lifting"]','high','reprepare_and_recoat','strong_consensus')
) AS x(scenario_key,key,title,causes,prevent,symptoms,severity,corrective,strength)
ON p.scenario_key=x.scenario_key
ON CONFLICT (scenario_id,failure_key) DO NOTHING;

-- Tool categories.
INSERT INTO public.build_tool_requirements
(scenario_id,source_layer,tool_category,requirement_level,reason_el,condition_expression,active)
SELECT p.id,'GENERAL_GUIDANCE',x.tool,x.level,x.reason,x.cond::jsonb,true
FROM public.build_solution_profiles p
JOIN (VALUES
('waterproof_exterior_wall_rain_penetration','inspection_tools','required','Για έλεγχο façade/details και καταγραφή μοτίβου υγρασίας.','{}'),
('waterproof_exterior_wall_rain_penetration','surface_preparation_tools','conditional','Για αφαίρεση σαθρών και προετοιμασία επισκευών.','{}'),
('waterproof_exterior_wall_rain_penetration','repair_detail_tools','conditional','Για επιβεβαιωμένες ρωγμές/αρμούς/λεπτομέρειες.','{}'),
('waterproof_exterior_wall_rain_penetration','application_tools','conditional','Μόνο για το επιλεγμένο τεκμηριωμένο σύστημα.','{"protective_system_selected":true}'),
('waterproof_exterior_wall_rain_penetration','fall_protection','conditional','Για εργασίες σε ύψος.','{"work_at_height":true}'),

('repair_small_holes_dents','scraper','required','Για αφαίρεση χαλαρών ακμών.','{}'),
('repair_small_holes_dents','filling_knife_or_trowel','required','Για τοπικό γέμισμα/εξομάλυνση.','{}'),
('repair_small_holes_dents','abrasive','conditional','Για λείανση μετά την πλήρη ξήρανση.','{}'),
('repair_small_holes_dents','dust_removal','required','Για καθαρή repair area.','{}'),

('repair_weak_friable_wall_surface','scraper','required','Για αφαίρεση ασταθών στρώσεων.','{}'),
('repair_weak_friable_wall_surface','inspection_tapping_tool','conditional','Για αποτύπωση αποκόλλησης όπου είναι κατάλληλο.','{}'),
('repair_weak_friable_wall_surface','dust_removal','required','Για έλεγχο/καθαρισμό της βάσης.','{}'),
('repair_weak_friable_wall_surface','repair_tools','conditional','Μετά την επιβεβαίωση σταθερής βάσης.','{"substrate_stable":true}'),

('paint_wood_existing_sound','scraper','conditional','Για loose finish.','{}'),
('paint_wood_existing_sound','abrasive','required','Για προετοιμασία retained finish/εκτεθειμένου ξύλου.','{}'),
('paint_wood_existing_sound','dust_removal','required','Για καθαρισμό μετά sanding.','{}'),
('paint_wood_existing_sound','application_tools','required','Σύμφωνα με το selected finish.','{}'),

('paint_wood_weathered','scraper','required','Για αποτυχημένο finish/χαλαρές ίνες.','{}'),
('paint_wood_weathered','abrasive','required','Για αποκατάσταση sound surface όπου κατάλληλο.','{}'),
('paint_wood_weathered','dust_removal','required','Για καθαρή βάση.','{}'),
('paint_wood_weathered','application_tools','required','Για το selected exterior finish.','{}'),

('paint_metal_bare_ferrous','degreasing_tools','required','Για αφαίρεση oil/grease/ρύπων.','{}'),
('paint_metal_bare_ferrous','abrasive_or_wire_tool','conditional','Ανάλογα με rust/mill scale και required preparation.','{}'),
('paint_metal_bare_ferrous','dust_removal','required','Μετά mechanical preparation.','{}'),
('paint_metal_bare_ferrous','application_tools','required','Σύμφωνα με coating system.','{}'),

('paint_metal_existing_sound_ferrous','degreasing_tools','required','Για καθαρισμό/απολίπανση.','{}'),
('paint_metal_existing_sound_ferrous','abrasive_or_wire_tool','required','Για loose paint/rust και retained coating preparation.','{}'),
('paint_metal_existing_sound_ferrous','dust_removal','required','Μετά preparation.','{}'),
('paint_metal_existing_sound_ferrous','application_tools','required','Σύμφωνα με coating system.','{}')
) AS x(scenario_key,tool,level,reason,cond)
ON p.scenario_key=x.scenario_key
ON CONFLICT (scenario_id,tool_category) DO NOTHING;

-- Project kit slots: quantities remain manufacturer-/geometry-driven, never generic numeric guesses.
INSERT INTO public.build_project_kit_requirements
(scenario_id,source_layer,requirement_type,requirement_level,reason_el,quantity_basis,
 compatibility_constraints,customer_can_replace,condition_expression,active)
SELECT p.id,'GENERAL_GUIDANCE',x.req,x.level,x.reason,x.qty,x.compat::jsonb,x.replaceable,x.cond::jsonb,true
FROM public.build_solution_profiles p
JOIN (VALUES
('waterproof_exterior_wall_rain_penetration','repair_material','conditional','Για επιβεβαιωμένες ρωγμές/τοπικές βλάβες.','repair_geometry_and_manufacturer_consumption','["substrate_compatible","detail_compatible"]',true,'{}'),
('waterproof_exterior_wall_rain_penetration','primer','conditional','Μόνο αν απαιτείται από επιλεγμένο protective system.','manufacturer_declared_consumption','["substrate_and_finish_compatible","manufacturer_verified"]',true,'{"protective_system_selected":true}'),
('waterproof_exterior_wall_rain_penetration','protective_finish','conditional','Μετά την αποκατάσταση της αιτίας και μόνο όταν τεκμηριώνεται η λύση.','manufacturer_declared_coverage_or_consumption_and_coats','["exterior_use","substrate_compatible","manufacturer_verified"]',true,'{"protective_system_selected":true}'),
('waterproof_exterior_wall_rain_penetration','detail_sealant_or_component','conditional','Για αρμούς/ανοίγματα μόνο ως μέρος τεκμηριωμένης detail λύσης.','detail_length_or_geometry','["movement_and_substrate_compatible","system_specific"]',true,'{}'),

('repair_small_holes_dents','repair_filler','required','Για γέμισμα τοπικής βλάβης.','repair_volume_and_manufacturer_depth_consumption','["background_compatible","depth_compatible","manufacturer_verified"]',true,'{}'),
('repair_small_holes_dents','reinforcement','conditional','Μόνο αν το repair system το απαιτεί.','repair_geometry','["repair_system_compatible"]',true,'{}'),
('repair_small_holes_dents','primer','conditional','Μόνο όπου το repaired substrate/finish system το απαιτεί.','manufacturer_declared_consumption','["repair_and_finish_compatible","manufacturer_verified"]',true,'{"finish_required":true}'),
('repair_small_holes_dents','finish_coating','conditional','Για ομοιόμορφο τελικό φινίρισμα.','manufacturer_declared_coverage_and_coats','["repair_compatible","manufacturer_verified"]',true,'{"finish_required":true}'),

('repair_weak_friable_wall_surface','repair_material','conditional','Μετά την αφαίρεση ασταθών υλικών και μόνο σε sound substrate.','repair_area_depth_and_manufacturer_consumption','["substrate_compatible","manufacturer_verified"]',true,'{"substrate_stable":true}'),
('repair_weak_friable_wall_surface','primer_or_conditioner','conditional','Δεν υποκαθιστά αφαίρεση σαθρών· μόνο όπου τεκμηριώνεται για τη sound βάση.','manufacturer_declared_consumption','["sound_substrate_only","finish_compatible","manufacturer_verified"]',true,'{"substrate_stable":true}'),
('repair_weak_friable_wall_surface','finish_coating','conditional','Μετά την ολοκλήρωση repair/curing.','manufacturer_declared_coverage_and_coats','["repair_compatible","manufacturer_verified"]',true,'{"finish_required":true}'),

('paint_wood_existing_sound','wood_finish','required','Τελικό compatible wood finish.','manufacturer_declared_coverage_and_coats','["wood_use","retained_coating_compatible","manufacturer_verified"]',true,'{}'),
('paint_wood_existing_sound','primer_or_undercoat','conditional','Για bare spots ή όπου το selected system το απαιτεί.','manufacturer_declared_consumption','["wood_and_finish_compatible","manufacturer_verified"]',true,'{}'),
('paint_wood_existing_sound','repair_filler','conditional','Για τοπικές ατέλειες μόνο με wood-compatible repair.','repair_geometry_and_manufacturer_guidance','["wood_compatible","finish_compatible"]',true,'{}'),

('paint_wood_weathered','exterior_wood_finish','required','Finish κατάλληλο για exterior wood/exposure.','manufacturer_declared_coverage_and_coats','["exterior_wood_use","manufacturer_verified"]',true,'{}'),
('paint_wood_weathered','primer_undercoat_or_pretreatment','conditional','Μόνο αν το selected system το απαιτεί.','manufacturer_declared_consumption','["system_specific","manufacturer_verified"]',true,'{}'),
('paint_wood_weathered','wood_repair_component','conditional','Για τοπικές επισκευές μόνο όταν το wood παραμένει sound.','repair_geometry','["wood_compatible"]',true,'{}'),

('paint_metal_bare_ferrous','metal_primer','conditional','Όπως ορίζει το επιλεγμένο corrosion-protection system.','manufacturer_declared_coverage_or_consumption','["ferrous_steel","topcoat_compatible","manufacturer_verified"]',false,'{}'),
('paint_metal_bare_ferrous','metal_topcoat_system','required','Protective finish for the actual exposure.','manufacturer_declared_coverage_and_coats','["ferrous_steel","primer_system_compatible","environment_suitable","manufacturer_verified"]',false,'{}'),
('paint_metal_bare_ferrous','cleaner_degreaser','conditional','Όπου απαιτείται για oil/grease contamination.','contamination_and_method_based','["substrate_compatible"]',true,'{}'),

('paint_metal_existing_sound_ferrous','metal_finish_system','required','Compatible over retained sound coating/bare repaired spots.','manufacturer_declared_coverage_and_coats','["retained_coating_compatible","ferrous_steel","manufacturer_verified"]',false,'{}'),
('paint_metal_existing_sound_ferrous','spot_primer','conditional','Για bare metal spots where required by system.','manufacturer_declared_consumption','["ferrous_steel","finish_compatible","manufacturer_verified"]',false,'{"bare_metal_spots":true}'),
('paint_metal_existing_sound_ferrous','cleaner_degreaser','required','Για contamination removal before preparation/coating.','surface_condition_based','["coating_compatible"]',true,'{}')
) AS x(scenario_key,req,level,reason,qty,compat,replaceable,cond)
ON p.scenario_key=x.scenario_key
ON CONFLICT (scenario_id,requirement_type) DO NOTHING;

-- Direct provenance for every active entity introduced above.
WITH scenario_source(scenario_key,source_key,evidence_strength,passage,section,applicability) AS (
 VALUES
 ('waterproof_exterior_wall_rain_penetration','rics_damp_mould','strong_consensus',
  'RICS describes penetrating damp as water moving through building elements and recommends investigating moisture sources including gutters/downpipes, cracked external render, poor pointing, openings/sealants, roofing defects and plumbing before remediation.',
  'Damp sources / checks','General diagnostic principle; UK consumer guidance, not Greek law.'),
 ('repair_small_holes_dents','british_gypsum_minor_wall_patch','common_professional_practice',
  'General minor-repair sequence: remove loose material, clean, fill local damage with a suitable repair material, allow deeper/staged fills to set/dry, then sand only after drying.',
  'Installation steps 1–4','General patch workflow only; product-specific mix/time values excluded.'),
 ('repair_weak_friable_wall_surface','british_gypsum_unstable_background','common_professional_practice',
  'A repair background must be made sound by removing loose, flaking or unstable material; if significant areas remain friable/delaminate, a more substantial repair is needed rather than coating over weakness.',
  'Damaged background preparation','General substrate-stability principle; product-specific bonding/plaster values excluded.'),
 ('paint_wood_existing_sound','usda_wood_finishing_2021','strong_consensus',
  'Wood finishing must account for wood properties, moisture and exposure; exterior finishes primarily protect against water, sunlight and weathering, so retained finishes and substrate condition must be assessed before refinishing.',
  'Chapter 16 overview','General wood-finishing/building-science principle; North American research, not Greek code.'),
 ('paint_wood_weathered','usda_wood_finishing_2021','strong_consensus',
  'Wood finishing guidance addresses the effect of sunlight, water and weathering on wood/finishes and moisture control; weather-degraded surfaces require appropriate preparation before refinishing.',
  'Chapter 16 overview / weathering sections','General wood weathering principle; no product-specific values imported.'),
 ('paint_metal_bare_ferrous','iso_12944_4_2017','standard_based',
  'ISO 12944-4 covers uncoated carbon/low-alloy steel surfaces and their preparation for protective paint systems, including different surface types and preparation grades.',
  'Scope / abstract','International standard reference; exact preparation grade is selected by project/coating system rather than invented here.'),
 ('paint_metal_existing_sound_ferrous','iso_12944_4_2017','standard_based',
  'ISO 12944-4 covers other painted steel surfaces as well as uncoated steel and defines surface-preparation approaches for protective paint systems.',
  'Scope / abstract','International standard reference; exact preparation grade/system remains project/manufacturer-specific.')
)
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability,active)
SELECT e.entity_type,e.entity_id,s.id,ss.passage,ss.section,ss.evidence_strength,ss.applicability,true
FROM scenario_source ss
JOIN public.build_solution_profiles p ON p.scenario_key=ss.scenario_key
JOIN public.general_build_sources s ON s.source_key=ss.source_key
CROSS JOIN LATERAL (
 SELECT 'profile'::text,p.id
 UNION ALL SELECT 'solution_rule',r.id FROM public.build_solution_rules r WHERE r.scenario_id=p.id AND r.active
 UNION ALL SELECT 'diagnostic_rule',d.id FROM public.build_diagnostic_rules d WHERE d.scenario_id=p.id AND d.active
 UNION ALL SELECT 'solution_step',stp.id FROM public.build_solution_steps stp WHERE stp.scenario_id=p.id AND stp.active
 UNION ALL SELECT 'failure_mode',f.id FROM public.build_failure_modes f WHERE f.scenario_id=p.id AND f.active
 UNION ALL SELECT 'tool_requirement',t.id FROM public.build_tool_requirements t WHERE t.scenario_id=p.id AND t.active
 UNION ALL SELECT 'project_kit_requirement',k.id FROM public.build_project_kit_requirements k WHERE k.scenario_id=p.id AND k.active
) AS e(entity_type,entity_id)
ON CONFLICT (entity_type,entity_id,source_id) DO UPDATE SET
 supporting_passage=EXCLUDED.supporting_passage,
 relevant_section_page=EXCLUDED.relevant_section_page,
 evidence_strength=EXCLUDED.evidence_strength,
 applicability=EXCLUDED.applicability,
 active=true;

-- Secondary source for general coating-preparation compatibility on retained coatings.
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability,active)
SELECT e.entity_type,e.entity_id,s.id,
 'General surface-preparation guidance requires a dry, sound surface; removal of contamination, loose paint/rust and preparation of retained glossy coating, with a compatibility/test area where existing coating compatibility is uncertain.',
 'Previously coated surfaces / general preparation','common_professional_practice',
 'Used only for generic preparation/compatibility principles; no product-specific temperatures, primers or timings are imported.',true
FROM public.general_build_sources s
JOIN public.build_solution_profiles p ON p.scenario_key IN ('paint_wood_existing_sound','paint_metal_existing_sound_ferrous')
CROSS JOIN LATERAL (
 SELECT 'profile'::text,p.id
 UNION ALL SELECT 'solution_rule',r.id FROM public.build_solution_rules r WHERE r.scenario_id=p.id AND r.active
 UNION ALL SELECT 'solution_step',stp.id FROM public.build_solution_steps stp WHERE stp.scenario_id=p.id AND stp.active
) AS e(entity_type,entity_id)
WHERE s.source_key='sherwin_surface_prep'
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- Layer C provenance plus underlying technical source for scenario-specific stop conditions.
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability,active)
SELECT 'stop_condition',sc.id,s.id,
 'KONTA MOU blocks or warns when the selected project path would hide unresolved moisture, unstable substrates, significant decay/corrosion or substrate identity/compatibility uncertainty.',
 'Layer separation and stop/escalation governance','strong_consensus',
 'Internal workflow/safety rule; not represented as an external construction standard.',true
FROM public.build_stop_conditions sc
JOIN public.build_solution_profiles p ON p.id=sc.scenario_id
JOIN public.general_build_sources s ON s.source_key='konta_mou_build_studio_governance_v1'
WHERE p.scenario_key IN (
 'waterproof_exterior_wall_rain_penetration','repair_small_holes_dents','repair_weak_friable_wall_surface',
 'paint_wood_existing_sound','paint_wood_weathered','paint_metal_bare_ferrous','paint_metal_existing_sound_ferrous'
)
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- Quantity/coverage provenance for the new project-kit records: actual use is not a universal theoretical value.
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability,active)
SELECT 'project_kit_requirement',k.id,s.id,
 'Actual material consumption can differ from theoretical coverage because surface profile/roughness, porosity, application method and losses influence consumption; exact calculations therefore use the selected manufacturer declared value plus explicit project conditions.',
 'Consumption / theoretical versus practical usage','common_professional_practice',
 'General quantity principle only. No numeric waste factor or product coverage is imported.',true
FROM public.build_project_kit_requirements k
JOIN public.build_solution_profiles p ON p.id=k.scenario_id
JOIN public.general_build_sources s ON s.source_key='hempel_coverage_general'
WHERE p.scenario_key IN (
 'waterproof_exterior_wall_rain_penetration','repair_small_holes_dents','repair_weak_friable_wall_surface',
 'paint_wood_existing_sound','paint_wood_weathered','paint_metal_bare_ferrous','paint_metal_existing_sound_ferrous'
)
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

COMMIT;
