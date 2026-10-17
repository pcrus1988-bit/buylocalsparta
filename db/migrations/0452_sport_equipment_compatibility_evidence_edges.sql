-- KONTA MOY Sport & Fit 0452: governed activity-to-equipment compatibility
-- This is the shared Sport & Fit ontology, not a parallel recommendation DB.
-- Class-level edges carry evidence and do NOT assert that any specific
-- unverified vendor offer or product family possesses technical properties.
BEGIN;
INSERT INTO public.sport_knowledge_sources
  (source_key,source_type,publisher,title,url,retrieved_at,source_status,metadata,active)
VALUES
 ('sport_equipment_ifab_2026_27_law4','reference_guide','IFAB',
 'IFAB Laws of the Game 2026/27 Law 4: Compulsory player equipment',
 'https://www.theifab.com/laws/latest/the-players-equipment/',now(),'current',
 '{"version":"2026/27","scope":"football match kit","rule":"shinguards covered by socks, socks and footwear are compulsory","retrievalDate":"2026-10-15","sourceAuthority":"sport governing body"}'::jsonb,true),
 ('sport_equipment_rei_socks_activity','reference_guide','REI Co-op',
 'REI Expert Advice: How to Choose Socks by Activity',
 'https://www.rei.com/learn/expert-advice/socks.html',now(),'current',
 '{"scope":"socks by running/walking/hiking/athletic-multisport activity","retrievalDate":"2026-10-15","authority":"expert equipment guidance","mandatory":false}'::jsonb,true)
ON CONFLICT(source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,url=EXCLUDED.url,retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,source_status='current',active=true,updated_at=now();

CREATE TABLE IF NOT EXISTS public.sport_equipment_compatibility_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sport_code text NOT NULL CHECK (sport_code IN (
  'running','walking','gym','football','hiking','basketball','tennis','padel',
  'volleyball','handball','badminton')),
 use_case text NOT NULL DEFAULT 'all' CHECK(length(btrim(use_case))>0),
 primary_role text NOT NULL DEFAULT 'footwear' CHECK(primary_role='footwear'),
 secondary_role text NOT NULL CHECK(secondary_role IN ('socks','top','bottom','layer','accessory')),
 secondary_kind text NOT NULL DEFAULT 'all' CHECK(length(btrim(secondary_kind))>0),
 relationship_type text NOT NULL CHECK(relationship_type IN (
  'requires','recommended_with','compatible_with','optional_with','incompatible_with',
  'substitutes','complements','primary_equipment','secondary_equipment')),
 source_id uuid NOT NULL REFERENCES public.sport_knowledge_sources(id) ON DELETE RESTRICT,
 evidence_excerpt text NOT NULL CHECK(length(btrim(evidence_excerpt))>=20),
 confidence numeric(6,5) NOT NULL CHECK(confidence>=0 AND confidence<=1),
 applicability jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(applicability)='object'),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(sport_code,use_case,primary_role,secondary_role,secondary_kind,relationship_type)
);

-- Must never become an anonymous remote API with unreviewed rule writes.
ALTER TABLE public.sport_equipment_compatibility_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sport_equipment_compatibility_rules FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS sport_equipment_compatibility_lookup
 ON public.sport_equipment_compatibility_rules(sport_code,use_case,secondary_role)
 WHERE active;

INSERT INTO public.sport_equipment_compatibility_rules
(sport_code,use_case,primary_role,secondary_role,secondary_kind,relationship_type,
 source_id,evidence_excerpt,confidence,applicability,active)
SELECT x.sport_code,x.use_case,'footwear',x.secondary_role,x.secondary_kind,x.relationship_type,
 s.id,x.evidence_excerpt,x.confidence,x.applicability,true
FROM (VALUES
 ('running'::text,'all'::text,'socks'::text,'all'::text,'recommended_with'::text,
  'REI distinguishes running socks by fit and cushioning; a correctly sized technical sock may complement a running shoe.',
  0.97000::numeric,'{"reasoningScope":"running socks with running footwear","mandatory":false,"doNotInferProductSpecificFit":true}'::jsonb,
  'sport_equipment_rei_socks_activity'::text),
 ('walking','all','socks','all','recommended_with',
  'REI describes walking socks for fitness walking, moisture management and comfort.',
  0.97000,'{"reasoningScope":"walking socks with walking footwear","mandatory":false}'::jsonb,
  'sport_equipment_rei_socks_activity'),
 ('hiking','all','socks','all','recommended_with',
  'REI describes activity-specific hiking socks with moisture management, padding and proper fit.',
  0.99000,'{"reasoningScope":"hiking socks with hiking shoes","mandatory":false,"doNotInferSockFabric":true}'::jsonb,
  'sport_equipment_rei_socks_activity'),
 ('gym','all','socks','all','optional_with',
  'REI describes athletic/multisport socks for cross training with moisture-wicking fabric.',
  0.90000,'{"reasoningScope":"athletic socks in gym","mandatory":false}'::jsonb,
  'sport_equipment_rei_socks_activity'),
 ('football','football_match','socks','all','requires',
  'IFAB Law 4 of the 2026/27 Laws of the Game lists socks as mandatory player equipment for football matches.',
  1.00000,'{"regulatoryEquipmentRequirement":true,"doesNotRequireMarketplacePurchase":true,"ageScope":"all"}'::jsonb,
  'sport_equipment_ifab_2026_27_law4'),
 ('football','football_match','accessory','shin_guards','requires',
  'IFAB Law 4 of the 2026/27 Laws of the Game requires appropriately sized shinguards covered by socks for football matches.',
  1.00000,'{"regulatoryEquipmentRequirement":true,"doNotMatchGenericAccessories":true,"familySpecificSubtypeRequired":true}'::jsonb,
  'sport_equipment_ifab_2026_27_law4')
) x(sport_code,use_case,secondary_role,secondary_kind,relationship_type,
    evidence_excerpt,confidence,applicability,source_key)
JOIN public.sport_knowledge_sources s ON s.source_key=x.source_key AND s.active
ON CONFLICT(sport_code,use_case,primary_role,secondary_role,secondary_kind,relationship_type)
DO UPDATE SET source_id=EXCLUDED.source_id,evidence_excerpt=EXCLUDED.evidence_excerpt,
 confidence=EXCLUDED.confidence,applicability=EXCLUDED.applicability,
 active=true,updated_at=now();

DO $$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM public.sport_equipment_compatibility_rules r
 JOIN public.sport_knowledge_sources s ON s.id=r.source_id AND s.active
 WHERE r.active AND r.sport_code IN ('running','walking','hiking','gym','football')
   AND s.source_type='reference_guide';
 IF n<6 THEN RAISE EXCEPTION '0452 expected at least six traceable compatible sport-kit edges, found %',n; END IF;
 IF EXISTS (SELECT 1 FROM public.sport_equipment_compatibility_rules
            WHERE active AND relationship_type='requires'
            AND secondary_kind='shin_guards'
            AND NOT (sport_code='football' AND use_case='football_match')) THEN
  RAISE EXCEPTION '0452 shinguard requirement misapplied outside match football'; END IF;
END $$;
COMMIT;
