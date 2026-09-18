import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const SUPPLIER_CODE = "symphonya";
const CATEGORY_BATCH_SIZE = 1_000;
const PUBLICATION_BATCH_SIZE = 1_000;

export type SymphonyaAutoPublicationResult = Readonly<{
  categoryCandidates: number;
  categorized: number;
  unmapped: number;
  publicationEnabled: boolean;
  orderForwardingEnabled: boolean;
  published: number;
}>;

export function symphonyaAutoPublicationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BLS_SYMPHONYA_AUTO_PUBLICATION_ENABLED?.trim().toLowerCase() === "true";
}

/**
 * Category organization is always allowed because it does not make an offer public.
 * Publication is deliberately double-gated:
 * - explicit BLS_SYMPHONYA_AUTO_PUBLICATION_ENABLED=true
 * - supplier order_forwarding_enabled=true
 *
 * This prevents a browseable product from becoming purchasable before the supplier
 * order path has been operationally enabled.
 */
export async function runSymphonyaAutoPublicationSweep(): Promise<SymphonyaAutoPublicationResult> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const supplier = await pool.query<SqlRow>(`
    SELECT id::text id,order_forwarding_enabled
      FROM public.dropship_suppliers
     WHERE code=$1 AND active=true
     LIMIT 1
  `, [SUPPLIER_CODE]);
  const orderForwardingEnabled = supplier.rows[0]?.order_forwarding_enabled === true;
  const publicationEnabled = symphonyaAutoPublicationEnabled() && orderForwardingEnabled;

  const candidates = await pool.query<SqlRow>(`
    SELECT cv.id::text canonical_id,
           cv.family_id::text family_id,
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
     ORDER BY dso.updated_at DESC,dso.id
     LIMIT $2
  `, [SUPPLIER_CODE, CATEGORY_BATCH_SIZE]);

  const idsByCategory = new Map<string, Array<{ canonicalId: string; familyId: string | null }>>();
  for (const row of candidates.rows) {
    const code = resolveSymphonyaCategoryCode(row.normalized_payload, String(row.title ?? ""));
    if (!code) continue;
    const item = {
      canonicalId: requiredText(row.canonical_id, "canonical id"),
      familyId: optionalText(row.family_id)
    };
    const entries = idsByCategory.get(code);
    if (entries) entries.push(item);
    else idsByCategory.set(code, [item]);
  }

  let categorized = 0;
  for (const [code, entries] of idsByCategory) {
    const canonicalIds = entries.map((item) => item.canonicalId);
    const familyIds = [...new Set(entries.map((item) => item.familyId).filter((item): item is string => Boolean(item)))];

    if (familyIds.length) {
      await pool.query(`
        UPDATE public.product_families pf
           SET category_id=c.id,
               updated_at=now()
          FROM public.categories c
         WHERE pf.id=ANY($1::uuid[])
           AND pf.category_id IS NULL
           AND c.market_id=pf.market_id
           AND c.code=$2
           AND c.active=true
           AND c.assignable=true
           AND c.taxonomy_role='product_class'
      `, [familyIds, code]);
    }

    const changed = await pool.query<SqlRow>(`
      UPDATE public.canonical_variants cv
         SET category_id=COALESCE(pf.category_id,c.id),
             updated_at=now()
        FROM public.product_families pf,
             public.categories c
       WHERE cv.id=ANY($1::uuid[])
         AND cv.category_id IS NULL
         AND pf.id=cv.family_id
         AND c.market_id=cv.market_id
         AND c.code=$2
         AND c.active=true
         AND c.assignable=true
         AND c.taxonomy_role='product_class'
      RETURNING cv.id
    `, [canonicalIds, code]);
    categorized += changed.rowCount ?? changed.rows.length;
  }

  let published = 0;
  if (publicationEnabled) {
    const result = await pool.query<SqlRow>(`
      WITH eligible AS MATERIALIZED (
        SELECT vo.id offer_id,vo.vendor_id,vo.public_id,
               cv.id canonical_id,cv.family_id,dso.id supplier_offer_id
          FROM public.dropship_supplier_offers dso
          JOIN public.dropship_suppliers ds
            ON ds.id=dso.supplier_id
           AND ds.code=$1
           AND ds.active=true
           AND ds.order_forwarding_enabled=true
          JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
          JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
         WHERE cv.category_id IS NOT NULL
           AND cv.family_id IS NOT NULL
           AND cv.suppressed=false
           AND cv.recalled=false
           AND vo.status::text IN ('draft','approved')
           AND COALESCE(vo.source_payload->>'pricingManagedBy','')='symphonya_auto_v1'
           AND COALESCE(vo.source_payload->>'pricingPending','true')='false'
           AND dso.supplier_cost_minor>0
           AND vo.customer_price_minor>0
           AND vo.customer_price_minor>=dso.supplier_cost_minor
           AND dso.cached_available=true
           AND COALESCE(dso.cached_quantity,0)>0
           AND dso.availability_expires_at IS NOT NULL
           AND dso.availability_expires_at>now()
           AND COALESCE(dso.availability_payload->>'priceHeld','false')<>'true'
           AND EXISTS (
             SELECT 1 FROM public.product_translations pt
              WHERE pt.canonical_variant_id=cv.id
                AND pt.locale='el'
                AND NULLIF(btrim(pt.title),'') IS NOT NULL
           )
           AND COALESCE((
             SELECT s.status::text
               FROM public.vendor_product_submissions s
              WHERE s.vendor_id=vo.vendor_id
                AND s.canonical_variant_id=vo.canonical_variant_id
              ORDER BY s.updated_at DESC,s.id DESC
              LIMIT 1
           ),'') <> 'archived'
         ORDER BY vo.id
         LIMIT $2
      ), family_changed AS (
        UPDATE public.product_families pf
           SET active=true,updated_at=now()
          FROM eligible e
         WHERE pf.id=e.family_id
           AND pf.active=false
        RETURNING pf.id
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
               source_payload=COALESCE(vo.source_payload,'{}'::jsonb)
                 || jsonb_build_object('publicationState','PUBLISHED','publishedBy','symphonya_auto_publication'),
               updated_at=now()
          FROM eligible e
         WHERE vo.id=e.offer_id
        RETURNING vo.id,vo.vendor_id,vo.public_id
      ), audit_events AS (
        INSERT INTO public.vendor_catalog_visibility_events(
          vendor_id,offer_id,scope,visible,actor_id,metadata
        )
        SELECT vendor_id,id,'product',true,NULL,
               jsonb_build_object(
                 'source','symphonya_auto_publication',
                 'channel','dropshipping',
                 'supplier',$1,
                 'offer_public_id',public_id
               )
          FROM offer_changed
        RETURNING id
      )
      SELECT count(*)::int published FROM eligible
    `, [SUPPLIER_CODE, PUBLICATION_BATCH_SIZE]);
    published = Number(result.rows[0]?.published ?? 0);
  }

  return {
    categoryCandidates: candidates.rowCount ?? candidates.rows.length,
    categorized,
    unmapped: Math.max(0, (candidates.rowCount ?? candidates.rows.length) - categorized),
    publicationEnabled,
    orderForwardingEnabled,
    published
  };
}

