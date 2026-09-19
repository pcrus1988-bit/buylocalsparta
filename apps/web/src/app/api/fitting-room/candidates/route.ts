import { unstable_cache } from "next/cache";
import { formatMoney, money } from "@buy-local-sparta/core";
import { getExpansionHubRuntimeSnapshot } from "../../../../lib/expansion-hub-runtime";
import { resolveHubSelection, SPARTA_GATEWAY_SLUG } from "../../../../lib/hub-resolver";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../lib/postgres-runtime";

type Audience = "women" | "men";

type CandidateRow = Readonly<{
  canonical_public_id: string;
  slug: string;
  title: string;
  category_code: string;
  brand_name: string | null;
  color: string | null;
  fit: string | null;
  target_gender: string | null;
  min_price_minor: number | string;
  available_to_sell: number | string;
  sizes: string[] | null;
  media_public_id: string | null;
  media_alt: string | null;
  vendor_public_id: string;
  vendor_name: string;
}>;

const WOMEN_CATEGORIES = [
  "fashion-womens-tops",
  "fashion-womens-shirts",
  "fashion-womens-knitwear",
  "fashion-womens-dresses",
  "fashion-womens-jumpsuits",
  "fashion-womens-trousers-jeans",
  "fashion-womens-skirts",
  "fashion-womens-shorts",
  "fashion-womens-jackets-coats",
  "womens-sneakers",
  "womens-formal-shoes",
  "womens-boots",
  "womens-sandals",
  "handbags",
  "sunglasses",
  "belts",
  "scarves-hats-gloves",
  "necklaces",
  "earrings",
  "bracelets",
  "rings",
  "lip-makeup",
  "eye-makeup",
  "face-makeup",
  "fragrance",
  "nail-care-colour",
  "beauty-tools-accessories"
] as const;

const MEN_CATEGORIES = [
  "fashion-mens-tshirts-tops",
  "fashion-mens-shirts",
  "fashion-mens-knitwear",
  "fashion-mens-trousers-jeans",
  "fashion-mens-shorts",
  "fashion-mens-jackets-coats",
  "fashion-mens-suits-formal",
  "mens-sneakers",
  "mens-formal-shoes",
  "mens-boots",
  "mens-sandals",
  "mens-bags",
  "backpacks",
  "sunglasses",
  "belts",
  "scarves-hats-gloves",
  "wallets-cardholders",
  "ties-formal-accessories",
  "fragrance",
  "grooming-care",
  "beauty-tools-accessories"
] as const;

const WOMEN_ONLY_BEAUTY = new Set(["lip-makeup", "eye-makeup", "face-makeup", "nail-care-colour"]);
const MEN_ONLY_BEAUTY = new Set(["grooming-care"]);

function normalizeAudienceText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasWomenSignal(value: string): boolean {
  return /(?:^|\s)(?:women|womens|woman|female|lady|ladies|donna|femme|girl)(?:\s|$)|γυναικ/.test(value);
}

function hasMenSignal(value: string): boolean {
  return /(?:^|\s)(?:men|mens|man|male|uomo|homme|boy)(?:\s|$)|ανδρ/.test(value);
}

function candidateMatchesAudience(row: CandidateRow, audience: Audience): boolean {
  const category = normalizeAudienceText(row.category_code);
  if (audience === "men" && WOMEN_ONLY_BEAUTY.has(row.category_code)) return false;
  if (audience === "women" && MEN_ONLY_BEAUTY.has(row.category_code)) return false;
  if (audience === "men" && /(?:^|\s)(?:women|womens|woman|female)(?:\s|$)|γυναικ/.test(category)) return false;
  if (audience === "women" && /(?:^|\s)(?:men|mens|man|male)(?:\s|$)|ανδρ/.test(category)) return false;

  const declared = normalizeAudienceText(row.target_gender);
  if (declared && !/unisex|neutral|all|ολ/.test(declared)) {
    if (audience === "men" && hasWomenSignal(declared) && !hasMenSignal(declared)) return false;
    if (audience === "women" && hasMenSignal(declared) && !hasWomenSignal(declared)) return false;
  }

  const text = normalizeAudienceText([row.title, row.category_code, row.target_gender].filter(Boolean).join(" "));
  const women = hasWomenSignal(text);
  const men = hasMenSignal(text);
  if (audience === "men" && women && !men) return false;
  if (audience === "women" && men && !women) return false;
  return true;
}

