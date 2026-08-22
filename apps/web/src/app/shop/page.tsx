import type { Metadata } from "next";
import { getCatalogCards, getCatalogFacets } from "../../lib/catalog-view";
import { SiteHeader } from "../../components/SiteHeader";
import { getVisitorKey } from "../../lib/visitor";
import { SaveSearchButton } from "../../components/SaveSearchButton";
import { CatalogProductCard } from "../../components/CatalogProductCard";
import { STOREFRONT_CATEGORIES, storefrontCategoryBySlug } from "../../lib/storefront-taxonomy";
import { SiteFooter } from "../../components/SiteFooter";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import { getCrawlerCatalogCards } from "../../lib/crawler-catalog";
import { isReadOnlyPublicCrawlerRequest } from "../../lib/request-audience";

type ShopProps = Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>;

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
  const availability = valueOf(params.availability);
  const sort = valueOf(params.sort);
  const category = valueOf(params.category);
  const subcategory = valueOf(params.subcategory);
  const brand = valueOf(params.brand);
  const color = valueOf(params.color);
  const size = valueOf(params.size);
  const fit = valueOf(params.fit);
  const categoryView = storefrontCategoryBySlug(category);
  const readOnlyCrawler = await isReadOnlyPublicCrawlerRequest();
  const visitorKey = readOnlyCrawler ? "" : await getVisitorKey();
  const facets = await getCatalogFacets(category, query);
  let products = readOnlyCrawler
    ? [...await getCrawlerCatalogCards("23100", query, category, { subcategory, brand, color, size, fit })]
    : [...await getCatalogCards(visitorKey, "23100", query, category, { subcategory, brand, color, size })];
  const fitOptions = [...new Set(products.map((product) => product.fit).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "el"));
  if (fit && !readOnlyCrawler) products = products.filter((product) => product.fit === fit);
  if (availability === "available") products = products.filter((product) => product.available);
  if (sort === "price-asc") products.sort((a, b) => a.priceMinor - b.priceMinor);
  if (sort === "price-desc") products.sort((a, b) => b.priceMinor - a.priceMinor);
  const hasDetailedFilters = Boolean(subcategory || brand || color || size || fit);

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
          {STOREFRONT_CATEGORIES.map((item) => <a className={category === item.slug ? "category-chip active" : "category-chip"} href={`/shop?category=${item.slug}`} key={item.slug}>{item.label}</a>)}
        </div>
      </section>

      <section className="shell catalog-layout">
        <aside className="catalog-sidebar">
          <form className="filter-form" action="/shop">
            <label htmlFor="q">Αναζήτηση</label>
            <input id="q" name="q" defaultValue={valueOf(params.q)} placeholder={categoryView?.searchHint ?? "Τι ψάχνεις;"} />

            <label htmlFor="category">Τμήμα</label>
            <select id="category" name="category" defaultValue={category}>
              <option value="">Όλα τα τμήματα</option>
              {STOREFRONT_CATEGORIES.map((item) => <option value={item.slug} key={item.slug}>{item.label}</option>)}
            </select>

            {facets.subcategories.length > 0 ? <>
              <label htmlFor="subcategory">Υποκατηγορία προϊόντος</label>
              <select id="subcategory" name="subcategory" defaultValue={subcategory}>
                <option value="">Όλες οι υποκατηγορίες</option>
                {facets.subcategories.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </> : null}

            {facets.brands.length > 0 ? <>
              <label htmlFor="brand">Μάρκα</label>
              <select id="brand" name="brand" defaultValue={brand}>
                <option value="">Όλες οι μάρκες</option>
                {facets.brands.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </> : null}

            {facets.colors.length > 0 ? <>
              <label htmlFor="color">Χρώμα</label>
              <select id="color" name="color" defaultValue={color}>
                <option value="">Όλα τα χρώματα</option>
                {facets.colors.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </> : null}

            {facets.sizes.length > 0 ? <>
              <label htmlFor="size">Μέγεθος</label>
              <select id="size" name="size" defaultValue={size}>
                <option value="">Όλα τα μεγέθη</option>
                {facets.sizes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </> : null}

            {fitOptions.length > 0 ? <>
              <label htmlFor="fit">Εφαρμογή</label>
              <select id="fit" name="fit" defaultValue={fit}>
                <option value="">Όλες οι εφαρμογές</option>
                {fitOptions.map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
            </> : null}

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
          <div className="results-toolbar"><div><strong>{products.length} προϊόντα</strong>{query && <span> για «{valueOf(params.q)}»</span>}{categoryView && <span> · {categoryView.label}</span>}{subcategory && <span> · {facets.subcategories.find((item) => item.value === subcategory)?.label}</span>}</div>{(query || availability || category) && <SaveSearchButton query={query} availability={availability} category={category} />}</div>
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