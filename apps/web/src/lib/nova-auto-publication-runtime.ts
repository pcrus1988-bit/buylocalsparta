import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const SUPPLIER_CODE = "nova_brandsgateway";
const CATEGORY_BATCH_SIZE = 500;
const PUBLICATION_BATCH_SIZE = 2_000;

type CategoryCandidate = Readonly<{
  canonical_id: string;
  title: string;
  normalized_payload: unknown;
}>;

export type NovaAutoPublicationResult = Readonly<{
  categoryCandidates: number;
  categorized: number;
  unmapped: number;
  published: number;
}>;

/**
 * Keep trusted NOVA/BrandsGateway materialization aligned with the commercial
 * dropshipping contract: safe products should not require a manual publish click.
 *
 * Safety remains fail-closed:
 * - category assignment only uses deterministic supplier evidence;
 * - publication waits until canonical family consolidation has completed;
 * - ambiguous/unmapped taxonomy stays inactive and hidden;
 * - moderation, archive, suppression, recall and price/cost gates remain authoritative;
 * - this never invents supplier stock or extends availability TTLs.
 */
export async function runNovaAutoPublicationSweep(): Promise<NovaAutoPublicationResult> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const candidates = await pool.query<CategoryCandidate>(`
    SELECT
      cv.id::text AS canonical_id,
      csp.title,
      csp.normalized_payload
    FROM public.dropship_supplier_offers dso
    JOIN public.dropship_suppliers ds
      ON ds.id=dso.supplier_id
     AND ds.code=$1
     AND ds.active=true
    JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
    JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
    JOIN public.catalog_source_products csp ON csp.id=dso.source_product_id
    WHERE cv.category_id IS NULL
      AND cv.suppressed=false
      AND cv.recalled=false
    ORDER BY dso.created_at,dso.id
    LIMIT $2
  `,[SUPPLIER_CODE,CATEGORY_BATCH_SIZE]);

  const idsByCategory = new Map<string,string[]>();
  for (const row of candidates.rows) {
    const code = resolveNovaCategoryCode(row.normalized_payload,row.title);
    if (!code) continue;
    const ids = idsByCategory.get(code);
    if (ids) ids.push(row.canonical_id);
    else idsByCategory.set(code,[row.canonical_id]);
  }

  let categorized = 0;
  for (const [code,canonicalIds] of idsByCategory) {
    const changed = await pool.query<SqlRow>(`
      UPDATE public.canonical_variants cv
      SET category_id=c.id,
          updated_at=now()
      FROM public.categories c
      WHERE cv.id=ANY($1::uuid[])
        AND cv.category_id IS NULL
        AND c.market_id=cv.market_id
        AND c.code=$2
        AND c.active=true
        AND c.assignable=true
        AND c.taxonomy_role='product_class'
      RETURNING cv.id
    `,[canonicalIds,code]);
    categorized += changed.rowCount ?? changed.rows.length;
  }

  const published = await pool.query<SqlRow>(`
    WITH eligible AS MATERIALIZED (
      SELECT
        vo.id AS offer_id,
        cv.id AS canonical_id,
        dso.id AS supplier_offer_id
      FROM public.dropship_supplier_offers dso
      JOIN public.dropship_suppliers ds
        ON ds.id=dso.supplier_id
       AND ds.code=$1
       AND ds.active=true
      JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
      JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
      WHERE cv.category_id IS NOT NULL
        AND cv.family_id IS NOT NULL
        AND vo.status::text IN ('draft','approved')
        AND COALESCE((
          SELECT s.status::text
          FROM public.vendor_product_submissions s
          WHERE s.vendor_id=vo.vendor_id
            AND s.canonical_variant_id=vo.canonical_variant_id
            AND (
              (s.vendor_sku IS NULL AND vo.vendor_sku IS NULL)
              OR s.vendor_sku=vo.vendor_sku
              OR s.vendor_sku IS NULL
            )
          ORDER BY (s.vendor_sku=vo.vendor_sku) DESC NULLS LAST,s.updated_at DESC,s.id DESC
          LIMIT 1
        ),'') <> 'archived'
        AND cv.suppressed=false
        AND cv.recalled=false
        AND dso.supplier_cost_minor>0
        AND vo.customer_price_minor>0
        AND vo.customer_price_minor>=dso.supplier_cost_minor
        AND NOT (
          cv.active
          AND dso.active
          AND vo.status='approved'
          AND vo.merchant_visible
          AND vo.merchant_pause_active=false
        )
      ORDER BY vo.id
      LIMIT $2
    ), canonical_changed AS (
      UPDATE public.canonical_variants cv
      SET active=true,updated_at=now()
      FROM eligible e
      WHERE cv.id=e.canonical_id
        AND cv.active=false
      RETURNING cv.id
    ), supplier_changed AS (
      UPDATE public.dropship_supplier_offers dso
      SET active=true,updated_at=now()
      FROM eligible e
      WHERE dso.id=e.supplier_offer_id
        AND dso.active=false
      RETURNING dso.id
    ), offer_changed AS (
      UPDATE public.vendor_offers vo
      SET status=CASE WHEN vo.status='draft' THEN 'approved'::public.offer_status ELSE vo.status END,
          merchant_visible=true,
          merchant_pause_active=false,
          merchant_visibility_updated_by=NULL,
          merchant_visibility_updated_at=now(),
          updated_at=now()
      FROM eligible e
      WHERE vo.id=e.offer_id
      RETURNING vo.id,vo.vendor_id,vo.public_id
    ), audit_events AS (
      INSERT INTO public.vendor_catalog_visibility_events(
        vendor_id,offer_id,scope,visible,actor_id,metadata
      )
      SELECT
        vo.vendor_id,
        vo.id,
        'product',
        true,
        NULL,
        jsonb_build_object(
          'source','nova_auto_publication',
          'channel','dropshipping',
          'supplier',$1,
          'offer_public_id',vo.public_id
        )
      FROM offer_changed vo
      RETURNING id
    )
    SELECT count(*)::int AS published FROM eligible
  `,[SUPPLIER_CODE,PUBLICATION_BATCH_SIZE]);

  const publishedCount = Number(published.rows[0]?.published ?? 0);
  return {
    categoryCandidates: candidates.rowCount ?? candidates.rows.length,
    categorized,
    unmapped: Math.max(0,(candidates.rowCount ?? candidates.rows.length)-categorized),
    published: publishedCount
  };
}