function safeAudience(value: unknown): Audience {
  return value === "men" ? "men" : "women";
}

function safeVendorId(value: unknown): string | undefined {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate) return undefined;
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(candidate)) throw new Error("INVALID_VENDOR");
  return candidate;
}

function safeHubSlug(value: unknown): string {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : SPARTA_GATEWAY_SLUG;
  const hub = resolveHubSelection(candidate);
  if (!hub) throw new Error("INVALID_HUB");
  return hub.slug;
}

function safeBrands(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((entry) => {
    if (typeof entry !== "string") return [];
    const brand = entry.trim().toLocaleLowerCase("el-GR").slice(0, 160);
    return brand ? [brand] : [];
  }))].slice(0, 5);
}

function safeBudgetMinor(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 5_000_000) : 0;
}

function safeSizes(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((entry) => {
    if (typeof entry !== "string") return [];
    const size = entry.trim().slice(0, 80);
    return size ? [size] : [];
  }))].slice(0, 40);
}

const loadHubMarket = unstable_cache(
  async (hubSlug: string): Promise<Readonly<{ hubSlug: string; hubName: string; marketId: string }>> => {
    const hub = resolveHubSelection(hubSlug);
    if (!hub) throw new Error("INVALID_HUB");
    const snapshot = await getExpansionHubRuntimeSnapshot();
    const runtime = snapshot.hubs.find((entry) => entry.hubId === hub.id);
    if (!runtime?.enterable || !runtime.marketId || !runtime.shoppingEnabled) throw new Error("HUB_NOT_ENTERABLE");
    return { hubSlug: hub.slug, hubName: hub.nameEl, marketId: runtime.marketId };
  },
  ["fitting-room-hub-market-v1"],
  { revalidate: 300 }
);

