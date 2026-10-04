import type { Metadata } from "next";
import { after } from "next/server";
import { interpretSearchQuery, resolveCatalogColor } from "@buy-local-sparta/core";
import type { CatalogCard, CatalogFacetOption } from "../../lib/catalog-view";
import { getShopCatalogPage } from "../../lib/shop-catalog-page";
import { getCachedShopTaxonomy } from "../../lib/cached-shop-taxonomy";
import { SiteHeader } from "../../components/SiteHeader";
import { getVisitorKey } from "../../lib/visitor";
import { recordStorefrontSearchAnalytics } from "../../lib/storefront-search-analytics";
import { SaveSearchButton } from "../../components/SaveSearchButton";
import { CatalogProductCard } from "../../components/CatalogProductCard";
import { CatalogSearchInput } from "../../components/CatalogSearchInput";
import { ShopFilterFacets } from "../../components/ShopFilterFacets";
import {
  inferStorefrontTaxonomyIntent,
  resolveStorefrontSubcategoryIntent,
  STOREFRONT_CATEGORIES,
  storefrontCategoryBySlug,
  storefrontFacetEnabled,
  storefrontLeafForSubcategory
} from "../../lib/storefront-taxonomy";
import { SiteFooter } from "../../components/SiteFooter";
import { enrichCatalogCardsWithLocalProof, type LocalCommerceProof } from "../../lib/local-commerce-proof";
import { catalogAttributeDefinitionsForLeaf } from "../../lib/catalog-attribute-facets";
import { filterCatalogCardsByAttributes, type CatalogAttributeFilters } from "../../lib/catalog-attribute-filter";
import { extractStorefrontAttributeQuery, resolveStorefrontAttributeIntents } from "../../lib/storefront-attribute-query";
import { formatStorefrontAttributeAdvisory } from "../../lib/storefront-attribute-label";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import { isReadOnlyPublicCrawlerRequest } from "../../lib/request-audience";
import { getCachedCrawlerCatalogCards, getCachedPublishedDropshipShopPage, hasLiveLocalShopProducts } from "../../lib/cached-public-shop-page";
import { getSeoGlobalSettingsSnapshot } from "../../lib/seo-settings";
import { getCachedShopSupplierFacets } from "../../lib/shop-supplier-facets";

const SHOP_PAGE_SIZE = 30;
const SHOP_INDEXABLE_QUERY_KEYS = new Set([
  "q",
  "page",
  "category",
  "subcategory",
  "subcategory_any",
  "guideLabel",
  "availability",
  "sort",
  "minPrice",
  "maxPrice",
  "brand",
  "color",
  "size",
  "fit"
]);

type ShopProps = Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>;
type ShopCard = CatalogCard & Readonly<{
  previewImageSrc?: string;
  localProof?: LocalCommerceProof;
  supplierFulfilled?: boolean;
}>;

function valueOf(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function valuesOf(value: string | string[] | undefined): readonly string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((entry) => entry.trim()).filter(Boolean))];
}

function positivePage(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function euroPriceMinor(value: string): number | undefined {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100);
}

function purchasablePublicProduct(product: ShopCard): boolean {
  return product.available && product.availableToSell > 0 && product.priceMinor > 0 && Boolean(product.vendorId);
}

function interleaveHubSearchProducts(
  localProducts: readonly ShopCard[],
  supplierProducts: readonly ShopCard[],
  limit = SHOP_PAGE_SIZE
): ShopCard[] {
  const result: ShopCard[] = [];
  const seen = new Set<string>();
  let localIndex = 0;
  let supplierIndex = 0;

  while (result.length < limit && (localIndex < localProducts.length || supplierIndex < supplierProducts.length)) {
    const local = localProducts[localIndex++];
    if (local && !seen.has(local.id)) {
      seen.add(local.id);
      result.push(local);
    }
    if (result.length >= limit) break;

    const supplier = supplierProducts[supplierIndex++];
    if (supplier && !seen.has(supplier.id)) {
      seen.add(supplier.id);
      result.push(supplier);
    }
  }
  return result;
}

