"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { HomepageHeroSlide } from "../lib/homepage-hero-runtime";
import styles from "./HomeHeroCarousel.module.css";

export function HomeHeroCarousel({ slides, children }: { slides: readonly HomepageHeroSlide[]; children: ReactNode }) {
  const visibleSlides = useMemo(() => slides.filter((slide) => slide.isVisible), [slides]);
  const total = visibleSlides.length + 1;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (active >= total) setActive(0);
  }, [active, total]);

  useEffect(() => {
    if (paused || total < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((value) => (value + 1) % total), 8000);
    return () => window.clearInterval(timer);
  }, [paused, total]);

  const legacyIndex = visibleSlides.length ? 1 : 0;
  const managedSlide =
    active === legacyIndex
      ? null
      : active === 0
        ? visibleSlides[0] ?? null
        : visibleSlides[active - 1] ?? null;

  function go(delta: number) {
    setActive((value) => (value + delta + total) % total);
  }

  return (
    <section
      className={styles.carousel}
      aria-label="Κύριες ανακοινώσεις"
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className={styles.stage} aria-live="polite">
        {managedSlide ? (
          managedSlide.linkUrl ? (
            <a className={styles.bannerLink} href={managedSlide.linkUrl} aria-label={managedSlide.title}>
              <img className={styles.bannerImage} src={managedSlide.imageUrl} alt={managedSlide.altText || managedSlide.title} width={1536} height={794} />
            </a>
          ) : (
            <img className={styles.bannerImage} src={managedSlide.imageUrl} alt={managedSlide.altText || managedSlide.title} width={1536} height={794} />
          )
        ) : children}
      </div>

      {total > 1 ? (
        <>
          <button className={`${styles.control} ${styles.previous}`} type="button" onClick={() => go(-1)} aria-label="Προηγούμενο banner">‹</button>
          <button className={`${styles.control} ${styles.next}`} type="button" onClick={() => go(1)} aria-label="Επόμενο banner">›</button>
          <div className={styles.dots} role="tablist" aria-label="Επιλογή banner">
            {Array.from({ length: total }, (_, index) => (
              <button
                key={index}
                type="button"
                className={`${styles.dot} ${active === index ? styles.dotActive : ""}`}
                onClick={() => setActive(index)}
                aria-label={`Banner ${index + 1} από ${total}`}
                aria-selected={active === index}
                role="tab"
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
