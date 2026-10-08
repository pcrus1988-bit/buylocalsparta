-- Greek Retail 2026 extended social/economic evidence instrument (pre-pilot only).
-- No in-place change to immutable questions, completed responses, or the old analysis plan.
-- This migration intentionally does nothing if the study has left draft status.
BEGIN;
DO $research$
DECLARE
  v_study record;
  v_source record;
  v_source_plan record;
  v_new_instrument uuid;
  v_plan jsonb;
  v_hash text;
BEGIN
  SELECT id,current_wave_id,status INTO v_study
  FROM public.research_studies WHERE slug='greek-retail-2026' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Greek Retail 2026 study not installed'; END IF;
  IF v_study.status <> 'draft' THEN
    RAISE NOTICE 'Skipping pre-pilot revision; study status: %',v_study.status;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.research_instruments
    WHERE study_id=v_study.id AND wave_id=v_study.current_wave_id AND version='0.3.0'
  ) THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.research_responses
    WHERE study_id=v_study.id AND wave_id=v_study.current_wave_id
  ) THEN
    RAISE NOTICE 'Skipping revision: study already has responses for this wave';
    RETURN;
  END IF;
  SELECT id,version,content_sha256,consent_statement_version
    INTO v_source FROM public.research_instruments
    WHERE study_id=v_study.id AND wave_id=v_study.current_wave_id
    ORDER BY created_at DESC,id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing prior instrument'; END IF;
  SELECT id,version,plan_json,title INTO v_source_plan
    FROM public.research_analysis_plans
    WHERE study_id=v_study.id AND wave_id=v_study.current_wave_id
      AND instrument_id=v_source.id
    ORDER BY created_at DESC,id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing existing governed analysis plan'; END IF;

  INSERT INTO public.research_instruments
    (study_id,wave_id,version,content_sha256,status,consent_statement_version)
  VALUES (v_study.id,v_study.current_wave_id,'0.3.0',v_source.content_sha256,'draft',v_source.consent_statement_version)
  RETURNING id INTO v_new_instrument;

  INSERT INTO public.research_questions
    (instrument_id,code,section_code,position,question_type,prompt_el,help_el,required,analysis_key,config)
  SELECT v_new_instrument,code,section_code,position,question_type,prompt_el,help_el,required,analysis_key,config
  FROM public.research_questions WHERE instrument_id=v_source.id ORDER BY position;

  INSERT INTO public.research_questions
    (instrument_id,code,section_code,position,question_type,prompt_el,help_el,required,analysis_key,config)
  SELECT v_new_instrument, r.code,r.section_code,
    (SELECT max(position) FROM public.research_questions WHERE instrument_id=v_new_instrument) + row_number() OVER (ORDER BY r.ordinal),
    r.question_type,r.prompt_el,r.help_el,r.required,r.analysis_key,r.config
  FROM (
    SELECT row_number() OVER () AS ordinal, q.*
    FROM (VALUES
    ('Q19','G',20,'matrix','Σε σύγκριση με τους προηγούμενους 12 μήνες, πώς μεταβλήθηκαν τα ακόλουθα μεγέθη;','Αναφερόμαστε στην εκτίμησή σας, όχι σε λογιστικά στοιχεία. Επιλέξτε «Δεν γνωρίζω» εάν δεν μπορείτε να εκτιμήσετε.',true,'economic_trends','{"items":[["turnover","Κύκλος εργασιών / έσοδα"],["operating_cost","Λειτουργικά έξοδα"],["profitability","Λειτουργική κερδοφορία"]],"scale":[["up_large","Αυξήθηκε σημαντικά"],["up_small","Αυξήθηκε λίγο"],["stable","Έμεινε περίπου σταθερό"],["down_small","Μειώθηκε λίγο"],["down_large","Μειώθηκε σημαντικά"],["unknown","Δεν γνωρίζω"],["prefer_not","Προτιμώ να μην απαντήσω"]]}'::jsonb),
    ('Q20','G',21,'scale','Πόσο αισιόδοξοι είστε για την πορεία της επιχείρησής σας τους επόμενους 12 μήνες;','0 = πολύ απαισιόδοξοι · 10 = πολύ αισιόδοξοι',true,'business_optimism','{"min":0,"max":10,"step":1,"labels":{"0":"Πολύ απαισιόδοξοι","10":"Πολύ αισιόδοξοι"}}'::jsonb),
    ('Q21','G',22,'single','Πώς πιστεύετε ότι θα εξελιχθεί η κερδοφορία της επιχείρησής σας τους επόμενους 12 μήνες;',NULL,true,'profit_outlook','{"options":[["down_large","Σημαντική μείωση"],["down_small","Μικρή μείωση"],["stable","Περίπου σταθερή"],["up_small","Μικρή αύξηση"],["up_large","Σημαντική αύξηση"],["unknown","Δεν γνωρίζω / δεν μπορώ να εκτιμήσω"]]}'::jsonb),
    ('Q22','G',23,'single','Ποια περιγραφή ταιριάζει περισσότερο στην περιοχή όπου λειτουργεί το κύριο κατάστημά σας;','Χρησιμοποιείται μόνο για ομαδοποιημένες γεωγραφικές συγκρίσεις.',true,'settlement_class','{"options":[["athens","Μητροπολιτική περιοχή Αθήνας / Πειραιά"],["thessaloniki","Μητροπολιτική περιοχή Θεσσαλονίκης"],["large_city","Άλλη μεγάλη πόλη"],["small_city","Μικρή πόλη / κωμόπολη"],["village","Χωριό / αγροτική περιοχή"],["online_only","Μόνο online, χωρίς φυσικό κατάστημα"],["unknown","Δεν γνωρίζω / δεν ταιριάζει"]]}'::jsonb),
    ('Q23','H',24,'matrix','Πόσο συμφωνείτε με τις ακόλουθες προτάσεις για το ηλεκτρονικό εμπόριο;','Απαντήστε με βάση την εμπειρία ή την εκτίμησή σας.',true,'ecommerce_attitude','{"items":[["opportunity","Το ηλεκτρονικό εμπόριο δημιουργεί ευκαιρίες για την επιχείρησή μου"],["necessity","Το ηλεκτρονικό εμπόριο είναι πλέον απαραίτητο για να παραμείνουμε ανταγωνιστικοί"],["unaffordable","Το κόστος εισόδου ή διατήρησης online πωλήσεων είναι δύσκολο να δικαιολογηθεί"],["complement","Η online προβολή μπορεί να ενισχύσει τις πωλήσεις του φυσικού καταστήματος"]],"scale":[["1","Διαφωνώ απόλυτα"],["2","Διαφωνώ"],["3","Ούτε συμφωνώ ούτε διαφωνώ"],["4","Συμφωνώ"],["5","Συμφωνώ απόλυτα"],["na","Δεν γνωρίζω / δεν αφορά"]]}'::jsonb),
    ('Q24','H',25,'multi','Τι σας εμποδίζει περισσότερο να πραγματοποιήσετε την πρώτη online πώληση;','Εμφανίζεται μόνο σε επιχειρήσεις που δεν δηλώνουν online κανάλι πωλήσεων. Επιλέξτε έως τρία.',true,'first_sale_barriers','{"showIf":{"questionCode":"Q03","noneOf":["own_eshop","marketplace","social"]},"max":3,"options":[["setup_cost","Αρχικό κόστος"],["recurring_cost","Μηνιαίο κόστος / προμήθειες"],["skills","Έλλειψη τεχνικών γνώσεων"],["time","Έλλειψη χρόνου"],["staff","Έλλειψη προσωπικού"],["catalog","Ψηφιοποίηση προϊόντων / αποθέματος"],["payments","Πληρωμές / φορολογικές υποχρεώσεις"],["shipping","Αποστολές / επιστροφές"],["demand","Αβεβαιότητα για τη ζήτηση"],["not_needed","Δεν το χρειαζόμαστε σήμερα"],["other","Άλλος λόγος"],["none","Δεν υπάρχει σημαντικό εμπόδιο"]]}'::jsonb),
    ('Q25','I',26,'matrix','Πώς επηρέασε η συμμετοχή σας σε marketplace τους παρακάτω τομείς;','Μόνο για νυν ή πρώην χρήστες marketplace. Πρόκειται για προσωπική εκτίμηση και όχι για επαληθευμένα οικονομικά στοιχεία.',true,'marketplace_effects','{"showIf":{"questionCode":"Q13","oneOf":["current","past"]},"items":[["profitability","Κερδοφορία από τις πωλήσεις"],["customer_reach","Πρόσβαση σε νέους πελάτες"],["dependence","Εξάρτηση από τρίτη πλατφόρμα"],["customer_control","Έλεγχος της σχέσης με τον πελάτη"],["workload","Χρόνος / φόρτος διαχείρισης"]],"scale":[["-2","Μειώθηκε πολύ"],["-1","Μειώθηκε λίγο"],["0","Δεν άλλαξε"],["1","Αυξήθηκε λίγο"],["2","Αυξήθηκε πολύ"],["na","Δεν γνωρίζω / δεν αφορά"]]}'::jsonb),
    ('Q26','J',27,'single','Η παρουσία της επιχείρησής σας στο διαδίκτυο έχει επηρεάσει τις επισκέψεις ή αγορές στο φυσικό κατάστημα;','Μόνο για επιχειρήσεις με online κανάλια. Επιλέξτε με βάση την εμπειρία σας.',true,'online_to_local_impact','{"showIf":{"questionCode":"Q03","anyOf":["own_eshop","marketplace","social"]},"options":[["more_store","Αυξήθηκαν οι επισκέψεις ή αγορές στο κατάστημα"],["more_online_only","Βοήθησε μόνο τις online πωλήσεις"],["no_change","Δεν παρατηρήθηκε διαφορά"],["less_store","Μειώθηκαν οι επισκέψεις ή αγορές στο κατάστημα"],["no_physical","Δεν διαθέτουμε φυσικό κατάστημα"],["unknown","Δεν μπορώ να εκτιμήσω"]]}'::jsonb),
    ('Q27','J',28,'multi','Ποιοι οικονομικοί παράγοντες πιέζουν περισσότερο την επιχείρησή σας σήμερα;','Επιλέξτε έως τρεις.',true,'economic_pressures','{"max":3,"options":[["purchasing_power","Μειωμένη αγοραστική δύναμη πελατών"],["supplier_cost","Αύξηση τιμών προμηθευτών"],["energy","Ενέργεια / λειτουργικές παροχές"],["rent","Ενοίκια"],["payroll","Μισθοδοσία / προσωπικό"],["tax","Φόροι και εισφορές"],["liquidity","Ρευστότητα / χρηματοδότηση"],["competition","Ανταγωνισμός στις τιμές"],["online_competition","Ανταγωνισμός από μεγάλες online πλατφόρμες"],["other","Άλλο"],["none","Καμία ιδιαίτερη πίεση"]]}'::jsonb),
    ('Q28','I',29,'single','Τι ποσοστό των λιανικών πωλήσεών σας προέρχεται περίπου από marketplaces;','Μόνο για επιχειρήσεις που χρησιμοποιούν σήμερα marketplaces.',true,'marketplace_revenue_dependence','{"showIf":{"questionCode":"Q13","oneOf":["current"]},"options":[["0_10","0–10%"],["11_25","11–25%"],["26_50","26–50%"],["51_75","51–75%"],["76_100","76–100%"],["unknown","Δεν γνωρίζω / δεν μπορώ να εκτιμήσω"]]}'::jsonb)
    ) AS q(code,section_code,position,question_type,prompt_el,help_el,required,analysis_key,config)
  ) r
  WHERE NOT EXISTS (
    SELECT 1 FROM public.research_questions existing
    WHERE existing.instrument_id=v_new_instrument AND existing.code=r.code
  );

  SELECT encode(digest(convert_to(COALESCE(string_agg(
    jsonb_build_object(
      'code',code,'sectionCode',section_code,'position',position,
      'type',question_type,'prompt',prompt_el,'help',help_el,
      'required',required,'analysisKey',analysis_key,'config',config
    )::text,',' ORDER BY position),'[]'),'UTF8'),'sha256'),'hex')
    INTO v_hash FROM public.research_questions WHERE instrument_id=v_new_instrument;
  UPDATE public.research_instruments SET content_sha256=v_hash WHERE id=v_new_instrument;

  v_plan := jsonb_set(v_source_plan.plan_json,'{instrumentVersion}','"0.3.0"'::jsonb);
  v_plan := jsonb_set(v_plan,'{primaryOutcomes}',
    COALESCE(v_plan->'primaryOutcomes','[]'::jsonb) ||
    '[{"metricKey":"business_confidence.mean","label":"Greek Retail Business Confidence Index","estimand":"weighted_population_mean","segments":["overall","regionCode","sectorCode"]}]'::jsonb
  );
  v_plan := jsonb_set(v_plan,'{secondaryAnalyses,scope}',
    to_jsonb('All pre-specified questionnaire distributions, economic trends, e-commerce attitudes, marketplace outcomes and conditional-domain summaries; revenue/profit divergence is a self-reported descriptive association.'::text));
  v_plan := jsonb_set(v_plan,'{exploratoryAnalyses}',
    COALESCE(v_plan->'exploratoryAnalyses','[]'::jsonb) ||
    '[{"family":"economic_and_channel_associations","metrics":["revenue_up_profit_down.share","marketplace_profitability_decline.share","marketplace_dependence_increase.share","online_to_local_impact.share.more_store"],"dimensions":["regionCode","sectorCode","sizeBand","settlementBand"],"classification":"exploratory","limitations":"self-report, noncausal; post-stratification domains do not automatically have design-based intervals"}]'::jsonb
  );
  INSERT INTO public.research_analysis_plans
    (study_id,wave_id,instrument_id,version,title,status,plan_json,content_sha256)
  VALUES (
    v_study.id,v_study.current_wave_id,v_new_instrument,
    'greek-retail-2026-plan-v3-sentiment',
    'Greek Retail 2026 — confidence, economic pressure and digital impact',
    'draft',v_plan,encode(digest(convert_to(v_plan::text,'UTF8'),'sha256'),'hex')
  );
END;
$research$;
COMMIT;
