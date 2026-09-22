import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export async function reconcileVitexStorefrontTaxonomy(): Promise<void> {
  if (!productionDatabaseConfigured()) {
    throw new Error("Production database is required for VITEX storefront taxonomy");
  }

  await getProductionPostgresRuntime().sqlPool.query(`
    BEGIN;

    WITH parent AS (
      SELECT *
      FROM categories
      WHERE code='paint-decorating'
      LIMIT 1
    ),
    defs(code,slug,name_el,name_en,sort_order) AS (
      VALUES
        ('paint-decorating-interior-wall','paint-decorating-interior-wall','Χρώματα εσωτερικού χώρου','Interior wall paints',51),
        ('paint-decorating-exterior-wall','paint-decorating-exterior-wall','Χρώματα εξωτερικού χώρου','Exterior wall paints',52),
        ('paint-decorating-primers','paint-decorating-primers','Αστάρια & βελατούρες','Primers & undercoats',53),
        ('paint-decorating-metal','paint-decorating-metal','Χρώματα & προστασία μετάλλου','Metal paints & protection',54),
        ('paint-decorating-wood','paint-decorating-wood','Βερνίκια & προστασία ξύλου','Wood varnishes & protection',55),
        ('paint-decorating-fillers','paint-decorating-fillers','Στόκοι & επισκευή επιφανειών','Fillers & surface repair',56),
        ('paint-decorating-thinners-hardeners','paint-decorating-thinners-hardeners','Διαλυτικά & σκληρυντικά','Thinners & hardeners',57),
        ('paint-decorating-specialty','paint-decorating-specialty','Ειδικές & διακοσμητικές επιστρώσεις','Specialty & decorative coatings',58)
    )
    INSERT INTO categories(
      id,market_id,parent_id,code,slug,commerce_mode,active,filter_schema,sort_config,
      require_compatibility_confirmation,regulated_checkout_allowed,counteroffer_allowed,
      advice_allowed,checkout_fulfilment_modes,taxonomy_role,assignable,discoverable,sort_order,
      created_at,updated_at
    )
    SELECT
      gen_random_uuid(),p.market_id,p.id,d.code,d.slug,p.commerce_mode,true,
      p.filter_schema,p.sort_config,p.require_compatibility_confirmation,
      p.regulated_checkout_allowed,p.counteroffer_allowed,p.advice_allowed,
      p.checkout_fulfilment_modes,'product_class',true,true,d.sort_order,now(),now()
    FROM parent p
    CROSS JOIN defs d
    WHERE NOT EXISTS (
      SELECT 1
      FROM categories c
      WHERE c.market_id=p.market_id AND c.slug=d.slug
    );

    WITH defs(slug,name_el,name_en) AS (
      VALUES
        ('paint-decorating-interior-wall','Χρώματα εσωτερικού χώρου','Interior wall paints'),
        ('paint-decorating-exterior-wall','Χρώματα εξωτερικού χώρου','Exterior wall paints'),
        ('paint-decorating-primers','Αστάρια & βελατούρες','Primers & undercoats'),
        ('paint-decorating-metal','Χρώματα & προστασία μετάλλου','Metal paints & protection'),
        ('paint-decorating-wood','Βερνίκια & προστασία ξύλου','Wood varnishes & protection'),
        ('paint-decorating-fillers','Στόκοι & επισκευή επιφανειών','Fillers & surface repair'),
        ('paint-decorating-thinners-hardeners','Διαλυτικά & σκληρυντικά','Thinners & hardeners'),
        ('paint-decorating-specialty','Ειδικές & διακοσμητικές επιστρώσεις','Specialty & decorative coatings')
    ),
    rows AS (
      SELECT c.id,d.name_el,d.name_en
      FROM defs d
      JOIN categories c ON c.slug=d.slug
    )
    INSERT INTO category_translations(category_id,locale,name,description,seo_title,seo_description)
    SELECT id,'el',name_el,NULL,NULL,NULL FROM rows
    ON CONFLICT (category_id,locale) DO UPDATE SET name=EXCLUDED.name;

    WITH defs(slug,name_el,name_en) AS (
      VALUES
        ('paint-decorating-interior-wall','Χρώματα εσωτερικού χώρου','Interior wall paints'),
        ('paint-decorating-exterior-wall','Χρώματα εξωτερικού χώρου','Exterior wall paints'),
        ('paint-decorating-primers','Αστάρια & βελατούρες','Primers & undercoats'),
        ('paint-decorating-metal','Χρώματα & προστασία μετάλλου','Metal paints & protection'),
        ('paint-decorating-wood','Βερνίκια & προστασία ξύλου','Wood varnishes & protection'),
        ('paint-decorating-fillers','Στόκοι & επισκευή επιφανειών','Fillers & surface repair'),
        ('paint-decorating-thinners-hardeners','Διαλυτικά & σκληρυντικά','Thinners & hardeners'),
        ('paint-decorating-specialty','Ειδικές & διακοσμητικές επιστρώσεις','Specialty & decorative coatings')
    ),
    rows AS (
      SELECT c.id,d.name_el,d.name_en
      FROM defs d
      JOIN categories c ON c.slug=d.slug
    )
    INSERT INTO category_translations(category_id,locale,name,description,seo_title,seo_description)
    SELECT id,'en',name_en,NULL,NULL,NULL FROM rows
    ON CONFLICT (category_id,locale) DO UPDATE SET name=EXCLUDED.name;

    CREATE TEMP TABLE tmp_vitex_category_map ON COMMIT DROP AS
    SELECT vcp.canonical_variant_id,cv.family_id,
      CASE
        WHEN mp.product_category='interior wall paint' THEN 'paint-decorating-interior-wall'
        WHEN mp.product_category IN ('exterior wall paint','acrylic exterior paint') THEN 'paint-decorating-exterior-wall'
        WHEN mp.product_category IN ('primer','surface preparation primer','metal primer') THEN 'paint-decorating-primers'
        WHEN mp.product_category IN ('metal coating','metal coatings','metal enamel','metal paint','enamel paint') THEN 'paint-decorating-metal'
        WHEN mp.product_category IN ('wood coating','wood floor varnish','wood preservative') THEN 'paint-decorating-wood'
        WHEN mp.product_category IN ('surface preparation','filler') THEN 'paint-decorating-fillers'
        WHEN lower(vcp.product_title) LIKE '%διαλυτικ%' OR lower(vcp.product_title) LIKE '%thinner%'
          OR lower(vcp.product_title) LIKE '%σκληρυντικ%' OR lower(vcp.product_title) LIKE '%hardener%'
          THEN 'paint-decorating-thinners-hardeners'
        WHEN lower(vcp.product_title) LIKE '%αστάρι%' OR lower(vcp.product_title) LIKE '%βελατούρα%'
          THEN 'paint-decorating-primers'
        WHEN lower(vcp.product_title) LIKE '%στοκ%'
          THEN 'paint-decorating-fillers'
        WHEN lower(vcp.product_title) LIKE '%ξύλ%' OR lower(vcp.product_title) LIKE '%wood%'
          THEN 'paint-decorating-wood'
        WHEN lower(vcp.product_title) LIKE '%chassis%' OR lower(vcp.product_title) LIKE '%αντισκωρια%'
          OR (lower(vcp.product_title) LIKE '%metallico%' AND lower(vcp.product_title) LIKE '%μεταλλ%')
          OR lower(vcp.product_title) LIKE '%aquavit%'
          THEN 'paint-decorating-metal'
        WHEN lower(vcp.product_title) LIKE '%εσωτερικ%' AND lower(vcp.product_title) LIKE '%χρώ%'
          THEN 'paint-decorating-interior-wall'
        WHEN lower(vcp.product_title) LIKE '%εξωτερικ%' OR lower(vcp.product_title) LIKE '%acrylan%'
          OR lower(vcp.product_title) LIKE '%τσιμεντόχρωμα%'
          THEN 'paint-decorating-exterior-wall'
        ELSE 'paint-decorating-specialty'
      END AS target_code
    FROM vitex_commerce_products vcp
    JOIN canonical_variants cv ON cv.id=vcp.canonical_variant_id
    LEFT JOIN manufacturer_products mp ON mp.id=vcp.manufacturer_product_id
    WHERE vcp.active=true
      AND vcp.canonical_variant_id IS NOT NULL;

    WITH family_target AS (
      SELECT family_id,min(target_code) AS target_code
      FROM tmp_vitex_category_map
      GROUP BY family_id
      HAVING count(DISTINCT target_code)=1
    )
    UPDATE product_families pf
    SET category_id=c.id,updated_at=now()
    FROM family_target x
    JOIN categories c ON c.code=x.target_code
    WHERE pf.id=x.family_id
      AND pf.category_id IS DISTINCT FROM c.id;

    UPDATE canonical_variants cv
    SET category_id=c.id,updated_at=now()
    FROM tmp_vitex_category_map x
    JOIN categories c ON c.code=x.target_code
    WHERE cv.id=x.canonical_variant_id
      AND cv.category_id IS DISTINCT FROM c.id;

    COMMIT;
  `);
}
