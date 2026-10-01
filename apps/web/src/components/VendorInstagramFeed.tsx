"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicVendorInstagramMedia } from "../lib/vendor-instagram-service";
import type { VendorInstagramSettings } from "../lib/vendor-storefront-settings";
import styles from "./VendorInstagramFeed.module.css";

type FeedPayload = Readonly<{
  username: string;
  profilePictureUrl?: string;
  settings: VendorInstagramSettings;
  items: readonly PublicVendorInstagramMedia[];
}>;

export function VendorInstagramFeed(props: {
  vendorId: string;
  vendorName: string;
  sectionTitle: string;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef(new Map<number, HTMLVideoElement>());
  const [shouldLoad, setShouldLoad] = useState(false);
  const [payload, setPayload] = useState<FeedPayload>();
  const [activeIndex, setActiveIndex] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || shouldLoad) return;
    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: "700px 0px" });
    observer.observe(root);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    if (!shouldLoad || payload || error) return;
    const controller = new AbortController();
    fetch(`/api/public/vendor/${encodeURIComponent(props.vendorId)}/instagram`, {
      signal: controller.signal,
      headers: { accept: "application/json" }
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("feed_unavailable");
        return response.json() as Promise<FeedPayload>;
      })
      .then((feed) => {
        if (!feed.items?.length) throw new Error("feed_empty");
        setPayload(feed);
      })
      .catch((cause) => {
        if ((cause as Error)?.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [error, payload, props.vendorId, shouldLoad]);

  const settings = payload?.settings;
  const items = payload?.items ?? [];
  const activeItem = items[activeIndex];
  const instagramHref = payload?.username ? `https://www.instagram.com/${payload.username}/` : undefined;

  useEffect(() => {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    videoRefs.current.forEach((video, index) => {
      video.muted = index !== activeIndex || !soundOn;
      if (index === activeIndex && settings?.autoplay && !reducedMotion) {
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    });
  }, [activeIndex, settings?.autoplay, soundOn]);

  useEffect(() => {
    if (settings) setSoundOn(settings.muted === false);
  }, [settings?.muted]);

  const move = useCallback((direction: -1 | 1) => {
    if (!items.length) return;
    const next = (activeIndex + direction + items.length) % items.length;
    setActiveIndex(next);
    setSoundOn(false);
    const track = trackRef.current;
    const child = track?.children.item(next) as HTMLElement | null;
    child?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeIndex, items.length]);

  const onTrackScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track || window.innerWidth > 760) return;
    const center = track.scrollLeft + track.clientWidth / 2;
    let closest = 0;
    let distance = Number.POSITIVE_INFINITY;
    Array.from(track.children).forEach((node, index) => {
      const element = node as HTMLElement;
      const itemCenter = element.offsetLeft + element.offsetWidth / 2;
      const delta = Math.abs(itemCenter - center);
      if (delta < distance) {
        distance = delta;
        closest = index;
      }
    });
    if (closest !== activeIndex) {
      setActiveIndex(closest);
      setSoundOn(false);
    }
  }, [activeIndex]);

  const layoutClass = useMemo(() => {
    if (settings?.desktopLayout === "carousel") return styles.carousel;
    return styles.spotlight;
  }, [settings?.desktopLayout]);

  return <section ref={rootRef} className={styles.section} aria-labelledby="vendor-instagram-title">
    <div className={styles.header}>
      <div>
        <div className={styles.eyebrow}>Instagram · @{payload?.username ?? props.vendorName}</div>
        <h2 id="vendor-instagram-title">{settings?.sectionTitle || props.sectionTitle}</h2>
      </div>
      {instagramHref && <a className={styles.profileLink} href={instagramHref} target="_blank" rel="noreferrer">Άνοιξε στο Instagram ↗</a>}
    </div>

    {!payload && !error && <div className={styles.skeleton} aria-label="Φόρτωση Instagram">
      <div /><div /><div />
    </div>}

    {payload && items.length > 0 && <div className={layoutClass}>
      <button className={styles.arrow} type="button" onClick={() => move(-1)} aria-label="Προηγούμενο Instagram">‹</button>
      <div
        ref={trackRef}
        className={`${styles.track} ${settings?.mobileLayout === "carousel" ? styles.mobileCarousel : styles.mobileReels}`}
        onScroll={onTrackScroll}
      >
        {items.map((item, index) => <article
          className={`${styles.card} ${index === activeIndex ? styles.cardActive : ""}`}
          key={item.id}
          aria-current={index === activeIndex ? "true" : undefined}
        >
          <div className={styles.media}>
            {item.mediaType === "VIDEO" ? <video
              ref={(node) => {
                if (node) videoRefs.current.set(index, node);
                else videoRefs.current.delete(index);
              }}
              src={item.mediaUrl}
              poster={item.thumbnailUrl}
              muted
              playsInline
              loop
              preload={Math.abs(index - activeIndex) <= 1 ? "metadata" : "none"}
              autoPlay={Boolean(settings?.autoplay && index === activeIndex)}
              aria-label={item.caption || `Instagram Reel από ${props.vendorName}`}
            /> : <img
              src={item.mediaUrl}
              alt={item.caption || `Instagram δημοσίευση από ${props.vendorName}`}
              loading={index < 2 ? "eager" : "lazy"}
            />}
            <div className={styles.mediaShade} />
            <div className={styles.topBadge}>Instagram</div>
            {item.mediaType === "VIDEO" && index === activeIndex && <button
              className={styles.soundButton}
              type="button"
              onClick={() => setSoundOn((current) => !current)}
              aria-label={soundOn ? "Σίγαση βίντεο" : "Ενεργοποίηση ήχου"}
            >{soundOn ? "🔊" : "🔇"}</button>}
            <div className={styles.caption}>
              <strong>@{payload.username}</strong>
              {item.caption && <p>{item.caption}</p>}
              <a href={item.permalink} target="_blank" rel="noreferrer">Δες τη δημοσίευση ↗</a>
            </div>
          </div>
        </article>)}
      </div>
      <button className={styles.arrow} type="button" onClick={() => move(1)} aria-label="Επόμενο Instagram">›</button>
      <div className={styles.mobileCounter} aria-live="polite">{activeIndex + 1} / {items.length}</div>
    </div>}

    {payload && activeItem && <div className={styles.desktopMeta}>
      <span>{activeIndex + 1} / {items.length}</span>
      <span>{activeItem.mediaProductType === "REELS" ? "Reel" : "Post"}</span>
    </div>}
  </section>;
}
