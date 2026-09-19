import type { Metadata } from "next";
import Link from "next/link";
import { ColorFinderExperience } from "../../components/ColorFinderExperience";
import { SiteFooter } from "../../components/SiteFooter";
import { resolveColorFinderContext } from "../../lib/color-finder-context";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import styles from "./page.module.css";

export const revalidate = 300;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Props = Readonly<{ searchParams: SearchParams }>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeLocalPath(value: string | undefined): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return undefined;
  return value.slice(0, 500);
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const context = resolveColorFinderContext(first(params.category), first(params.categoryLabel));
  return governedStaticSeoMetadata("/color-finder", {
    title: `${context.studioLabel} · Color Finder`,
    description: `${context.heroBody} Το ΚΟΝΤΑ ΜΟΥ συγκρίνει μόνο διαθέσιμα προϊόντα της σχετικής κατηγορίας.`
  });
}

export default async function ColorFinderPage({ searchParams }: Props) {
  const params = await searchParams;
  const categoryCode = first(params.category)?.trim() || "nail-care-colour";
  const categoryLabel = first(params.categoryLabel)?.trim();
  const vendorId = first(params.vendor)?.trim();
  const context = resolveColorFinderContext(categoryCode, categoryLabel);
  const returnTo = safeLocalPath(first(params.returnTo));
  const backHref = returnTo ?? "/";
  const shopHref = vendorId
    ? `/vendor/${encodeURIComponent(vendorId)}`
    : `/shop?category=${encodeURIComponent(categoryCode)}`;
  const shopLabel = vendorId ? "BACK TO STORE" : context.shopLabel;

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <Link href={backHref} className={styles.back}>← KONTA MOY</Link>
        <div className={styles.wordmark}>
          <strong>{context.studioLabel}</strong>
          <span>COLOR FINDER · by KONTA MOY</span>
        </div>
        <Link href={shopHref} className={styles.shopLink}>{shopLabel} ↗</Link>
      </div>

      <ColorFinderExperience
        products={[]}
        context={context}
        categoryCode={categoryCode}
        vendorId={vendorId}
      />

      <section className={styles.manifesto} aria-label="Σχετικά με το Color Finder">
        <span>01</span>
        <div>
          <p>THE IDEA · {context.categoryLabel}</p>
          <h2>Color first.<br />Product second.</h2>
        </div>
        <p>
          {context.heroBody} Το Color Finder αλλάζει αυτόματα πλαίσιο όταν ανοίγει από διαφορετική κατηγορία:
          το κείμενο, τα σχετικά φίλτρα και ο κατάλογος προϊόντων προσαρμόζονται σε αυτό που ψάχνεις.
        </p>
      </section>

      <SiteFooter />
    </main>
  );
}
