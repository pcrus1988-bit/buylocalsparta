import { unstable_cache } from "next/cache";
import { loadCatalogMetadata } from "./catalog-metadata";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { trustedCatalogSourceHttpsUrl } from "./trusted-catalog-source-url";
import type { SportAudience, SportFitKnowledge, SportFitProduct, SportKnowledgeQueueStatus, SportKnowledgeStatus } from "./sport-fit-engine";

type SportCatalogRow = Readonly<{
  id: string;
  family_id: string | null;
  slug: string;
  title: string;
  category_code: string;
  price_minor: number | string;
  available_to_sell: number | string;
  vendor_id: string;
  vendor_name: string;
  preview_image_src: string | null;
  source_code: string | null;
  source_website: string | null;
  knowledge_status: string | null;
  identity_quality: string | null;
  completeness_score: number | string | null;
  evidence_score: number | string | null;
  queue_status: string | null;
  sport_facts: unknown;
}>;

export type SportFitCatalogSnapshot = Readonly<{
  vendorId: string;
  vendorName: string;
  products: readonly SportFitProduct[];
}>;

const COMMON_CATEGORIES = [
  "socks-hosiery",
  "sports-clothing",
  "fitness-accessories",
  "team-sports-equipment"
] as const;

const CATEGORY_SCOPE: Readonly<Record<SportAudience, readonly string[]>> = {
  men: [
    ...COMMON_CATEGORIES,
    "mens-running-shoes",
    "mens-sneakers",
    "fashion-mens-activewear",
    "fashion-mens-tshirts-tops",
    "fashion-mens-shorts",
    "fashion-mens-trousers-jeans"
  ],
  women: [
    ...COMMON_CATEGORIES,
    "womens-running-shoes",
    "womens-sneakers",
    "fashion-womens-activewear",
    "fashion-womens-tops",
    "fashion-womens-shorts",
    "fashion-womens-trousers-jeans"
  ],
  kids: [
    ...COMMON_CATEGORIES,
    "kids-running-shoes",
    "kids-sneakers"
  ]
};

function safeInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function safeUnitInterval(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

function objectValue(value: unknown): Readonly<Record<string, unknown>> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function stringList(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === "string" && item.trim().length > 0)?.trim();
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function knowledgeStatus(value: string | null): SportKnowledgeStatus | undefined {
  return value && ["pending","researching","partial","verified","conflict","insufficient"].includes(value)
    ? value as SportKnowledgeStatus
    : undefined;
}

function queueStatus(value: string | null): SportKnowledgeQueueStatus | undefined {
  return value && ["pending","leased","completed","partial","failed","blocked"].includes(value)
    ? value as SportKnowledgeQueueStatus
    : undefined;
}

function sportKnowledge(row: SportCatalogRow): SportFitKnowledge | undefined {
  const facts = objectValue(row.sport_facts);
  const status = knowledgeStatus(row.knowledge_status);
  const queue = queueStatus(row.queue_status);
  const identityQuality = row.identity_quality === "weak" || row.identity_quality === "medium" || row.identity_quality === "strong"
    ? row.identity_quality
    : undefined;
  if (!status && !queue && !identityQuality && Object.keys(facts).length === 0) return undefined;

  return {
    status,
    identityQuality,
    queueStatus: queue,
    completenessScore: safeUnitInterval(row.completeness_score),
    evidenceScore: safeUnitInterval(row.evidence_score),
    activities: stringList(facts.sport_activity),
    surfaces: stringList(facts.sport_surface),
    useCases: stringList(facts.sport_use_case),
    cushioningLevel: stringValue(facts.cushioning_level),
    supportLevel: stringValue(facts.support_level),
    fitLengthProfile: stringValue(facts.fit_length_profile),
    widthProfile: stringValue(facts.footwear_width_profile),
    dropMm: numberValue(facts.heel_to_toe_drop_mm),
    weightG: numberValue(facts.shoe_weight_g),
    footballSurfaceCode: stringValue(facts.football_surface_code),
    weatherProtection: stringList(facts.weather_protection),
    sockHeight: stringValue(facts.sock_height),
    sockCushioning: stringValue(facts.sock_cushioning),
    moistureWicking: booleanValue(facts.moisture_wicking),
    sockArchSupport: booleanValue(facts.sock_arch_support)
  };
}

function safeVendorId(value: string): string {
  const vendorId = value.trim();
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(vendorId)) throw new Error("INVALID_VENDOR");
  return vendorId;
}

