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
  displayLabel: string;
  hint: string;
  tone: string;
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
    shopHref: "/shop?category=beauty"
  },
  {
    categoryCode: "studio-lips",
    categoryLabel: "Χείλη",
    studioLabel: "LIP STUDIO",
    displayLabel: "Χείλη",
    hint: "Ανακάλυψε κραγιόν και προϊόντα χειλιών στο σωστό χρώμα.",
    tone: "lip",
    shopHref: "/shop?category=beauty"
  },
  {
    categoryCode: "studio-eye-makeup",
    categoryLabel: "Μάτια",
    studioLabel: "EYE STUDIO",
    displayLabel: "Μάτια",
    hint: "Βρες σκιές και χρωματικές επιλογές για τα μάτια.",
    tone: "eye",
    shopHref: "/shop?category=beauty"
  },
  {
    categoryCode: "studio-makeup",
    categoryLabel: "Μακιγιάζ",
    studioLabel: "MAKEUP STUDIO",
    displayLabel: "Μακιγιάζ",
    hint: "Ξεκίνα από το χρώμα και βρες το μακιγιάζ που ταιριάζει.",
    tone: "makeup",
    shopHref: "/shop?category=beauty"
  },
  {
    categoryCode: "studio-hair-color",
    categoryLabel: "Χρώμα μαλλιών",
    studioLabel: "HAIR COLOR STUDIO",
    displayLabel: "Μαλλιά",
    hint: "Δες αποχρώσεις και προϊόντα μαλλιών κοντά στο χρώμα σου.",
    tone: "hair",
    shopHref: "/shop?category=beauty"
  },
  {
    categoryCode: "studio-shoes",
    categoryLabel: "Παπούτσια",
    studioLabel: "SHOE STUDIO",
    displayLabel: "Παπούτσια",
    hint: "Βρες παπούτσια που δένουν με το χρώμα ή το look σου.",
    tone: "shoe",
    shopHref: "/shop?category=fashion"
  },
  {
    categoryCode: "studio-bags",
    categoryLabel: "Τσάντες & αξεσουάρ",
    studioLabel: "ACCESSORY STUDIO",
    displayLabel: "Τσάντες & αξεσουάρ",
    hint: "Βρες την τσάντα ή το αξεσουάρ που ολοκληρώνει την παλέτα σου.",
    tone: "accessory",
    shopHref: "/shop?category=fashion"
  },
  {
    categoryCode: "studio-fashion",
    categoryLabel: "Μόδα",
    studioLabel: "FASHION STUDIO",
    displayLabel: "Μόδα",
    hint: "Ανακάλυψε ρούχα και fashion επιλογές ξεκινώντας από το χρώμα.",
    tone: "fashion",
    shopHref: "/shop?category=fashion"
  },
  {
    categoryCode: "studio-home",
    categoryLabel: "Σπίτι & διακόσμηση",
    studioLabel: "HOME COLOR STUDIO",
    displayLabel: "Σπίτι",
    hint: "Ταίριαξε αντικείμενα και διακόσμηση με τα χρώματα του χώρου σου.",
    tone: "home",
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

function StudioSymbol({ tone }: { tone: string }) {
  const commonProps = {
    className: styles.studioSymbol,
    viewBox: "0 0 240 170",
    role: "presentation",
    "aria-hidden": true
  } as const;

  if (tone === "nail") {
    return (
      <svg {...commonProps}>
        <path className={styles.symbolSoft} d="M90 151c-4-22 3-42 21-61l18-19c5-5 11-7 17-4 7 4 8 12 3 18l-8 10 10-9 27-37c4-6 11-8 17-4 6 4 7 11 3 17l-22 34 27-28c5-5 12-5 17-1 5 5 5 12 0 17l-29 31 22-17c5-4 12-3 16 2 4 5 3 12-2 16l-43 35c-18 15-40 22-64 20Z" />
        <path className={styles.symbolPrimary} d="M89 151c-4-20 3-39 19-57l19-21c4-5 10-6 15-3 6 4 7 10 3 16l-8 11 11-10 27-36c4-5 10-7 15-3 5 4 6 10 3 15l-23 35 29-29c4-4 10-4 15 0 4 4 4 10 0 15l-32 34 26-20c4-4 10-3 14 2 4 5 3 11-2 15l-42 34c-17 14-37 21-60 20Z" />
        <path className={styles.symbolSecondary} d="M127 69c3-9 8-15 16-18 5 7 5 14 1 22l-7 10-10-14Zm45-21c5-7 11-11 19-11 4 7 3 14-2 21l-8 11-9-21Zm27 21c5-5 11-8 18-6 2 7 0 13-5 19l-9 9-4-22Zm10 29c5-3 10-4 16-1 0 7-3 12-8 16l-10 7 2-22Z" />
        <path className={styles.symbolLine} d="M100 147c16-4 31-11 45-23" />
      </svg>
    );
  }

  if (tone === "lip") {
    return (
      <svg {...commonProps}>
        <path className={styles.symbolSoft} d="M34 91c21-8 35-23 50-38 11-11 24-10 36-4 13-6 25-7 36 3 16 15 31 30 51 39-19 35-55 52-87 52S53 126 34 91Z" />
        <path className={styles.symbolPrimary} d="M35 88c20-8 34-21 49-35 11-10 23-9 36-2 13-7 25-8 36 2 16 14 31 27 49 35-22 9-52 12-85 12-34 0-64-3-85-12Z" />
        <path className={styles.symbolSecondary} d="M36 91c24 8 53 12 84 12 31 0 61-4 85-12-16 31-48 47-85 47-37 0-69-16-84-47Z" />
        <path className={styles.symbolLine} d="M52 91c22 5 44 7 68 7 24 0 47-2 68-7" />
        <path className={styles.symbolHighlight} d="M79 66c11-8 24-9 39-2" />
      </svg>
    );
  }

  if (tone === "eye") {
    return (
      <svg {...commonProps}>
        <path className={styles.symbolSoft} d="M27 89c26-37 59-55 94-55 37 0 69 18 94 55-26 37-57 54-94 54-36 0-68-17-94-54Z" />
        <path className={styles.symbolLineWide} d="M29 88c27-35 58-52 93-52 35 0 66 17 92 52-26 34-57 51-92 51-35 0-66-17-93-51Z" />
        <circle className={styles.symbolSecondary} cx="122" cy="87" r="31" />
        <circle className={styles.symbolDark} cx="122" cy="87" r="16" />
        <circle className={styles.symbolHighlight} cx="112" cy="75" r="6" />
        <path className={styles.symbolLine} d="M55 56 44 43m31 2-5-17m31 10-1-19m28 19 5-18m22 25 11-15m16 27 15-10" />
        <path className={styles.symbolPrimary} d="M59 59c18-18 39-27 64-27 26 0 47 9 63 27-18-10-39-15-63-15-24 0-45 5-64 15Z" />
      </svg>
    );
  }

  if (tone === "makeup") {
    return (
      <svg {...commonProps}>
        <ellipse className={styles.symbolSoft} cx="95" cy="106" rx="55" ry="43" />
        <ellipse className={styles.symbolPrimary} cx="95" cy="100" rx="52" ry="39" />
        <ellipse className={styles.symbolSecondary} cx="95" cy="100" rx="38" ry="27" />
        <path className={styles.symbolLineWide} d="M47 82c6-31 29-50 58-50 28 0 49 16 58 42-18-11-39-16-61-15-21 0-39 8-55 23Z" />
        <path className={styles.symbolDark} d="m151 74 20 10-42 70-17-9 39-71Z" />
        <path className={styles.symbolPrimary} d="M169 78c13-21 28-31 44-29 0 17-9 34-28 49l-16-20Z" />
        <path className={styles.symbolHighlight} d="M65 81c13-9 28-12 45-8" />
      </svg>
    );
  }

  if (tone === "hair") {
    return (
      <svg {...commonProps}>
        <path className={styles.hairBack} d="M174 24c-37 5-58 25-69 49-9 18-17 25-39 35-22 10-34 29-31 51 21-19 42-26 62-27 30-2 54-12 68-31 17-24 19-51 9-77Z" />
        <path className={styles.hairMid} d="M170 30c-31 7-47 23-56 44-8 19-19 32-42 42-18 8-27 20-29 35 16-11 34-15 54-16 28-2 49-12 61-29 15-21 20-49 12-76Z" />
        <path className={styles.symbolLineHair} d="M164 37c-27 10-39 25-47 44-9 21-23 35-45 44m86-75c-22 12-33 27-39 44-8 20-20 31-38 40m70-72c-16 10-25 23-31 37-6 15-15 26-28 34" />
        <path className={styles.symbolHighlight} d="M149 43c-18 12-28 25-35 42" />
      </svg>
    );
  }

  if (tone === "shoe") {
    return (
      <svg {...commonProps}>
        <path className={styles.symbolSoft} d="M29 126c33-6 62-18 82-37 20-20 29-46 35-70l20 7c-2 22 2 42 10 62l14 34c3 7 1 15-5 20-5 4-11 6-18 6H45c-10 0-16-5-16-13v-9Z" />
        <path className={styles.symbolPrimary} d="M32 122c30-5 57-17 76-35 19-18 28-42 33-64l19 6c-1 23 3 43 12 63l11 26c4 9-2 17-12 17H45c-8 0-13-4-13-10v-3Z" />
        <path className={styles.symbolDark} d="M159 31h13c0 36 6 67 18 96h-16c-10-27-15-59-15-96Z" />
        <path className={styles.symbolSecondary} d="M45 116c24-7 45-18 62-34 8 16 22 29 41 37l-2 8H48l-3-11Z" />
        <path className={styles.symbolHighlight} d="M61 113c18-7 34-16 47-29" />
      </svg>
    );
  }

  if (tone === "accessory") {
    return (
      <svg {...commonProps}>
        <path className={styles.symbolSoft} d="M52 70h136l11 83H41l11-83Z" />
        <rect className={styles.symbolPrimary} x="46" y="66" width="148" height="86" rx="18" />
        <path className={styles.symbolLineWide} d="M86 70c0-30 14-46 35-46s35 16 35 46" />
        <path className={styles.symbolSecondary} d="M46 83c22 15 47 23 75 23 28 0 52-8 73-23v25c-22 12-46 18-73 18-28 0-53-6-75-18V83Z" />
        <rect className={styles.symbolDark} x="111" y="96" width="20" height="18" rx="5" />
        <path className={styles.symbolHighlight} d="M64 76h45" />
      </svg>
    );
  }

  if (tone === "fashion") {
    return (
      <svg {...commonProps}>
        <path className={styles.symbolLineWide} d="M120 25c0-8 6-14 14-14 9 0 14 6 14 13 0 8-5 12-14 17l-14 8" />
        <path className={styles.symbolLineWide} d="M58 59 120 31l63 28" />
        <path className={styles.symbolPrimary} d="m94 59 26-18 27 18 11 27-18 18 33 52H67l33-52-18-18 12-27Z" />
        <path className={styles.symbolSecondary} d="M120 41v115H67l33-52-18-18 12-27 26-18Z" />
        <path className={styles.symbolLine} d="m100 65 20 28 21-28M95 110h50" />
        <path className={styles.symbolHighlight} d="M109 55c7-3 14-3 22 0" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <rect className={styles.symbolSoft} x="119" y="94" width="80" height="55" rx="15" />
      <path className={styles.symbolSecondary} d="M118 103c14-15 29-22 45-22 17 0 31 7 43 22v40h-88v-40Z" />
      <path className={styles.symbolPrimary} d="M75 75h58l-8 76H83L75 75Z" />
      <ellipse className={styles.symbolPrimary} cx="104" cy="75" rx="29" ry="10" />
      <path className={styles.symbolLineWide} d="M105 76c-1-23 8-40 26-53m-23 53c11-19 26-30 47-32m-48 31c-11-20-25-31-43-35m43 33c24-14 45-18 62-12" />
      <path className={styles.symbolSecondary} d="M128 27c13-7 24-7 33-1-5 12-15 18-31 18l-2-17Zm28 17c15-5 27-3 34 5-8 11-20 15-36 10l2-15ZM76 38c-13-8-24-9-34-3 4 13 14 20 30 21l4-18Zm93 22c14-3 25 1 31 10-9 9-21 11-35 5l4-15Z" />
      <path className={styles.symbolHighlight} d="M89 86h24" />
    </svg>
  );
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
                  <StudioSymbol tone={studio.tone} />
                  <div className={styles.studioSwatches}>
                    <i /><i /><i /><i /><i />
                  </div>
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
