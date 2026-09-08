import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { getHomepageCatalogCards } from "../lib/home-catalog";
import { getVisitorKey } from "../lib/visitor";
import { CatalogProductCard } from "../components/CatalogProductCard";
import { HomeQuickSearch } from "../components/HomeQuickSearch";
import { HomeHeroCarousel } from "../components/HomeHeroCarousel";
import { HomeRegistrationCta } from "../components/HomeRegistrationCta";
import { getAvailableStorefrontCategories } from "../lib/available-catalog-taxonomy";
import { listHomepageHeroSlides } from "../lib/homepage-hero-runtime";
import { listHomepagePromoCtas } from "../lib/homepage-promo-cta-runtime";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import styles from "./home-premium.module.css";
import { governedStaticSeoMetadata } from "../lib/seo-metadata";
import { getCrawlerHomepageCatalogCards } from "../lib/crawler-catalog";
import { isReadOnlyPublicCrawlerRequest } from "../lib/request-audience";

const FEATURED_PRODUCT_LIMIT = 10;
const HOMEPAGE_PROJECTION_REVALIDATE_SECONDS = 60;

const FAQ_ITEMS = [
  {
    question: "Τι είναι το ΚΟΝΤΑ ΜΟΥ στη Σπάρτη;",
    answer: "Το ΚΟΝΤΑ ΜΟΥ είναι η τοπική αγορά της Σπάρτης online: συγκεντρώνει προϊόντα και επιχειρήσεις της περιοχής σε μία κοινή εμπειρία αναζήτησης, συμβουλής και αγοράς."
  },
  {
    question: "Μπορώ να αγοράσω από διαφορετικά καταστήματα με μία διαδικασία;",
    answer: "Ναι. Η εμπειρία είναι σχεδιασμένη ώστε να βρίσκεις προϊόντα από διαφορετικά τοπικά καταστήματα και να ολοκληρώνεις την αγορά σου με ένα ενιαίο checkout, όπου η διαθεσιμότητα και ο τρόπος εκπλήρωσης το επιτρέπουν."
  },
  {
    question: "Τι γίνεται αν δεν βρίσκω το προϊόν που ψάχνω;",
    answer: "Μπορείς να χρησιμοποιήσεις το Ask Local. Το αίτημά σου φτάνει σε σχετικούς τοπικούς επαγγελματίες, ώστε να πάρεις πραγματική απάντηση και βοήθεια αντί να ψάχνεις σε δεκάδες διαφορετικά e-shops."
  },
  {
    question: "Πώς επιλέγεται το κατάστημα που θα εξυπηρετήσει μία αγορά;",
    answer: "Η ανάθεση λαμβάνει υπόψη πραγματική διαθεσιμότητα και κανόνες δίκαιης προβολής. Στόχος είναι να αποφεύγεται η τεχνητή προτεραιότητα ενός καταστήματος και να λειτουργεί η τοπική αγορά με καθαρούς, συνεπείς κανόνες."
  },
  {
    question: "Το ΚΟΝΤΑ ΜΟΥ λειτουργεί μόνο για online αγορές;",
    answer: "Όχι. Η πλατφόρμα βοηθά να ανακαλύπτεις τι υπάρχει κοντά σου, να επικοινωνείς με ανθρώπους που γνωρίζουν τα προϊόντα τους και, όπου υποστηρίζεται, να επιλέγεις τοπική παραλαβή ή άλλη διαθέσιμη μέθοδο εκπλήρωσης."
  }
] as const;

const getCachedHomepageHeroSlides = unstable_cache(
  () => listHomepageHeroSlides({ visibleOnly: true }),
  ["homepage-visible-hero-slides-v1"],
  { revalidate: HOMEPAGE_PROJECTION_REVALIDATE_SECONDS }
);

const getCachedHomepagePromoCtas = unstable_cache(
  () => listHomepagePromoCtas({ visibleOnly: true }),
  ["homepage-visible-promo-ctas-v1"],
  { revalidate: HOMEPAGE_PROJECTION_REVALIDATE_SECONDS }
);

const getCachedHomepageCategories = unstable_cache(
  () => getAvailableStorefrontCategories("23100"),
  ["homepage-available-storefront-categories-23100-v1"],
  { revalidate: HOMEPAGE_PROJECTION_REVALIDATE_SECONDS }
);

