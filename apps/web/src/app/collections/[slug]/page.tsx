import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogProductCard } from "../../../components/CatalogProductCard";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { getCatalogCards, type CatalogCard } from "../../../lib/catalog-view";
import { getCrawlerCatalogCards } from "../../../lib/crawler-catalog";
import { EDITORIAL_COLLECTIONS, editorialCollectionBySlug } from "../../../lib/editorial-collections";
import { isReadOnlyPublicCrawlerRequest } from "../../../lib/request-audience";
import { getVisitorKey } from "../../../lib/visitor";
import styles from "./editorial-collection.module.css";

type Props = Readonly<{ params: Promise<{ slug: string }> }>;

const PRODUCT_LIMIT = 12;

export function generateStaticParams() {
  return EDITORIAL_COLLECTIONS.map((collection) => ({ slug: collection.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const collection = editorialCollectionBySlug(slug);
  if (!collection) return { title: "Συλλογή", robots: { index: false, follow: false } };
  return {
    title: collection.title,
    description: collection.story,
    alternates: { canonical: `/collections/${collection.slug}` },
    openGraph: {
      title: `${collection.title} | ΚΟΝΤΑ ΜΟΥ`,
      description: collection.story,
      type: "website",
      locale: "el_GR"
    }
  };
}

function purchasable(product: CatalogCard): boolean {
  return product.available && product.availableToSell > 0 && product.priceMinor > 0 && Boolean(product.vendorId);
}

function uniqueProducts(products: readonly CatalogCard[]): CatalogCard[] {
  return [...new Map(products.filter(purchasable).map((product) => [product.id, product])).values()];
}

async function liveCollectionProducts(slug: string, visitorKey: string, readOnlyCrawler: boolean): Promise<readonly CatalogCard[]> {
  const collection = editorialCollectionBySlug(slug);
  if (!collection) return [];
  const load = (query: string, category: string) => readOnlyCrawler
    ? getCrawlerCatalogCards("23100", query, category)
    : getCatalogCards(visitorKey, "23100", query, category);

  let products: CatalogCard[] = [];
  try {
    products = uniqueProducts(await load(collection.query, collection.primaryCategory));
    for (const category of collection.fallbackCategories) {
      if (products.length >= PRODUCT_LIMIT) break;
      const next = await load("", category);
      products = uniqueProducts([...products, ...next]);
    }
    if (products.length < 6) {
      products = uniqueProducts([...products, ...await load("", "")]);
    }
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.editorial_collection_degraded",
      collection: slug,
      message: error instanceof Error ? error.message : String(error)
    }));
  }
  return products.slice(0, PRODUCT_LIMIT);
}

export default async function EditorialCollectionPage({ params }: Props) {
  const { slug } = await params;
  const collection = editorialCollectionBySlug(slug);
  if (!collection) notFound();
  const readOnlyCrawler = await isReadOnlyPublicCrawlerRequest();
  const visitorKey = readOnlyCrawler ? "" : await getVisitorKey();
  const products = await liveCollectionProducts(collection.slug, visitorKey, readOnlyCrawler);
  const accentClass = collection.accent === "mountain"
    ? styles.accentMountain
    : collection.accent === "home"
      ? styles.accentHome
      : styles.accentGift;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: collection.title,
    description: collection.story,
    url: `https://kontamou.site/collections/${collection.slug}`,
    inLanguage: "el-GR",
    about: { "@type": "Place", name: "Σπάρτη" },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: products.length,
      itemListElement: products.map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `https://kontamou.site/product/${encodeURIComponent(product.slug)}`,
        name: product.title
      }))
    }
  };

  return <main className={`${styles.page} ${accentClass}`}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c") }} />
    <div className="announcement">Μικρές ιστορίες αγορών, από την πραγματική τοπική αγορά της Σπάρτης.</div>
    <SiteHeader />

    <section className={styles.hero}>
      <div className={`shell ${styles.heroInner}`}>
        <div>
          <span className={styles.kicker}>{collection.eyebrow}</span>
          <h1>{collection.title}</h1>
          <p className={styles.lead}>{collection.lead}</p>
        </div>
        <div className={styles.storyCard}><p>{collection.story}</p></div>
      </div>
    </section>

    <section className={styles.moments} aria-label="Στιγμές της συλλογής">
      <div className={`shell ${styles.momentRail}`}>
        {collection.moments.map((moment, index) => <div key={moment}><span>0{index + 1}</span><strong>{moment}</strong></div>)}
      </div>
    </section>

    <section className={styles.products}>
      <div className="shell">
        <div className={styles.heading}>
          <div><span className={styles.kicker}>Από καταστήματα κοντά σου</span><h2>Πραγματικές επιλογές για αυτή τη στιγμή.</h2></div>
          <p>Η συλλογή χρησιμοποιεί μόνο προϊόντα με ενεργή τιμή, διαθέσιμο απόθεμα και επιλέξιμο τοπικό κατάστημα. Η σύνθεση μπορεί να αλλάζει καθώς αλλάζει η αγορά.</p>
        </div>
        {products.length ? <div className={styles.grid}>{products.map((product, index) => <CatalogProductCard product={product} index={index} key={product.id} />)}</div> : <div className={styles.empty}><div className="eyebrow">Η συλλογή ενημερώνεται</div><h2>Δεν υπάρχουν αρκετές διαθέσιμες επιλογές αυτή τη στιγμή.</h2><p>Πες μας τι ψάχνεις και το Ask Local θα το δρομολογήσει σε κατάλληλο κατάστημα.</p><a className="button" href="/ask-local">Ρώτησε τοπικά</a></div>}
      </div>
    </section>

    <section className={styles.ask}>
      <div className={`shell ${styles.askInner}`}>
        <div><h2>Θες κάτι πιο συγκεκριμένο;</h2><p>Η συλλογή είναι αφετηρία, όχι κατάλογος χωρίς τέλος. Περιέγραψε την περίσταση και ρώτησε πραγματικό τοπικό κατάστημα.</p></div>
        <a className="button" href="/ask-local">Ask Local</a>
      </div>
    </section>

    <SiteFooter />
  </main>;
}
