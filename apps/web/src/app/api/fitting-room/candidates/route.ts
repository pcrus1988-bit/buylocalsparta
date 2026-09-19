import { unstable_cache } from "next/cache";
import type { CatalogCard } from "../../../../lib/catalog-view";
import { getExpansionHubRuntimeSnapshot } from "../../../../lib/expansion-hub-runtime";
import { resolveHubSelection, SPARTA_GATEWAY_SLUG } from "../../../../lib/hub-resolver";
import { getPublishedDropshipCatalogPage } from "../../../../lib/published-dropship-catalog-page";
import { getPublicProductDetails } from "../../../../lib/public-product-detail";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../lib/postgres-runtime";
import { getShopCatalogPage } from "../../../../lib/shop-catalog-page";
import { getVendorDropshipCatalogPage, getVendorDropshipFacets } from "../../../../lib/vendor-dropship-catalog-page";
import { getVendorLocalCatalogCards } from "../../../../lib/vendor-local-catalog";
import { getVisitorKey } from "../../../../lib/visitor";

type Audience = "women" | "men";

type StyleGroup = Readonly<{
  category: "fashion" | "beauty";
  subcategories: readonly string[];
}>;

type StyleProduct = Readonly<{
  id: string;
  slug: string;
  title: string;
  price: string;
  priceMinor: number;
  categoryCode: string;
  categoryLabel?: string;
  brand?: string;
  color?: string;
  sizes: readonly string[];
  fit?: string;
  composition?: string;
  mediaId?: string;
  mediaAlt?: string;
  sourceImageAvailable?: boolean;
  available: boolean;
  availableToSell: number;
  vendorId?: string;
  vendorName?: string;
  imageSrc?: string;
}>;

const WOMEN_GROUPS: readonly StyleGroup[] = [
  {
    category: "fashion",
    subcategories: [
      "fashion-womens-tops",
      "fashion-womens-shirts",
      "fashion-womens-knitwear",
      "fashion-womens-dresses",
      "fashion-womens-jumpsuits",
      "fashion-womens-trousers-jeans",
      "fashion-womens-skirts",
      "fashion-womens-shorts",
      "fashion-womens-jackets-coats"
    ]
  },
  {
    category: "fashion",
    subcategories: [
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
      "rings"
    ]
  },
  {
    category: "beauty",
    subcategories: [
      "lip-makeup",
      "eye-makeup",
      "face-makeup",
      "fragrance",
      "nail-care-colour",
      "beauty-tools-accessories"
    ]
  }
];

const MEN_GROUPS: readonly StyleGroup[] = [
  {
    category: "fashion",
    subcategories: [
      "fashion-mens-tshirts-tops",
      "fashion-mens-shirts",
      "fashion-mens-knitwear",
      "fashion-mens-trousers-jeans",
      "fashion-mens-shorts",
      "fashion-mens-jackets-coats",
      "fashion-mens-suits-formal"
    ]
  },
  {
    category: "fashion",
    subcategories: [
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
      "ties-formal-accessories"
    ]
  },
  {
    category: "beauty",
    subcategories: [
      "fragrance",
      "grooming-care",
      "beauty-tools-accessories"
    ]
  }
];

function groupsFor(audience: Audience): readonly StyleGroup[] {
  return audience === "men" ? MEN_GROUPS : WOMEN_GROUPS;
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

function compactProduct(product: CatalogCard & Readonly<{ previewImageSrc?: string }>): StyleProduct | undefined {
  if (!product.id || !product.slug || !product.title || product.priceMinor <= 0 || !product.available || product.availableToSell <= 0) {
    return undefined;
  }
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    price: product.price,
    priceMinor: product.priceMinor,
    categoryCode: product.categoryCode,
    categoryLabel: product.categoryLabel,
    brand: product.brand,
    color: product.color,
    sizes: product.sizes ?? [],
    fit: product.fit,
    composition: product.composition,
    mediaId: product.mediaId,
    mediaAlt: product.mediaAlt,
    sourceImageAvailable: product.sourceImageAvailable,
    available: product.available,
    availableToSell: product.availableToSell,
    vendorId: product.vendorId,
    vendorName: product.vendorName,
    imageSrc: product.previewImageSrc
  };
}

function uniqueProducts(products: readonly (StyleProduct | undefined)[]): StyleProduct[] {
  const unique = new Map<string, StyleProduct>();
  for (const product of products) {
    if (!product || unique.has(product.id)) continue;
    unique.set(product.id, product);
  }
  return [...unique.values()];
}