async function readSportFitCatalog(vendorId: string, audience: SportAudience): Promise<SportFitCatalogSnapshot> {
  if (!productionDatabaseConfigured()) return { vendorId, vendorName: "", products: [] };

  const categories = CATEGORY_SCOPE[audience];
  const result = await getProductionPostgresRuntime().nativePool.query<SportCatalogRow>(`
    SELECT
      cv.public_id AS id,
      pf.id AS family_id,
      cv.slug,
      COALESCE(NULLIF(el.title,''),NULLIF(en.title,''),NULLIF(cv.model,''),NULLIF(pf.model,''),cv.slug) AS title,
      c.code AS category_code,
      vo.customer_price_minor AS price_minor,
      GREATEST(
        0,
        COALESCE(ib.on_hand,0)
          - COALESCE(ib.active_reservations,0)
          - COALESCE(ib.safety_stock,0)
          - COALESCE(ib.blocked,0)
      ) AS available_to_sell,
      v.public_id AS vendor_id,
      COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS vendor_name,
      media.source_url AS preview_image_src,
      media.source_code,
      media.source_website,
      sk.knowledge_status,
      sk.identity_quality,
      sk.completeness_score,
      sk.evidence_score,
      sq.status AS queue_status,
      sportfacts.facts AS sport_facts
    FROM vendor_businesses v
    JOIN vendor_offers vo ON vo.vendor_id=v.id
    JOIN vendor_locations l ON l.id=vo.location_id
    JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
    LEFT JOIN product_families pf ON pf.id=cv.family_id
    LEFT JOIN sport_product_knowledge sk ON sk.family_id=pf.id
    LEFT JOIN sport_knowledge_enrichment_queue sq ON sq.family_id=pf.id
    LEFT JOIN LATERAL (
      SELECT COALESCE(jsonb_object_agg(fact.code,fact.value),'{}'::jsonb) AS facts
      FROM (
        SELECT
          ad.code,
          CASE
            WHEN ad.data_type='multienum'
              THEN to_jsonb(array_agg(av.code ORDER BY pfav.position) FILTER (WHERE av.code IS NOT NULL))
            WHEN ad.data_type='enum'
              THEN to_jsonb(max(av.code))
            WHEN ad.data_type='number'
              THEN to_jsonb(max(pfav.number_value))
            WHEN ad.data_type='boolean'
              THEN to_jsonb(bool_or(pfav.boolean_value))
            ELSE to_jsonb(max(pfav.text_value))
          END AS value
        FROM product_family_attribute_values pfav
        JOIN attribute_definitions ad ON ad.id=pfav.attribute_id
        LEFT JOIN attribute_values av ON av.id=pfav.attribute_value_id
        WHERE pfav.family_id=pf.id
          AND ad.group_code LIKE 'sport%'
          AND coalesce(pfav.confidence,0)>=0.70
        GROUP BY ad.code,ad.data_type
      ) fact
      WHERE fact.value IS NOT NULL
        AND fact.value <> 'null'::jsonb
    ) sportfacts ON true
    JOIN categories c ON c.id=cv.category_id
    JOIN inventory_balances ib ON ib.offer_id=vo.id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    LEFT JOIN LATERAL (
      SELECT pm.source_url,cs.code AS source_code,cs.website AS source_website
      FROM product_media pm
      JOIN catalog_sources cs ON cs.id=pm.source_id AND cs.active=true
      WHERE pm.canonical_variant_id=cv.id
        AND pm.vendor_id=v.id
        AND pm.kind='image'
        AND pm.scan_status='clean'
        AND pm.rights_status='approved'
        AND pm.moderation_status='approved'
        AND pm.source_url IS NOT NULL
      ORDER BY pm.sort_order ASC,pm.created_at ASC,pm.id
      LIMIT 1
    ) media ON true
    WHERE v.public_id=$1
      AND v.status='active'
      AND c.code=ANY($2::text[])
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND COALESCE(cv.commerce_channel,'normal')='normal'
      AND vo.status='approved'
      AND vo.merchant_visible=true
      AND vo.merchant_pause_active=false
      AND vo.customer_price_minor>0
      AND l.active=true
      AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
      AND GREATEST(
        0,
        COALESCE(ib.on_hand,0)
          - COALESCE(ib.active_reservations,0)
          - COALESCE(ib.safety_stock,0)
          - COALESCE(ib.blocked,0)
      )>=1
      AND ib.stock_confirmed_at IS NOT NULL
      AND ib.stock_confirmed_at + make_interval(secs=>COALESCE(ib.freshness_ttl_seconds,0))>now()
    ORDER BY
      CASE
        WHEN c.code LIKE '%running-shoes' THEN 0
        WHEN c.code LIKE '%sneakers' THEN 1
        WHEN c.code='socks-hosiery' THEN 2
        WHEN c.code LIKE '%activewear' THEN 3
        ELSE 4
      END,
      vo.updated_at DESC,
      cv.public_id
    LIMIT 320
  `, [safeVendorId(vendorId), [...categories]]);

  if (result.rows.length === 0) return { vendorId, vendorName: "", products: [] };

  const metadata = await loadCatalogMetadata(result.rows.map((row) => row.id));
  const products = result.rows.flatMap((row): readonly SportFitProduct[] => {
    const details = metadata.get(row.id);
    const priceMinor = safeInt(row.price_minor);
    const availableToSell = safeInt(row.available_to_sell);
    if (!priceMinor || !availableToSell) return [];

    return [{
      id: row.id,
      familyId: row.family_id ?? undefined,
      slug: row.slug,
      title: details?.title ?? row.title,
      priceMinor,
      categoryCode: row.category_code,
      categoryLabel: details?.categoryLabel,
      brand: details?.brand,
      color: details?.color,
      sizes: details?.sizes ?? [],
      fit: details?.fit,
      description: details?.description,
      attributes: details?.attributes ?? {},
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      previewImageSrc: trustedCatalogSourceHttpsUrl(row.source_code, row.source_website, row.preview_image_src),
      knowledge: sportKnowledge(row),
      available: true,
      availableToSell
    }];
  });

  return {
    vendorId,
    vendorName: result.rows[0]?.vendor_name ?? "",
    products
  };
}

const cachedSportFitCatalog = unstable_cache(
  readSportFitCatalog,
  ["sport-fit-catalog-v2"],
  { revalidate: 30 }
);

export async function getSportFitCatalog(vendorId: string, audience: SportAudience): Promise<SportFitCatalogSnapshot> {
  return cachedSportFitCatalog(safeVendorId(vendorId), audience);
}
