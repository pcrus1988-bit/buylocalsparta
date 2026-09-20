"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import styles from "../app/home-premium.module.css";

export type HomeDiscoveryStageProduct = Readonly<{
  id: string;
  slug: string;
  title: string;
  price: string;
  mediaId?: string;
  sourceImageAvailable?: boolean;
}>;

const STAGE_TABS = ["Style", "Color", "BAZAAR", "Ask Local", "Αγορά"] as const;
const STAGE_IMAGE_SIZES =
  "(max-width: 760px) calc(100vw - 48px), (max-width: 1100px) 44vw, 560px";

function StagePhoto({
  src,
  preload = false,
  position = "center center"
}: {
  src: string;
  preload?: boolean;
  position?: string;
}) {
  return (
    <div className={styles.stagePhoto} aria-hidden="true">
      <Image
        src={src}
        alt=""
        fill
        sizes={STAGE_IMAGE_SIZES}
        quality={90}
        preload={preload}
        className={styles.stagePhotoImage}
        style={{ objectPosition: position }}
      />
    </div>
  );
}

export function HomeDiscoveryStage({
  products
}: {
  products: readonly HomeDiscoveryStageProduct[];
}) {
  void products;
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % STAGE_TABS.length);
    }, 6800);
    return () => window.clearInterval(timer);
  }, []);

  let slide: React.ReactNode;

  if (active === 0) {
    slide = (
      <a className={`${styles.discoveryStageSlide} ${styles.stageStyle}`} href="/fitting-room">
        <StagePhoto
          src="/home-discovery/style-builder.jpg"
          preload
          position="center 46%"
        />
        <div className={styles.stageSlideCopy}>
          <small>STYLE BUILDER</small>
          <h2>Το look που έψαχνες.</h2>
          <p>Φτιάξε ένα ολοκληρωμένο σύνολο με μόδα, ομορφιά και αξεσουάρ σε μία εμπειρία.</p>
          <strong>Μπες στο fitting room <span aria-hidden="true">→</span></strong>
        </div>
      </a>
    );
  } else if (active === 1) {
    slide = (
      <a className={`${styles.discoveryStageSlide} ${styles.stageColor}`} href="/color-finder">
        <StagePhoto
          src="/home-discovery/color-finder.jpg"
          position="center 48%"
        />
        <div className={styles.stageSlideCopy}>
          <small>COLOR FINDER</small>
          <h2>Ξεκίνα από το χρώμα.</h2>
          <p>Διάλεξε απόχρωση και δες μόδα, ομορφιά και σπίτι να μιλούν την ίδια χρωματική γλώσσα.</p>
          <strong>Άνοιξε το Color Finder <span aria-hidden="true">→</span></strong>
        </div>
      </a>
    );
  } else if (active === 2) {
    slide = (
      <a className={`${styles.discoveryStageSlide} ${styles.stageBazaar}`} href="/bazaar">
        <StagePhoto
          src="/home-discovery/bazaar.jpg"
          position="center 46%"
        />
        <div className={styles.stageSlideCopy}>
          <small>BAZAAR</small>
          <h2>Καλές ευκαιρίες. Χωρίς ψάξιμο.</h2>
          <p>Ξεχωριστές τιμές και προϊόντα που αξίζει να δεις τώρα.</p>
          <strong>Δες το BAZAAR <span aria-hidden="true">→</span></strong>
        </div>
      </a>
    );
  } else if (active === 3) {
    slide = (
      <a className={`${styles.discoveryStageSlide} ${styles.stageAsk}`} href="/ask-local">
        <StagePhoto
          src="/home-discovery/ask-local.jpg"
          position="center 43%"
        />
        <div className={styles.stageSlideCopy}>
          <small>ASK LOCAL</small>
          <h2>Δεν το βρίσκεις; Ρώτησε.</h2>
          <p>Πες μας τι χρειάζεσαι και άφησε τα κοντινά καταστήματα να σου προτείνουν λύσεις.</p>
          <strong>Ρώτησε τοπικά <span aria-hidden="true">→</span></strong>
        </div>
      </a>
    );
  } else {
    slide = (
      <a className={`${styles.discoveryStageSlide} ${styles.stageMarket}`} href="/shop">
        <StagePhoto
          src="/home-discovery/marketplace-discovery.jpg"
          position="center 47%"
        />
        <div className={styles.stageSlideCopy}>
          <small>ΑΝΑΚΑΛΥΨΗ</small>
          <h2>Δες τι υπάρχει τώρα.</h2>
          <p>Πραγματικά προϊόντα από την αγορά γύρω σου, συγκεντρωμένα σε μία ζωντανή βιτρίνα.</p>
          <strong>Μπες στην αγορά <span aria-hidden="true">→</span></strong>
        </div>
      </a>
    );
  }

  return (
    <aside className={styles.discoveryStage} aria-label="KONTA MOY discovery">
      <div className={styles.discoveryStageTopline}>
        <span>Τώρα κοντά σου</span>
        <span>{String(active + 1).padStart(2, "0")} / 05</span>
      </div>

      <div className={styles.discoveryStageViewport} key={active}>
        {slide}
      </div>

      <div className={styles.discoveryStageTabs} role="tablist" aria-label="Discovery επιλογές">
        {STAGE_TABS.map((tab, index) => (
          <button
            type="button"
            key={tab}
            role="tab"
            aria-selected={index === active}
            className={index === active ? styles.discoveryStageTabActive : undefined}
            onClick={() => setActive(index)}
          >
            {tab}
          </button>
        ))}
      </div>
    </aside>
  );
}
