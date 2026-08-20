import { getHomepageCatalogCards } from "../lib/home-catalog";
import { getVisitorKey } from "../lib/visitor";
import { CatalogProductCard } from "../components/CatalogProductCard";
import { HomeQuickSearch } from "../components/HomeQuickSearch";
import { STOREFRONT_CATEGORIES, categoryCodeMatches } from "../lib/storefront-taxonomy";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import styles from "./home-premium.module.css";

const FEATURED_PRODUCT_LIMIT = 4;

export default async function Home() {
  const visitorKey = await getVisitorKey();
  const featuredProducts = await getHomepageCatalogCards(visitorKey, "23100", FEATURED_PRODUCT_LIMIT);
  const visibleCategories = STOREFRONT_CATEGORIES.filter((category) =>
    featuredProducts.some((card) => categoryCodeMatches(card.categoryCode, category.slug))
  );

  return (
    <main className={styles.home}>
      <div className="announcement">Δωρεάν παραλαβή από συνεργαζόμενα καταστήματα στη Σπάρτη</div>
      <SiteHeader />

      <section className={`${styles.hero} shell`} id="top">
        <div className={styles.heroCopy}>
          <div className="eyebrow">Η τοπική αγορά · πιο απλά, πιο ανθρώπινα</div>
          <h1 className={styles.heroTitle}>Βρες το στη Σπάρτη. Αγόρασέ το από ανθρώπους που το γνωρίζουν.</h1>
          <p className={styles.heroLead}>
            Προϊόντα από τοπικά καταστήματα, πραγματική συμβουλή όταν τη χρειάζεσαι και μία καθαρή εμπειρία αγοράς — χωρίς να ψάχνεις σε δεκάδες διαφορετικά e-shops.
          </p>
          <div className={styles.heroActions}>
            <a className="button" href="/shop">Όλα τα προϊόντα</a>
            <a className="button button-secondary" href="/shops?status=partner">Ενεργά καταστήματα</a>
          </div>
          <div className={styles.heroProof} aria-label="ΚΟΝΤΑ ΜΟΥ Sparta benefits">
            <span><strong>4</strong> επιλογές που ανανεώνονται</span>
            <span><strong>Fair</strong> ανάθεση καταστήματος</span>
            <span><strong>1</strong> ενιαίο checkout</span>
          </div>
        </div>

        <div className={styles.heroVisual} aria-hidden="true">
          <div className={styles.marketCard}>
            <div className={styles.marketCardTop}><span>ΚΟΝΤΑ ΜΟΥ</span><span>SPARTA · 23100</span></div>
            <div className={styles.marketPulse}>
              <span className={styles.pulseCore}>LOCAL</span>
              <span className={styles.pulseRingOne} />
              <span className={styles.pulseRingTwo} />
              <span className={`${styles.pulseDot} ${styles.pulseDotOne}`} />
              <span className={`${styles.pulseDot} ${styles.pulseDotTwo}`} />
              <span className={`${styles.pulseDot} ${styles.pulseDotThree}`} />
            </div>
            <div className={styles.marketCardBottom}>
              <strong>Discover locally.</strong>
              <span>Fair exposure · real advice · local pickup</span>
            </div>
          </div>
          <div className={`${styles.floatingMetric} ${styles.metricTop}`}>✓ Δίκαιη εναλλαγή καταστημάτων</div>
          <div className={`${styles.floatingMetric} ${styles.metricBottom}`}>Ρώτησε άνθρωπο, όχι αλγόριθμο</div>
        </div>
      </section>

      <section className={`${styles.searchDock} shell`} aria-labelledby="home-search-title">
        <div className={styles.searchIntro}>
          <div className="eyebrow">Ξεκίνα εδώ</div>
          <h2 id="home-search-title">Τι ψάχνεις σήμερα;</h2>
          <p>Μία απλή αναζήτηση, χωρίς φίλτρα. Αν δεν υπάρχει αποτέλεσμα, θα σου προτείνουμε αμέσως Ask Local.</p>
        </div>
        <HomeQuickSearch />
      </section>

      <section className={`${styles.discoverySection} shell`} aria-labelledby="featured-title">
        <div className={styles.sectionTop}>
          <div>
            <div className="eyebrow">Ανακάλυψε κάτι τώρα</div>
            <h2 id="featured-title">4 επιλογές. Δίκαιη εναλλαγή στην τοπική αγορά.</h2>
          </div>
          <a className={styles.inlineLink} href="/shop">Δες όλα τα προϊόντα <span>→</span></a>
        </div>

        {featuredProducts.length ? (
          <div className={styles.productRail} aria-label="Fair rotating product selection">
            {featuredProducts.map((product, index) => <CatalogProductCard product={product} index={index} key={product.id} />)}
          </div>
        ) : (
          <div className={styles.emptyDiscovery}>
            <strong>Το catalogue ενημερώνεται.</strong>
            <span>Δες όλα τα προϊόντα ή αναζήτησε αυτό που χρειάζεσαι.</span>
            <a className="button" href="/shop">Άνοιγμα καταλόγου</a>
          </div>
        )}

        <div className={styles.rotationNote}>
          <span className={styles.rotationDot} />
          Η τετράδα αλλάζει περιοδικά. Μόνο τα προϊόντα που φτάνουν πραγματικά στην αρχική περνούν από Fair Vendor Assignment, ώστε η προβολή να μην επιβαρύνει τεχνητά τα στατιστικά δικαιοσύνης.
        </div>

        {visibleCategories.length ? (
          <div className={styles.categoryArea}>
            <div className={styles.categoryHeader}>
              <div><div className="eyebrow">Από τις διαθέσιμες επιλογές τώρα</div><h3>Περιηγήσου ανά κατηγορία</h3></div>
              <a className={styles.inlineLink} href="/shop">Όλες οι επιλογές <span>→</span></a>
            </div>
            <div className={styles.categoryRail} aria-label="Available product categories">
              {visibleCategories.map((category) => (
                <a className={styles.categoryCard} href={`/category/${category.slug}`} key={category.slug}>
                  <span className={styles.categoryMark}>{category.mark}</span>
                  <span className={styles.categoryCopy}><strong>{category.label}</strong><small>{category.name}</small></span>
                  <span className={styles.categorySymbol} aria-hidden="true">{category.symbol}</span>
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className={styles.howSection} aria-labelledby="how-title">
        <div className={`${styles.howInner} shell`}>
          <div className={styles.howHeading}>
            <div className="eyebrow">Από την αναζήτηση στην αγορά</div>
            <h2 id="how-title">Καταλαβαίνεις πώς λειτουργεί σε λίγα δευτερόλεπτα.</h2>
          </div>
          <div className={styles.stepsGrid}>
            <article><span>01</span><strong>Ψάχνεις</strong><p>Βρες το προϊόν χωρίς να χαθείς σε δεκάδες φίλτρα.</p></article>
            <article><span>02</span><strong>Ρωτάς αν χρειάζεται</strong><p>Όταν δεν υπάρχει αποτέλεσμα, το Ask Local εμφανίζεται ακριβώς τη σωστή στιγμή.</p></article>
            <article><span>03</span><strong>Αγοράζεις τοπικά</strong><p>Ένα checkout, δίκαιη ανάθεση και επιλογή τοπικής παραλαβής όπου υποστηρίζεται.</p></article>
          </div>
          <div className={styles.howActions}>
            <a className="button" href="/how-it-works">Πώς λειτουργεί</a>
            <a className="button button-secondary" href="/advice">Θέλω συμβουλή</a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