const loadSourceImageIds = unstable_cache(
  async (canonicalIds: readonly string[]): Promise<readonly string[]> => {
    const ids = [...new Set(canonicalIds.map((id) => id.trim()).filter(Boolean))];
    if (!ids.length) return [];
    const details = await getPublicProductDetails(ids);
    return ids.filter((id) => Boolean(details.get(id)?.sourceImageUrl));
  },
  ["fitting-room-source-image-fallback-v1"],
  { revalidate: 900 }
);

async function withSourceImageFallbacks(products: readonly StyleProduct[]): Promise<readonly StyleProduct[]> {
  if (!products.length) return products;
  const sourceImageIds = new Set(await loadSourceImageIds(products.map((product) => product.id)));
  return products.map((product) => product.sourceImageAvailable || !sourceImageIds.has(product.id)
    ? product
    : { ...product, sourceImageAvailable: true });
}

const loadHubScope = unstable_cache(
  async (hubSlug: string): Promise<Readonly<{
    hubSlug: string;
    hubName: string;
    marketId: string;
    marketCode: string;
    postcode: string;
  }>> => {
    const hub = resolveHubSelection(hubSlug);
    if (!hub) throw new Error("INVALID_HUB");

    const snapshot = await getExpansionHubRuntimeSnapshot();
    const runtime = snapshot.hubs.find((entry) => entry.hubId === hub.id);
    if (!runtime?.enterable || !runtime.marketId || !runtime.marketCode || !runtime.shoppingEnabled) {
      throw new Error("HUB_NOT_ENTERABLE");
    }

    const postcodeResult = await getProductionPostgresRuntime().nativePool.query<{ postcode: string }>(`
      SELECT vl.postcode
      FROM vendor_locations vl
      WHERE vl.market_id=$1::uuid
        AND vl.active=true
        AND vl.postcode ~ '^[0-9]{5}$'
      GROUP BY vl.postcode
      ORDER BY COUNT(*) DESC,vl.postcode
      LIMIT 1
    `, [runtime.marketId]);
    const postcode = postcodeResult.rows[0]?.postcode?.trim()
      || (runtime.marketCode === "sparta" ? "23100" : "");
    if (!postcode) throw new Error("HUB_POSTCODE_UNAVAILABLE");

    return {
      hubSlug: hub.slug,
      hubName: hub.nameEl,
      marketId: runtime.marketId,
      marketCode: runtime.marketCode,
      postcode
    };
  },
  ["fitting-room-hub-scope-v2"],
  { revalidate: 300 }
);

async function loadHubProducts(
  hub: Awaited<ReturnType<typeof loadHubScope>>,
  audience: Audience
): Promise<readonly StyleProduct[]> {
  const visitorKey = await getVisitorKey();
  const products: (StyleProduct | undefined)[] = [];

  for (const group of groupsFor(audience)) {
    const localPage = await getShopCatalogPage({
      visitorKey,
      postcode: hub.postcode,
      category: group.category,
      filters: { subcategories: group.subcategories },
      limit: 24,
      offset: 0
    });
    products.push(...localPage.products.map(compactProduct));

    // The shared dropship projection is currently the live Sparta market projection.
    // Never leak it into another HUB. Other HUBs still receive their local fair-assigned
    // catalogue until the core dropship read model becomes market-keyed.
    if (hub.marketCode === "sparta") {
      const dropshipPage = await getPublishedDropshipCatalogPage({
        category: group.category,
        filters: { subcategories: group.subcategories },
        limit: 24,
        offset: 0
      });
      products.push(...dropshipPage.products.map(compactProduct));
    }
  }

  return uniqueProducts(products);
}

type BrandOption = Readonly<{ value: string; label: string; count: number }>;

