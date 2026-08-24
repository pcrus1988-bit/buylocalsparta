import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryCatalogBrowser } from "../../../components/CategoryCatalogBrowser";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { getCatalogCards } from "../../../lib/catalog-view";
import { getAvailableStorefrontCategories } from "../../../lib/available-catalog-taxonomy";
import { getVisitorKey } from "../../../lib/visitor";
import { getSeoGlobalSettingsSnapshot } from "../../../lib/seo-settings";
import { getSeoEntityOverridesSnapshot } from "../../../lib/seo-entity-overrides";
import { findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "../../../lib/seo-entity-policy";
import { buildGovernedSeoMetadata } from "../../../lib/seo-metadata";
import { getCrawlerCatalogCards } from "../../../lib/crawler-catalog";
import { isReadOnlyPublicCrawlerRequest } from "../../../lib/request-audience";
import { productPublicPath } from "../../../lib/product-url";

type Props = Readonly<{ params: Promise<{ slug: string }> }>;

export async function generateStaticParams() {
  return (await getAvailableStorefrontCategories("23100")).map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = (await getAvailableStorefrontCategories("23100")).find((item) => item.slug === slug);
  if (!category) return { title: "Κατηγορία", robots: { index: false, follow: false } };
  const reference: SeoEntityReference = { kind: "category", id: category.slug };
  const [{ settings }, overrides] = await Promise.all([getSeoGlobalSettingsSnapshot(), getSeoEntityOverridesSnapshot()]);
  return buildGovernedSeoMetadata({
    reference,
    settings,
    override: findSeoEntityOverride(overrides.entries, reference),
    defaults: {
      title: category.label,
      description: `${category.description} Ανακάλυψε τοπικά διαθέσιμα προϊόντα στη Σπάρτη.`,
      canonicalPath: `/category/${category.slug}`
    },
    entityEligible: true,
    defaultIndexAllowed: true
  });
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const availableCategories = await getAvailableStorefrontCategories("23100");
  const category = availableCategories.find((item) => item.slug === slug);
  if (!category) notFound();

  const settingsPromise = getSeoGlobalSettingsSnapshot();
  const overridesPromise = getSeoEntityOverridesSnapshot();
  const readOnlyCrawler = await isReadOnlyPublicCrawlerRequest();
  const visitorKey = readOnlyCrawler ? "" : await getVisitorKey();
  const [products, { settings }, overrideSnapshot] = await Promise.all([
    readOnlyCrawler
      ? getCrawlerCatalogCards("23100", "", category.slug)
      : getCatalogCards(visitorKey, "23100", "", category.slug),
    settingsPromise,
    overridesPromise
  ]);
  const siblings = availableCategories.filter((item) => item.slug !== category.slug);
  const reference: SeoEntityReference = { kind: "category", id: category.slug };
  const override = findSeoEntityOverride(overrideSnapshot.entries, reference);
  const seoControl = resolveSeoEntityControl({
    settings,
    kind: reference.kind,
    entityEligible: true,
    defaultIndexAllowed: true,
    defaultSchemaAllowed: true,
    override
  });
  const categoryUrl = new URL(override?.canonicalPath ?? `/category/${category.slug}`, `${settings.canonicalOrigin}/`).toString();
  const availableProducts = products.filter((product) => product.available);
  const merchants = [...new Map(availableProducts.flatMap((product) =>
    product.vendorId && product.vendorName ? [[product.vendorId, product.vendorName] as const] : []
  )).entries()];
  const itemList = availableProducts.slice(0, 24).map((product, index) => ({
    "@type": "ListItem",
    position: index + 1,
    item: {
      "@type": "Product",
      name: product.title,
      url: new URL(productPublicPath(product), `${settings.canonicalOrigin}/`).toString(),
      image: product.mediaId
        ? `${settings.canonicalOrigin}/api/media/${encodeURIComponent(product.mediaId)}`
        : product.sourceImageAvailable
          ? `${settings.canonicalOrigin}/api/catalog-source-image/${encodeURIComponent(product.id)}`
          : undefined
    }
  }));
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${categoryUrl}#collection`,
        url: categoryUrl,
        name: `${category.label} στη Σπάρτη`,
        description: category.description,
        inLanguage: "el-GR",
        about: { "@type": "Place", name: "Σπάρτη", address: { "@type": "PostalAddress", postalCode: "23100", addressCountry: "GR" } },
        mainEntity: { "@id": `${categoryUrl}#products` }
      },
      {
        "@type": "ItemList",
        "@id": `${categoryUrl}#products`,
        name: `Διαθέσιμα προϊόντα: ${category.label}`,
        numberOfItems: availableProducts.length,
        itemListElement: itemList
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Αρχική", item: settings.canonicalOrigin },
          { "@type": "ListItem", position: 2, name: category.label, item: categoryUrl }
        ]
      }
    ]
  };

  return (
    <main>
      {seoControl.schemaAllowed ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c") }} /> : null}
      <div className="announcement">Ανακάλυψε τη Σπάρτη ανά κατηγορία — με πραγματικούς τοπικούς ανθρώπους.</div>
      <SiteHeader />

      <section className={`category-landing-hero ${category.artClass}`}>
        <div className="shell category-landing-grid">
          <div className="category-landing-copy">
            <div className="eyebrow light">{category.eyebrow}</div>
            <h1>{category.label}</h1>
            <p>{category.description}</p>
            <div className="hero-actions">
              <a className="button button-light" href="#category-products">Δες προϊόντα</a>
              <a className="button category-outline" href="/ask-local">Ρώτησε τοπικά</a>
            </div>
          </div>
          <div className="category-landing-visual" aria-hidden="true">
            <span className="category-hero-symbol">{category.symbol}</span>
            <span className="category-hero-mark">{category.mark}</span>
            <div className="category-visual-card category-visual-card-a">LOCAL</div>
            <div className="category-visual-card category-visual-card-b">SPARTA</div>
          </div>
        </div>
      </section>

      <section className="shell category-intro-band" aria-label="Πώς λειτουργεί η κατηγορία">
        <div><strong>Μία δημόσια παρουσία ανά προϊόν</strong><span>Δεν βάζουμε τα τοπικά καταστήματα σε δημόσιο πόλεμο τιμών για το ίδιο προϊόν. <a className="text-link" href="/fairness">Δες τους κανόνες →</a></span></div>
        <div><strong>Τοπικός άνθρωπος όταν χρειάζεται</strong><span>Η ανάθεση συμβούλου και συνεργάτη εκπλήρωσης γίνεται με τους κανόνες δικαιοσύνης της πλατφόρμας.</span></div>
        <div><strong>Ένα checkout</strong><span>Συνδύασε προϊόντα από διαφορετικές κατηγορίες και καταστήματα σε μία αγορά.</span></div>
      </section>

      <section className="section section-tint" id="category-products">
        <div className="shell">
          <div className="section-heading">
            <div><div className="eyebrow">Διαθέσιμα τώρα</div><h2>{category.label} στη Σπάρτη</h2></div>
            <p className="section-note">Ξεκίνα από 10 τυχαίες επιλογές και χρησιμοποίησε αναζήτηση ή φίλτρα μόνο μέσα σε αυτή την κατηγορία.</p>
          </div>
          {products.length ? (
            <CategoryCatalogBrowser products={products} categoryName={category.label} />
          ) : (
            <div className="empty-state category-empty-state"><div className="eyebrow">Η κατηγορία χτίζεται</div><h2>Δεν υπάρχουν ακόμη ενεργά προϊόντα εδώ.</h2><p>Η σελίδα είναι έτοιμη για το πραγματικό catalog. Μέχρι τότε, το Ask Local μπορεί να δρομολογήσει ιδιωτικά αυτό που ψάχνεις σε κατάλληλο κατάστημα.</p><a className="button" href="/ask-local">Ask Local</a></div>
          )}
        </div>
      </section>

      {merchants.length ? <section className="shell section category-merchants" aria-labelledby="category-merchants-title">
        <div className="section-heading">
          <div><div className="eyebrow">Τοπικά καταστήματα</div><h2 id="category-merchants-title">Ποιοι εξυπηρετούν αυτή την κατηγορία</h2></div>
          <p className="section-note">Τα καταστήματα εμφανίζονται επειδή διαθέτουν ενεργό προϊόν στην κατηγορία — όχι επειδή αγόρασαν θέση προβολής.</p>
        </div>
        <div className="category-merchant-grid">
          {merchants.map(([vendorId, vendorName]) => (
            <a href={`/vendor/${encodeURIComponent(vendorId)}`} key={vendorId}>
              <span aria-hidden="true">{vendorName.slice(0, 1).toLocaleUpperCase("el")}</span>
              <strong>{vendorName}</strong>
              <small>Δες κατάστημα και στοιχεία →</small>
            </a>
          ))}
        </div>
      </section> : null}

      {siblings.length > 0 ? <section className="shell section category-discovery">
        <div className="section-heading">
          <div><div className="eyebrow">Συνέχισε την ανακάλυψη</div><h2>Και άλλες πλευρές της τοπικής αγοράς</h2></div>
        </div>
        <div className="category-discovery-grid">
          {siblings.map((item) => (
            <a className={`category-discovery-card ${item.artClass}`} href={`/category/${item.slug}`} key={item.slug}>
              <span className="category-discovery-symbol" aria-hidden="true">{item.symbol}</span>
              <span><strong>{item.label}</strong><small>{item.name}</small></span>
              <span>↗</span>
            </a>
          ))}
        </div>
      </section> : null}
      <SiteFooter />
    </main>
  );
}
