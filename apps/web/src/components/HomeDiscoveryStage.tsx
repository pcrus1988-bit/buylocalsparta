"use client";

import { useEffect, useMemo, useState } from "react";
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

function productImage(product: HomeDiscoveryStageProduct): string | undefined {
  if (product.mediaId) return `/api/media/${encodeURIComponent(product.mediaId)}`;
  if (product.sourceImageAvailable) return `/api/catalog-source-image/${encodeURIComponent(product.id)}`;
  return undefined;
}

export function HomeDiscoveryStage({ products }: { products: readonly HomeDiscoveryStageProduct[] }) {
  const [active, setActive] = useState(0);
  const visualProducts = useMemo(
    () => products.filter((product) => Boolean(productImage(product))).slice(0, 3),
    [products]
  );
  const primaryProduct = visualProducts[0] ?? products[0];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % STAGE_TABS.length), 6800);
    return () => window.clearInterval(timer);
  }, []);

  let slide: React.ReactNode;

  if (active === 0) {
    slide = (
      <a className={`${styles.discoveryStageSlide} ${styles.stageStyle}`} href="/fitting-room" key="style">
        <div className={styles.stageLookVisual} aria-hidden="true">
          <div className={styles.stageMirror}><span className={styles.stageLookFigure} /></div>
          <span className={`${styles.stageTag} ${styles.stageTagOne}`}>OUTFIT</span>
          <span className={`${styles.stageTag} ${styles.stageTagTwo}`}>BEAUTY</span>
          <span className={`${styles.stageTag} ${styles.stageTagThree}`}>ACCESSORIES</span>
        </div>
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
      <a className={`${styles.discoveryStageSlide} ${styles.stageColor}`} href="/color-finder" key="color">
        <div className={styles.stageColorVisual} aria-hidden="true">
          <span className={styles.stageColorOne}>ΧΕΙΛΗ</span>
          <span className={styles.stageColorTwo}>ΝΥΧΙΑ</span>
          <span className={styles.stageColorThree}>ΜΑΤΙΑ</span>
          <span className={styles.stageColorFour}>ΜΑΛΛΙΑ</span>
        </div>
        <div className={styles.stageSlideCopy}>
          <small>COLOR FINDER</small>
          <h2>Ξεκίνα από το χρώμα.</h2>
          <p>Διάλεξε απόχρωση και άφησε το ΚΟΝΤΑ ΜΟΥ να σε οδηγήσει στις σωστές επιλογές.</p>
          <strong>Άνοιξε το Color Finder <span aria-hidden="true">→</span></strong>
        </div>
      </a>
    );
  } else if (active === 2) {
    slide = (
      <a className={`${styles.discoveryStageSlide} ${styles.stageBazaar}`} href="/bazaar" key="bazaar">
        <div className={styles.stageBazaarVisual} aria-hidden="true">
          {primaryProduct && productImage(primaryProduct) ? (
            <img src={productImage(primaryProduct)} alt="" loading="lazy" decoding="async" />
          ) : (
            <span>BAZAAR</span>
          )}
        </div>
        <div className={styles.stageSlideCopy}>
          <small>BAZAAR</small>
          <h2>Καλές ευκαιρίες. Χωρίς ψάξιμο.</h2>
          <p>Ξεχωριστές τιμές και ειδικές επιλογές συγκεντρωμένες σε ένα σημείο.</p>
          <strong>Δες το BAZAAR <span aria-hidden="true">→</span></strong>
        </div>
      </a>
    );
  } else if (active === 3) {
    slide = (
      <a className={`${styles.discoveryStageSlide} ${styles.stageAsk}`} href="/ask-local" key="ask">
        <div className={styles.stageAskVisual} aria-hidden="true">
          <span className={styles.stageAskBubbleOne}>Ψάχνω κάτι συγκεκριμένο.</span>
          <span className={styles.stageAskBubbleTwo}>Ρώτησε το κατάλληλο κατάστημα.</span>
          <span className={styles.stageAskBubbleThree}>Υπάρχει άνθρωπος που ξέρει.</span>
        </div>
        <div className={styles.stageSlideCopy}>
          <small>ASK LOCAL</small>
          <h2>Δεν το βρίσκεις; Ρώτησε.</h2>
          <p>Πες μας τι χρειάζεσαι και φτάσε σε ανθρώπους που γνωρίζουν πραγματικά το προϊόν.</p>
          <strong>Ρώτησε τοπικά <span aria-hidden="true">→</span></strong>
        </div>
      </a>
    );
  } else {
    slide = (
      <a className={`${styles.discoveryStageSlide} ${styles.stageMarket}`} href="/shop" key="market">
        <div className={styles.stageMarketVisual} aria-hidden="true">
          {visualProducts.length ? visualProducts.map((product) => (
            <span className={styles.stageMarketProduct} key={product.id}>
              <img src={productImage(product)} alt="" loading="lazy" decoding="async" />
            </span>
          )) : (
            <span className={styles.stageMarketFallback}>ΚΟΝΤΑ<br />ΣΟΥ</span>
          )}
        </div>
        <div className={styles.stageSlideCopy}>
          <small>ΑΝΑΚΑΛΥΨΗ</small>
          <h2>Δες τι υπάρχει τώρα.</h2>
          <p>Πραγματικά προϊόντα από την αγορά, έτοιμα να τα ανακαλύψεις.</p>
          <strong>Μπες στην αγορά <span aria-hidden="true">→</span></strong>
        </div>
      </a>
    );
  }

  return (
    <aside className={styles.discoveryStage} aria-label="Ανακάλυψε το ΚΟΝΤΑ ΜΟΥ">
      <div className={styles.discoveryStageTop}>
        <span>Τώρα κοντά σου</span>
        <span>{String(active + 1).padStart(2, "0")} / {String(STAGE_TABS.length).padStart(2, "0")}</span>
      </div>
      <div className={styles.discoveryStageViewport}>{slide}</div>
      <div className={styles.discoveryStageTabs} aria-label="Επιλογές αρχικής σελίδας">
        {STAGE_TABS.map((tab, index) => (
          <button
            className={index === active ? styles.discoveryStageTabActive : undefined}
            type="button"
            onClick={() => setActive(index)}
            aria-pressed={index === active}
            key={tab}
          >
            {tab}
          </button>
        ))}
      </div>
    </aside>
  );
}
