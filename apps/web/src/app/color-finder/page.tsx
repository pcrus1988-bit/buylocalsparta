import type { Metadata } from "next";
import Image from "next/image";
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
  displayLabel: string;
  hint: string;
  tone: string;
  imageSrc: string;
  shopHref: string;
}>;

const COLOR_STUDIOS: readonly ColorStudioDefinition[] = [
  {
    categoryCode: "studio-nails",
    categoryLabel: "Βερνίκια νυχιών",
    studioLabel: "NAIL STUDIO",
    displayLabel: "Νύχια",
    hint: "Βρες βερνίκια στην απόχρωση που έχεις στο μυαλό σου.",
    tone: "nail",
    imageSrc: "/color-finder/studios/nail-studio.png",
    shopHref: "/shop?category=beauty"
  },
  {
    categoryCode: "studio-lips",
    categoryLabel: "Χείλη",
    studioLabel: "LIP STUDIO",
    displayLabel: "Χείλη",
    hint: "Ανακάλυψε κραγιόν και προϊόντα χειλιών στο σωστό χρώμα.",
    tone: "lip",
    imageSrc: "/color-finder/studios/lip-studio.png",
    shopHref: "/shop?category=beauty"
  },
  {
    categoryCode: "studio-eye-makeup",
    categoryLabel: "Μάτια",
    studioLabel: "EYE STUDIO",
    displayLabel: "Μάτια",
    hint: "Βρες σκιές και χρωματικές επιλογές για τα μάτια.",
    tone: "eye",
    imageSrc: "/color-finder/studios/eye-studio.png",
    shopHref: "/shop?category=beauty"
  },
  {
    categoryCode: "studio-makeup",
    categoryLabel: "Μακιγιάζ",
    studioLabel: "MAKEUP STUDIO",
    displayLabel: "Μακιγιάζ",
    hint: "Ξεκίνα από το χρώμα και βρες το μακιγιάζ που ταιριάζει.",
    tone: "makeup",
    imageSrc: "/color-finder/studios/makeup-studio.png",
    shopHref: "/shop?category=beauty"
  },
  {
    categoryCode: "studio-hair-color",
    categoryLabel: "Χρώμα μαλλιών",
    studioLabel: "HAIR COLOR STUDIO",
    displayLabel: "Μαλλιά",
    hint: "Δες αποχρώσεις και προϊόντα μαλλιών κοντά στο χρώμα σου.",
    tone: "hair",
    imageSrc: "/color-finder/studios/hair-color-studio.png",
    shopHref: "/shop?category=beauty"
  },
  {
    categoryCode: "studio-shoes",
    categoryLabel: "Παπούτσια",
    studioLabel: "SHOE STUDIO",
    displayLabel: "Παπούτσια",
    hint: "Βρες παπούτσια που δένουν με το χρώμα ή το look σου.",
    tone: "shoe",
    imageSrc: "/color-finder/studios/shoe-studio.png",
    shopHref: "/shop?category=fashion"
  },
  {
    categoryCode: "studio-bags",
    categoryLabel: "Τσάντες & αξεσουάρ",
    studioLabel: "ACCESSORY STUDIO",
    displayLabel: "Τσάντες & αξεσουάρ",
    hint: "Βρες την τσάντα ή το αξεσουάρ που ολοκληρώνει την παλέτα σου.",
    tone: "accessory",
    imageSrc: "/color-finder/studios/accessory-studio.png",
    shopHref: "/shop?category=fashion"
  },
  {
    categoryCode: "studio-fashion",
    categoryLabel: "Μόδα",
    studioLabel: "FASHION STUDIO",
    displayLabel: "Μόδα",
    hint: "Ανακάλυψε ρούχα και fashion επιλογές ξεκινώντας από το χρώμα.",
    tone: "fashion",
    imageSrc: "/color-finder/studios/fashion-studio.png",
    shopHref: "/shop?category=fashion"
  },
  {
    categoryCode: "studio-home",
    categoryLabel: "Σπίτι & διακόσμηση",
    studioLabel: "HOME COLOR STUDIO",
    displayLabel: "Σπίτι",
    hint: "Ταίριαξε αντικείμενα και διακόσμηση με τα χρώματα του χώρου σου.",
    tone: "home",
    imageSrc: "/color-finder/studios/home-color-studio.png",
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
      <main className={`${styles.page} ${styles.hubPage}`}>
        <div className={styles.topBar}>
          <Link href={backHref} className={styles.back}>← ΚΟΝΤΑ ΜΟΥ</Link>
          <div className={styles.wordmark}>
            <strong>COLOR FINDER</strong>
            <span>by KONTA MOY</span>
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
            <div className={styles.studioHeroCopy}>
              <span className={styles.heroEyebrow}>KONTA MOY · COLOR FINDER</span>
              <h1 id="color-studios-title">
                Διάλεξε χρώμα.<br />
                <em>Βρες αυτό που σου ταιριάζει.</em>
              </h1>
            </div>
            <div className={styles.studioHeroAside}>
              <span className={styles.studioCount}>9 COLOR STUDIOS</span>
              <p>
                Ξεκίνα από την απόχρωση που θέλεις — ή πάρε ένα χρώμα από φωτογραφία —
                και διάλεξε πού θέλεις να το βρεις.
              </p>
              <div className={styles.heroPalette} aria-hidden="true">
                <i /><i /><i /><i /><i /><i /><i />
              </div>
            </div>
          </div>

          <div className={styles.studioSectionHead}>
            <div>
              <span>ΤΑ STUDIOS</span>
              <h2>Σε τι θέλεις να βρεις το χρώμα σου;</h2>
            </div>
            <p>Διάλεξε μία κατηγορία για να ξεκινήσεις.</p>
          </div>

          <div className={styles.studioGrid}>
            {COLOR_STUDIOS.map((studio, index) => (
              <Link
                key={studio.categoryCode}
                href={studioHref(studio, vendorId, returnTo)}
                className={styles.studioCard}
                data-tone={studio.tone}
              >
                <div className={styles.studioCardTop}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <small>{studio.studioLabel}</small>
                </div>

                <div className={styles.studioArt} aria-hidden="true">
                  <Image
                    src={studio.imageSrc}
                    alt=""
                    fill
                    quality={90}
                    priority={index < 3}
                    loading={index < 3 ? "eager" : "lazy"}
                    sizes="(max-width: 760px) 50vw, (max-width: 1100px) 33vw, 25vw"
                    className={styles.studioImage}
                  />
                </div>

                <div className={styles.studioCardCopy}>
                  <h3>{studio.displayLabel}</h3>
                  <p>{studio.hint}</p>
                  <span className={styles.studioCta}>
                    Βρες το χρώμα σου <b>→</b>
                  </span>
                </div>
              </Link>
            ))}
          </div>

          <div className={styles.studioHubNote}>
            <div className={styles.noteMark}>◎</div>
            <div>
              <strong>Έχεις το χρώμα μπροστά σου;</strong>
              <p>
                Σε κάθε studio μπορείς να διαλέξεις απόχρωση ή να πάρεις χρώμα από φωτογραφία.
              </p>
            </div>
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
