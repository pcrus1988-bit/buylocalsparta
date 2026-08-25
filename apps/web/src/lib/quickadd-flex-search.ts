import type { SqlExecutor, SqlRow } from "@buy-local-sparta/core";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const optionalText = (value: unknown): string | undefined => text(value) || undefined;
const jsonObject = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
};
const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];

export type QuickAddFlexibleMatch = Readonly<{
  canonicalVariantId: string;
  canonicalUuid: string;
  title: string;
  description?: string;
  gtin?: string;
  brand?: string;
  model?: string;
  mpn?: string;
  categoryCode: string;
  categoryPath: string;
  specifications: Readonly<Record<string, unknown>>;
  variantAttributes: Readonly<Record<string, unknown>>;
  active: boolean;
  score: number;
  offerId?: string;
  vendorSku?: string;
  customerPriceMinor: number;
  merchantVisible: boolean;
  merchantPauseActive: boolean;
  offerStatus?: string;
  onHand: number;
  activeReservations: number;
  safetyStock: number;
  blocked: number;
}>;

export async function flexibleQuickAddSearch(
  tx: SqlExecutor,
  input: { vendorId: string; query: string; code?: string; limit?: number }
): Promise<readonly QuickAddFlexibleMatch[]> {
  const vendorId = text(input.vendorId);
  const query = text(input.query).replace(/\s+/g, " ");
  const suppliedCode = text(input.code).replace(/\D/g, "");
  const queryDigits = query.replace(/\D/g, "");
  const digits = suppliedCode || (queryDigits.length >= 4 ? queryDigits : "");
  const limit = Math.min(12, Math.max(1, Math.floor(input.limit ?? 8)));
  if (!vendorId || (!query && !digits)) return [];

  const rows = await tx.query<SqlRow>(`
    WITH RECURSIVE vendor_ctx AS (
      SELECT id AS vendor_uuid,market_id
      FROM public.vendor_businesses
      WHERE public_id=$1::text OR id::text=$1::text
      LIMIT 1
    ), category_tree AS (
      SELECT c.id,c.parent_id,c.code,ARRAY[COALESCE(el.name,en.name,c.code)]::text[] AS path_names
      FROM public.categories c
      LEFT JOIN public.category_translations el ON el.category_id=c.id AND el.locale='el'
      LEFT JOIN public.category_translations en ON en.category_id=c.id AND en.locale='en'
      CROSS JOIN vendor_ctx vc
      WHERE c.parent_id IS NULL AND (c.market_id IS NULL OR c.market_id=vc.market_id)
      UNION ALL
      SELECT c.id,c.parent_id,c.code,t.path_names||COALESCE(el.name,en.name,c.code)
      FROM public.categories c
      JOIN category_tree t ON c.parent_id=t.id
      LEFT JOIN public.category_translations el ON el.category_id=c.id AND el.locale='el'
      LEFT JOIN public.category_translations en ON en.category_id=c.id AND en.locale='en'
      CROSS JOIN vendor_ctx vc
      WHERE c.market_id IS NULL OR c.market_id=vc.market_id
    ), candidates AS (
      SELECT cv.id::text AS canonical_uuid,cv.public_id AS canonical_public_id,
             COALESCE(el.title,en.title,cv.model,cv.mpn,cv.slug) AS title,
             COALESCE(NULLIF(el.description,''),NULLIF(en.description,'')) AS description,
             CASE WHEN el.specifications IS NOT NULL AND el.specifications<>'{}'::jsonb THEN el.specifications
                  WHEN en.specifications IS NOT NULL THEN en.specifications ELSE '{}'::jsonb END AS specifications,
             COALESCE(cv.variant_attributes,'{}'::jsonb) AS variant_attributes,
             COALESCE(NULLIF(cv.gtin,''),ids.primary_trade_id) AS gtin,
             cv.model,cv.mpn,cv.active,b.name AS brand,t.code AS category_code,t.path_names,
             own_offer.offer_id,own_offer.vendor_sku,own_offer.customer_price_minor,
             own_offer.merchant_visible,own_offer.merchant_pause_active,own_offer.offer_status,
             own_offer.on_hand,own_offer.active_reservations,own_offer.safety_stock,own_offer.blocked,
             CASE
               WHEN $3::text<>'' AND (
                 regexp_replace(COALESCE(cv.gtin,''),'\\D','','g')=$3::text
                 OR regexp_replace(COALESCE(own_offer.source_gtin,''),'\\D','','g')=$3::text
                 OR regexp_replace(COALESCE(own_offer.vendor_sku,''),'\\D','','g')=$3::text
                 OR strpos(COALESCE(ids.identifier_digits,''),$3::text)>0 AND length($3::text)>=8
               ) THEN 1000
               WHEN $2::text<>'' AND (
                 lower(COALESCE(own_offer.vendor_sku,''))=lower($2::text)
                 OR lower(COALESCE(cv.model,''))=lower($2::text)
                 OR lower(COALESCE(cv.mpn,''))=lower($2::text)
                 OR lower(COALESCE(ids.identifier_text,''))=lower($2::text)
               ) THEN 960
               WHEN $2::text<>'' AND lower(COALESCE(el.title,en.title,cv.model,cv.mpn,cv.slug))=lower($2::text) THEN 930
               WHEN $3::text<>'' AND (
                 strpos(regexp_replace(COALESCE(cv.gtin,''),'\\D','','g'),$3::text)>0
                 OR strpos(regexp_replace(COALESCE(own_offer.source_gtin,''),'\\D','','g'),$3::text)>0
                 OR strpos(regexp_replace(COALESCE(own_offer.vendor_sku,''),'\\D','','g'),$3::text)>0
                 OR strpos(COALESCE(ids.identifier_digits,''),$3::text)>0
                 OR strpos(regexp_replace(COALESCE(cv.model,''),'\\D','','g'),$3::text)>0
                 OR strpos(regexp_replace(COALESCE(cv.mpn,''),'\\D','','g'),$3::text)>0
                 OR strpos(regexp_replace(COALESCE(el.title,en.title,''),'\\D','','g'),$3::text)>0
                 OR strpos(regexp_replace(COALESCE(el.description,en.description,''),'\\D','','g'),$3::text)>0
                 OR strpos(regexp_replace(COALESCE(el.specifications,en.specifications,'{}'::jsonb)::text,'\\D','','g'),$3::text)>0
                 OR strpos(regexp_replace(COALESCE(cv.variant_attributes,'{}'::jsonb)::text,'\\D','','g'),$3::text)>0
               ) THEN 900
               WHEN $2::text<>'' AND strpos(lower(COALESCE(el.title,en.title,cv.model,cv.mpn,cv.slug)),lower($2::text))>0 THEN 840
               WHEN $2::text<>'' AND (
                 strpos(lower(COALESCE(cv.model,'')),lower($2::text))>0
                 OR strpos(lower(COALESCE(cv.mpn,'')),lower($2::text))>0
                 OR strpos(lower(COALESCE(b.name,'')),lower($2::text))>0
                 OR strpos(lower(COALESCE(own_offer.vendor_sku,'')),lower($2::text))>0
                 OR strpos(lower(COALESCE(ids.identifier_text,'')),lower($2::text))>0
               ) THEN 800
               WHEN $2::text<>'' AND (
                 strpos(lower(COALESCE(el.description,en.description,'')),lower($2::text))>0
                 OR strpos(lower(COALESCE(el.specifications,en.specifications,'{}'::jsonb)::text),lower($2::text))>0
                 OR strpos(lower(COALESCE(cv.variant_attributes,'{}'::jsonb)::text),lower($2::text))>0
               ) THEN 700
               ELSE 0
             END AS match_score
      FROM public.canonical_variants cv
      JOIN vendor_ctx vc ON vc.market_id=cv.market_id
      JOIN category_tree t ON t.id=cv.category_id
      LEFT JOIN public.product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN public.product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      LEFT JOIN public.brands b ON b.id=cv.brand_id
      LEFT JOIN LATERAL (
        SELECT string_agg(COALESCE(pi.normalized_value,''),' ') AS identifier_text,
               string_agg(regexp_replace(COALESCE(pi.normalized_value,''),'\\D','','g'),' ') AS identifier_digits,
               (array_agg(pi.normalized_value ORDER BY pi.is_primary DESC,pi.created_at,pi.id)
                 FILTER (WHERE pi.identifier_scope='trade_item' AND pi.identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn13')))[1] AS primary_trade_id
        FROM public.product_identifiers pi
        WHERE pi.canonical_variant_id=cv.id AND pi.active=true
      ) ids ON true
      LEFT JOIN LATERAL (
        SELECT vo.public_id AS offer_id,vo.vendor_sku,vo.source_gtin,vo.customer_price_minor,
               vo.merchant_visible,vo.merchant_pause_active,vo.status::text AS offer_status,
               COALESCE(ib.on_hand,0)::integer AS on_hand,
               COALESCE(ib.active_reservations,0)::integer AS active_reservations,
               COALESCE(ib.safety_stock,0)::integer AS safety_stock,
               COALESCE(ib.blocked,0)::integer AS blocked
        FROM public.vendor_offers vo
        LEFT JOIN public.inventory_balances ib ON ib.offer_id=vo.id
        WHERE vo.vendor_id=vc.vendor_uuid AND vo.canonical_variant_id=cv.id
        ORDER BY vo.created_at,vo.id
        LIMIT 1
      ) own_offer ON true
      WHERE cv.suppressed=false AND cv.recalled=false
    )
    SELECT * FROM candidates
    WHERE match_score>0
    ORDER BY match_score DESC,
             CASE WHEN offer_id IS NOT NULL THEN 0 ELSE 1 END,
             title
    LIMIT $4::integer
  `, [vendorId, query, digits, limit]);

  return rows.rows.map((row) => ({
    canonicalVariantId: String(row.canonical_public_id),
    canonicalUuid: String(row.canonical_uuid),
    title: String(row.title),
    description: optionalText(row.description),
    gtin: optionalText(row.gtin),
    brand: optionalText(row.brand),
    model: optionalText(row.model),
    mpn: optionalText(row.mpn),
    categoryCode: String(row.category_code),
    categoryPath: stringArray(row.path_names).join(" › "),
    specifications: jsonObject(row.specifications),
    variantAttributes: jsonObject(row.variant_attributes),
    active: Boolean(row.active),
    score: Number(row.match_score ?? 0),
    offerId: optionalText(row.offer_id),
    vendorSku: optionalText(row.vendor_sku),
    customerPriceMinor: Number(row.customer_price_minor ?? 0),
    merchantVisible: Boolean(row.merchant_visible),
    merchantPauseActive: Boolean(row.merchant_pause_active),
    offerStatus: optionalText(row.offer_status),
    onHand: Number(row.on_hand ?? 0),
    activeReservations: Number(row.active_reservations ?? 0),
    safetyStock: Number(row.safety_stock ?? 0),
    blocked: Number(row.blocked ?? 0)
  }));
}
