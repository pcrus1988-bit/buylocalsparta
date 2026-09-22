-- Paint & Build project accessory taxonomy and quantity-rule layer.
-- Commercial accessory rules are KONTA MOU workflow data; they are deliberately
-- separate from VITEX/manufacturer technical instructions.
BEGIN;

WITH parent AS (
  SELECT id,market_id
  FROM public.categories
  WHERE code='paint-decorating'
    AND active=true
  ORDER BY created_at
  LIMIT 1
),
seed(code,slug,accessory_key,sort_order) AS (
  VALUES
    ('paint-decorating-rollers','paint-decorating-rollers','roller',210),
    ('paint-decorating-brushes','paint-decorating-brushes','brush',220),
    ('paint-decorating-trays','paint-decorating-trays','tray',230),
    ('paint-decorating-masking-tape','paint-decorating-masking-tape','masking_tape',240),
    ('paint-decorating-protective-covering','paint-decorating-protective-covering','protective_covering',250),
    ('paint-decorating-extension-poles','paint-decorating-extension-poles','extension_pole',260),
    ('paint-decorating-roller-sleeves','paint-decorating-roller-sleeves','roller_sleeve',270),
    ('paint-decorating-ppe','paint-decorating-ppe','painting_ppe',280),
    ('paint-decorating-cleaning-tools','paint-decorating-cleaning-tools','cleaning_tool',290)
)
INSERT INTO public.categories
(market_id,parent_id,code,slug,commerce_mode,active,filter_schema,sort_config,
 require_compatibility_confirmation,regulated_checkout_allowed,counteroffer_allowed,advice_allowed,
 checkout_fulfilment_modes,taxonomy_role,assignable,discoverable,sort_order)
SELECT
  p.market_id,
  p.id,
  s.code,
  s.slug,
  'standard',
  true,
  jsonb_build_object('paint_build_accessory',true,'accessory_key',s.accessory_key),
  '{}'::jsonb,
  false,
  false,
  true,
  true,
  ARRAY['pickup','local_delivery','shipping']::text[],
  'product_class',
  true,
  true,
  s.sort_order
FROM parent p
CROSS JOIN seed s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.categories existing
  WHERE existing.market_id=p.market_id
    AND existing.slug=s.slug
);

CREATE TABLE IF NOT EXISTS public.build_project_accessory_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accessory_key text NOT NULL UNIQUE,
  project_type text NOT NULL DEFAULT 'paint',
  label_el text NOT NULL,
  category_code text NOT NULL,
  role text NOT NULL CHECK (role IN ('recommended_working','optional_extra')),
  default_selected boolean NOT NULL DEFAULT true,
  quantity_rule text NOT NULL CHECK (quantity_rule IN ('fixed','area_ceiling')),
  base_quantity integer NOT NULL DEFAULT 1 CHECK (base_quantity >= 1 AND base_quantity <= 99),
  area_per_unit_m2 numeric(12,3),
  max_quantity integer NOT NULL DEFAULT 99 CHECK (max_quantity >= 1 AND max_quantity <= 99),
  application_method text,
  search_terms text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (quantity_rule='fixed' AND area_per_unit_m2 IS NULL)
    OR
    (quantity_rule='area_ceiling' AND area_per_unit_m2 IS NOT NULL AND area_per_unit_m2 > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_build_project_accessory_rules_active_sort
  ON public.build_project_accessory_rules(project_type,active,sort_order,accessory_key);

ALTER TABLE public.build_project_accessory_rules ENABLE ROW LEVEL SECURITY;

INSERT INTO public.build_project_accessory_rules
(accessory_key,project_type,label_el,category_code,role,default_selected,quantity_rule,
 base_quantity,area_per_unit_m2,max_quantity,application_method,search_terms,sort_order)
VALUES
  ('roller','paint','Ρολό βαφής','paint-decorating-rollers','recommended_working',true,'fixed',1,NULL,2,'roller',
    ARRAY['ρολό βαφής','paint roller'],10),
  ('brush','paint','Πινέλο βαφής','paint-decorating-brushes','recommended_working',true,'fixed',1,NULL,2,'brush',
    ARRAY['πινέλο βαφής','paint brush'],20),
  ('tray','paint','Σκάφη βαφής','paint-decorating-trays','recommended_working',true,'fixed',1,NULL,2,NULL,
    ARRAY['σκάφη βαφής','paint tray'],30),
  ('masking_tape','paint','Χαρτοταινία / ταινία μασκαρίσματος','paint-decorating-masking-tape','recommended_working',true,'area_ceiling',1,20,8,NULL,
    ARRAY['χαρτοταινία','ταινία μασκαρίσματος','masking tape'],40),
  ('protective_covering','paint','Προστατευτικό κάλυμμα','paint-decorating-protective-covering','recommended_working',true,'area_ceiling',1,20,10,NULL,
    ARRAY['νάυλον προστασίας βαφής','προστατευτικό κάλυμμα βαφής','protective covering'],50),
  ('extension_pole','paint','Κοντάρι προέκτασης','paint-decorating-extension-poles','optional_extra',false,'fixed',1,NULL,1,'roller',
    ARRAY['κοντάρι ρολού','extension pole paint'],60),
  ('roller_sleeve','paint','Εφεδρικό ανταλλακτικό ρολού','paint-decorating-roller-sleeves','optional_extra',false,'fixed',1,NULL,2,'roller',
    ARRAY['ανταλλακτικό ρολού βαφής','roller sleeve'],70),
  ('painting_ppe','paint','Γάντια εργασίας','paint-decorating-ppe','optional_extra',false,'fixed',1,NULL,2,NULL,
    ARRAY['γάντια εργασίας','work gloves'],80),
  ('cleaning_tool','paint','Υλικό καθαρισμού εργαλείων','paint-decorating-cleaning-tools','optional_extra',false,'fixed',1,NULL,2,NULL,
    ARRAY['καθαρισμός εργαλείων βαφής','paint tool cleaning'],90)
ON CONFLICT (accessory_key) DO UPDATE SET
  project_type=EXCLUDED.project_type,
  label_el=EXCLUDED.label_el,
  category_code=EXCLUDED.category_code,
  role=EXCLUDED.role,
  default_selected=EXCLUDED.default_selected,
  quantity_rule=EXCLUDED.quantity_rule,
  base_quantity=EXCLUDED.base_quantity,
  area_per_unit_m2=EXCLUDED.area_per_unit_m2,
  max_quantity=EXCLUDED.max_quantity,
  application_method=EXCLUDED.application_method,
  search_terms=EXCLUDED.search_terms,
  active=true,
  sort_order=EXCLUDED.sort_order,
  updated_at=now();

COMMIT;
