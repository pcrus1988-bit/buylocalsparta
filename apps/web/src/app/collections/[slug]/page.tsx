import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CatalogProductCard } from "../../../components/CatalogProductCard";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import type { CatalogCard } from "../../../lib/catalog-view";
import { getCachedCrawlerCatalogCards } from "../../../lib/cached-public-shop-page";
import { EDITORIAL_COLLECTIONS, editorialCollectionBySlug, legacyEditorialCollectionRedirect } from "../../../lib/editorial-collections";
import styles from "./editorial-collection.module.css";

type Props = Readonly<{ params: Promise<{ slug: string }> }>;

export const revalidate = 60;
export const dynamicParams = false;

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

async function boundedCollectionSlice(
  query: string,
  category: string,
  limit: number
): Promise<readonly CatalogCard[]> {
  if (limit <= 0) return [];
  return getCachedCrawlerCatalogCards("23100", query, category, {}, limit);
}

async function liveCollectionProducts(slug: string): Promise<readonly CatalogCard[]> {
  const collection = editorialCollectionBySlug(slug);
  if (!collection) return [];

  let products: CatalogCard[] = [];
  try {
    const batches = await Promise.all(collection.searches.map((search) =>
      boundedCollectionSlice(
        search.query ?? "",
        search.category,
        Math.min(search.limit, PRODUCT_LIMIT)
      )
    ));
    products = uniqueProducts(batches.flat()).slice(0, PRODUCT_LIMIT);

    // A collection should stay on-theme even when one leaf temporarily thins out.
    // If needed, top up only from its first curated leaf rather than from the whole catalogue.
    const fallbackSearch = collection.searches[0];
    if (products.length < 6 && fallbackSearch) {
      const remaining = PRODUCT_LIMIT - products.length;
      const fallback = await boundedCollectionSlice(
        fallbackSearch.query ?? "",
        fallbackSearch.category,
        remaining
      );
      products = uniqueProducts([...products, ...fallback]);
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
  if (!collection) {
    const legacyTarget = legacyEditorialCollectionRedirect(slug);
    if (legacyTarget) redirect(legacyTarget);
    notFound();
  }
  const products = await liveCollectionProducts(collection.slug);
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
    <div className="announcement">Ιδέες για τη στιγμή σου, όλα σε ένα μέρος.</div>
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
          <div><span className={styles.kicker}>Για να διαλέξεις πιο εύκολα</span><h2>Ιδέες που μπορείς να βάλεις στο καλάθι τώρα.</h2></div>
          <p>Συγκεντρώσαμε επιλογές που ταιριάζουν στη στιγμή — και τις ανανεώνουμε όσο αλλάζει η διαθεσιμότητα.</p>
        </div>
        {products.length ? <div className={styles.grid}>{products.map((product, index) => <CatalogProductCard product={product} index={index} key={product.id} />)}</div> : <div className={styles.empty}><div className="eyebrow">Νέες επιλογές έρχονται</div><h2>Δεν βρήκαμε αρκετές προτάσεις για αυτή τη στιγμή.</h2><p>Πες μας τι έχεις στο μυαλό σου και θα σε βοηθήσουμε να βρεις κάτι που ταιριάζει.</p><a className="button" href="/ask-local">Ρώτησε τοπικά</a></div>}
      </div>
    </section>

    <section className={styles.ask}>
      <div className={`shell ${styles.askInner}`}>
        <div><h2>Θες κάτι πιο συγκεκριμένο;</h2><p>Πες μας για ποιον είναι, τι σου αρέσει ή περίπου τι θέλεις να ξοδέψεις — και θα σε βοηθήσουμε να βρεις την κατάλληλη επιλογή.</p></div>
        <a className="button" href="/ask-local">Ρώτησε τοπικά</a>
      </div>
    </section>

    <SiteFooter />
  </main>;
}