function fallbackFacetOptions(values: readonly { value?: string; label?: string }[]): CatalogFacetOption[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const entry of values) {
    const value = entry.value?.trim();
    if (!value) continue;
    const current = counts.get(value);
    counts.set(value, {
      label: entry.label?.trim() || current?.label || value,
      count: (current?.count ?? 0) + 1
    });
  }
  return [...counts.entries()]
    .map(([value, entry]) => ({ value, label: entry.label, count: entry.count }))
    .sort((left, right) => left.label.localeCompare(right.label, "el"));
}

function deriveFallbackFacets(products: readonly ShopCard[]) {
  return {
    subcategories: fallbackFacetOptions(products.map((product) => ({
      value: product.categoryCode,
      label: product.categoryLabel ?? product.categoryCode
    }))),
    brands: fallbackFacetOptions(products.map((product) => ({
      value: product.brand,
      label: product.brand
    }))),
    colors: fallbackFacetOptions(products.map((product) => ({
      value: product.color,
      label: product.color
    }))),
    sizes: fallbackFacetOptions(products.flatMap((product) =>
      product.sizes.map((size) => ({ value: size, label: size }))
    )),
    fits: fallbackFacetOptions(products.map((product) => ({
      value: product.fit,
      label: product.fit
    })))
  };
}

function mergeFacetOptions(
  primary: readonly CatalogFacetOption[],
  fallback: readonly CatalogFacetOption[]
): readonly CatalogFacetOption[] {
  if (!fallback.length) return primary;
  const merged = new Map(primary.map((entry) => [entry.value, entry] as const));
  for (const entry of fallback) {
    const existing = merged.get(entry.value);
    if (!existing) merged.set(entry.value, entry);
    else if (typeof existing.count !== "number" && typeof entry.count === "number") {
      merged.set(entry.value, { ...existing, count: entry.count });
    }
  }
  return [...merged.values()];
}

function canonicalColorFacetOptions(options: readonly CatalogFacetOption[]): readonly CatalogFacetOption[] {
  const grouped = new Map<string, CatalogFacetOption>();
  for (const entry of options) {
    const resolved = resolveCatalogColor(entry.value) ?? resolveCatalogColor(entry.label);
    const value = resolved?.key ?? entry.value.trim();
    if (!value) continue;
    const label = resolved?.displayNameEl ?? entry.label;
    const existing = grouped.get(value);
    const hasCount = typeof existing?.count === "number" || typeof entry.count === "number";
    grouped.set(value, {
      value,
      label,
      count: hasCount ? (existing?.count ?? 0) + (entry.count ?? 0) : undefined
    });
  }
  return [...grouped.values()].sort((left, right) =>
    (right.count ?? 0) - (left.count ?? 0) || left.label.localeCompare(right.label, "el")
  );
}

function shopPageHref(params: Record<string, string | string[] | undefined>, page: number): string {
  const next = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(params)) {
    if (key === "page" || rawValue === undefined) continue;
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) if (value.trim()) next.append(key, value);
  }
  if (page > 1) next.set("page", String(page));
  const query = next.toString();
  return query ? `/shop?${query}` : "/shop";
}

export async function generateMetadata({ searchParams }: ShopProps): Promise<Metadata> {
  const base = await governedStaticSeoMetadata("/shop", {
    title: "Προϊόντα",
    description: "Ανακάλυψε προϊόντα διαθέσιμα από τοπικά καταστήματα της Σπάρτης."
  });
  const params = await searchParams;
  const hasQueryState = Object.entries(params).some(([key, value]) => {
    if (!valueOf(value).trim()) return false;
    return SHOP_INDEXABLE_QUERY_KEYS.has(key) || key.startsWith("attr_");
  });
  if (!hasQueryState) return base;
  const category = storefrontCategoryBySlug(valueOf(params.category));
  return {
    ...base,
    alternates: { canonical: category ? `/category/${category.slug}` : "/shop" },
    robots: { index: false, follow: true }
  };
}

