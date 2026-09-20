"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import styles from "../app/bazaar/Bazaar.module.css";

type LuckyDeal = Readonly<{
  id: string;
  slug: string;
  title: string;
  brand?: string;
  imageSrc: string;
  priceMinor: number;
  msrpMinor?: number;
  savingsPercent?: number;
  conditionLabel: string;
}>;

function euro(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

export function BazaarLuckyFind({ deals }: Readonly<{ deals: readonly LuckyDeal[] }>) {
  const [index, setIndex] = useState(0);
  if (!deals.length) return null;

  const deal = deals[index % deals.length];
  const savedMinor = deal.msrpMinor && deal.msrpMinor > deal.priceMinor
    ? deal.msrpMinor - deal.priceMinor
    : undefined;

  function nextDeal() {
    setIndex((current) => {
      if (deals.length <= 1) return 0;
      const step = 5;
      return (current + step) % deals.length;
    });
  }

  return (
    <section className={styles.luckyCard} aria-labelledby="bazaar-lucky-title">
      <div className={styles.luckyCopy}>
        <span className={styles.kickerInverse}>ΤΥΧΑΙΑ ΕΥΚΑΙΡΙΑ</span>
        <h2 id="bazaar-lucky-title">Άσε το BAZAAR να διαλέξει για σένα.</h2>
        <p>Ένα κλικ, μία άλλη ευκαιρία. Σαν να ψάχνεις σε πάγκο και ξαφνικά να βρίσκεις το λαβράκι.</p>
        <button type="button" className={styles.shuffleButton} onClick={nextDeal}>
          ↻ Δείξε μου άλλη
        </button>
      </div>

      <article className={styles.luckyProduct}>
        <Link href={`/bazaar/product/${encodeURIComponent(deal.slug)}`} className={styles.luckyImage}>
          <Image
            src={deal.imageSrc}
            alt={deal.title}
            fill
            sizes="(max-width: 720px) 88vw, 340px"
            style={{ objectFit: "contain" }}
          />
        </Link>
        <div className={styles.luckyProductBody}>
          <div className={styles.luckyMeta}>
            <span>{deal.conditionLabel}</span>
            {deal.savingsPercent ? <strong>−{deal.savingsPercent}%</strong> : null}
          </div>
          {deal.brand ? <p className={styles.brandText}>{deal.brand}</p> : null}
          <h3><Link href={`/bazaar/product/${encodeURIComponent(deal.slug)}`}>{deal.title}</Link></h3>
          <div className={styles.luckyPriceRow}>
            <span className={styles.bigPrice}>{euro(deal.priceMinor)}</span>
            {deal.msrpMinor && deal.msrpMinor > deal.priceMinor ? <s>{euro(deal.msrpMinor)}</s> : null}
          </div>
          {savedMinor ? <p className={styles.youSave}>Κερδίζεις {euro(savedMinor)}</p> : null}
        </div>
      </article>
    </section>
  );
}
