import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "../../components/SiteHeader";
import { SiteFooter } from "../../components/SiteFooter";
import { BazaarLuckyFind } from "../../components/BazaarLuckyFind";
import {
  bazaarConditionLabel,
  bazaarDisplayConditionLabel,
  bazaarProductDisclosure,
  bazaarProductNoticeSummary,
  bazaarProductNoticeTitle,
  bazaarSourceLabel,
  getBazaarCatalog,
  type BazaarCard
} from "../../lib/bazaar-catalog";
import { getCachedBazaarFacets } from "../../lib/bazaar-facets";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import styles from "./Bazaar.module.css";

type BazaarPageProps = Readonly<{ searchParams: Promise<Record<string,string | string[] | undefined>> }>;

function valueOf(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function euro(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

function imageFor(product: BazaarCard): string {
  return product.mediaId
    ? `/api/media/${encodeURIComponent(product.mediaId)}`
    : `/api/catalog-source-image/${encodeURIComponent(product.id)}`;
}

function humanCategory(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .toLocaleLowerCase("el-GR")
    .replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase("el-GR"));
}

function savedMinor(product: BazaarCard): number | undefined {
  return product.msrpMinor && product.msrpMinor > product.priceMinor
    ? product.msrpMinor - product.priceMinor
    : undefined;
}

export async function generateMetadata({ searchParams }: BazaarPageProps): Promise<Metadata> {
  const base = await governedStaticSeoMetadata("/bazaar", {
    title: "BAZAAR",
    description: "Ευκαιρίες σε tester, sample, open-box, επιστροφές και μοναδικά κομμάτια από όλη την Ελλάδα, στο BAZAAR του KONTA MOY."
  });
  const params = await searchParams;
  const hasQueryState = Object.values(params).some((value) => valueOf(value).trim().length > 0);
  return hasQueryState ? { ...base, alternates: { canonical: "/bazaar" }, robots: { index: false, follow: true } } : base;
}

function DealCard({ product, eager = false }: Readonly<{ product: BazaarCard; eager?: boolean }>) {
  const saved = savedMinor(product);
  const disclosure = bazaarProductDisclosure(product.bazaarSource);
  return (
    <article className={styles.dealCard}>
      {product.savingsPercent ? <span className={styles.discountStamp}>−{product.savingsPercent}%</span> : null}
      <Link href={`/bazaar/product/${encodeURIComponent(product.slug)}`} className={styles.dealImage} aria-label={`Δες ${product.title}`}>
        <Image
          src={imageFor(product)}
          alt={product.mediaAlt ?? product.title}
          fill
          priority={eager}
          sizes="(max-width: 800px) 72vw, 31vw"
          style={{ objectFit: "contain", padding: 14 }}
        />
      </Link>
      <div className={styles.dealBody}>
        <div className={styles.metaRow}>
          <span className={styles.conditionPill}>{bazaarDisplayConditionLabel(product.condition, product.bazaarSource)}</span>
          {product.availableToSell === 1 ? <span className={styles.lastOne}>ΤΕΛΕΥΤΑΙΟ 1</span> : null}
        </div>
        {product.brand ? <p className={styles.brandText}>{product.brand}</p> : null}
        <h3><Link href={`/bazaar/product/${encodeURIComponent(product.slug)}`}>{product.title}</Link></h3>
        <div className={styles.priceRow}>
          <span className={styles.price}>{euro(product.priceMinor)}</span>
          {product.msrpMinor && product.msrpMinor > product.priceMinor ? <s>{euro(product.msrpMinor)}</s> : null}
        </div>
        {saved ? <p className={styles.saveLine}>Κερδίζεις {euro(saved)}</p> : null}
        {disclosure ? (
          <details className={styles.notice}>
            <summary>{bazaarProductNoticeTitle(product.bazaarSource)} · Περισσότερα</summary>
            <p>{bazaarProductNoticeSummary(product.bazaarSource)}</p>
          </details>
        ) : null}
      </div>
    </article>
  );
}

export default async function BazaarPage({ searchParams }: BazaarPageProps) {
  const params = await searchParams;
  const query = valueOf(params.q).trim();
  const condition = valueOf(params.condition).trim();
  const source = valueOf(params.source).trim();
  const brand = valueOf(params.brand).trim();
  const category = valueOf(params.category).trim();
  const dealRaw = Number.parseInt(valueOf(params.deal), 10);
  const dealFloor = Number.isFinite(dealRaw) && dealRaw > 0 ? Math.min(dealRaw, 90) : 0;
  const lastOneOnly = valueOf(params.stock) === "last";

  const hasCatalogFilters = Boolean(query || condition || source || brand || category);
  const hasExperienceFilters = Boolean(dealFloor || lastOneOnly);
  const hasAnyFilters = hasCatalogFilters || hasExperienceFilters;

  const [products, facets] = await Promise.all([
    getBazaarCatalog({ query, condition, source, brand, category, limit: 160 }),
    getCachedBazaarFacets()
  ]);

  const { brands, categories, conditions, sources } = facets;
  const bySavings = [...products].sort((a, b) =>
    (b.savingsPercent ?? -1) - (a.savingsPercent ?? -1)
    || a.availableToSell - b.availableToSell
    || a.priceMinor - b.priceMinor
  );

  const filteredProducts = bySavings.filter((product) => {
    if (dealFloor && (product.savingsPercent ?? 0) < dealFloor) return false;
    if (lastOneOnly && product.availableToSell !== 1) return false;
    return true;
  });

  const biggestDrops = bySavings.filter((product) => (product.savingsPercent ?? 0) > 0).slice(0, 8);
  const lastPieces = bySavings.filter((product) => product.availableToSell === 1).slice(0, 8);
  const luckyPool = (biggestDrops.length ? bySavings.filter((product) => (product.savingsPercent ?? 0) >= 15) : bySavings)
    .slice(0, 18)
    .map((product) => ({
      id: product.id,
      slug: product.slug,
      title: product.title,
      brand: product.brand,
      imageSrc: imageFor(product),
      priceMinor: product.priceMinor,
      msrpMinor: product.msrpMinor,
      savingsPercent: product.savingsPercent,
      conditionLabel: bazaarDisplayConditionLabel(product.condition, product.bazaarSource)
    }));

  const maxSaving = Math.max(0, ...products.map((product) => product.savingsPercent ?? 0));
  const thirtyPlus = products.filter((product) => (product.savingsPercent ?? 0) >= 30).length;
  const oneLeft = products.filter((product) => product.availableToSell === 1).length;

  const categoryCounts = [...products.reduce((acc, product) => {
    acc.set(product.categoryCode, (acc.get(product.categoryCode) ?? 0) + 1);
    return acc;
  }, new Map<string, number>())]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const marketProducts = filteredProducts.slice(0, 60);

  return (
    <main className={styles.page}>
      <div className="announcement">BAZAAR · Η χαρά είναι να πετύχεις το λαβράκι.</div>
      <SiteHeader />

      <section className={`shell ${styles.hero}`}>
        <div className={styles.heroPanel}>
          <div className={styles.heroContent}>
            <span className={styles.kicker}>KONTA MOY · BARGAIN HUNT</span>
            <h1 className={styles.heroTitle}>BAZAAR</h1>
            <p className={styles.heroLead}>
              Δεν ψάχνεις απλώς προϊόν. <strong>Ψάχνεις την ευκαιρία.</strong> Testers, samples, open-box,
              επιστροφές και μοναδικά κομμάτια — όταν φύγουν, μπορεί να μην ξανάρθουν.
            </p>

            <div className={styles.statRail} aria-label="Στιγμιότυπο ευκαιριών">
              <div className={styles.statCard}>
                <span className={styles.statValue}>{maxSaving ? `−${maxSaving}%` : "ΝΕΑ"}</span>
                <span className={styles.statLabel}>μεγαλύτερη πτώση στις τωρινές επιλογές</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue}>{thirtyPlus}</span>
                <span className={styles.statLabel}>επιλογές με έκπτωση 30%+</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue}>{oneLeft}</span>
                <span className={styles.statLabel}>κομμάτια που έχουν μείνει μόνο ένα</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="shell" aria-label="Γρήγορες διαδρομές BAZAAR">
        <nav className={styles.marketNav}>
          <Link className={`${styles.marketChip} ${styles.marketChipHot}`} href="/bazaar?deal=50">🔥 50%+ κάτω</Link>
          <Link className={`${styles.marketChip} ${styles.marketChipRed}`} href="/bazaar?stock=last">⏳ Τελευταίο κομμάτι</Link>
          <Link className={styles.marketChip} href="/bazaar?source=supplier_tester">🧪 Tester corner</Link>
          <Link className={styles.marketChip} href="/bazaar?source=supplier_sample">✨ Samples</Link>
          <Link className={styles.marketChip} href="/bazaar?source=open_box">📦 Open box</Link>
          <Link className={styles.marketChip} href="/bazaar?source=damaged_packaging">🏷️ Συσκευασία με φθορά</Link>
        </nav>

        <details className={styles.filterShell} open={hasCatalogFilters}>
          <summary className={styles.filterSummary}>
            <span>Βρες το δικό σου λαβράκι</span>
            <span>{hasAnyFilters ? "Ενεργά φίλτρα" : "Αναζήτηση & φίλτρα"}</span>
          </summary>
          <form action="/bazaar" className={styles.filterForm}>
            <label className={styles.filterField}>
              <span>Αναζήτηση</span>
              <input name="q" defaultValue={query} placeholder="Brand, προϊόν, κατηγορία…" />
            </label>
            <label className={styles.filterField}>
              <span>Κατάσταση</span>
              <select name="condition" defaultValue={condition}>
                <option value="">Όλες</option>
                {conditions.map((item) => <option key={item} value={item}>{bazaarConditionLabel(item)}</option>)}
              </select>
            </label>
            <label className={styles.filterField}>
              <span>Προέλευση</span>
              <select name="source" defaultValue={source}>
                <option value="">Όλες</option>
                {sources.map((item) => <option key={item} value={item}>{bazaarSourceLabel(item)}</option>)}
              </select>
            </label>
            <label className={styles.filterField}>
              <span>Brand</span>
              <select name="brand" defaultValue={brand}>
                <option value="">Όλα</option>
                {brands.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className={styles.filterField}>
              <span>Κατηγορία</span>
              <select name="category" defaultValue={category}>
                <option value="">Όλες</option>
                {categories.map((item) => <option key={item} value={item}>{humanCategory(item)}</option>)}
              </select>
            </label>
            <button type="submit" className={styles.filterSubmit}>Κυνήγι</button>
          </form>
        </details>
      </section>

      {!hasAnyFilters && biggestDrops.length ? (
        <section className={`shell ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>ΟΙ ΜΕΓΑΛΕΣ ΠΤΩΣΕΙΣ</span>
              <h2>Εδώ είναι το πολύ χρήμα.</h2>
            </div>
            <p>Οι πιο δυνατές διαφορές τιμής ανεβαίνουν μπροστά. Όχι ατελείωτο scroll μέχρι να βρεις την προσφορά.</p>
          </div>
          <div className={styles.dealStrip}>
            {biggestDrops.map((product, index) => <DealCard key={product.id} product={product} eager={index < 2} />)}
          </div>
        </section>
      ) : null}

      {!hasAnyFilters && luckyPool.length ? (
        <section className={`shell ${styles.section}`}>
          <BazaarLuckyFind deals={luckyPool} />
        </section>
      ) : null}

      {!hasAnyFilters && lastPieces.length ? (
        <section className={`shell ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>ΜΙΑ ΚΑΙ ΕΞΩ</span>
              <h2>Το τελευταίο κομμάτι.</h2>
            </div>
            <p>Αυτές οι επιλογές έχουν μόνο ένα διαθέσιμο τεμάχιο. Το BAZAAR είναι πιο ενδιαφέρον όταν η ανακάλυψη δεν είναι μόνιμη.</p>
          </div>
          <div className={styles.dealStrip}>
            {lastPieces.map((product) => <DealCard key={product.id} product={product} />)}
          </div>
        </section>
      ) : null}

      {!hasAnyFilters && categoryCounts.length ? (
        <section className={`shell ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>ΟΙ ΠΑΓΚΟΙ</span>
              <h2>Πήγαινε εκεί που σε τραβάει.</h2>
            </div>
            <p>Σαν πραγματικό παζάρι: ξεκινάς από έναν πάγκο και βλέπεις τι θα πετύχεις.</p>
          </div>
          <div className={styles.stalls}>
            {categoryCounts.map(([code, count]) => (
              <Link className={styles.stall} key={code} href={`/bazaar?category=${encodeURIComponent(code)}`}>
                <span className={styles.stallName}>{humanCategory(code)}</span>
                <span className={styles.stallCount}>{count} στο τωρινό mix →</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className={`shell ${styles.section}`} style={{ paddingBottom: 76 }}>
        <div className={styles.catalogTopline}>
          <div>
            <span className={styles.sectionEyebrow}>{hasAnyFilters ? "ΤΑ ΑΠΟΤΕΛΕΣΜΑΤΑ ΣΟΥ" : "ΣΚΑΨΕ ΒΑΘΥΤΕΡΑ"}</span>
            <h2 style={{ margin: "5px 0 0" }}>
              {hasAnyFilters ? `${filteredProducts.length} ευκαιρίες` : "Κι άλλες ευκαιρίες"}
            </h2>
          </div>
          {hasAnyFilters ? <Link className={styles.clearLink} href="/bazaar">Καθαρισμός φίλτρων</Link> : null}
        </div>

        {marketProducts.length === 0 ? (
          <div className={styles.empty}>
            <h3>Δεν βρέθηκε ευκαιρία με αυτά τα φίλτρα.</h3>
            <p>Δοκίμασε πιο ανοιχτή αναζήτηση — το BAZAAR αλλάζει μαζί με τη διαθεσιμότητα.</p>
          </div>
        ) : (
          <div className={styles.marketGrid}>
            {marketProducts.map((product, index) => {
              const disclosure = bazaarProductDisclosure(product.bazaarSource);
              return (
                <article className={styles.marketCard} key={product.id}>
                  {product.savingsPercent ? <span className={styles.miniDiscount}>−{product.savingsPercent}%</span> : null}
                  <Link href={`/bazaar/product/${encodeURIComponent(product.slug)}`} className={styles.marketImage} aria-label={`Δες ${product.title}`}>
                    <Image
                      src={imageFor(product)}
                      alt={product.mediaAlt ?? product.title}
                      fill
                      priority={hasAnyFilters && index < 4}
                      loading={hasAnyFilters && index < 4 ? undefined : "lazy"}
                      sizes="(max-width: 560px) 46vw, (max-width: 1100px) 24vw, 19vw"
                      style={{ objectFit: "contain", padding: 10 }}
                    />
                  </Link>
                  <div className={styles.marketBody}>
                    <div className={styles.metaRow}>
                      <span className={styles.conditionPill}>{bazaarDisplayConditionLabel(product.condition, product.bazaarSource)}</span>
                      {product.availableToSell === 1 ? <span className={styles.lastOne}>1 ΜΟΝΟ</span> : null}
                    </div>
                    {product.brand ? <p className={styles.brandText}>{product.brand}</p> : null}
                    <h3><Link href={`/bazaar/product/${encodeURIComponent(product.slug)}`}>{product.title}</Link></h3>
                    <div className={styles.priceRow}>
                      <span className={styles.marketPrice}>{euro(product.priceMinor)}</span>
                      {product.msrpMinor && product.msrpMinor > product.priceMinor ? <s>{euro(product.msrpMinor)}</s> : null}
                    </div>
                    {savedMinor(product) ? <p className={styles.saveLine}>− {euro(savedMinor(product) ?? 0)}</p> : null}
                    <p className={styles.stockLine}>
                      {product.availableToSell === 1 ? "Μοναδικό διαθέσιμο κομμάτι" : `${product.availableToSell} διαθέσιμα`}
                      {product.bazaarSource ? ` · ${bazaarSourceLabel(product.bazaarSource)}` : ""}
                    </p>
                    {disclosure ? (
                      <details className={styles.notice}>
                        <summary>{bazaarProductNoticeTitle(product.bazaarSource)} · Περισσότερα</summary>
                        <p>{bazaarProductNoticeSummary(product.bazaarSource)}</p>
                      </details>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!hasAnyFilters && filteredProducts.length > marketProducts.length ? (
          <p className={styles.moreHint}>
            Κάθε επίσκεψη ξεκινά με ένα δυνατό mix ευκαιριών. Ψάξε ανά πάγκο ή χρησιμοποίησε τα φίλτρα
            για να ανακαλύψεις ακόμα πιο συγκεκριμένα λαβράκια.
          </p>
        ) : null}
      </section>

      <SiteFooter />
    </main>
  );
}