export default async function ShopPage({ searchParams }: ShopProps) {
  const params = await searchParams;
  const page = positivePage(valueOf(params.page));
  const pageOffset = (page - 1) * SHOP_PAGE_SIZE;
  const query = valueOf(params.q).trim();
  const searchIntent = interpretSearchQuery(query);
  const taxonomySeedQuery = searchIntent.text || (searchIntent.applied.length ? "" : query);
  const requestedCategory = valueOf(params.category);
  const taxonomyIntent = inferStorefrontTaxonomyIntent(taxonomySeedQuery);
  const inferredCategory = requestedCategory ? undefined : taxonomyIntent?.category;
  const category = requestedCategory || inferredCategory?.slug || "";
  const requestedSubcategory = valueOf(params.subcategory);
  const intentLeaf = taxonomyIntent && (!requestedCategory || taxonomyIntent.category.slug === requestedCategory)
    ? taxonomyIntent.leaf
    : undefined;
  const activeLeaf = intentLeaf
    ?? (requestedSubcategory ? storefrontLeafForSubcategory(category, requestedSubcategory) : undefined);
  const naturalAttributeQuery = extractStorefrontAttributeQuery(taxonomySeedQuery, activeLeaf?.key);
  const catalogQuery = naturalAttributeQuery.text;
  const availability = valueOf(params.availability);
  const sort = valueOf(params.sort);
  const minPriceInput = valueOf(params.minPrice).trim();
  const maxPriceInput = valueOf(params.maxPrice).trim();
  const explicitMinPriceMinor = euroPriceMinor(minPriceInput);
  const explicitMaxPriceMinor = euroPriceMinor(maxPriceInput);
  const minPriceMinor = explicitMinPriceMinor ?? searchIntent.minPriceMinor;
  const maxPriceMinor = explicitMaxPriceMinor ?? searchIntent.maxPriceMinor;
  const requestedGuideSubcategories = category === "fashion"
    ? valuesOf(params.subcategory_any).map((entry) => entry.slice(0, 120)).slice(0, 64)
    : [];
  const requestedGuideLabel = category === "fashion" ? valueOf(params.guideLabel).trim().slice(0, 120) : "";
  const brand = valueOf(params.brand);
  const requestedColor = valueOf(params.color).trim();
  const color = resolveCatalogColor(requestedColor)?.key ?? requestedColor;
  const size = valueOf(params.size);
  const fit = valueOf(params.fit);
  const attributeDefinitions = catalogAttributeDefinitionsForLeaf(activeLeaf?.key);
  const explicitAttributeFilters: CatalogAttributeFilters = Object.fromEntries(
    attributeDefinitions
      .map((definition) => [definition.key, valueOf(params[`attr_${definition.key}`]).trim()] as const)
      .filter(([, value]) => Boolean(value))
  );
  let attributeFilters: CatalogAttributeFilters = explicitAttributeFilters;
  let resolvedNaturalAttributeFilters: CatalogAttributeFilters = {};
  let subcategory = requestedSubcategory;
  let filters = { subcategory, brand, color, size, fit };

  // The Vercel web runtime intentionally uses one PostgreSQL client per instance.
  // Keep DB-backed cache misses sequential: starting presence/SEO reads alongside
  // taxonomy can make one request wait for the only pool slot until the connection
  // acquisition timeout. Cache hits remain fast, while cold refreshes stay bounded.
  let taxonomy = await getCachedShopTaxonomy(category, catalogQuery, filters, "23100", activeLeaf?.key, attributeFilters);

  const inferredSubcategory = requestedSubcategory || requestedGuideSubcategories.length
    ? undefined
    : resolveStorefrontSubcategoryIntent(activeLeaf, taxonomy.facets.subcategories);
  if (inferredSubcategory) {
    subcategory = inferredSubcategory.value;
    filters = { subcategory, brand, color, size, fit };
    taxonomy = await getCachedShopTaxonomy(category, catalogQuery, filters, "23100", activeLeaf?.key, attributeFilters);
  }
  resolvedNaturalAttributeFilters = resolveStorefrontAttributeIntents(
    naturalAttributeQuery.intents,
    taxonomy.attributeFacets,
    explicitAttributeFilters
  );
  if (Object.keys(resolvedNaturalAttributeFilters).length > 0) {
    attributeFilters = { ...resolvedNaturalAttributeFilters, ...explicitAttributeFilters };
    taxonomy = await getCachedShopTaxonomy(category, catalogQuery, filters, "23100", activeLeaf?.key, attributeFilters);
  }

  const groupedSubcategories = subcategory ? [] : requestedGuideSubcategories;
  const productFilters = { ...filters, fit, subcategories: groupedSubcategories };
  const attributeFacets = taxonomy.attributeFacets;
  const availableCategories = taxonomy.categories.length ? taxonomy.categories : STOREFRONT_CATEGORIES;
  const categoryView = availableCategories.some((item) => item.slug === category) ? storefrontCategoryBySlug(category) : undefined;
  const allowDropship = searchIntent.availability !== "pickup_today";
  let products: ShopCard[] = [];
  let hasNextPage = false;
  const localProductsAvailable = await hasLiveLocalShopProducts();
  const readOnlyCrawler = localProductsAvailable ? await isReadOnlyPublicCrawlerRequest() : false;
  let visitorKey = localProductsAvailable && !readOnlyCrawler ? await getVisitorKey() : "";

  if (readOnlyCrawler) {
    let crawlerProducts = [...await getCachedCrawlerCatalogCards(
      "23100",
      catalogQuery,
      category,
      { ...filters, fit },
      SHOP_PAGE_SIZE
    )];
    if (groupedSubcategories.length) {
      const allowed = new Set(groupedSubcategories);
      crawlerProducts = crawlerProducts.filter((product) => allowed.has(product.categoryCode));
    }
    crawlerProducts = [...await filterCatalogCardsByAttributes(crawlerProducts, attributeFilters)];
    products = crawlerProducts;

    if (allowDropship && page === 1 && products.length < SHOP_PAGE_SIZE) {
      const remaining = SHOP_PAGE_SIZE - products.length;
      const dropshipPage = await getCachedPublishedDropshipShopPage({
        query: catalogQuery,
        category,
        filters: productFilters,
        attributeFilters,
        minPriceMinor,
        maxPriceMinor,
        sort,
        limit: remaining,
        offset: 0
      });
      const seen = new Set(products.map((product) => product.id));
      products.push(...dropshipPage.products.filter((product) => !seen.has(product.id)).slice(0, remaining));
    }
  } else {
    const mixedHubSearch = localProductsAvailable && allowDropship && Boolean(catalogQuery);
    if (mixedHubSearch) {
      // A global search is HUB-wide, not source-wide. Give current local-vendor stock
      // and supplier-backed stock deterministic space on every result page instead of
      // exhausting one source before the other. This keeps an active local vendor from
      // disappearing behind a large dropship catalogue (and vice versa).
      const sourcePageSize = Math.ceil(SHOP_PAGE_SIZE / 2);
      const sourceOffset = (page - 1) * sourcePageSize;
      const localPage = await getShopCatalogPage({
        visitorKey,
        postcode: "23100",
        query: catalogQuery,
        category,
        filters: productFilters,
        attributeFilters,
        minPriceMinor,
        maxPriceMinor,
        sort,
        limit: sourcePageSize,
        offset: sourceOffset
      });
      const dropshipPage = await getCachedPublishedDropshipShopPage({
        query: catalogQuery,
        category,
        filters: productFilters,
        attributeFilters,
        minPriceMinor,
        maxPriceMinor,
        sort,
        limit: sourcePageSize,
        offset: sourceOffset
      });
      products = interleaveHubSearchProducts(localPage.products, dropshipPage.products);
      hasNextPage = localPage.hasMore || dropshipPage.hasMore;
    } else if (!localProductsAvailable) {
      // When there is no live local-stock catalogue, avoid performing visitor-specific
      // fairness/assignment work only to discover an empty local window. Dropship
      // discovery is public/non-personalized and can safely use the short shared cache;
      // checkout still revalidates authoritative supplier availability.
      if (allowDropship) {
        const dropshipPage = await getCachedPublishedDropshipShopPage({
          query: catalogQuery,
          category,
          filters: productFilters,
          attributeFilters,
          minPriceMinor,
          maxPriceMinor,
          sort,
          limit: SHOP_PAGE_SIZE,
          offset: pageOffset
        });
        products = [...dropshipPage.products];
        hasNextPage = dropshipPage.hasMore;
      }
    } else {
      const localPage = await getShopCatalogPage({
        visitorKey,
        postcode: "23100",
        query: catalogQuery,
        category,
        filters: productFilters,
        attributeFilters,
        minPriceMinor,
        maxPriceMinor,
        sort,
        limit: SHOP_PAGE_SIZE,
        offset: pageOffset
      });

      products = searchIntent.availability === "pickup_today"
        ? [...await enrichCatalogCardsWithLocalProof(localPage.products, visitorKey, "23100")]
        : [...localPage.products];
      const expectedLocalCount = Math.max(0, Math.min(SHOP_PAGE_SIZE, localPage.total - pageOffset));
      const atFinalLocalWindow = pageOffset + SHOP_PAGE_SIZE >= localPage.total;

      if (allowDropship && atFinalLocalWindow) {
        const dropshipOffset = Math.max(0, pageOffset - localPage.total);
        const dropshipSlots = Math.max(0, SHOP_PAGE_SIZE - expectedLocalCount);
        const dropshipPage = await getCachedPublishedDropshipShopPage({
          query: catalogQuery,
          category,
          filters: productFilters,
          attributeFilters,
          minPriceMinor,
          maxPriceMinor,
          sort,
          limit: Math.max(1, dropshipSlots),
          offset: dropshipOffset
        });

        if (dropshipSlots > 0) {
          const seen = new Set(products.map((product) => product.id));
          products.push(...dropshipPage.products.filter((product) => !seen.has(product.id)).slice(0, dropshipSlots));
        }
        hasNextPage = dropshipPage.hasMore;
      } else {
        hasNextPage = localPage.hasMore || pageOffset + SHOP_PAGE_SIZE < localPage.total;
      }
    }
  }

  const fallbackFacetProducts = [...products];
  products = products.filter(purchasablePublicProduct);
  if (availability === "available") products = products.filter((product) => product.available);
  const fallbackFacets = deriveFallbackFacets(fallbackFacetProducts);

  // Supplier-backed filters must be derived from the same live family projection
  // that selects products. The broader taxonomy projection intentionally keeps
  // discovery vocabulary during stock load-shedding, so it can contain values that
  // are not currently sellable. Using it as the only facet source creates clickable
  // options with positive historical counts that correctly return zero live products.
  const supplierFacets = allowDropship && !readOnlyCrawler
    ? await getCachedShopSupplierFacets({
        query: catalogQuery,
        category,
        subcategories: subcategory ? [subcategory] : groupedSubcategories,
        brand,
        color,
        size,
        fit
      }).catch((error) => {
        console.error(JSON.stringify({
          level: "error",
          event: "storefront.shop_supplier_facets_degraded",
          message: error instanceof Error ? error.message : String(error)
        }));
        return undefined;
      })
    : undefined;

  // If there is no live local catalogue, supplier facets are authoritative rather
  // than additive. This prevents stale discovery-only taxonomy values from leaking
  // back into a dropship-only filter panel. In a mixed HUB catalogue we merge both
  // sources so local and supplier-backed choices remain discoverable together.
  const supplierFacetsAuthoritative = !localProductsAvailable && supplierFacets !== undefined;
  const liveFacetOptions = (
    taxonomyOptions: readonly CatalogFacetOption[],
    supplierOptions: readonly CatalogFacetOption[]
  ): readonly CatalogFacetOption[] => (
    supplierFacetsAuthoritative
      ? supplierOptions
      : mergeFacetOptions(taxonomyOptions, supplierOptions)
  );

  const facets = {
    subcategories: mergeFacetOptions(
      liveFacetOptions(taxonomy.facets.subcategories, supplierFacets?.categories ?? []),
      fallbackFacets.subcategories
    ),
    brands: mergeFacetOptions(
      liveFacetOptions(taxonomy.facets.brands, supplierFacets?.brands ?? []),
      fallbackFacets.brands
    ),
    colors: canonicalColorFacetOptions(mergeFacetOptions(
      liveFacetOptions(taxonomy.facets.colors, supplierFacets?.colors ?? []),
      fallbackFacets.colors
    )),
    sizes: mergeFacetOptions(
      liveFacetOptions(taxonomy.facets.sizes, supplierFacets?.sizes ?? []),
      fallbackFacets.sizes
    )
  };
  const fitOptions = mergeFacetOptions(
    liveFacetOptions(taxonomy.fits ?? [], supplierFacets?.fits ?? []),
    fallbackFacets.fits
  );
  if (searchIntent.availability === "pickup_today") products = products.filter((product) => product.localProof?.pickup && product.localProof.stockConfirmedToday);
  if (minPriceMinor !== undefined) products = products.filter((product) => product.priceMinor >= minPriceMinor);
  if (maxPriceMinor !== undefined) products = products.filter((product) => product.priceMinor <= maxPriceMinor);
  if (sort === "price-asc") products.sort((a, b) => a.priceMinor - b.priceMinor);
  if (sort === "price-desc") products.sort((a, b) => b.priceMinor - a.priceMinor);

  if (!readOnlyCrawler && query) {
    // Search analytics needs a stable visitor digest, but an empty/default browse
    // is never recorded by recordStorefrontSearchAnalytics. Avoid touching request
    // identity on the common dropship-only landing page solely for a guaranteed no-op.
    if (!visitorKey) visitorKey = await getVisitorKey();
    const analyticsPayload = {
      visitorKey,
      query,
      resultCount: products.length,
      categoryCode: subcategory || category || undefined,
      filters: {
        subcategory: subcategory || undefined,
        subcategoryGroup: groupedSubcategories.length ? groupedSubcategories.join(",") : undefined,
        brand: brand || undefined,
        color: color || undefined,
        size: size || undefined,
        fit: fit || undefined,
        availability: availability || searchIntent.availability || undefined,
        sort: sort || undefined,
        minPriceMinor,
        maxPriceMinor,
        interpretedAttributeCount: naturalAttributeQuery.intents.length || undefined,
        page,
        ...Object.fromEntries(Object.entries(attributeFilters).map(([key, value]) => [`attr_${key}`, value]))
      }
    };
    after(async () => {
      try {
        await recordStorefrontSearchAnalytics(analyticsPayload);
      } catch (error) {
        console.error(JSON.stringify({
          level: "error",
          event: "storefront.search_analytics_deferred_failed",
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    });
  }

  const hasDetailedFilters = Boolean(subcategory || groupedSubcategories.length || brand || color || size || fit || minPriceMinor !== undefined || maxPriceMinor !== undefined || Object.keys(attributeFilters).length);
  const activeSubcategoryLabel = groupedSubcategories.length
    ? requestedGuideLabel || "Ομαδοποιημένη επιλογή"
    : facets.subcategories.find((item) => item.value === subcategory)?.label ?? inferredSubcategory?.label;
  const selectedAttributeLabels = attributeDefinitions.flatMap((definition) => {
    const value = attributeFilters[definition.key];
    return value ? [`${definition.label}: ${value}`] : [];
  });
  const unresolvedAttributeLabels = naturalAttributeQuery.intents.flatMap((intent) => {
    if (explicitAttributeFilters[intent.key] || resolvedNaturalAttributeFilters[intent.key]) return [];
    const definition = attributeDefinitions.find((candidate) => candidate.key === intent.key);
    return definition ? [formatStorefrontAttributeAdvisory(definition.label, intent.value)] : [];
  });
  const interpretedLabels = [
    inferredCategory ? `Κατηγορία: ${inferredCategory.label}` : undefined,
    activeLeaf ? `Πρόθεση: ${activeLeaf.label}` : undefined,
    inferredSubcategory ? `Υποκατηγορία: ${inferredSubcategory.label}` : undefined,
    groupedSubcategories.length ? `Επιλογή οδηγού: ${activeSubcategoryLabel}` : undefined,
    ...selectedAttributeLabels,
    ...unresolvedAttributeLabels,
    searchIntent.identifier ? `Κωδικός: ${searchIntent.identifier}` : undefined,
    minPriceMinor !== undefined ? `Από €${(minPriceMinor / 100).toFixed(2)}` : undefined,
    maxPriceMinor !== undefined ? `Έως €${(maxPriceMinor / 100).toFixed(2)}` : undefined,
    searchIntent.availability === "in_stock" ? "Σε απόθεμα" : undefined,
    searchIntent.availability === "pickup_today" ? "Παραλαβή σήμερα · μόνο με σημερινή επιβεβαίωση αποθέματος" : undefined
  ].filter((label): label is string => Boolean(label));
  const showSubcategory = facets.subcategories.length > 0 && storefrontFacetEnabled(activeLeaf, "subcategory");
  const showBrand = facets.brands.length > 0 && storefrontFacetEnabled(activeLeaf, "brand");
  const showColor = facets.colors.length > 0 && storefrontFacetEnabled(activeLeaf, "color");
  const showSize = facets.sizes.length > 0 && storefrontFacetEnabled(activeLeaf, "size");
  const showFit = fitOptions.length > 0 && storefrontFacetEnabled(activeLeaf, "fit");
  const { settings: seoSettings } = await getSeoGlobalSettingsSnapshot();
  const shopUrl = new URL("/shop", `${seoSettings.canonicalOrigin}/`).toString();
  const breadcrumbStructuredData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Αρχική", item: seoSettings.canonicalOrigin },
      { "@type": "ListItem", position: 2, name: "Προϊόντα", item: shopUrl }
    ]
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbStructuredData).replaceAll("<", "\\u003c") }} />
      <div className="announcement">Η τοπική αγορά της Σπάρτης — online, αλλά ανθρώπινα.</div>
      <SiteHeader />

      <section className="catalog-hero shell">
        <div className="eyebrow">Marketplace · Sparta 23100</div>
        <h1>{categoryView ? categoryView.label : "Βρες το τοπικά."}</h1>
        <p className="lead">{categoryView ? categoryView.description : "Ένα καθαρό αποτέλεσμα ανά προϊόν, με πραγματική τιμή και τοπική διαθεσιμότητα."}</p>
        <div className="category-chip-row" aria-label="Κατηγορίες προϊόντων">
          <a className={!category ? "category-chip active" : "category-chip"} href="/shop">Όλα</a>
          {availableCategories.map((item) => <a className={category === item.slug ? "category-chip active" : "category-chip"} href={`/shop?category=${item.slug}`} key={item.slug}>{item.label}</a>)}
        </div>
      </section>

      <section className="shell catalog-layout">
        <aside className="catalog-sidebar">
          <div className="catalog-filter-heading">
            <div>
              <span className="catalog-filter-kicker">Κατάλογος</span>
              <strong>Κατηγορίες & φίλτρα</strong>
              <small>Διάλεξε μόνο ό,τι σε ενδιαφέρει</small>
            </div>
            {(query || availability || category || hasDetailedFilters) ? <a className="text-link" href="/shop">Καθαρισμός</a> : null}
          </div>
          <form className="filter-form" action="/shop">
            {availability === "available" ? <input type="hidden" name="availability" value="available" /> : null}
            {groupedSubcategories.map((value) => <input type="hidden" name="subcategory_any" value={value} key={value} />)}
            {groupedSubcategories.length && requestedGuideLabel ? <input type="hidden" name="guideLabel" value={requestedGuideLabel} /> : null}
            <label htmlFor="q">Αναζήτηση</label>
            <CatalogSearchInput key={query} defaultValue={query} placeholder={categoryView?.searchHint ?? "Π.χ. Bosch δραπανο μέχρι 100€"} />

            {availableCategories.length > 0 ? <>
              <label htmlFor="category">Τμήμα</label>
              <select id="category" name="category" defaultValue={categoryView ? category : ""}>
                <option value="">Όλα τα τμήματα</option>
                {availableCategories.map((item) => <option value={item.slug} key={item.slug}>{item.label}</option>)}
              </select>
            </> : null}

            {showSubcategory ? <>
              <label htmlFor="subcategory">Υποκατηγορία προϊόντος</label>
              <select id="subcategory" name="subcategory" defaultValue={subcategory}>
                <option value="">Όλες οι υποκατηγορίες</option>
                {facets.subcategories.map((item) => <option value={item.value} key={item.value}>{item.label}{typeof item.count === "number" ? ` (${item.count})` : ""}</option>)}
              </select>
              {groupedSubcategories.length ? <small style={{ display: "block", marginTop: -6, color: "var(--ink-soft)" }}>Τρέχουσα ομαδοποιημένη επιλογή: {activeSubcategoryLabel}</small> : null}
            </> : null}

            <ShopFilterFacets
              brands={showBrand ? facets.brands : []}
              colors={showColor ? facets.colors : []}
              sizes={showSize ? facets.sizes : []}
              fits={showFit ? fitOptions : []}
              attributeFacets={attributeFacets}
              selectedBrand={brand}
              selectedColor={color}
              selectedSize={size}
              selectedFit={fit}
              selectedAttributes={attributeFilters}
            />

            <fieldset className="catalog-price-range">
              <legend>Εύρος τιμής</legend>
              <div className="catalog-price-range-fields">
                <label className="catalog-price-field" htmlFor="minPrice">
                  <span>Από</span>
                  <span className="catalog-price-input">
                    <input id="minPrice" name="minPrice" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0" defaultValue={minPriceInput} />
                    <b aria-hidden="true">€</b>
                  </span>
                </label>
                <span className="catalog-price-separator" aria-hidden="true">—</span>
                <label className="catalog-price-field" htmlFor="maxPrice">
                  <span>Έως</span>
                  <span className="catalog-price-input">
                    <input id="maxPrice" name="maxPrice" type="number" inputMode="decimal" min="0" step="0.01" placeholder="χωρίς όριο" defaultValue={maxPriceInput} />
                    <b aria-hidden="true">€</b>
                  </span>
                </label>
              </div>
            </fieldset>

            <label htmlFor="sort">Ταξινόμηση</label>
            <select id="sort" name="sort" defaultValue={sort}>
              <option value="">Προτεινόμενα</option>
              <option value="price-asc">Τιμή: χαμηλά → υψηλά</option>
              <option value="price-desc">Τιμή: υψηλά → χαμηλά</option>
            </select>
            <div className="catalog-filter-actions">
              <button className="button" type="submit">Προβολή αποτελεσμάτων</button>
              {(query || availability || category || hasDetailedFilters) ? <a className="text-link" href="/shop">Καθαρισμός φίλτρων</a> : null}
            </div>
          </form>
          <div className="fairness-note"><strong>Τοπική αγορά, χωρίς θόρυβο</strong><p>Κάθε προϊόν εμφανίζεται μία φορά, με πραγματική διαθέσιμη επιλογή από ενεργό τοπικό κατάστημα.</p><a className="text-link" href="/fairness">Πώς λειτουργεί →</a></div>
        </aside>

        <div className="catalog-results">
          <div className="results-toolbar"><div><strong>{products.length}{hasNextPage ? "+" : ""} προϊόντα</strong>{query && <span> για «{valueOf(params.q)}»</span>}{categoryView && <span> · {categoryView.label}</span>}{(subcategory || groupedSubcategories.length) && <span> · {activeSubcategoryLabel}</span>}{page > 1 && <span> · Σελίδα {page}</span>}</div>{(query || availability || category) && groupedSubcategories.length === 0 && <SaveSearchButton query={query} availability={availability} category={category} />}</div>
          {interpretedLabels.length > 0 ? <div className="category-chip-row" aria-label="Κατανόηση αναζήτησης">{interpretedLabels.map((label) => <span className="category-chip active" key={label}>{label}</span>)}</div> : null}
          {activeLeaf?.attributeHints.length ? <div className="fairness-note"><strong>Χρήσιμα χαρακτηριστικά για {activeLeaf.label.toLocaleLowerCase("el")}</strong><p>{activeLeaf.attributeHints.join(" · ")}</p></div> : null}
          {products.length === 0 ? (
            <div className="empty-state"><div className="eyebrow">0 αποτελέσματα</div><h2>Δεν το βρήκαμε ακόμα.</h2><p>Δοκίμασε διαφορετικά φίλτρα ή χρησιμοποίησε το Ask Local για να ρωτήσουμε κατάλληλο κατάστημα ιδιωτικά.</p><a className="button" href="/ask-local">Ask Local</a></div>
          ) : (
            <div className="product-grid catalog-product-grid">
              {products.map((product, index) => <CatalogProductCard product={product} index={index} key={product.id} />)}
            </div>
          )}
          {(page > 1 || hasNextPage) ? <nav aria-label="Σελιδοποίηση προϊόντων" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, margin: "32px 0 8px" }}>
            {page > 1 ? <a className="button" href={shopPageHref(params, page - 1)}>← Προηγούμενα</a> : null}
            <span aria-current="page">Σελίδα {page}</span>
            {hasNextPage ? <a className="button" href={shopPageHref(params, page + 1)}>Επόμενα →</a> : null}
          </nav> : null}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}