export function resolveSymphonyaCategoryCode(payloadValue: unknown, sourceTitle = ""): string | null {
  const payload = record(payloadValue);
  const details = record(payload.categoryDetails);
  const cat = normalize(optionalText(details.cat) ?? "");
  const scat = normalize(optionalText(details.scat) ?? "");
  const sscat = normalize(optionalText(details.sscat) ?? "");
  const title = normalize(sourceTitle);
  const evidence = `${cat} ${scat} ${sscat} ${title}`;

  if (cat === "fragrance") return "fragrance";
  if (cat === "room scents") {
    return containsAny(evidence, ["candle","home fragrance","room spray","diffuser"])
      ? "candles-home-fragrance"
      : null;
  }

  if (cat === "makeup") {
    if (scat === "lips") return "lip-makeup";
    if (scat === "eyes" || scat === "eyebrows") return "eye-makeup";
    if (scat === "nails") return "nail-care-colour";
    if (scat === "face" || scat === "cheeks") return "face-makeup";
    if (scat.includes("brush") || scat.includes("applicator")) return "beauty-tools-accessories";
    return null;
  }

  if (cat === "skin") {
    if (scat.includes("cleansing") || scat.includes("exfoliating")) return "facial-cleansers";
    if (scat.includes("face shaving")) return "grooming-care";
    if (containsAny(evidence, ["sun care","sunscreen","spf"])) return "sun-care";
    if (containsAny(evidence, ["serum","treatment","mask","eye care","toning","calming"])) return "serums-treatments";
    if (containsAny(evidence, ["cream","lotion","gel","emulsion","balm","moistur"])) return "face-moisturisers";
    return "serums-treatments";
  }

  if (cat === "hair") {
    if (scat === "hair accessories") return "hair-accessories";
    if (scat === "hair styling") return "hair-styling-products";
    if (scat === "hair colouring") return "hair-treatments";
    if (containsAny(evidence, ["shampoo","conditioner"])) return "shampoo-conditioner";
    if (scat === "hair care" || scat === "hair care sets") return "hair-treatments";
    return null;
  }

  if (cat === "body") {
    if (scat === "sun & tan" || containsAny(evidence, ["sunscreen","sun protection","spf"])) return "sun-care";
    if (containsAny(evidence, ["shaving","beard","after-shave","aftershave"])) return "grooming-care";
    return "bath-body-care";
  }

  if (containsAny(evidence, ["perfume","eau de parfum","eau de toilette","parfum"])) return "fragrance";
  return null;
}

function containsAny(value: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => value.includes(token));
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[_/\\-]+/g, " ").replace(/\s+/g, " ").trim();
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function optionalText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function requiredText(value: unknown, label: string): string {
  const text = optionalText(value);
  if (!text) throw new Error(`${label} is required`);
  return text;
}
