import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { getPublicBrandDirectory } from "../../lib/brand-guide-runtime";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import { HUB_LOCALITY_COOKIE } from "../../lib/primary-location-gateway";
import styles from "./page.module.css";

const PAGE_SIZE = 48;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

type Props = Readonly<{
  searchParams: Promise<{ q?: string; letter?: string; page?: string }>;
}>;

function pageNumber(value?: string): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function href(params: { q?: string; letter?: string }, page: number): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.letter) query.set("letter", params.letter);
  if (page > 1) query.set("page", String(page));
  const suffix = query.toString();
  return suffix ? `/brands?${suffix}` : "/brands";
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const hasFilterState = Boolean(params.q?.trim() || params.letter?.trim() || (params.page && params.page !== "1"));
  const governed = await governedStaticSeoMetadata("/brands", {
    title: "Brands στο ΚΟΝΤΑ ΜΟΥ",
    description: "Ανακάλυψε brands μέσα από τις κατηγορίες που εκπροσωπούν και τα προϊόντα που είναι πραγματικά διαθέσιμα στο ΚΟΝΤΑ ΜΟΥ."
  });
  return hasFilterState
    ? { ...governed, alternates: { canonical: "/brands" }, robots: { index: false, follow: true } }
    : governed;
}

export default async function BrandsPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 100) || "";
  const letter = /^[A-Z0-9]$/i.test(params.letter ?? "") ? params.letter!.toUpperCase() : "";
  const page = pageNumber(params.page);
  const locality = (await cookies()).get(HUB_LOCALITY_COOKIE)?.value;
  const directory = await getPublicBrandDirectory({
    q: q || undefined,
    letter: letter || undefined,
    selectedHubSlug: locality,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE
  });

  return <main className={styles.page}>
    <SiteHeader />
    <section className="shell">
      <div className={styles.hero}>
        <div className={styles.heroGrid}>
          <div>
            <div className="eyebrow">Brand discovery · όχι απλώς φίλτρα</div>
            <h1>Μπες στον κόσμο του brand.</h1>
            <p>Δες τι αντιπροσωπεύει κάθε brand, σε ποιες κατηγορίες ξεχωρίζει και τι μπορείς να αγοράσεις πραγματικά τώρα από όλα τα ενεργά καταστήματα του επιλεγμένου hub.</p>
          </div>
          <div className={styles.heroMetric}>
            <strong>{directory.total.toLocaleString("el-GR")}</strong>
            <span>brands με ενεργή διαθεσιμότητα στο επιλεγμένο hub</span>
          </div>
        </div>
      </div>

      <div className={styles.controls}>
        <form className={styles.search} action="/brands">
          <input name="q" type="search" defaultValue={q} placeholder="Αναζήτησε brand…" aria-label="Αναζήτηση brand" />
          <button className="button" type="submit">Αναζήτηση</button>
        </form>
        <nav className={styles.letters} aria-label="Brands ανά γράμμα">
          <Link className={`${styles.letter} ${!letter ? styles.activeLetter : ""}`} href={q ? `/brands?q=${encodeURIComponent(q)}` : "/brands"}>Όλα</Link>
          {LETTERS.map((item) => <Link
            key={item}
            className={`${styles.letter} ${letter === item ? styles.activeLetter : ""}`}
            href={href({ q: q || undefined, letter: item }, 1)}
          >{item}</Link>)}
        </nav>
      </div>

      {directory.items.length ? <section className={styles.grid} aria-label="Brands">
        {directory.items.map((brand) => <Link
          className={styles.card}
          href={locality ? `/brands/${brand.slug}?hub=${encodeURIComponent(locality)}` : `/brands/${brand.slug}`}
          key={brand.id}
        >
          <div className={styles.logoBox}>
            {brand.logoUrl
              ? <img src={brand.logoUrl} alt={`Λογότυπο ${brand.name}`} loading="lazy" decoding="async" />
              : <span className={styles.fallback}>{brand.name}</span>}
          </div>
          <div className={styles.cardMeta}>
            <strong>{brand.name}</strong>
            <span>{brand.liveProductCount.toLocaleString("el-GR")} διαθέσιμα προϊόντα</span>
            {brand.indexable ? <span className={styles.guideReady}>BRAND GUIDE</span> : null}
          </div>
        </Link>)}
      </section> : <div className={styles.empty}>
        <div className="eyebrow">0 brands</div>
        <h2>Δεν βρήκαμε brand με αυτά τα κριτήρια.</h2>
        <Link className="button" href="/brands">Δες όλα τα brands</Link>
      </div>}

      {(page > 1 || directory.hasMore) ? <nav className={styles.pagination} aria-label="Σελιδοποίηση brands">
        {page > 1 ? <Link className="button button-secondary" href={href({ q: q || undefined, letter: letter || undefined }, page - 1)}>← Προηγούμενα</Link> : null}
        <span>Σελίδα {page}</span>
        {directory.hasMore ? <Link className="button button-secondary" href={href({ q: q || undefined, letter: letter || undefined }, page + 1)}>Επόμενα →</Link> : null}
      </nav> : null}
    </section>
    <SiteFooter />
  </main>;
}