const getCachedCrawlerHomepageCards = unstable_cache(
  () => getCrawlerHomepageCatalogCards("23100", FEATURED_PRODUCT_LIMIT),
  ["homepage-crawler-featured-products-23100-v1"],
  { revalidate: HOMEPAGE_PROJECTION_REVALIDATE_SECONDS }
);

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/", { canonicalPath: "/" });
}

async function homepageSectionOrFallback<T>(label: string, operation: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // The homepage is an SEO-critical public entry point. A transient database or
    // downstream failure in one dynamic block must not turn the whole document
    // into HTTP 500. Keep the failure visible in runtime logs and render the
    // affected block's existing empty state until the next request succeeds.
    console.error(`[homepage] ${label} unavailable; rendering fallback`, error);
    return fallback;
  }
}

export default async function Home() {
  const readOnlyCrawler = await isReadOnlyPublicCrawlerRequest();
  const visitorKey = readOnlyCrawler
    ? ""
    : await homepageSectionOrFallback("visitor-key", () => getVisitorKey(), "");

  const [featuredProducts, heroSlides, promoCtas, visibleCategories] = await Promise.all([
    homepageSectionOrFallback(
      "featured-products",
      () => readOnlyCrawler
        ? getCachedCrawlerHomepageCards()
        : getHomepageCatalogCards(visitorKey, "23100", FEATURED_PRODUCT_LIMIT),
      []
    ),
    homepageSectionOrFallback("hero-slides", getCachedHomepageHeroSlides, []),
    homepageSectionOrFallback("promo-ctas", getCachedHomepagePromoCtas, []),
    homepageSectionOrFallback("visible-categories", getCachedHomepageCategories, [])
  ]);
  const promoCta = promoCtas[0] ?? null;
  const homepageStructuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": "https://kontamou.site/#homepage",
        url: "https://kontamou.site/",
        name: "ΚΟΝΤΑ ΜΟΥ Σπάρτη | Η τοπική αγορά της Σπάρτης online",
        description: "Ανακάλυψε προϊόντα από καταστήματα της Σπάρτης, πάρε πραγματική συμβουλή από τοπικούς επαγγελματίες και αγόρασε με μία ενιαία εμπειρία checkout.",
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
      <div className="announcement">Δωρεάν παραλαβή από συνεργαζόμενα καταστήματα στη Σπάρτη</div>
      <SiteHeader />

      <HomeHeroCarousel slides={heroSlides}>
        <section className={`${styles.hero} shell`} id="top">
          <div className={styles.heroCopy}>
            <div className="eyebrow">Η τοπική αγορά · πιο απλά, πιο ανθρώπινα</div>
            <h1 className={styles.heroTitle}>
              <span className={styles.heroTitlePrimary}>Βρες το στη Σπάρτη.</span>{" "}
              <span className={styles.heroTitleSecondary}>Αγόρασέ το από ανθρώπους που το γνωρίζουν.</span>
            </h1>
            <p className={styles.heroLead}>
              Προϊόντα από τοπικά καταστήματα, πραγματική συμβουλή όταν τη χρειάζεσαι και μία καθαρή εμπειρία αγοράς — χωρίς να ψάχνεις σε δεκάδες διαφορετικά e-shops.
            </p>
            <div className={styles.heroActions}>
              <a className="button" href="/shop">Κατάλογος προϊόντων στη Σπάρτη</a>
              <a className="button button-secondary" href="/shops">Καταστήματα στη Σπάρτη</a>
            </div>
            <div className={styles.heroProof} aria-label="ΚΟΝΤΑ ΜΟΥ Σπάρτη benefits">
              <span><span style={{ fontWeight: 800 }}>10</span> επιλογές που ανανεώνονται</span>
              <span><span style={{ fontWeight: 800 }}>Fair</span> ανάθεση καταστήματος</span>
              <span><span style={{ fontWeight: 800 }}>1</span> ενιαίο checkout</span>
            </div>
          </div>

          <div className={styles.heroVisual}>
            <section className={styles.heroSearchCard} aria-labelledby="home-search-title">
              <div className={styles.searchIntro}>
                <div className="eyebrow">Ξεκίνα εδώ</div>
                <h2 id="home-search-title">Τι ψάχνεις σήμερα;</h2>
                <p>Μία απλή αναζήτηση, χωρίς φίλτρα. Αν δεν υπάρχει αποτέλεσμα, θα σου προτείνουμε αμέσως Ask Local.</p>
              </div>
              <HomeQuickSearch />
            </section>
          </div>
        </section>
      </HomeHeroCarousel>

      {promoCta ? <HomeRegistrationCta cta={promoCta} /> : null}

      <section className={`${styles.discoverySection} shell`} aria-labelledby="featured-title">
        <div className={styles.sectionTop}>
          <div>
            <div className="eyebrow">Ανακάλυψε κάτι τώρα</div>
            <h2
              id="featured-title"
              style={{
                maxWidth: "none",
                margin: "9px 0 0",
                whiteSpace: "nowrap",
                fontSize: "clamp(20px, 2.9vw, 44px)",
                lineHeight: 1.05,
                letterSpacing: "-0.045em"
              }}
            >
              <span style={{ fontWeight: 800 }}>10 επιλογές.</span>{" "}
              <span style={{ fontWeight: 400 }}>Δίκαιη εναλλαγή στην τοπική αγορά.</span>
            </h2>
          </div>
          <a className={styles.inlineLink} href="/shop">Δες όλο τον κατάλογο <span>→</span></a>
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
          Η δεκάδα αλλάζει περιοδικά. Μόνο τα προϊόντα που φτάνουν πραγματικά στην αρχική περνούν από Fair Vendor Assignment, ώστε η προβολή να μην επιβαρύνει τεχνητά τα στατιστικά δικαιοσύνης.
        </div>

        {visibleCategories.length ? (
          <div className={styles.categoryArea}>
            <div className={styles.categoryHeader}>
              <div><div className="eyebrow">Από τις διαθέσιμες επιλογές τώρα</div><h3>Περιηγήσου ανά κατηγορία</h3></div>
              <a className={styles.inlineLink} href="/shop">Πλήρης κατάλογος αγορών <span>→</span></a>
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
            <a className="button" href="/how-it-works">Πώς λειτουργεί το ΚΟΝΤΑ ΜΟΥ</a>
            <a className="button button-secondary" href="/advice">Ρώτησε το Ask Local</a>
          </div>
        </div>
      </section>

      <section className="shell" aria-labelledby="local-market-title" style={{ paddingTop: 72, paddingBottom: 30 }}>
        <div style={{ maxWidth: 900 }}>
          <div className="eyebrow">Τοπικό εμπόριο με πραγματική χρησιμότητα</div>
          <h2 id="local-market-title" style={{ margin: "10px 0 20px", fontSize: "clamp(34px, 4vw, 56px)", lineHeight: 1.03 }}>
            Η τοπική αγορά της Σπάρτης online
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.8, margin: "0 0 16px" }}>
            Το ΚΟΝΤΑ ΜΟΥ δημιουργήθηκε για να κάνει την αναζήτηση και την αγορά από τοπικά καταστήματα της Σπάρτης πιο απλή. Αντί να ανοίγεις διαφορετικές ιστοσελίδες, να τηλεφωνείς παντού ή να μην ξέρεις ποιο κατάστημα μπορεί πραγματικά να σε εξυπηρετήσει, βρίσκεις σε ένα σημείο προϊόντα, κατηγορίες και επαγγελματίες της περιοχής. Η πληροφορία για διαθεσιμότητα και εκπλήρωση παραμένει συνδεδεμένη με το πραγματικό κατάστημα και δεν αντιμετωπίζεται σαν μία ανώνυμη λίστα προϊόντων.
          </p>
          <p style={{ fontSize: 17, lineHeight: 1.8, margin: "0 0 16px" }}>
            Με απλά λόγια: βρες το στη Σπάρτη και αγόρασέ το από ανθρώπους που το γνωρίζουν. Όταν υπάρχει κατάλληλο προϊόν, μπορείς να προχωρήσεις μέσα από μία ενιαία εμπειρία αγοράς. Όταν δεν υπάρχει προφανές αποτέλεσμα, το Ask Local σου δίνει έναν πιο ανθρώπινο δρόμο: ρωτάς τι χρειάζεσαι και δίνεις στους σχετικούς τοπικούς επαγγελματίες τη δυνατότητα να απαντήσουν ουσιαστικά.
          </p>
          <p style={{ fontSize: 17, lineHeight: 1.8, margin: 0 }}>
            Για το ΚΟΝΤΑ ΜΟΥ η τοπική αγορά δεν είναι απλώς ένας κατάλογος επιχειρήσεων. Είναι ένα δίκτυο πραγματικών καταστημάτων, πραγματικής γνώσης και πραγματικής εξυπηρέτησης. Γι’ αυτό η πλατφόρμα συνδυάζει ανακάλυψη προϊόντων, συμβουλή, δίκαιη ανάθεση καταστήματος, ένα checkout και τοπική παραλαβή όπου υποστηρίζεται — με στόχο να είναι εύκολο να αγοράζεις κοντά σου χωρίς να χάνεις την άνεση που περιμένεις από ένα σύγχρονο online shop.
          </p>
        </div>
      </section>

      <section className="shell" aria-labelledby="why-kontamou-title" style={{ paddingTop: 34, paddingBottom: 34 }}>
        <h2 id="why-kontamou-title" style={{ margin: "0 0 24px", fontSize: "clamp(30px, 3.5vw, 46px)" }}>Γιατί να αγοράσεις τοπικά μέσα από το ΚΟΝΤΑ ΜΟΥ;</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          <article style={{ border: "1px solid rgba(24, 48, 39, 0.13)", borderRadius: 20, padding: 22 }}>
            <h3 style={{ marginTop: 0 }}>Προϊόντα και καταστήματα της Σπάρτης</h3>
            <p style={{ lineHeight: 1.7, marginBottom: 0 }}>Η αναζήτηση ξεκινά από την πραγματική τοπική αγορά. Βλέπεις προϊόντα και επιχειρήσεις που συνδέονται με τη Σπάρτη και τη γύρω περιοχή, αντί για μία απρόσωπη πανελλαδική λίστα όπου το τοπικό κατάστημα χάνεται ανάμεσα σε χιλιάδες αποτελέσματα.</p>
          </article>
          <article style={{ border: "1px solid rgba(24, 48, 39, 0.13)", borderRadius: 20, padding: 22 }}>
            <h3 style={{ marginTop: 0 }}>Πραγματική συμβουλή με Ask Local</h3>
            <p style={{ lineHeight: 1.7, marginBottom: 0 }}>Δεν είναι κάθε αγορά θέμα φίλτρων. Για εργαλεία, σχολικά, δώρα, παπούτσια, παιχνίδια ή οτιδήποτε χρειάζεται γνώση, μπορείς να ζητήσεις βοήθεια από ανθρώπους που δουλεύουν καθημερινά με αυτά τα προϊόντα και γνωρίζουν τι υπάρχει στην τοπική αγορά.</p>
          </article>
          <article style={{ border: "1px solid rgba(24, 48, 39, 0.13)", borderRadius: 20, padding: 22 }}>
            <h3 style={{ marginTop: 0 }}>Μία καθαρή εμπειρία αγοράς</h3>
            <p style={{ lineHeight: 1.7, marginBottom: 0 }}>Το ΚΟΝΤΑ ΜΟΥ είναι σχεδιασμένο ώστε διαφορετικά τοπικά καταστήματα να μπορούν να συμμετέχουν χωρίς ο πελάτης να χρειάζεται να επαναλαμβάνει από την αρχή την ίδια διαδικασία. Η διαθεσιμότητα, η ανάθεση και η εκπλήρωση ελέγχονται ξεχωριστά από το checkout.</p>
          </article>
        </div>
      </section>

      <section className="shell" aria-labelledby="homepage-faq-title" style={{ paddingTop: 34, paddingBottom: 46 }}>
        <div className="eyebrow">Συχνές ερωτήσεις</div>
        <h2 id="homepage-faq-title" style={{ margin: "10px 0 24px", fontSize: "clamp(30px, 3.5vw, 46px)" }}>Πώς λειτουργεί η τοπική αγορά online;</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {FAQ_ITEMS.map((item) => (
            <details key={item.question} style={{ border: "1px solid rgba(24, 48, 39, 0.13)", borderRadius: 16, padding: "16px 18px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 800 }}>{item.question}</summary>
              <p style={{ margin: "12px 0 0", lineHeight: 1.7 }}>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="shell" aria-label="Κοινοποίηση ΚΟΝΤΑ ΜΟΥ" style={{ paddingTop: 8, paddingBottom: 72 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <span style={{ fontWeight: 800 }}>Μοιράσου την τοπική αγορά της Σπάρτης:</span>
          <a href="https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fkontamou.site%2F" target="_blank" rel="noopener noreferrer">Facebook</a>
          <a href="https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fkontamou.site%2F" target="_blank" rel="noopener noreferrer">LinkedIn</a>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
