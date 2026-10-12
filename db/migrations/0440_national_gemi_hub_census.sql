-- National GEMI census: private, unclaimed, provenance-bearing registry directory.
-- No registry contact, survey response, research invite or vendor account is copied.
-- 131 static hub coordinates reflect EXPANSION_HUBS; coverage assignment is a later governed batch.
CREATE SCHEMA IF NOT EXISTS research_private;

CREATE TABLE IF NOT EXISTS research_private.hub_gemi_geo_keys (
 location_key text PRIMARY KEY CHECK(location_key ~ '^[a-f0-9]{32}$'),
 postcode text, city text, municipality text, prefecture text,
 latitude double precision CHECK(latitude BETWEEN 34 AND 43),
 longitude double precision CHECK(longitude BETWEEN 19 AND 30),
 geo_source text CHECK(geo_source IN ('verified_geocode','licensed_gazetteer','verified_manual')),
 precision_kind text CHECK(precision_kind IN ('address','postcode','locality')),
 source_reference text, island_group text, checked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL)),
 CHECK(latitude IS NULL OR (geo_source IS NOT NULL AND precision_kind IS NOT NULL AND source_reference IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS research_private.hub_gemi_directory (
 gemi_number text PRIMARY KEY CHECK(gemi_number ~ '^[0-9]{8,20}$'),
 public_slug text NOT NULL UNIQUE CHECK(public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
 legal_name text NOT NULL, city text, municipality text, prefecture text,
 postcode text, sector_code text,
 matched_activity_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
 source_frame_unit_id uuid NOT NULL REFERENCES public.research_frame_units(id),
 source_record_ref text NOT NULL,
 location_key text REFERENCES research_private.hub_gemi_geo_keys(location_key),
 latitude double precision, longitude double precision,
 assigned_hub_id text CHECK(assigned_hub_id IS NULL OR assigned_hub_id ~ '^KM-HUB-[0-9]{3}$'),
 assigned_hub_slug text,
 hub_distance_km numeric CHECK(hub_distance_km IS NULL OR hub_distance_km>=0),
 assignment_method text CHECK(assignment_method IN
    ('nearest_geocoded_25km','nearest_geocoded_outside_radius','manual_geo_review')),
 assignment_status text NOT NULL DEFAULT 'awaiting_geocode' CHECK(assignment_status IN
    ('awaiting_geocode','assigned','outside_coverage','manual_review')),
 display_status text NOT NULL DEFAULT 'unpublished' CHECK(display_status IN
    ('unpublished','published','suppressed')),
 claim_application_id uuid REFERENCES public.hub_expansion_prospects(id),
 source_checked_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 seo_approved boolean NOT NULL DEFAULT false,
 CHECK((assigned_hub_id IS NULL AND assigned_hub_slug IS NULL) OR
       (assigned_hub_id IS NOT NULL AND assigned_hub_slug IS NOT NULL)),
 CHECK(display_status <> 'published' OR
   (assignment_status='assigned' AND assigned_hub_id IS NOT NULL AND
    latitude IS NOT NULL AND longitude IS NOT NULL AND
    postcode ~ '^[0-9]{5}$' AND legal_name IS NOT NULL))
);
ALTER TABLE research_private.hub_gemi_directory ADD COLUMN IF NOT EXISTS seo_approved boolean NOT NULL DEFAULT false;
DO $ddl$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint
 WHERE conrelid='research_private.hub_gemi_directory'::regclass
 AND conname='hub_gemi_directory_seo_requires_public') THEN
  ALTER TABLE research_private.hub_gemi_directory
   ADD CONSTRAINT hub_gemi_directory_seo_requires_public
   CHECK(NOT seo_approved OR display_status='published');
 END IF;
END $ddl$;
COMMENT ON TABLE research_private.hub_gemi_directory IS
 'Private GEMI registry research identities, not vendor membership, merchant verification, or outreach authorization.';
COMMENT ON TABLE research_private.hub_gemi_geo_keys IS
 'Reusable verified geographies. Never store provider coordinates without redistribution/storage permission.';
CREATE INDEX IF NOT EXISTS hub_gemi_directory_hub_status_idx ON
 research_private.hub_gemi_directory(assigned_hub_slug,display_status,public_slug);
CREATE INDEX IF NOT EXISTS hub_gemi_directory_unassigned_idx ON
 research_private.hub_gemi_directory(assignment_status,location_key);
CREATE INDEX IF NOT EXISTS hub_gemi_directory_sector_idx ON
 research_private.hub_gemi_directory(assigned_hub_slug,sector_code);
CREATE INDEX IF NOT EXISTS hub_gemi_directory_frame_idx ON
 research_private.hub_gemi_directory(source_frame_unit_id);

CREATE OR REPLACE FUNCTION research_private.hub_gemi_slug(legal_name text,gemi text)
 RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $slug$
 SELECT coalesce(nullif(trim(both '-' from left(regexp_replace(
 lower(translate(translate(upper(coalesce(legal_name,'')),
  'ΆΈΉΊΌΎΏΪΫ','ΑΕΗΙΟΥΩΙΥ'),
  'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ','ABGDEZITIKLMNXOPRSTYFHPO')),
 '[^a-z0-9]+','-','g'),70)),''),
 'epixeirisi') || '-gemi-' || gemi
 $slug$;

CREATE TABLE IF NOT EXISTS research_private.hub_gemi_hub_master (
 hub_id text PRIMARY KEY, hub_slug text NOT NULL UNIQUE, name_el text NOT NULL,
 region_code text NOT NULL,regional_unit text NOT NULL,
 latitude double precision NOT NULL, longitude double precision NOT NULL,
 radius_km numeric NOT NULL CHECK(radius_km=25),
 coverage_mode text NOT NULL CHECK(coverage_mode IN
 ('GEODESIC_RADIUS_25KM','ISLAND_LOCKED_RADIUS_25KM','WHOLE_ISLAND','LEGACY_SPARTA')),
 master_checked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE research_private.hub_gemi_geo_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_private.hub_gemi_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_private.hub_gemi_hub_master ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON research_private.hub_gemi_geo_keys FROM PUBLIC,anon,authenticated;
REVOKE ALL ON research_private.hub_gemi_directory FROM PUBLIC,anon,authenticated;
REVOKE ALL ON research_private.hub_gemi_hub_master FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION research_private.hub_gemi_slug(text,text) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA research_private TO bls_app_runtime,bls_platform_runtime;
GRANT SELECT ON research_private.hub_gemi_directory TO bls_app_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON research_private.hub_gemi_directory TO bls_platform_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON research_private.hub_gemi_geo_keys TO bls_platform_runtime;
GRANT SELECT ON research_private.hub_gemi_hub_master TO bls_platform_runtime;

DROP POLICY IF EXISTS hub_gemi_directory_app_published_read ON research_private.hub_gemi_directory;
CREATE POLICY hub_gemi_directory_app_published_read
 ON research_private.hub_gemi_directory FOR SELECT TO bls_app_runtime
 USING (display_status='published' AND assignment_status='assigned');
DROP POLICY IF EXISTS hub_gemi_directory_platform_management ON research_private.hub_gemi_directory;
CREATE POLICY hub_gemi_directory_platform_management
 ON research_private.hub_gemi_directory FOR ALL TO bls_platform_runtime
 USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS hub_gemi_geo_platform_management ON research_private.hub_gemi_geo_keys;
CREATE POLICY hub_gemi_geo_platform_management
 ON research_private.hub_gemi_geo_keys FOR ALL TO bls_platform_runtime
 USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS hub_gemi_master_platform_read ON research_private.hub_gemi_hub_master;
CREATE POLICY hub_gemi_master_platform_read ON research_private.hub_gemi_hub_master
 FOR SELECT TO bls_platform_runtime USING (true);

INSERT INTO research_private.hub_gemi_hub_master
 (hub_id,hub_slug,name_el,region_code,regional_unit,latitude,longitude,radius_km,coverage_mode)
VALUES
  ('KM-HUB-001','athina','Αθήνα','ATT','Central Athens',37.9838,23.7275,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-002','megara','Μέγαρα','ATT','West Attica',37.9942,23.3439,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-003','oropos','Ωρωπός','ATT','East Attica',38.3034,23.755,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-004','lavrio','Λαύριο','ATT','East Attica',37.7145,24.0565,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-005','aigina','Αίγινα','ATT','Islands',37.7467,23.4275,25,'WHOLE_ISLAND'),
  ('KM-HUB-006','poros','Πόρος','ATT','Islands',37.4994,23.4536,25,'WHOLE_ISLAND'),
  ('KM-HUB-007','kythira','Κύθηρα','ATT','Islands',36.149,22.989,25,'WHOLE_ISLAND'),
  ('KM-HUB-008','korinthos','Κόρινθος','PEL','Corinthia',37.9386,22.9322,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-009','xylokastro','Ξυλόκαστρο','PEL','Corinthia',38.0776,22.6317,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-010','nafplio','Ναύπλιο','PEL','Argolis',37.5686,22.8069,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-011','kranidi','Κρανίδι','PEL','Argolis',37.3797,23.1597,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-012','tripoli','Τρίπολη','PEL','Arcadia',37.5089,22.3794,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-013','leonidio','Λεωνίδιο','PEL','Arcadia',37.1668,22.8577,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-014','megalopoli','Μεγαλόπολη','PEL','Arcadia',37.4011,22.1422,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-015','sparti','Σπάρτη','PEL','Laconia',37.0745,22.4303,25,'LEGACY_SPARTA'),
  ('KM-HUB-016','gytheio','Γύθειο','PEL','Laconia',36.761,22.5652,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-017','molai','Μολάοι','PEL','Laconia',36.8074,22.8513,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-018','areopoli','Αρεόπολη','PEL','Laconia',36.6667,22.3833,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-019','kalamata','Καλαμάτα','PEL','Messenia',37.0389,22.1142,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-020','pylos','Πύλος','PEL','Messenia',36.9125,21.6965,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-021','kyparissia','Κυπαρισσία','PEL','Messenia',37.2511,21.6736,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-022','patra','Πάτρα','WGR','Achaea',38.2466,21.7346,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-023','aigio','Αίγιο','WGR','Achaea',38.2486,22.0819,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-024','kalavryta','Καλάβρυτα','WGR','Achaea',38.0327,22.1122,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-025','pyrgos','Πύργος','WGR','Elis',37.6751,21.441,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-026','mesolongi','Μεσολόγγι','WGR','Aetolia-Acarnania',38.3694,21.429,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-027','agrinio','Αγρίνιο','WGR','Aetolia-Acarnania',38.6214,21.4078,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-028','amfilochia','Αμφιλοχία','WGR','Aetolia-Acarnania',38.8583,21.1664,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-029','lamia','Λαμία','CGR','Phthiotis',38.9,22.4333,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-030','atalanti','Αταλάντη','CGR','Phthiotis',38.6515,22.9996,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-031','livadeia','Λιβαδειά','CGR','Boeotia',38.435,22.8739,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-032','thiva','Θήβα','CGR','Boeotia',38.325,23.3189,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-033','amfissa','Άμφισσα','CGR','Phocis',38.5281,22.3771,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-034','karpenisi','Καρπενήσι','CGR','Evrytania',38.9122,21.7986,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-035','chalkida','Χαλκίδα','CGR','Euboea',38.4635,23.6028,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-036','aliveri','Αλιβέρι','CGR','Euboea',38.4167,24.0333,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-037','kymi','Κύμη','CGR','Euboea',38.634,24.102,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-038','istiaia','Ιστιαία','CGR','Euboea',38.9552,23.1521,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-039','karystos','Κάρυστος','CGR','Euboea',38.0137,24.4169,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-040','skyros','Σκύρος','CGR','Euboea',38.904,24.5631,25,'WHOLE_ISLAND'),
  ('KM-HUB-041','larisa','Λάρισα','THS','Larissa',39.639,22.4191,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-042','volos','Βόλος','THS','Magnesia',39.361,22.9422,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-043','trikala','Τρίκαλα','THS','Trikala',39.5553,21.7679,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-044','karditsa','Καρδίτσα','THS','Karditsa',39.3646,21.9215,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-045','kalampaka','Καλαμπάκα','THS','Trikala',39.7044,21.626,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-046','elassona','Ελασσόνα','THS','Larissa',39.8947,22.1886,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-047','farsala','Φάρσαλα','THS','Larissa',39.2947,22.3847,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-048','almyros','Αλμυρός','THS','Magnesia',39.182,22.7594,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-049','agia-larisas','Αγιά','THS','Larissa',39.7188,22.7587,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-050','skiathos','Σκιάθος','THS','Sporades',39.1624,23.4909,25,'WHOLE_ISLAND'),
  ('KM-HUB-051','ioannina','Ιωάννινα','EPI','Ioannina',39.665,20.8537,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-052','konitsa','Κόνιτσα','EPI','Ioannina',40.0486,20.7569,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-053','metsovo','Μέτσοβο','EPI','Ioannina',39.7703,21.1822,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-054','arta','Άρτα','EPI','Arta',39.16,20.9877,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-055','preveza','Πρέβεζα','EPI','Preveza',38.9562,20.7506,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-056','igoumenitsa','Ηγουμενίτσα','EPI','Thesprotia',39.5034,20.2673,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-057','parga','Πάργα','EPI','Preveza',39.2855,20.4006,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-058','paramythia','Παραμυθιά','EPI','Thesprotia',39.4711,20.5111,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-059','kozani','Κοζάνη','WMC','Kozani',40.3007,21.7889,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-060','ptolemaida','Πτολεμαΐδα','WMC','Kozani',40.5147,21.6786,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-061','florina','Φλώρινα','WMC','Florina',40.782,21.4098,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-062','kastoria','Καστοριά','WMC','Kastoria',40.5217,21.2634,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-063','grevena','Γρεβενά','WMC','Grevena',40.0845,21.4274,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-064','thessaloniki','Θεσσαλονίκη','CMC','Thessaloniki',40.6401,22.9444,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-065','katerini','Κατερίνη','CMC','Pieria',40.2696,22.506,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-066','veria','Βέροια','CMC','Imathia',40.5244,22.2024,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-067','edessa','Έδεσσα','CMC','Pella',40.8026,22.0475,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-068','giannitsa','Γιαννιτσά','CMC','Pella',40.7919,22.4075,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-069','kilkis','Κιλκίς','CMC','Kilkis',40.993,22.875,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-070','polykastro','Πολύκαστρο','CMC','Kilkis',40.9942,22.5694,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-071','serres','Σέρρες','CMC','Serres',41.0856,23.5497,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-072','polygyros','Πολύγυρος','CMC','Chalkidiki',40.377,23.441,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-073','nea-moudania','Νέα Μουδανιά','CMC','Chalkidiki',40.242,23.284,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-074','nikiti','Νικήτη','CMC','Chalkidiki',40.2237,23.6688,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-075','ierissos','Ιερισσός','CMC','Chalkidiki',40.3981,23.8758,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-076','kavala','Καβάλα','EMT','Kavala',40.9396,24.4069,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-077','drama','Δράμα','EMT','Drama',41.149,24.1471,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-078','xanthi','Ξάνθη','EMT','Xanthi',41.1349,24.888,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-079','komotini','Κομοτηνή','EMT','Rhodope',41.1181,25.4054,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-080','alexandroupoli','Αλεξανδρούπολη','EMT','Evros',40.8457,25.8739,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-081','didymoteicho','Διδυμότειχο','EMT','Evros',41.3496,26.4961,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-082','orestiada','Ορεστιάδα','EMT','Evros',41.5031,26.5297,25,'GEODESIC_RADIUS_25KM'),
  ('KM-HUB-083','limenas-thasou','Λιμένας Θάσου','EMT','Kavala',40.7781,24.7094,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-084','limenaria-thasou','Λιμενάρια Θάσου','EMT','Kavala',40.6273,24.5762,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-085','kamariotissa-samothrakis','Καμαριώτισσα','EMT','Evros',40.4743,25.4761,25,'WHOLE_ISLAND'),
  ('KM-HUB-086','kissamos','Κίσσαμος','CRE','Chania',35.4939,23.6576,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-087','chania','Χανιά','CRE','Chania',35.5138,24.018,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-088','palaiochora','Παλαιόχωρα','CRE','Chania',35.2315,23.6819,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-089','rethymno','Ρέθυμνο','CRE','Rethymno',35.3656,24.4823,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-090','plakias','Πλακιάς','CRE','Rethymno',35.1928,24.394,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-091','irakleio','Ηράκλειο','CRE','Heraklion',35.3387,25.1442,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-092','moires','Μοίρες','CRE','Heraklion',35.0514,24.8733,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-093','agios-nikolaos','Άγιος Νικόλαος','CRE','Lasithi',35.1911,25.7134,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-094','ierapetra','Ιεράπετρα','CRE','Lasithi',35.0119,25.7407,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-095','sitia','Σητεία','CRE','Lasithi',35.2087,26.1048,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-096','kerkyra','Κέρκυρα','ION','Corfu',39.6243,19.9217,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-097','sidari','Σιδάρι','ION','Corfu',39.79,19.704,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-098','lefkimmi','Λευκίμμη','ION','Corfu',39.4231,20.0707,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-099','lefkada','Λευκάδα','ION','Lefkada',38.8302,20.7047,25,'WHOLE_ISLAND'),
  ('KM-HUB-100','argostoli','Αργοστόλι','ION','Kefalonia',38.1754,20.4886,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-101','sami-kefalonias','Σάμη','ION','Kefalonia',38.2526,20.6465,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-102','vathy-ithakis','Βαθύ Ιθάκης','ION','Ithaca',38.3642,20.7185,25,'WHOLE_ISLAND'),
  ('KM-HUB-103','zakynthos','Ζάκυνθος','ION','Zakynthos',37.787,20.8999,25,'WHOLE_ISLAND'),
  ('KM-HUB-104','gaios-paxoi','Γάιος Παξών','ION','Corfu',39.1978,20.1858,25,'WHOLE_ISLAND'),
  ('KM-HUB-105','mytilini','Μυτιλήνη','NAE','Lesbos',39.1067,26.5553,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-106','kalloni-lesvou','Καλλονή Λέσβου','NAE','Lesbos',39.2324,26.2073,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-107','mythimna-molyvos','Μόλυβος','NAE','Lesbos',39.368,26.174,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-108','chios','Χίος','NAE','Chios',38.3682,26.1359,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-109','pyrgi-chiou','Πυργί Χίου','NAE','Chios',38.2262,25.999,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-110','vathy-samou','Βαθύ Σάμου','NAE','Samos',37.7548,26.9778,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-111','karlovasi','Καρλόβασι','NAE','Samos',37.7953,26.7044,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-112','myrina','Μύρινα','NAE','Lemnos',39.8748,25.0636,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-113','moudros','Μούδρος','NAE','Lemnos',39.872,25.269,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-114','agios-kirykos','Άγιος Κήρυκος','NAE','Ikaria',37.6153,26.2945,25,'WHOLE_ISLAND'),
  ('KM-HUB-115','rodos','Ρόδος','SAE','Rhodes',36.4341,28.2176,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-116','lindos','Λίνδος','SAE','Rhodes',36.0917,28.0853,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-117','gennadi','Γεννάδι','SAE','Rhodes',36.0236,27.9235,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-118','kos','Κως','SAE','Kos',36.8933,27.2889,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-119','kefalos','Κέφαλος','SAE','Kos',36.7454,26.9584,25,'ISLAND_LOCKED_RADIUS_25KM'),
  ('KM-HUB-120','kalymnos','Κάλυμνος','SAE','Kalymnos',36.9488,26.983,25,'WHOLE_ISLAND'),
  ('KM-HUB-121','leros','Λέρος','SAE','Kalymnos',37.1323,26.852,25,'WHOLE_ISLAND'),
  ('KM-HUB-122','patmos','Πάτμος','SAE','Kalymnos',37.3098,26.5478,25,'WHOLE_ISLAND'),
  ('KM-HUB-123','pigadia-karpathou','Πηγάδια Καρπάθου','SAE','Karpathos-Kasos',35.507,27.213,25,'WHOLE_ISLAND'),
  ('KM-HUB-124','ermoupoli','Ερμούπολη','SAE','Syros',37.444,24.942,25,'WHOLE_ISLAND'),
  ('KM-HUB-125','naxos','Νάξος','SAE','Naxos',37.1036,25.376,25,'WHOLE_ISLAND'),
  ('KM-HUB-126','parikia','Παροικιά','SAE','Paros',37.0853,25.1486,25,'WHOLE_ISLAND'),
  ('KM-HUB-127','mykonos','Μύκονος','SAE','Mykonos',37.4467,25.3289,25,'WHOLE_ISLAND'),
  ('KM-HUB-128','tinos','Τήνος','SAE','Tinos',37.5375,25.1634,25,'WHOLE_ISLAND'),
  ('KM-HUB-129','fira','Φηρά','SAE','Thira',36.4167,25.4333,25,'WHOLE_ISLAND'),
  ('KM-HUB-130','adamas-milou','Αδάμαντας Μήλου','SAE','Milos',36.725,24.446,25,'WHOLE_ISLAND'),
  ('KM-HUB-131','chora-androu','Χώρα Άνδρου','SAE','Andros',37.838,24.937,25,'WHOLE_ISLAND')
ON CONFLICT(hub_id) DO UPDATE SET
 hub_slug=excluded.hub_slug,name_el=excluded.name_el,
 region_code=excluded.region_code,regional_unit=excluded.regional_unit,
 latitude=excluded.latitude,longitude=excluded.longitude,radius_km=excluded.radius_km,
 coverage_mode=excluded.coverage_mode,master_checked_at=now();
