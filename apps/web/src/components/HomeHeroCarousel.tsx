"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import type { HomepageHeroSlide } from "../lib/homepage-hero-runtime";
import styles from "./HomeHeroCarousel.module.css";

/**
 * The marketplace promise, locality and search are the primary homepage hero and
 * must never disappear behind a rotating campaign banner. Admin-managed campaign
 * imagery therefore sits in a secondary horizontal rail below the core hero.
 * Legacy seed artwork is intentionally excluded from this live campaign rail.
 */
export function HomeHeroCarousel({ slides, children }: { slides: readonly HomepageHeroSlide[]; children: ReactNode }) {
  const campaigns = useMemo(
    () => slides.filter((slide) => slide.isVisible && !slide.isSeed),
    [slides]
  );

  return (
    <div className={styles.heroExperience}>
      <div className={styles.stage}>{children}</div>
      {campaigns.length ? (
        <section className={styles.campaigns} aria-label="Τρέχουσες προτάσεις και ανακοινώσεις">
          <div className={styles.campaignRail}>
            {campaigns.map((slide) => {
              const image = <img className={styles.bannerImage} src={slide.imageUrl} alt={slide.altText || slide.title} width={1536} height={794} loading="lazy" decoding="async" />;
              return slide.linkUrl ? (
                <a className={styles.campaignCard} href={slide.linkUrl} key={slide.id} aria-label={slide.title}>{image}</a>
              ) : (
                <div className={styles.campaignCard} key={slide.id}>{image}</div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
