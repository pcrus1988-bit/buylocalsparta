import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { getHomepageCatalogCards } from "../lib/home-catalog";
import { getVisitorKey } from "../lib/visitor";
import { CatalogProductCard } from "../components/CatalogProductCard";
import { HomeQuickSearch } from "../components/HomeQuickSearch";
import { HomeHeroCarousel } from "../components/HomeHeroCarousel";
import { HomeLocalMarketScene } from "../components/HomeLocalMarketScene";
import { getAvailableStorefrontCategories } from "../lib/available-catalog-taxonomy";
import { listHomepageHeroSlides } from "../lib/homepage-hero-runtime";
import { getHomepageLocalMarketScene } from "../lib/homepage-local-market-runtime";
import { getPublicVendorDirectory, type PublicVendorDirectoryEntry } from "../lib/public-vendor-directory";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import styles from "./home-premium.module.css";
import { governedStaticSeoMetadata } from "../lib/seo-metadata";
import { getCrawlerHomepageCatalogCards } from "../lib/crawler-catalog";
import { isReadOnlyPublicCrawlerRequest } from "../lib/request-audience";

const FEATURED_PRODUCT_LIMIT = 8;
const HOMEPAGE_REVALIDATE_SECONDS = 60;

const FAQ_ITEMS = [
  {
    question: "Τι είναι το ΚΟΝΤΑ ΜΟΥ στη Σπάρτη;",
    answer: "Το ΚΟΝΤΑ ΜΟΥ συγκεντρώνει προϊόντα και ενεργά τοπικά καταστήματα σε μία κοινή εμπειρία αναζήτησης, συμβουλής και αγοράς."
  },
  {
    question: "Μπορώ να ζητήσω βοήθεια πριν αγοράσω;",
    answer: "Ναι. Με το Ask Local μπορείς να περιγράψεις αυτό που χρειάζεσαι και να απευθυνθείς σε κατάλληλο τοπικό κατάστημα."
  },
  {
    question: "Πώς παραλαμβάνω την αγορά μου;",
    answer: "Ανάλογα με το προϊόν και τον προορισμό σου, εμφανίζονται οι διαθέσιμες επιλογές τοπικής παραλαβής ή αποστολής κατά την αγορά."
  }
] as const;

const EDITORIAL_COLLECTIONS = [
  {
    eyebrow: "Απόδραση",
    title: "Σαββατοκύριακο στον Ταΰγετο",
    copy: "Μικρές και μεγάλες επιλογές για μία εξόρμηση, από καταστήματα που βρίσκονται κοντά σου.",
    href: "/collections/taygetos-weekend",
    className: styles.collectionMountain
  },
  {
    eyebrow: "Νέα αρχή",
    title: "Το πρώτο σου σπίτι",
    copy: "Χρήσιμα αντικείμενα, εργαλεία και λεπτομέρειες που κάνουν έναν χώρο πραγματικά δικό σου.",
    href: "/collections/first-home",
    className: styles.collectionHome
  },
  {
    eyebrow: "Για κάποιον δικό σου",
    title: "Δώρα με προσωπικότητα",
    copy: "Ιδέες από διαφορετικά τοπικά καταστήματα, χωρίς να ψάχνεις σε δεκάδες ξεχωριστά e-shops.",
    href: "/collections/gifts-with-personality",
    className: styles.collectionGift
  }
] as const;

const getCachedHomepageHeroSlides = unstable_cache(
  () => listHomepageHeroSlides({ visibleOnly: true }),
  ["homepage-visible-hero-slides-v2"],
  { revalidate: HOMEPAGE_REVALIDATE_SECONDS }
);

const getCachedHomepageLocalMarketScene = unstable_cache(
  () => getHomepageLocalMarketScene(),
  ["homepage-local-market-scene-v1"],
  { revalidate: HOMEPAGE_REVALIDATE_SECONDS }
);

const getCachedHomepageCategories = unstable_cache(
  () => getAvailableStorefrontCategories("23100"),
  ["homepage-available-storefront-categories-23100-v2"],
  { revalidate: HOMEPAGE_REVALIDATE_SECONDS }
);

const getCachedHomepageVendors = unstable_cache(
  () => getPublicVendorDirectory(),
  ["homepage-public-vendor-directory-v1"],
  { revalidate: HOMEPAGE_REVALIDATE_SECONDS }
);

const getCachedCrawlerHomepageCards = unstable_cache(
  () => getCrawlerHomepageCatalogCards("23100", FEATURED_PRODUCT_LIMIT),
  ["homepage-crawler-featured-products-23100-v2"],
  { revalidate: HOMEPAGE_REVALIDATE_SECONDS }
);

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/", { canonicalPath: "/" });
}