export function resolveNovaCategoryCode(payloadValue: unknown, sourceTitle: string): string | null {
  const payload = record(payloadValue);
  const path = categoryPath(payload).map(normalize);
  const root = path[0] ?? "";
  const level2 = path[1] ?? "";
  const level3 = path[2] ?? "";
  const haystack = normalize([
    sourceTitle,
    optionalText(payload.description),
    ...path,
    ...attributeEvidence(payload)
  ].filter(Boolean).join(" "));
  const gender = inferGender(payload,haystack);

  if (root === "bags" || containsAny(haystack,["handbag","shoulder bag","clutch bag","crossbody bag","tote bag","bucket bag","messenger bag","belt bag"])) {
    if (containsAny(`${level2} ${level3} ${haystack}`,["backpack"])) return "backpacks";
    if (containsAny(`${level2} ${level3}`,["luggage","travel","duffel","briefcase","business laptop"])) return "luggage-travel-bags";
    return "handbags";
  }

  if (root === "accessories") {
    const accessory = `${level2} ${level3} ${haystack}`;
    if (containsAny(accessory,["sunglass"])) return "sunglasses";
    if (containsAny(accessory,["glasses frames","glasses frame","optical frame"])) return "optical-frames";
    if (containsAny(accessory,["belt"])) return "belts";
    if (containsAny(accessory,["wallet","cardholder","card holder"])) return "wallets-cardholders";
    if (containsAny(accessory,["earring"])) return "earrings";
    if (containsAny(accessory,["necklace"])) return "necklaces";
    if (containsAny(accessory,["bracelet"])) return "bracelets";
    if (containsAny(` ${accessory} `,[" ring "," rings "])) return "rings";
    if (containsAny(accessory,["watch"])) return "watches";
    if (containsAny(accessory,["scarf","foulard","hat","beanie","cap","glove","ear muff"])) return "scarves-hats-gloves";
  }

  if (root === "shoes" || containsAny(haystack,["shoe","sneaker","loafer","boot","sandal","slipper","ballerina flat"])) {
    if (!gender) return null;
    const prefix = gender === "women" ? "womens" : "mens";
    const shoe = `${level2} ${level3} ${haystack}`;
    if (containsAny(shoe,["sneaker","low top","high top","athletic"])) return `${prefix}-sneakers`;
    if (containsAny(shoe,["boot","ankle boot","chelsea","over the knee"])) return `${prefix}-boots`;
    if (containsAny(shoe,["sandal","slipper","slide","flip flop"])) return `${prefix}-sandals`;
    if (containsAny(shoe,["loafer","flat","pump","oxford","derby","heel","stiletto","ballet","espadrille","mule","wedge"])) return `${prefix}-formal-shoes`;
  }

  if (root === "clothing" || containsAny(haystack,["shirt","sweater","sweatshirt","jacket","dress","skirt","trouser","jeans","shorts","polo","hoodie","blazer","cardigan","swimwear","bikini","underwear"])) {
    if (!gender) return null;
    const men = gender === "men";

    // NOVA categoryDetails is authoritative supplier taxonomy. Prefer its
    // second-level clothing class before fuzzy title/attribute evidence so
    // generic attribute labels such as "Brand" cannot turn clothing into
    // underwear (the substring "bra" previously matched "brand").
    if (root === "clothing") {
      if (level2 === "underwear" || level2 === "sleepwear") return men ? "mens-underwear" : "womens-underwear";
      if (level2 === "skirts") return men ? "fashion-mens-skirts" : "fashion-womens-skirts";
      if (level2 === "pants" || level2 === "jeans denim") return men ? "fashion-mens-trousers-jeans" : "fashion-womens-trousers-jeans";
      if (level2 === "shorts") return men ? "fashion-mens-shorts" : "fashion-womens-shorts";
      if (level2 === "dresses") return men ? "fashion-mens-dresses" : "fashion-womens-dresses";
      if (level2 === "sweaters") return men ? "fashion-mens-knitwear" : "fashion-womens-knitwear";
      if (level2 === "shirts") return men ? "fashion-mens-shirts" : "fashion-womens-shirts";
      if (level2 === "t shirts") return men ? "fashion-mens-tshirts-tops" : "fashion-womens-tops";
      if (level2 === "jackets" || level2 === "blazers" || level2 === "coats" || level2 === "trench coats") {
        return men ? "fashion-mens-jackets-coats" : "fashion-womens-jackets-coats";
      }
      if (level2 === "sportswear") return men ? "fashion-mens-activewear" : "fashion-womens-activewear";
      if (level2 === "jumpsuits") return men ? null : "fashion-womens-jumpsuits";
      if (level2 === "suits") return men ? "fashion-mens-suits-formal" : "fashion-womens-sets";
    }

    const clothing = `${level2} ${level3} ${haystack}`;
    if (containsAny(clothing,["swimwear","bikini","swim shorts","swim brief","one piece swimsuit"])) return men ? "fashion-mens-swimwear" : "fashion-womens-swimwear";
    if (
      containsAny(clothing,["underwear","boxer","briefs","panties","sleepwear","bralette"])
      || containsWholePhrase(clothing,"bra")
      || containsWholePhrase(clothing,"bras")
    ) return men ? "mens-underwear" : "womens-underwear";
    if (containsAny(clothing,["sportswear","activewear","workout","legging"])) return men ? "fashion-mens-activewear" : "fashion-womens-activewear";
    if (containsAny(clothing,["jacket","coat","blazer","trench","bomber","parka","waistcoat","cloak"])) return men ? "fashion-mens-jackets-coats" : "fashion-womens-jackets-coats";
    if (containsAny(clothing,["sweater","sweatshirt","cardigan","hoodie","cashmere","knitwear","turtleneck"])) return men ? "fashion-mens-knitwear" : "fashion-womens-knitwear";
    if (containsAny(clothing,["shorts","bermuda"])) return men ? "fashion-mens-shorts" : "fashion-womens-shorts";
    if (containsAny(clothing,["jeans","pants","trouser","jogger","chino","cargo"])) return men ? "fashion-mens-trousers-jeans" : "fashion-womens-trousers-jeans";
    if (containsAny(clothing,["dress"])) return men ? "fashion-mens-dresses" : "fashion-womens-dresses";
    if (containsAny(clothing,["skirt"])) return men ? "fashion-mens-skirts" : "fashion-womens-skirts";
    if (containsAny(clothing,["jumpsuit"])) return men ? null : "fashion-womens-jumpsuits";
    if (containsAny(clothing,["two piece suit","suit"]) || level2 === "sets") return men ? "fashion-mens-suits-formal" : "fashion-womens-sets";
    if (containsAny(clothing,["dress shirt","shirt","blouse"])) return men ? "fashion-mens-shirts" : "fashion-womens-shirts";
    if (containsAny(clothing,["t shirt","tshirt","polo","tank top","top","tee shirt"])) return men ? "fashion-mens-tshirts-tops" : "fashion-womens-tops";
  }

  return null;
}

