import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SharedLookActions } from "../../../components/SharedLookActions";
import { productPublicPath } from "../../../lib/product-url";
import { getSharedStyleLook, type StyleLookItem } from "../../../lib/style-builder-runtime";
import { styleLookShareTokenFromCode } from "../../../lib/style-look-share-code";
import styles from "./page.module.css";

type Props = Readonly<{ params: Promise<{ code: string }> }>;

const DEFAULT_STYLE_VENDOR = "vendor_e8cb57b3c67b469d9a9d";

const SLOT_LABELS: Readonly<Record<string, string>> = {
  main: "LOOK",
  bottom: "BOTTOM",
  layer: "LAYER",
  shoes: "SHOES",
  bag: "BAG",
  accessory: "DETAIL",
  beauty: "BEAUTY",
  nails: "NAILS"
};

function euro(minor: number): string {
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(minor / 100);
}

async function sharedLookFromCode(code: string) {
  const token = styleLookShareTokenFromCode(code);
  return token ? getSharedStyleLook(token) : undefined;
}

function imageFor(item: StyleLookItem): string | undefined {
  return item.imageSrc?.trim() || undefined;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const look = await sharedLookFromCode(code);

  if (!look) {
    return {
      title: "Shared Look · KONTA MOY",
      robots: { index: false, follow: true }
    };
  }

  const firstImage = look.composition.map(imageFor).find(Boolean);
  return {
    title: `${look.name} · Shared Look | KONTA MOY`,
    description: "Δες ένα ολοκληρωμένο look από το KONTA MOY Style Builder και πρόσθεσέ το εύκολα στο καλάθι σου.",
    robots: { index: false, follow: true },
    alternates: { canonical: `/look/${code}` },
    openGraph: {
      title: `${look.name} · KONTA MOY Style Builder`,
      description: "Ένα shared look από το KONTA MOY.",
      type: "website",
      images: firstImage ? [{ url: firstImage, alt: look.name }] : undefined
    }
  };
}

export default async function SharedLookPage({ params }: Props) {
  const { code } = await params;
  const look = await sharedLookFromCode(code);
  if (!look || !look.composition.length) notFound();

  const vendorId = look.composition.find((item) => item.vendorId)?.vendorId || DEFAULT_STYLE_VENDOR;
  const mood = look.source === "konta"
    ? "KONTA MOY edit · curated in the fitting room"
    : "Shared Style Builder look";
  const note = look.source === "konta"
    ? "Ένα ολοκληρωμένο look από το KONTA MOY. Μπορείς να ανοίξεις κάθε προϊόν ξεχωριστά ή να προσθέσεις όλο το look στο καλάθι."
    : "Ένα look που δημιουργήθηκε στο KONTA MOY Style Builder και μοιράστηκε μαζί σου.";

  const actionItems = look.composition.map((item) => ({
    id: item.id,
    title: item.title,
    price: item.price || euro(item.priceMinor),
    priceMinor: item.priceMinor,
    imageSrc: imageFor(item)
  }));

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          <strong>KONTA MOY</strong>
          <span>STYLE BUILDER</span>
        </Link>
        <em>SHARED LOOK</em>
      </header>

      <div className={styles.shell}>
        <section className={styles.hero}>
          <aside className={styles.consultant}>
            <div className={styles.badge}>K</div>
            <p className={styles.eyebrow}>A LOOK SHARED WITH YOU</p>
            <h1>{look.name}</h1>
            <p className={styles.mood}>{mood}</p>
            <p className={styles.note}>{note}</p>

            <div className={styles.total}>
              <span>Σύνολο look</span>
              <strong>{euro(look.totalMinor)}</strong>
            </div>

            <div className={styles.desktopActions}>
              <SharedLookActions items={actionItems} vendorId={vendorId} />
            </div>
          </aside>

          <div className={styles.stage}>
            <div className={styles.stageHeader}>
              <div>
                <small>THE EDIT</small>
                <strong>{look.composition.length} επιλεγμένα κομμάτια</strong>
              </div>
            </div>

            <div className={styles.grid}>
              {look.composition.map((item) => {
                const image = imageFor(item);
                return (
                  <article className={styles.card} key={`${item.slot}-${item.id}`}>
                    <div className={styles.image}>
                      <span className={styles.slot}>{SLOT_LABELS[item.slot] || item.slot.toUpperCase()}</span>
                      {image ? (
                        <Image
                          src={image}
                          alt={item.title}
                          fill
                          sizes="(max-width: 430px) 100vw, (max-width: 1050px) 50vw, 33vw"
                          unoptimized
                        />
                      ) : (
                        <span className={styles.fallback}>{item.title.slice(0, 1)}</span>
                      )}
                    </div>
                    <div className={styles.copy}>
                      <small>{item.brand || "KONTA MOY"}</small>
                      <strong>{item.title}</strong>
                      <em>{item.price || euro(item.priceMinor)}</em>
                      <Link className={styles.productLink} href={productPublicPath(item)} prefetch={false}>
                        Δες το προϊόν ↗
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <div className={styles.mobileActions}>
        <SharedLookActions items={actionItems} vendorId={vendorId} />
      </div>
    </main>
  );
}
