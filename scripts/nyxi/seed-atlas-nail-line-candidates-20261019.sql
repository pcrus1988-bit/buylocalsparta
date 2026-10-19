-- Curated, unverified product-line identity candidates from the registered
-- NYXI Source Atlas metadata ONLY. No manufacturer page fetched or copied.
-- No product SKUs, shades, swatches or products are created.
WITH candidates(publisher,line_key,line_name,source_key,kind) AS(
 VALUES
 ('Akzentz','luxio','Luxio','akzentz_luxio_collections','gel_polish'),
 ('Bio Sculpture','biogel','BIOGEL','bio_sculpture_biogel_colors','unclassified'),
 ('Bio Sculpture','evo','EVO','bio_sculpture_evo_colors','unclassified'),
 ('Creative Nail Design','cnd-shellac','CND SHELLAC','cnd_shellac_colours','gel_polish'),
 ('DND Gel','dc-color','DC Color','dnd_dc_color_catalogue','unclassified'),
 ('DND Gel','dnd-color','DND Color','dnd_dnd_color_catalogue','unclassified'),
 ('essie','gel-couture','Gel Couture','essie_gel_couture_sheers','traditional_lacquer'),
 ('Manucurist','green','Green','manucurist_green_colours','traditional_lacquer'),
 ('Manucurist','green-flash','Green Flash','manucurist_green_flash_colours','hybrid'),
 ('Nail Alliance / Gelish','gelish-color-plus','Gelish Color Plus','gelish_color_plus_all','unclassified'),
 ('OPI','gelcolor','GelColor','opi_gel_nail_polish','gel_polish'),
 ('OPI','gelevate','GELevate','opi_gel_nail_polish','unclassified'),
 ('OPI','infinite-shine','Infinite Shine','opi_infinite_shine','traditional_lacquer'),
 ('OPI','nail-lacquer','Nail Lacquer','opi_nail_lacquer_catalogue','traditional_lacquer'),
 ('Semilac','easy-off','EASY OFF','semilac_easy_off','gel_polish'),
 ('Semilac','uv-hybrid','UV Hybrid','semilac_uv_hybrid_colors','hybrid'),
 ('The GelBottle Inc','gel-colour','Gel Colour','tgb_gel_colour_shop_all','gel_polish')
), valid AS(
 SELECT c.*,p.id AS publisher_id,s.id AS atlas_source_id,s.canonical_url AS atlas_url,
  s.title AS atlas_title
 FROM candidates c
 JOIN public.nyxi_nail_brand_publishers_v1 p ON p.publisher_name=c.publisher
 JOIN public.nyxi_sources s ON s.source_key=c.source_key
 JOIN public.nyxi_nail_publisher_sources_v1 ps ON ps.publisher_id=p.id AND ps.source_id=s.id
 WHERE p.identity_status='source_atlas_publisher_unresolved'
  AND s.source_role='manufacturer_catalogue'
)
INSERT INTO public.nyxi_nail_product_lines_v1(
 publisher_id,line_key,line_name,product_type,review_status,metadata)
SELECT publisher_id,line_key,line_name,kind,'candidate',
 jsonb_build_object('source_atlas_id',atlas_source_id,'source_atlas_key',source_key,
 'source_atlas_title',atlas_title,'source_atlas_url',atlas_url,
 'basis','source_registry_title_only_not_fetched',
 'origin_publisher_identity_unresolved',true,'rights_review_required',true,
 'line_identity_unverified',true,'no_product_variants_ingested',true,
 'no_verified_shades_or_hex',true,'mapped_at','2026-10-19')
FROM valid ON CONFLICT(publisher_id,line_key) DO NOTHING;