function categoryPath(payload: Readonly<Record<string,unknown>>): string[] {
  const raw = Array.isArray(payload.categoryDetails) ? payload.categoryDetails : [];
  return raw.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const name = optionalText((value as Record<string,unknown>).name);
    return name ? [name] : [];
  });
}

function attributeEvidence(payload: Readonly<Record<string,unknown>>): string[] {
  const values: string[] = [];
  const collect = (raw: unknown) => {
    if (!Array.isArray(raw)) return;
    for (const value of raw) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const row = value as Record<string,unknown>;
      const name = optionalText(row.name);
      if (name) values.push(name);
      const option = optionalText(row.option);
      if (option) values.push(option);
      if (Array.isArray(row.options)) {
        for (const item of row.options) {
          const text = optionalText(item);
          if (text) values.push(text);
        }
      }
    }
  };
  collect(payload.attributes);
  const variants = Array.isArray(payload.variants) ? payload.variants : [];
  for (const variant of variants.slice(0,3)) {
    if (!variant || typeof variant !== "object" || Array.isArray(variant)) continue;
    collect((variant as Record<string,unknown>).attributes);
  }
  return values;
}

function inferGender(payload: Readonly<Record<string,unknown>>, evidence: string): "men" | "women" | null {
  const gender = normalize(nestedName(payload.gender) ?? "");
  if (gender === "women" || gender === "female") return "women";
  if (gender === "men" || gender === "male") return "men";
  const padded = ` ${evidence} `;
  if (containsAny(padded,[" italian size women "," shoe size women "," women s "," womens "," women "])) return "women";
  if (containsAny(padded,[" italian size men "," shoe size men "," men s "," mens "," men "])) return "men";
  return null;
}

function containsAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function containsWholePhrase(value: string, phrase: string): boolean {
  const normalizedPhrase = normalize(phrase);
  if (!normalizedPhrase) return false;
  return ` ${normalize(value)} `.includes(` ${normalizedPhrase} `);
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}

function nestedName(value: unknown): string | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? optionalText((value as Record<string,unknown>).name)
    : null;
}

function optionalText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function record(value: unknown): Readonly<Record<string,unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string,unknown>>
    : {};
}
