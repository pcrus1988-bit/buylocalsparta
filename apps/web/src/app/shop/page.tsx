import type { Metadata } from "next";
import { interpretSearchQuery } from "@buy-local-sparta/core";
import { getCatalogCards, type CatalogCard } from "../../lib/catalog-view";
import { getAvailableCatalogTaxonomy } from "../../lib/available-catalog-taxonomy";
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
  storefrontFacetEnabled
} from "../../lib/storefront-taxonomy";
import { SiteFooter } from "../../components/SiteFooter";
import { enrichCatalogCardsWithLocalProof, type LocalCommerceProof } from "../../lib/local-commerce-proof";
import { catalogAttributeDefinitionsForLeaf } from "../../lib/catalog-attribute-facets";
import { filterCatalogCardsByAttributes, type CatalogAttributeFilters } from "../../lib/catalog-attribute-filter";
import { extractStorefrontAttributeQuery, resolveStorefrontAttributeIntents } from "../../lib/storefront-attribute-query";

import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import { getCrawlerCatalogCards } from "../../lib/crawler-catalog";
import { isReadOnlyPublicCrawlerRequest } from "../../lib/request-audience";

type ShopProps = Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>;
type ShopCard = CatalogCard & Readonly<{ previewImageSrc?: string; localProof?: LocalCommerceProof }>;