const loadCandidateRows = unstable_cache(
  async (marketId: string, vendorId: string | undefined, audience: Audience): Promise<readonly CandidateRow[]> => {
    const categories = audience === "men" ? MEN_CATEGORIES : WOMEN_CATEGORIES;
    const result = await getProductionPostgresRuntime().nativePool.query<CandidateRow>(`
      WITH eligible AS MATERIALIZED (
        SELECT
          cv.id AS canonical_variant_id,
          cv.public_id AS canonical_public_id,
          cv.slug,
          COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
          c.code AS category_code,
          COALESCE(b.name,pfb.name) AS brand_name,
          COALESCE(
            NULLIF(BTRIM(el.specifications->>'color'),''),
            NULLIF(BTRIM(en.specifications->>'color'),''),
            NULLIF(BTRIM(cv.variant_attributes->>'color'),'')
          ) AS color,
          COALESCE(
            NULLIF(BTRIM(el.specifications->>'fit'),''),
            NULLIF(BTRIM(en.specifications->>'fit'),'')
          ) AS fit,
          COALESCE(
            NULLIF(BTRIM(cv.variant_attributes->>'gender'),''),
            NULLIF(BTRIM(cv.variant_attributes->>'target_gender'),''),
            NULLIF(BTRIM(el.specifications->>'gender'),''),
            NULLIF(BTRIM(en.specifications->>'gender'),'')
          ) AS target_gender,
          vo.customer_price_minor AS min_price_minor,
          GREATEST(
            CASE
              WHEN ib.offer_id IS NOT NULL
               AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>=1
               AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds)>now()
              THEN GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)
              ELSE 0
            END,
            CASE
              WHEN dso.vendor_offer_id IS NOT NULL
               AND ds.id IS NOT NULL
               AND dso.cached_available=true
               AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
               AND dso.availability_expires_at IS NOT NULL
               AND dso.availability_expires_at>now()
              THEN GREATEST(1,COALESCE(dso.cached_quantity,1))
              ELSE 0
            END
          ) AS available_to_sell,
          cv.variant_attributes,
          COALESCE(el.specifications,'{}'::jsonb) AS el_specifications,
          COALESCE(en.specifications,'{}'::jsonb) AS en_specifications,
          v.id AS vendor_id,
          v.public_id AS vendor_public_id,
          v.trading_name AS vendor_name,
          vo.updated_at,
          COALESCE(dso.availability_checked_at,ib.stock_confirmed_at,vo.updated_at) AS availability_checked_at,
          ROW_NUMBER() OVER (
            PARTITION BY cv.id
            ORDER BY
              vo.customer_price_minor ASC,
              COALESCE(dso.availability_checked_at,ib.stock_confirmed_at,vo.updated_at) DESC NULLS LAST,
              vo.updated_at DESC,
              v.public_id
          ) AS canonical_rank
        FROM vendor_offers vo
        JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
        JOIN categories c ON c.id=cv.category_id
        JOIN vendor_businesses v ON v.id=vo.vendor_id
        JOIN vendor_locations l ON l.id=vo.location_id
        LEFT JOIN product_families pf ON pf.id=cv.family_id
        LEFT JOIN brands b ON b.id=cv.brand_id
        LEFT JOIN brands pfb ON pfb.id=pf.brand_id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        LEFT JOIN inventory_balances ib ON ib.offer_id=vo.id
        LEFT JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id AND dso.active=true
        LEFT JOIN dropship_suppliers ds
          ON ds.id=dso.supplier_id
         AND ds.active=true
         AND ds.api_authoritative_availability=true
        WHERE cv.market_id=$1::uuid
          AND l.market_id=$1::uuid
          AND ($3::text IS NULL OR v.public_id=$3::text)
          AND c.code=ANY($2::text[])
          AND COALESCE(cv.commerce_channel,'normal')='normal'
          AND cv.active=true
          AND cv.suppressed=false
          AND cv.recalled=false
          AND vo.status='approved'
          AND vo.merchant_visible=true
          AND vo.merchant_pause_active=false
          AND vo.customer_price_minor>0
          AND v.status='active'
          AND l.active=true
          AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
          AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
          AND (
            (
              ib.offer_id IS NOT NULL
              AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>=1
              AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds)>now()
            )
            OR (
              dso.vendor_offer_id IS NOT NULL
              AND ds.id IS NOT NULL
              AND dso.cached_available=true
              AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
              AND dso.availability_expires_at IS NOT NULL
              AND dso.availability_expires_at>now()
            )
          )
      ), representatives AS MATERIALIZED (
        SELECT *
        FROM eligible
        WHERE canonical_rank=1
      ), vendor_spread AS MATERIALIZED (
        SELECT
          representatives.*,
          ROW_NUMBER() OVER (
            PARTITION BY category_code,vendor_public_id
            ORDER BY updated_at DESC,availability_checked_at DESC NULLS LAST,min_price_minor,canonical_public_id
          ) AS vendor_category_rank
        FROM representatives
      ), ranked AS MATERIALIZED (
        SELECT
          vendor_spread.*,
          ROW_NUMBER() OVER (
            PARTITION BY category_code
            ORDER BY
              vendor_category_rank ASC,
              md5(vendor_public_id || ':' || canonical_public_id),
              min_price_minor ASC
          ) AS category_rank
        FROM vendor_spread
      ), selected AS MATERIALIZED (
        SELECT *
        FROM ranked
        WHERE category_rank<=18
      )
      SELECT
        selected.canonical_public_id,
        selected.slug,
        selected.title,
        selected.category_code,
        selected.brand_name,
        selected.color,
        selected.fit,
        selected.target_gender,
        selected.min_price_minor,
        selected.available_to_sell,
        COALESCE(size_options.sizes,'{}'::text[]) AS sizes,
        media.media_public_id,
        media.alt_text AS media_alt,
        selected.vendor_public_id,
        selected.vendor_name
      FROM selected
      LEFT JOIN LATERAL (
        SELECT array_agg(DISTINCT size_value.value ORDER BY size_value.value) AS sizes
        FROM unnest(ARRAY[
          selected.variant_attributes->>'italian_size_men',
          selected.variant_attributes->>'italian_size_women',
          selected.variant_attributes->>'shoe_size_women',
          selected.variant_attributes->>'shoe_size_men',
          selected.variant_attributes->>'waist_size',
          selected.variant_attributes->>'belt_size',
          selected.variant_attributes->>'waist_length_size',
          selected.variant_attributes->>'hat_size',
          selected.variant_attributes->>'swimwear_sleepwear_size',
          selected.variant_attributes->>'shoe_size',
          selected.variant_attributes->>'earrings_size',
          selected.variant_attributes->>'bracelets_size',
          selected.variant_attributes->>'gloves_size_women',
          selected.variant_attributes->>'ring_size',
          selected.variant_attributes->>'gloves_size_men',
          selected.variant_attributes->>'size',
          selected.el_specifications->>'size',
          selected.en_specifications->>'size'
        ]) size_value(value)
        WHERE NULLIF(BTRIM(size_value.value),'') IS NOT NULL
      ) size_options ON true
      LEFT JOIN LATERAL (
        SELECT pm.public_id AS media_public_id,pm.alt_text
        FROM product_media pm
        WHERE pm.canonical_variant_id=selected.canonical_variant_id
          AND pm.kind='image'
          AND pm.scan_status='clean'
          AND pm.rights_status='approved'
          AND pm.moderation_status='approved'
          AND pm.object_key IS NOT NULL
          AND pm.content_type IN ('image/jpeg','image/png','image/webp')
        ORDER BY
          CASE WHEN pm.vendor_id=selected.vendor_id THEN 0 ELSE 1 END,
          pm.sort_order,
          pm.reviewed_at DESC NULLS LAST,
          pm.created_at DESC,
          pm.public_id
        LIMIT 1
      ) media ON true
      ORDER BY selected.category_code,selected.category_rank
    `, [marketId, [...categories], vendorId ?? null]);
    return result.rows;
  },
  ["fitting-room-candidate-pool-v6-hub-wide"],
  { revalidate: 60 }
);

