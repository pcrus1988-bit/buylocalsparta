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

type ColorStudioDefinition = Readonly<{
  categoryCode: string;
  categoryLabel: string;
  studioLabel: string;
  hint: string;
  shopHref: string;
}>;

const COLOR_STUDIOS: readonly ColorStudioDefinition[] = [
  {
    categoryCode: "studio-nails",
    categoryLabel: "Βερνίκια νυχιών",
    studioLabel: "NAIL STUDIO",
    hint: "Βερνίκια και αποχρώσεις νυχιών",
    shopHref: "/shop?category=beauty"
  },
  {
    categoryCode: "studio-lips",
    categoryLabel: "Χείλη",
    studioLabel: "LIP STUDIO",
    hint: "Κραγιόν και χρώμα χειλιών",
    shopHref: "/shop?category=beauty"
  },
  {
    categoryCode: "studio-eye-makeup",
    categoryLabel: "Μάτια",
    studioLabel: "EYE STUDIO",
    hint: "Σκιές και χρώμα ματιών",
    shopHref: "/shop?category=beauty"
  },
  {
    categoryCode: "studio-makeup",
    categoryLabel: "Μακιγιάζ",
    studioLabel: "MAKEUP STUDIO",
    hint: "Χρωματικές επιλογές μακιγιάζ",
    shopHref: "/shop?category=beauty"
  },
  {
    categoryCode: "studio-hair-color",
    categoryLabel: "Χρώμα μαλλιών",
    studioLabel: "HAIR COLOR STUDIO",
    hint: "Αποχρώσεις και προϊόντα μαλλιών",
    shopHref: "/shop?category=beauty"
  },
  {
    categoryCode: "studio-shoes",
    categoryLabel: "Παπούτσια",
    studioLabel: "SHOE STUDIO",
    hint: "Παπούτσια στο χρώμα που ψάχνεις",
    shopHref: "/shop?category=fashion"
  },
  {
    categoryCode: "studio-bags",
    categoryLabel: "Τσάντες & αξεσουάρ",
    studioLabel: "ACCESSORY STUDIO",
    hint: "Τσάντες και αξεσουάρ ανά χρώμα",
    shopHref: "/shop?category=fashion"
  },
  {
    categoryCode: "studio-fashion",
    categoryLabel: "Μόδα",
    studioLabel: "FASHION STUDIO",
    hint: "Ρούχα και fashion επιλογές ανά χρώμα",
    shopHref: "/shop?category=fashion"
  },
  {
    categoryCode: "studio-home",
    categoryLabel: "Σπίτι & διακόσμηση",
    studioLabel: "HOME COLOR STUDIO",
    hint: "Αντικείμενα για τον χώρο σου",
    shopHref: "/shop?category=home-living"
  }
] as const;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeLocalPath(value: string | undefined): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return undefined;
  return value.slice(0, 500);
}

function studioDefinition(categoryCode: string | undefined): ColorStudioDefinition | undefined {
  if (!categoryCode) return undefined;
  return COLOR_STUDIOS.find((studio) => studio.categoryCode === categoryCode);
}

function studioHref(
  studio: ColorStudioDefinition,
  vendorId?: string,
  returnTo?: string
): string {
  const params = new URLSearchParams({
    category: studio.categoryCode,
    categoryLabel: studio.categoryLabel
  });
  if (vendorId) params.set("vendor", vendorId);
  if (returnTo) params.set("returnTo", returnTo);
  return `/color-finder?${params.toString()}`;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const categoryCode = first(params.category)?.trim();

  if (!categoryCode) {
    return governedStaticSeoMetadata("/color-finder", {
      title: "Color Finder Studios · ΚΟΝΤΑ ΜΟΥ",
      description: "Διάλεξε Color Studio και ξεκίνα από το χρώμα: νύχια, χείλη, μάτια, μακιγιάζ, μαλλιά, παπούτσια, αξεσουάρ, μόδα και σπίτι."
    });
  }

  const context = resolveColorFinderContext(categoryCode, first(params.categoryLabel));
  return governedStaticSeoMetadata("/color-finder", {
    title: `${context.studioLabel} · Color Finder`,
    description: `${context.heroBody} Το ΚΟΝΤΑ ΜΟΥ συγκρίνει μόνο διαθέσιμα προϊόντα της σχετικής κατηγορίας.`
  });
}

export default async function ColorFinderPage({ searchParams }: Props) {
  const params = await searchParams;
  const requestedCategoryCode = first(params.category)?.trim();
  const categoryLabel = first(params.categoryLabel)?.trim();
  const vendorId = first(params.vendor)?.trim();
  const returnTo = safeLocalPath(first(params.returnTo));
  const backHref = returnTo ?? "/";
  const selectedStudio = studioDefinition(requestedCategoryCode);

  if (!requestedCategoryCode) {
    return (
      <main className={styles.page}>
        <div className={styles.topBar}>
          <Link href={backHref} className={styles.back}>← KONTA MOY</Link>
          <div className={styles.wordmark}>
            <strong>COLOR FINDER</strong>
            <span>ALL STUDIOS · by KONTA MOY</span>
          </div>
          <Link
            href={vendorId ? `/vendor/${encodeURIComponent(vendorId)}` : "/shop"}
            className={styles.shopLink}
          >
            SHOP ↗
          </Link>
        </div>

        <section className={styles.studioHub} aria-labelledby="color-studios-title">
          <div className={styles.studioHero}>
            <span>COLOR FIRST · CHOOSE YOUR STUDIO</span>
            <h1 id="color-studios-title">One color.<br />Every studio.</h1>
            <p>
              Διάλεξε πού θέλεις να ψάξεις. Κάθε studio προσαρμόζει τα προϊόντα και την εμπειρία
              στο είδος που σε ενδιαφέρει — όχι μόνο στα νύχια.
            </p>
          </div>

          <div className={styles.studioGrid}>
            {COLOR_STUDIOS.map((studio, index) => (
              <Link
                key={studio.categoryCode}
                href={studioHref(studio, vendorId, returnTo)}
                className={styles.studioCard}
              >
                <div className={styles.studioCardTop}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <small>OPEN STUDIO ↗</small>
                </div>
                <div>
                  <strong>{studio.studioLabel}</strong>
                  <p>{studio.hint}</p>
                </div>
              </Link>
            ))}
          </div>

          <div className={styles.studioHubNote}>
            <span>COLOR FINDER</span>
            <p>
              Μπορείς επίσης να ανοίξεις το Color Finder μέσα από μια συγκεκριμένη κατηγορία ή
              κατάστημα. Τότε θα ανοίγει απευθείας το κατάλληλο studio.
            </p>
          </div>
        </section>

        <SiteFooter />
      </main>
    );
  }

  const categoryCode = requestedCategoryCode;
  const context = resolveColorFinderContext(categoryCode, categoryLabel);
  const shopHref = vendorId
    ? `/vendor/${encodeURIComponent(vendorId)}`
    : selectedStudio?.shopHref ?? `/shop?category=${encodeURIComponent(categoryCode)}`;
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