function valueOf(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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
  const query = valueOf(params.q).trim();
  const searchIntent = interpretSearchQuery(query);
  const taxonomySeedQuery = searchIntent.text || (searchIntent.applied.length ? "" : query);
  const requestedCategory = valueOf(params.category);
  const taxonomyIntent = inferStorefrontTaxonomyIntent(taxonomySeedQuery);
  const inferredCategory = requestedCategory ? undefined : taxonomyIntent?.category;
  const activeLeaf = taxonomyIntent && (!requestedCategory || taxonomyIntent.category.slug === requestedCategory)
    ? taxonomyIntent.leaf
    : undefined;
  const naturalAttributeQuery = extractStorefrontAttributeQuery(taxonomySeedQuery, activeLeaf?.key);
  const catalogQuery = naturalAttributeQuery.text;
  const category = requestedCategory || inferredCategory?.slug || "";
  const availability = valueOf(params.availability);
  const sort = valueOf(params.sort);
  const requestedSubcategory = valueOf(params.subcategory);
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
  const readOnlyCrawler = await isReadOnlyPublicCrawlerRequest();
  const visitorKey = readOnlyCrawler ? "" : await getVisitorKey();
  let taxonomy = await getAvailableCatalogTaxonomy(category, catalogQuery, filters, "23100", activeLeaf?.key, attributeFilters);
  const inferredSubcategory = requestedSubcategory ? undefined : resolveStorefrontSubcategoryIntent(activeLeaf, taxonomy.facets.subcategories);
  if (inferredSubcategory) {
    subcategory = inferredSubcategory.value;
    filters = { subcategory, brand, color, size };
    taxonomy = await getAvailableCatalogTaxonomy(category, catalogQuery, filters, "23100", activeLeaf?.key, attributeFilters);
  }
  resolvedNaturalAttributeFilters = resolveStorefrontAttributeIntents(
    naturalAttributeQuery.intents,
    taxonomy.attributeFacets,
    explicitAttributeFilters
  );
  if (Object.keys(resolvedNaturalAttributeFilters).length > 0) {
    attributeFilters = { ...resolvedNaturalAttributeFilters, ...explicitAttributeFilters };
    taxonomy = await getAvailableCatalogTaxonomy(category, catalogQuery, filters, "23100", activeLeaf?.key, attributeFilters);
  }
  const facets = taxonomy.facets;
  const attributeFacets = taxonomy.attributeFacets;
  const availableCategories = taxonomy.categories;
  const categoryView = availableCategories.some((item) => item.slug === category) ? storefrontCategoryBySlug(category) : undefined;
  let products: ShopCard[] = readOnlyCrawler
    ? [...await getCrawlerCatalogCards("23100", catalogQuery, category, { ...filters, fit })]
    : [...await getCatalogCards(visitorKey, "23100", catalogQuery, category, filters)];
  products = [...await filterCatalogCardsByAttributes(products, attributeFilters)];
  if (!readOnlyCrawler) products = [...await enrichCatalogCardsWithLocalProof(products, visitorKey, "23100")];
  const fitOptions = [...new Set(products.filter((product) => product.available).map((product) => product.fit).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "el"));
  if (fit) products = products.filter((product) => product.fit === fit);
  if (availability === "available" || searchIntent.availability === "in_stock") products = products.filter((product) => product.available);
  if (searchIntent.availability === "pickup_today") products = products.filter((product) => product.localProof?.pickup && product.localProof.stockConfirmedToday);
  if (searchIntent.minPriceMinor !== undefined) products = products.filter((product) => product.priceMinor >= searchIntent.minPriceMinor!);
  if (searchIntent.maxPriceMinor !== undefined) products = products.filter((product) => product.priceMinor <= searchIntent.maxPriceMinor!);
  if (sort === "price-asc") products.sort((a, b) => a.priceMinor - b.priceMinor);
  if (sort === "price-desc") products.sort((a, b) => b.priceMinor - a.priceMinor);
  if (!readOnlyCrawler) await recordStorefrontSearchAnalytics({
    visitorKey,
    query,
    resultCount: products.length,
    categoryCode: subcategory || category || undefined,
    filters: {
      subcategory: subcategory || undefined,
      brand: brand || undefined,
      color: color || undefined,
      size: size || undefined,
      fit: fit || undefined,
      availability: availability || searchIntent.availability || undefined,
      sort: sort || undefined,
      interpretedMaxPriceMinor: searchIntent.maxPriceMinor,
      interpretedMinPriceMinor: searchIntent.minPriceMinor,
      interpretedAttributeCount: naturalAttributeQuery.intents.length || undefined,
      ...Object.fromEntries(Object.entries(attributeFilters).map(([key, value]) => [`attr_${key}`, value]))
    }
  });
  const hasDetailedFilters = Boolean(subcategory || brand || color || size || fit || Object.keys(attributeFilters).length);
  const activeSubcategoryLabel = facets.subcategories.find((item) => item.value === subcategory)?.label ?? inferredSubcategory?.label;
  const selectedAttributeLabels = attributeDefinitions.flatMap((definition) => {
    const value = attributeFilters[definition.key];
    return value ? [`${definition.label}: ${value}`] : [];
  });
  const unresolvedAttributeLabels = naturalAttributeQuery.intents.flatMap((intent) => {
    if (explicitAttributeFilters[intent.key] || resolvedNaturalAttributeFilters[intent.key]) return [];
    const definition = attributeDefinitions.find((candidate) => candidate.key === intent.key);
    return definition ? [`Ζητούμενο: ${definition.label} ${intent.value}`] : [];
  });
  const interpretedLabels = [
    inferredCategory ? `Κατηγορία: ${inferredCategory.label}` : undefined,
    activeLeaf ? `Πρόθεση: ${activeLeaf.label}` : undefined,
    inferredSubcategory ? `Υποκατηγορία: ${inferredSubcategory.label}` : undefined,
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
        <p className="lead">{categoryView ? categoryView.description : "Ένα καθαρό αποτέλεσμα ανά προϊόν. Χωρίς δημόσιο πόλεμο τιμών ανάμεσα στα τοπικά καταστήματα."}</p>
        <div className="category-chip-row" aria-label="Κατηγορίες προϊόντων">
          <a className={!category ? "category-chip active" : "category-chip"} href="/shop">Όλα</a>
          {availableCategories.map((item) => <a className={category === item.slug ? "category-chip active" : "category-chip"} href={`/shop?category=${item.slug}`} key={item.slug}>{item.label}</a>)}
        </div>
      </section>

      <section className="shell catalog-layout">
        <aside className="catalog-sidebar">
          <form className="filter-form" action="/shop">
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

            <label htmlFor="availability">Διαθεσιμότητα</label>
            <select id="availability" name="availability" defaultValue={availability}>
              <option value="">Όλα</option>
              <option value="available">Διαθέσιμο τώρα</option>
            </select>
            <label htmlFor="sort">Ταξινόμηση</label>
            <select id="sort" name="sort" defaultValue={sort}>
              <option value="">Προτεινόμενα</option>
              <option value="price-asc">Τιμή: χαμηλά → υψηλά</option>
              <option value="price-desc">Τιμή: υψηλά → χαμηλά</option>
            </select>
            <button className="button" type="submit">Εφαρμογή</button>
            {(query || availability || category || hasDetailedFilters) ? <a className="text-link" href="/shop">Καθαρισμός φίλτρων</a> : null}
          </form>
          <div className="fairness-note"><strong>Fair Vendor Exposure</strong><p>Όταν το ίδιο προϊόν υπάρχει σε περισσότερα καταστήματα, εμφανίζεται μία φορά και το κατάστημα εκπλήρωσης επιλέγεται δίκαια στο παρασκήνιο.</p><a className="text-link" href="/fairness">Δες τους κανόνες →</a></div>
        </aside>

        <div className="catalog-results">
          <div className="results-toolbar"><div><strong>{products.length} προϊόντα</strong>{query && <span> για «{valueOf(params.q)}»</span>}{categoryView && <span> · {categoryView.label}</span>}{subcategory && <span> · {activeSubcategoryLabel}</span>}</div>{(query || availability || category) && <SaveSearchButton query={query} availability={availability} category={category} />}</div>
          {interpretedLabels.length > 0 ? <div className="category-chip-row" aria-label="Κατανόηση αναζήτησης">{interpretedLabels.map((label) => <span className="category-chip active" key={label}>{label}</span>)}</div> : null}
          {activeLeaf?.attributeHints.length ? <div className="fairness-note"><strong>Χρήσιμα χαρακτηριστικά για {activeLeaf.label.toLocaleLowerCase("el")}</strong><p>{activeLeaf.attributeHints.join(" · ")}</p></div> : null}
          {products.length === 0 ? (
            <div className="empty-state"><div className="eyebrow">0 αποτελέσματα</div><h2>Δεν το βρήκαμε ακόμα.</h2><p>Δοκίμασε διαφορετικά φίλτρα ή χρησιμοποίησε το Ask Local για να ρωτήσουμε κατάλληλο κατάστημα ιδιωτικά.</p><a className="button" href="/ask-local">Ask Local</a></div>
          ) : (
            <div className="product-grid catalog-product-grid">
              {products.map((product, index) => <CatalogProductCard product={product} index={index} key={product.id} />)}
            </div>
          )}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