export async function POST(request: Request) {
  if (!productionDatabaseConfigured()) {
    return Response.json({ products: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const vendorId = safeVendorId(body.vendorId);
    const hubSlug = safeHubSlug(body.hubSlug);
    const audience = safeAudience(body.audience);
    const brands = safeBrands(body.brands);
    const budgetMinor = safeBudgetMinor(body.budgetMinor);
    const hub = await loadHubMarket(hubSlug);
    const rows = await loadCandidateRows(hub.marketId, vendorId, audience);

    const products = rows.flatMap((row) => {
      if (!candidateMatchesAudience(row, audience)) return [];
      const priceMinor = Number(row.min_price_minor);
      const availableToSell = Number(row.available_to_sell);
      if (
        !row.canonical_public_id
        || !row.slug
        || !row.title
        || !row.category_code
        || !Number.isSafeInteger(priceMinor)
        || priceMinor <= 0
        || !Number.isSafeInteger(availableToSell)
        || availableToSell <= 0
      ) return [];
      return [{
        id: row.canonical_public_id,
        slug: row.slug,
        title: row.title,
        priceMinor,
        price: formatMoney(money(priceMinor)),
        categoryCode: row.category_code,
        brand: row.brand_name?.trim() || undefined,
        color: row.color?.trim() || undefined,
        sizes: safeSizes(row.sizes),
        fit: row.fit?.trim() || undefined,
        mediaId: row.media_public_id?.trim() || undefined,
        mediaAlt: row.media_alt?.trim() || undefined,
        sourceImageAvailable: !row.media_public_id,
        available: true,
        availableToSell,
        vendorId: row.vendor_public_id,
        vendorName: row.vendor_name
      }];
    });

    products.sort((left, right) => {
      const leftBrand = left.brand?.trim().toLocaleLowerCase("el-GR") ?? "";
      const rightBrand = right.brand?.trim().toLocaleLowerCase("el-GR") ?? "";
      const leftBrandRank = brands.length > 0 && brands.includes(leftBrand) ? 0 : 1;
      const rightBrandRank = brands.length > 0 && brands.includes(rightBrand) ? 0 : 1;
      const leftBudgetRank = budgetMinor > 0 && left.priceMinor <= budgetMinor ? 0 : 1;
      const rightBudgetRank = budgetMinor > 0 && right.priceMinor <= budgetMinor ? 0 : 1;
      return leftBrandRank - rightBrandRank
        || leftBudgetRank - rightBudgetRank
        || left.priceMinor - right.priceMinor;
    });

    return Response.json(
      {
        scope: vendorId ? "vendor" : "hub",
        vendorId,
        hubSlug: hub.hubSlug,
        hubName: hub.hubName,
        audience,
        products
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({
      level: "error",
      event: "fitting_room.candidates_failed",
      message
    }));
    const invalidScope = message === "INVALID_VENDOR" || message === "INVALID_HUB" || message === "HUB_NOT_ENTERABLE";
    return Response.json(
      { error: invalidScope ? "fitting_room_scope_unavailable" : "fitting_room_candidates_unavailable" },
      { status: invalidScope ? 400 : 503, headers: { "Cache-Control": "no-store", ...(invalidScope ? {} : { "Retry-After": "1" }) } }
    );
  }
}