async function homepageSectionOrFallback<T>(label: string, operation: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error(`[homepage] ${label} unavailable; rendering fallback`, error);
    return fallback;
  }
}

function editorialRank(seed: string, vendorId: string): number {
  const value = `${seed}:${vendorId}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Editorial shop-window rotation is intentionally separate from transactional
 * Fair Vendor Assignment. It gives active partners stable exposure for one visitor
 * during the day without consuming or mutating checkout assignment state.
 */
function selectEditorialVendors(vendors: readonly PublicVendorDirectoryEntry[], visitorKey: string): readonly PublicVendorDirectoryEntry[] {
  const dayBucket = new Date().toISOString().slice(0, 10);
  const seed = `${dayBucket}:${visitorKey || "public"}`;
  return vendors
    .filter((vendor) => vendor.directoryStatus === "partner")
    .sort((left, right) => editorialRank(seed, left.id) - editorialRank(seed, right.id) || left.id.localeCompare(right.id))
    .slice(0, 6);
}

export default async function Home() {
  const readOnlyCrawler = await isReadOnlyPublicCrawlerRequest();
  const visitorKey = readOnlyCrawler ? "" : await homepageSectionOrFallback("visitor-key", () => getVisitorKey(), "");

  const [featuredProducts, heroSlides, localMarketScene, visibleCategories, vendorDirectory] = await Promise.all([
    homepageSectionOrFallback(
      "featured-products",
      () => readOnlyCrawler
        ? getCachedCrawlerHomepageCards()
        : getHomepageCatalogCards(visitorKey, "23100", FEATURED_PRODUCT_LIMIT),
      []
    ),
    homepageSectionOrFallback("hero-slides", getCachedHomepageHeroSlides, []),
    homepageSectionOrFallback("local-market-scene", getCachedHomepageLocalMarketScene, null),
    homepageSectionOrFallback("visible-categories", getCachedHomepageCategories, []),
    homepageSectionOrFallback("vendor-directory", getCachedHomepageVendors, [])
  ]);

  const activeVendors = selectEditorialVendors(vendorDirectory, visitorKey);

  const homepageStructuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": "https://kontamou.site/#homepage",
        url: "https://kontamou.site/",
        name: "ΚΟΝΤΑ ΜΟΥ Σπάρτη | Μια ολόκληρη πόλη. Κοντά σου.",
        description: "Ανακάλυψε προϊόντα και ανθρώπους από την τοπική αγορά της Σπάρτης, ζήτησε συμβουλή και αγόρασε με μία ενιαία εμπειρία.",
        inLanguage: "el-GR",
        isPartOf: { "@id": "https://kontamou.site/#website" },
        about: { "@id": "https://kontamou.site/#local-commerce-service" }
      },
      {
        "@type": "FAQPage",
        "@id": "https://kontamou.site/#faq",
        mainEntity: FAQ_ITEMS.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer }
        }))
      }
    ]
  };

  return (
    <main className={styles.home}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageStructuredData).replaceAll("<", "\\u003c") }}
      />
      <div className="announcement">Η τοπική αγορά της Σπάρτης — online, αλλά ανθρώπινα.</div>
      <SiteHeader />

      <HomeHeroCarousel slides={heroSlides}>
        <section
          className={`${styles.hero} shell`}
          id="top"
          style={localMarketScene?.isVisible ? undefined : { gridTemplateColumns: "minmax(0, 1fr)" }}
        >
          <div className={styles.heroCopy}>
            <a className={styles.locationPill} href="/choose-location" aria-label="Αλλαγή περιοχής">
              <span className={styles.locationDot} aria-hidden="true" />
              Σπάρτη <span>· Αλλαγή περιοχής</span>
            </a>
            <div className={styles.heroEyebrow}>Η πόλη σου, σε μία αγορά</div>
            <h1 className={styles.heroTitle}>Μια ολόκληρη πόλη.<br /><em>Κοντά σου.</em></h1>
            <p className={styles.heroLead}>
              Βρες αυτό που χρειάζεσαι, δες ποιος το γνωρίζει και αγόρασέ το από την τοπική αγορά με μία καθαρή εμπειρία.
            </p>
            <div className={styles.heroSearch}>
              <HomeQuickSearch />
            </div>
            <div className={styles.heroLinks}>
              <a href="/shop">Όλα τα προϊόντα <span aria-hidden="true">↗</span></a>
              <a href="/shops">Τα καταστήματα <span aria-hidden="true">↗</span></a>
              <a href="/ask-local">Ask Local <span aria-hidden="true">↗</span></a>
            </div>
          </div>
          {localMarketScene?.isVisible ? <HomeLocalMarketScene scene={localMarketScene} /> : null}
        </section>
      </HomeHeroCarousel>

      {visibleCategories.length ? (
        <section className={`${styles.categorySection} shell`} aria-labelledby="home-categories-title">
          <div className={styles.sectionHeadingCompact}>
            <div><span className={styles.kicker}>Ξεκίνα από εδώ</span><h2 id="home-categories-title">Τι ψάχνεις σήμερα;</h2></div>
            <a href="/shop">Όλες οι κατηγορίες →</a>
          </div>
          <div className={styles.categoryRail}>
            {visibleCategories.map((category) => (
              <a className={styles.categoryCard} href={`/category/${category.slug}`} key={category.slug}>
                <span className={styles.categoryMark}>{category.symbol}</span>
                <span><strong>{category.label}</strong><small>{category.name}</small></span>
                <b aria-hidden="true">↗</b>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className={`${styles.discoverySection} shell`} aria-labelledby="featured-title">
        <div className={styles.sectionHeading}>
          <div><span className={styles.kicker}>Διαθέσιμα τώρα στη Σπάρτη</span><h2 id="featured-title">Προϊόντα που μπορείς να ανακαλύψεις τώρα.</h2></div>
          <p>Η επιλογή ανανεώνεται και προβάλλει πραγματικά διαθέσιμα προϊόντα χωρίς να γεμίζει την αρχική με εσωτερικούς κανόνες του marketplace.</p>
        </div>
        {featuredProducts.length ? (
          <div className={styles.productRail}>
            {featuredProducts.map((product, index) => <CatalogProductCard product={product} index={index} key={product.id} />)}
          </div>
        ) : (
          <div className={styles.emptyDiscovery}><strong>Η βιτρίνα ενημερώνεται.</strong><a href="/shop">Δες τον πλήρη κατάλογο →</a></div>
        )}
        <div className={styles.centerAction}><a className="button" href="/shop">Μπες στην αγορά</a></div>
      </section>

      <section className={styles.marketWalk} aria-labelledby="market-walk-title">
        <div className="shell">
          <div className={styles.marketWalkIntro}>
            <span className={styles.kickerLight}>Η εμπειρία ΚΟΝΤΑ ΜΟΥ</span>
            <h2 id="market-walk-title">Βόλτα στην αγορά.</h2>
            <p>Όχι απλώς ένας κατάλογος. Μπες στις βιτρίνες, γνώρισε τους ανθρώπους τους και ανακάλυψε τι υπάρχει πραγματικά κοντά σου.</p>
          </div>
          {activeVendors.length ? (
            <div className={styles.windowRail} aria-label="Ενεργά τοπικά καταστήματα">
              {activeVendors.map((vendor, index) => {
                const imageSrc = vendor.mediaId ? `/api/media/${encodeURIComponent(vendor.mediaId)}` : vendor.story?.mediaUrl;
                const category = vendor.taxonomies[0]?.categoryLabel ?? "Τοπικό κατάστημα";
                const intro = vendor.story?.excerpt
                  ?? vendor.profileShortDescription
                  ?? (vendor.canonicalCount > 0 ? `${vendor.canonicalCount} ενεργά προϊόντα στην τοπική αγορά.` : "Γνώρισε το κατάστημα και όσα μπορεί να σε βοηθήσει να βρεις.");
                const vendorHref = `/vendor/${encodeURIComponent(vendor.id)}`;
                const askHref = `/ask-local?vendor=${encodeURIComponent(vendor.id)}`;
                const vendorProducts = featuredProducts.filter((product) => product.vendorId === vendor.id).slice(0, 3);
                return (
                  <article className={styles.shopWindow} key={vendor.id}>
                    <a href={vendorHref} aria-label={`Μπες στο κατάστημα ${vendor.name}`}>
                      <div className={`${styles.shopWindowImage} ${imageSrc ? styles.hasPhoto : ""}`} style={imageSrc ? { backgroundImage: `url(${imageSrc})` } : undefined}>
                        {!imageSrc ? <span className={styles.windowNumber}>{String(index + 1).padStart(2, "0")}</span> : null}
                        <span className={styles.windowStatus}>Ανοιχτή βιτρίνα</span>
                      </div>
                    </a>
                    <div className={styles.shopWindowCopy}>
                      <small>{category}</small>
                      <strong><a href={vendorHref}>{vendor.name}</a></strong>
                      <span>{intro}</span>
                      {vendor.adviser ? <span>Μπορείς να ρωτήσεις {vendor.adviser} πριν αγοράσεις.</span> : null}
                      {vendorProducts.length ? (
                        <details className="market-window-products">
                          <summary>Δες {vendorProducts.length === 1 ? "το διαθέσιμο προϊόν" : `${vendorProducts.length} διαθέσιμα προϊόντα`}</summary>
                          <div className="market-window-product-list">
                            {vendorProducts.map((product) => {
                              const productImage = product.mediaId
                                ? `/api/media/${encodeURIComponent(product.mediaId)}`
                                : product.sourceImageAvailable
                                  ? `/api/catalog-source-image/${encodeURIComponent(product.id)}`
                                  : undefined;
                              return (
                                <a className="market-window-product" href={`/product/${encodeURIComponent(product.slug)}`} key={product.id}>
                                  <span className="market-window-product-image">
                                    {productImage ? <img src={productImage} alt="" loading="lazy" /> : <span aria-hidden="true">{product.title.slice(0, 1)}</span>}
                                  </span>
                                  <span className="market-window-product-copy"><strong>{product.title}</strong><b>{product.price}</b></span>
                                </a>
                              );
                            })}
                          </div>
                        </details>
                      ) : vendor.canonicalCount > 0 ? <a className="market-window-product-fallback" href={vendorHref}>Δες τα προϊόντα του καταστήματος →</a> : null}
                      <div className="market-window-actions">
                        <a href={vendorHref}>Μπες στο κατάστημα</a>
                        <a href={askHref}>Ρώτησε</a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <a className={styles.marketWalkFallback} href="/shops">Γνώρισε τα καταστήματα της Σπάρτης →</a>
          )}
        </div>
      </section>

      <section className={`${styles.collectionsSection} shell`} aria-labelledby="collections-title">
        <div className={styles.sectionHeading}>
          <div><span className={styles.kicker}>Επιλογές με λόγο ύπαρξης</span><h2 id="collections-title">Ιδέες, όχι απλώς φίλτρα.</h2></div>
          <p>Συνδυασμοί προϊόντων από διαφορετικά καταστήματα που ξεκινούν από μία πραγματική στιγμή της ζωής.</p>
        </div>
        <div className={styles.collectionGrid}>
          {EDITORIAL_COLLECTIONS.map((collection) => (
            <a className={`${styles.collectionCard} ${collection.className}`} href={collection.href} key={collection.title}>
              <span>{collection.eyebrow}</span>
              <div><h3>{collection.title}</h3><p>{collection.copy}</p></div>
              <b>Ανακάλυψέ το ↗</b>
            </a>
          ))}
        </div>
      </section>

      <section className={styles.humanSection}>
        <div className={`${styles.humanGrid} shell`}>
          <div className={styles.humanPortrait} aria-hidden="true"><span>ΡΩΤΑ<br />ΚΑΠΟΙΟΝ<br />ΠΟΥ ΞΕΡΕΙ</span></div>
          <div className={styles.humanCopy}>
            <span className={styles.kicker}>Το δυνατό σημείο της τοπικής αγοράς</span>
            <h2>Υπάρχει άνθρωπος πίσω από το προϊόν.</h2>
            <p>Όταν η φωτογραφία και η περιγραφή δεν αρκούν, το ΚΟΝΤΑ ΜΟΥ σε φέρνει πιο κοντά σε ανθρώπους που γνωρίζουν αυτό που πουλάνε.</p>
            <div className={styles.humanActions}><a className="button" href="/ask-local">Ρώτησε τοπικά</a><a href="/advice">Βρες συμβουλή από κατάστημα →</a></div>
          </div>
        </div>
      </section>

      <section className={`${styles.serviceStrip} shell`} aria-label="Βασικά οφέλη">
        <div><span>01</span><strong>Μία αναζήτηση</strong><small>για την τοπική αγορά</small></div>
        <div><span>02</span><strong>Πραγματική συμβουλή</strong><small>όταν τη χρειάζεσαι</small></div>
        <div><span>03</span><strong>Μία αγορά</strong><small>χωρίς περιττή πολυπλοκότητα</small></div>
      </section>

      <section className={`${styles.faqSection} shell`} aria-labelledby="faq-title">
        <div><span className={styles.kicker}>Χρήσιμες απαντήσεις</span><h2 id="faq-title">Πριν ξεκινήσεις.</h2></div>
        <div className={styles.faqList}>{FAQ_ITEMS.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>
      </section>

      <SiteFooter />
    </main>
  );
}
