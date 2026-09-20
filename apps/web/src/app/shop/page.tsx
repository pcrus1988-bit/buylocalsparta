import type { Metadata } from "next";
import { after } from "next/server";
import { interpretSearchQuery } from "@buy-local-sparta/core";
import type { CatalogCard } from "../../lib/catalog-view";
import { getShopCatalogPage } from "../../lib/shop-catalog-page";
import { getPublishedDropshipCatalogPage } from "../../lib/published-dropship-catalog-page";
import { getCachedShopTaxonomy } from "../../lib/cached-shop-taxonomy";
import { SiteHeader } from "../../components/SiteHeader";
import { getVisitorKey } from "../../lib/visitor";
import { recordStorefrontSearchAnalytics } from "../../lib/storefront-search-analytics";
import { SaveSearchButton } from "../../components/SaveSearchButton";
import { CatalogProductCard } from "../../components/CatalogProductCard";
import { CatalogSearchInput } from "../../components/CatalogSearchInput";
import {
  inferStorefrontTaxonomyIntent,
  resolveStorefrontSubcategoryIntent,
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
import { getCrawlerCatalogCards } from "../../lib/crawler-catalog";
import { isReadOnlyPublicCrawlerRequest } from "../../lib/request-audience";

const SHOP_PAGE_SIZE = 30;

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

function purchasablePublicProduct(product: ShopCard): boolean {
  return product.available && product.availableToSell > 0 && product.priceMinor > 0 && Boolean(product.vendorId);
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
  const hasQueryState = Object.values(params).some((value) => valueOf(value).trim().length > 0);
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
  const requestedGuideSubcategories = category === "fashion"
    ? valuesOf(params.subcategory_any).map((entry) => entry.slice(0, 120)).slice(0, 64)
    : [];
  const requestedGuideLabel = category === "fashion" ? valueOf(params.guideLabel).trim().slice(0, 120) : "";
  const brand = valueOf(params.brand);
  const color = valueOf(params.color);
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
  let filters = { subcategory, brand, color, size };

  // Audience detection and the non-personal catalogue vocabulary are independent.
  // Start both immediately; taxonomy is cached for three minutes by its wrapper.
  const audiencePromise = isReadOnlyPublicCrawlerRequest();
  let taxonomy = await getCachedShopTaxonomy(category, catalogQuery, filters, "23100", activeLeaf?.key, attributeFilters);
  const readOnlyCrawler = await audiencePromise;

  const inferredSubcategory = requestedSubcategory || requestedGuideSubcategories.length
    ? undefined
    : resolveStorefrontSubcategoryIntent(activeLeaf, taxonomy.facets.subcategories);
  if (inferredSubcategory) {
    subcategory = inferredSubcategory.value;
    filters = { subcategory, brand, color, size };
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
  const facets = taxonomy.facets;
  const attributeFacets = taxonomy.attributeFacets;
  const availableCategories = taxonomy.categories;
  const categoryView = availableCategories.some((item) => item.slug === category) ? storefrontCategoryBySlug(category) : undefined;
  const allowDropship = searchIntent.availability !== "pickup_today";
  let products: ShopCard[] = [];
  let hasNextPage = false;
  const visitorKey = readOnlyCrawler ? "" : await getVisitorKey();

  if (readOnlyCrawler) {
    let crawlerProducts = [...await getCrawlerCatalogCards(
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
      const dropshipPage = await getPublishedDropshipCatalogPage({
        query: catalogQuery,
        category,
        filters: productFilters,
        attributeFilters,
        minPriceMinor: searchIntent.minPriceMinor,
        maxPriceMinor: searchIntent.maxPriceMinor,
        sort,
        limit: remaining,
        offset: 0
      });
      const seen = new Set(products.map((product) => product.id));
      products.push(...dropshipPage.products.filter((product) => !seen.has(product.id)).slice(0, remaining));
    }
  } else {
    const localPage = await getShopCatalogPage({
      visitorKey,
      postcode: "23100",
      query: catalogQuery,
      category,
      filters: productFilters,
      attributeFilters,
      minPriceMinor: searchIntent.minPriceMinor,
      maxPriceMinor: searchIntent.maxPriceMinor,
      sort,
      limit: SHOP_PAGE_SIZE,
      offset: pageOffset
    });

    products = [...await enrichCatalogCardsWithLocalProof(localPage.products, visitorKey, "23100")];
    const expectedLocalCount = Math.max(0, Math.min(SHOP_PAGE_SIZE, localPage.total - pageOffset));
    const atFinalLocalWindow = pageOffset + SHOP_PAGE_SIZE >= localPage.total;

    if (allowDropship && atFinalLocalWindow) {
      const dropshipOffset = Math.max(0, pageOffset - localPage.total);
      const dropshipSlots = Math.max(0, SHOP_PAGE_SIZE - expectedLocalCount);
      const dropshipPage = await getPublishedDropshipCatalogPage({
        query: catalogQuery,
        category,
        filters: productFilters,
        attributeFilters,
        minPriceMinor: searchIntent.minPriceMinor,
        maxPriceMinor: searchIntent.maxPriceMinor,
        sort,
        limit: Math.max(1, dropshipSlots),
        offset: dropshipOffset
      });

      if (dropshipSlots > 0) {
        const seen = new Set(products.map((product) => product.id));
        products.push(...dropshipPage.products.filter((product) => !seen.has(product.id)).slice(0, dropshipSlots));
      }
      hasNextPage = dropshipPage.total > dropshipOffset + dropshipSlots;
    } else {
      hasNextPage = localPage.hasMore || pageOffset + SHOP_PAGE_SIZE < localPage.total;
    }
  }

  products = products.filter(purchasablePublicProduct);
  if (availability === "available") products = products.filter((product) => product.available);
  const fitOptions = [...new Set(products.map((product) => product.fit).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "el"));
  if (fit) products = products.filter((product) => product.fit === fit);
  if (searchIntent.availability === "pickup_today") products = products.filter((product) => product.localProof?.pickup && product.localProof.stockConfirmedToday);
  if (searchIntent.minPriceMinor !== undefined) products = products.filter((product) => product.priceMinor >= searchIntent.minPriceMinor!);
  if (searchIntent.maxPriceMinor !== undefined) products = products.filter((product) => product.priceMinor <= searchIntent.maxPriceMinor!);
  if (sort === "price-asc") products.sort((a, b) => a.priceMinor - b.priceMinor);
  if (sort === "price-desc") products.sort((a, b) => b.priceMinor - a.priceMinor);

  if (!readOnlyCrawler) {
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
        interpretedMaxPriceMinor: searchIntent.maxPriceMinor,
        interpretedMinPriceMinor: searchIntent.minPriceMinor,
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

  const hasDetailedFilters = Boolean(subcategory || groupedSubcategories.length || brand || color || size || fit || Object.keys(attributeFilters).length);
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
    searchIntent.minPriceMinor !== undefined ? `Από €${(searchIntent.minPriceMinor / 100).toFixed(2)}` : undefined,
    searchIntent.maxPriceMinor !== undefined ? `Έως €${(searchIntent.maxPriceMinor / 100).toFixed(2)}` : undefined,
    searchIntent.availability === "in_stock" ? "Σε απόθεμα" : undefined,
    searchIntent.availability === "pickup_today" ? "Παραλαβή σήμερα · μόνο με σημερινή επιβεβαίωση αποθέματος" : undefined
  ].filter((label): label is string => Boolean(label));
  const showSubcategory = facets.subcategories.length > 0 && storefrontFacetEnabled(activeLeaf, "subcategory");
  const showBrand = facets.brands.length > 0 && storefrontFacetEnabled(activeLeaf, "brand");
  const showColor = facets.colors.length > 0 && storefrontFacetEnabled(activeLeaf, "color");
  const showSize = facets.sizes.length > 0 && storefrontFacetEnabled(activeLeaf, "size");
  const showFit = fitOptions.length > 0 && storefrontFacetEnabled(activeLeaf, "fit");

  return (
    <main>
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
              <strong>Φίλτρα</strong>
              <small>Διάλεξε ό,τι σε ενδιαφέρει</small>
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
                {facets.subcategories.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
              {groupedSubcategories.length ? <small style={{ display: "block", marginTop: -6, color: "var(--ink-soft)" }}>Τρέχουσα ομαδοποιημένη επιλογή: {activeSubcategoryLabel}</small> : null}
            </> : null}

            {showBrand ? <>
              <label htmlFor="brand">Μάρκα</label>
              <select id="brand" name="brand" defaultValue={brand}>
                <option value="">Όλες οι μάρκες</option>
                {facets.brands.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </> : null}

            {showColor ? <>
              <label htmlFor="color">Χρώμα</label>
              <select id="color" name="color" defaultValue={color}>
                <option value="">Όλα τα χρώματα</option>
                {facets.colors.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </> : null}

            {showSize ? <>
              <label htmlFor="size">Μέγεθος</label>
              <select id="size" name="size" defaultValue={size}>
                <option value="">Όλα τα μεγέθη</option>
                {facets.sizes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </> : null}

            {showFit ? <>
              <label htmlFor="fit">Εφαρμογή</label>
              <select id="fit" name="fit" defaultValue={fit}>
                <option value="">Όλες οι εφαρμογές</option>
                {fitOptions.map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
            </> : null}

            {attributeFacets.map((facet) => <div key={facet.key} className="catalog-attribute-filter">
              <label htmlFor={`attr_${facet.key}`}>{facet.label}</label>
              <select id={`attr_${facet.key}`} name={`attr_${facet.key}`} defaultValue={attributeFilters[facet.key] ?? ""}>
                <option value="">Όλα</option>
                {facet.options.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </div>)}

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
          <div className="results-toolbar"><div><strong>{products.length} προϊόντα</strong>{query && <span> για «{valueOf(params.q)}»</span>}{categoryView && <span> · {categoryView.label}</span>}{(subcategory || groupedSubcategories.length) && <span> · {activeSubcategoryLabel}</span>}{page > 1 && <span> · Σελίδα {page}</span>}</div>{(query || availability || category) && groupedSubcategories.length === 0 && <SaveSearchButton query={query} availability={availability} category={category} />}</div>
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