const loadAvailableBrandOptions = unstable_cache(
  async (
    marketId: string,
    vendorId: string | undefined,
    categories: readonly string[]
  ): Promise<readonly BrandOption[]> => {
    const result = await getProductionPostgresRuntime().nativePool.query<{
      brand_name: string;
      product_count: number | string;
    }>(`
      SELECT
        COALESCE(NULLIF(BTRIM(b.name),''),NULLIF(BTRIM(pfb.name),'')) AS brand_name,
        COUNT(DISTINCT cv.id)::int AS product_count
      FROM vendor_offers vo
      JOIN vendor_businesses v ON v.id=vo.vendor_id
      JOIN vendor_locations l ON l.id=vo.location_id
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN categories c ON c.id=cv.category_id
      LEFT JOIN product_families pf ON pf.id=cv.family_id
      LEFT JOIN brands b ON b.id=cv.brand_id
      LEFT JOIN brands pfb ON pfb.id=pf.brand_id
      WHERE l.market_id=$1::uuid
        AND ($2::text IS NULL OR v.public_id=$2)
        AND c.code=ANY($3::text[])
        AND v.status='active'
        AND l.active=true
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
        AND COALESCE(NULLIF(BTRIM(b.name),''),NULLIF(BTRIM(pfb.name),'')) IS NOT NULL
        AND (
          EXISTS (
            SELECT 1
            FROM dropship_supplier_offers dso
            JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
            WHERE dso.vendor_offer_id=vo.id
              AND dso.active=true
              AND ds.active=true
              AND ds.api_authoritative_availability=true
              AND dso.cached_available=true
              AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
              AND dso.availability_expires_at IS NOT NULL
              AND dso.availability_expires_at>now()
          )
          OR EXISTS (
            SELECT 1
            FROM inventory_balances ib
            WHERE ib.offer_id=vo.id
              AND GREATEST(
                0,
                COALESCE(ib.on_hand,0)
                  - COALESCE(ib.active_reservations,0)
                  - COALESCE(ib.safety_stock,0)
                  - COALESCE(ib.blocked,0)
              )>=1
              AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds)>now()
          )
        )
      GROUP BY COALESCE(NULLIF(BTRIM(b.name),''),NULLIF(BTRIM(pfb.name),''))
      ORDER BY product_count DESC,brand_name ASC
      LIMIT 80
    `, [marketId, vendorId ?? null, [...categories]]);

    return result.rows.map((row) => ({
      value: row.brand_name,
      label: row.brand_name,
      count: Math.max(0, Number(row.product_count) || 0)
    }));
  },
  ["fitting-room-brand-options-v1"],
  { revalidate: 300 }
);

async function loadVendorProducts(vendorId: string, audience: Audience): Promise<readonly StyleProduct[]> {
  const products: (StyleProduct | undefined)[] = [];

  // Keep genuine local stock available for local-only vendors.
  const localProducts = await getVendorLocalCatalogCards(vendorId);
  const allowedCategories = new Set(groupsFor(audience).flatMap((group) => [...group.subcategories]));
  products.push(...localProducts.filter((product) => allowedCategories.has(product.categoryCode)).map(compactProduct));

  // Supplier-backed vendor catalogues use the precomputed family filter projection.
  for (const group of groupsFor(audience)) {
    const page = await getVendorDropshipCatalogPage(vendorId, {
      categories: group.subcategories,
      availableOnly: true,
      sort: "recommended",
      limit: 36,
      offset: 0
    });
    products.push(...page.products.map(compactProduct));
  }

  return uniqueProducts(products);
}

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

    if (body.mode === "brands" && vendorId) {
      const facets = await getVendorDropshipFacets(vendorId);
      const allowedCategories = new Set(groupsFor(audience).flatMap((group) => [...group.subcategories]));
      const relevantCategoryCount = (facets.categories ?? [])
        .filter((entry) => allowedCategories.has(entry.value))
        .reduce((sum, entry) => sum + (entry.count ?? 0), 0);
      const brandOptions = relevantCategoryCount > 0
        ? (facets.brands ?? []).slice(0, 80)
        : [];
      return Response.json(
        {
          scope: "vendor",
          vendorId,
          hubSlug,
          audience,
          brands: brandOptions
        },
        { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=240" } }
      );
    }

    const hub = await loadHubScope(hubSlug);

    if (body.mode === "brands") {
      const categories = [...new Set(groupsFor(audience).flatMap((group) => [...group.subcategories]))];
      const brandOptions = await loadAvailableBrandOptions(hub.marketId, undefined, categories);
      return Response.json(
        {
          scope: "hub",
          hubSlug: hub.hubSlug,
          hubName: hub.hubName,
          audience,
          brands: brandOptions
        },
        { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=240" } }
      );
    }

    const products = [...(vendorId
      ? await loadVendorProducts(vendorId, audience)
      : await loadHubProducts(hub, audience))];

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

    const imageAwareProducts = await withSourceImageFallbacks(products);

    return Response.json(
      {
        scope: vendorId ? "vendor" : "hub",
        vendorId,
        hubSlug: hub.hubSlug,
        hubName: hub.hubName,
        audience,
        products: imageAwareProducts
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
    const invalidScope = [
      "INVALID_VENDOR",
      "INVALID_HUB",
      "HUB_NOT_ENTERABLE",
      "HUB_POSTCODE_UNAVAILABLE"
    ].includes(message);
    return Response.json(
      { error: invalidScope ? "fitting_room_scope_unavailable" : "fitting_room_candidates_unavailable" },
      { status: invalidScope ? 400 : 503, headers: { "Cache-Control": "no-store", ...(invalidScope ? {} : { "Retry-After": "1" }) } }
    );
  }
}
