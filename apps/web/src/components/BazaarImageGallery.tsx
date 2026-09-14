"use client";

import { useEffect, useMemo, useState } from "react";

type BazaarGalleryImage = Readonly<{
  src: string;
  alt: string;
}>;

type BazaarImageGalleryProps = Readonly<{
  images: readonly BazaarGalleryImage[];
  title: string;
  savingsPercent?: number;
}>;

function MagnifyIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <circle cx="10.8" cy="10.8" r="6.2" />
    <path d="m15.4 15.4 4.2 4.2" />
    <path d="M10.8 7.8v6M7.8 10.8h6" />
  </svg>;
}

function Chevron({ direction }: Readonly<{ direction: "left" | "right" }>) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
  </svg>;
}

export function BazaarImageGallery({ images, title, savingsPercent }: BazaarImageGalleryProps) {
  const safeImages = useMemo(() => images.filter((image) => image.src.trim().length > 0), [images]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);

  const selected = safeImages[selectedIndex] ?? safeImages[0];
  const hasMultiple = safeImages.length > 1;

  useEffect(() => {
    if (!zoomOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomOpen(false);
      if (event.key === "ArrowLeft" && hasMultiple) {
        setSelectedIndex((index) => (index - 1 + safeImages.length) % safeImages.length);
      }
      if (event.key === "ArrowRight" && hasMultiple) {
        setSelectedIndex((index) => (index + 1) % safeImages.length);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [hasMultiple, safeImages.length, zoomOpen]);

  if (!selected) return null;

  const previous = () => setSelectedIndex((index) => (index - 1 + safeImages.length) % safeImages.length);
  const next = () => setSelectedIndex((index) => (index + 1) % safeImages.length);

  return <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
    <div style={{ position: "relative", aspectRatio: "1 / 1", background: "#fff", borderRadius: 28, overflow: "hidden", minWidth: 0 }}>
      {savingsPercent ? <div style={{ position: "absolute", zIndex: 3, top: 18, right: 18, background: "#111", color: "#fff", borderRadius: 999, padding: "9px 13px", fontWeight: 900 }}>−{savingsPercent}%</div> : null}

      <button
        type="button"
        aria-label={`Μεγέθυνση εικόνας για ${title}`}
        onClick={() => setZoomOpen(true)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, padding: 0, background: "transparent", cursor: "zoom-in" }}
      >
        <img
          src={selected.src}
          alt={selected.alt}
          fetchPriority="high"
          decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "contain", padding: 24 }}
        />
      </button>

      <button
        type="button"
        aria-label="Άνοιγμα μεγεθυντικού φακού"
        title="Μεγέθυνση"
        onClick={() => setZoomOpen(true)}
        style={{ position: "absolute", zIndex: 4, left: 16, bottom: 16, width: 46, height: 46, borderRadius: 999, border: "1px solid rgba(0,0,0,.14)", background: "rgba(255,255,255,.94)", display: "grid", placeItems: "center", cursor: "zoom-in", boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}
      >
        <MagnifyIcon />
      </button>

      {hasMultiple ? <>
        <button type="button" aria-label="Προηγούμενη εικόνα" onClick={previous} style={{ position: "absolute", zIndex: 4, left: 12, top: "50%", transform: "translateY(-50%)", width: 42, height: 42, borderRadius: 999, border: "1px solid rgba(0,0,0,.12)", background: "rgba(255,255,255,.9)", display: "grid", placeItems: "center", cursor: "pointer" }}><Chevron direction="left" /></button>
        <button type="button" aria-label="Επόμενη εικόνα" onClick={next} style={{ position: "absolute", zIndex: 4, right: 12, top: "50%", transform: "translateY(-50%)", width: 42, height: 42, borderRadius: 999, border: "1px solid rgba(0,0,0,.12)", background: "rgba(255,255,255,.9)", display: "grid", placeItems: "center", cursor: "pointer" }}><Chevron direction="right" /></button>
      </> : null}
    </div>

    {hasMultiple ? <div aria-label="Εικόνες προϊόντος" style={{ display: "flex", gap: 9, overflowX: "auto", padding: "2px 2px 6px", scrollbarWidth: "thin" }}>
      {safeImages.map((image, index) => <button
        key={`${image.src}-${index}`}
        type="button"
        aria-label={`Εικόνα ${index + 1} από ${safeImages.length}`}
        aria-current={index === selectedIndex ? "true" : undefined}
        onClick={() => setSelectedIndex(index)}
        style={{ flex: "0 0 72px", width: 72, height: 72, padding: 4, borderRadius: 13, border: index === selectedIndex ? "2px solid #183c31" : "1px solid rgba(0,0,0,.14)", background: "#fff", cursor: "pointer", overflow: "hidden" }}
      >
        <img src={image.src} alt="" aria-hidden="true" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </button>)}
    </div> : null}

    {zoomOpen ? <div
      role="dialog"
      aria-modal="true"
      aria-label={`Μεγέθυνση εικόνων για ${title}`}
      onClick={(event) => { if (event.currentTarget === event.target) setZoomOpen(false); }}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(10,12,11,.94)", display: "grid", placeItems: "center", padding: "clamp(18px,4vw,48px)" }}
    >
      <button type="button" aria-label="Κλείσιμο μεγέθυνσης" onClick={() => setZoomOpen(false)} style={{ position: "absolute", top: 18, right: 18, width: 48, height: 48, borderRadius: 999, border: "1px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.12)", color: "#fff", fontSize: 30, lineHeight: 1, cursor: "pointer" }}>×</button>

      {hasMultiple ? <button type="button" aria-label="Προηγούμενη εικόνα" onClick={previous} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 50, height: 50, borderRadius: 999, border: "1px solid rgba(255,255,255,.28)", background: "rgba(255,255,255,.1)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}><Chevron direction="left" /></button> : null}

      <img src={selected.src} alt={selected.alt} style={{ width: "min(92vw,1400px)", height: "min(86vh,1100px)", objectFit: "contain" }} />

      {hasMultiple ? <button type="button" aria-label="Επόμενη εικόνα" onClick={next} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", width: 50, height: 50, borderRadius: 999, border: "1px solid rgba(255,255,255,.28)", background: "rgba(255,255,255,.1)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}><Chevron direction="right" /></button> : null}

      {hasMultiple ? <div style={{ position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)", color: "#fff", background: "rgba(0,0,0,.35)", borderRadius: 999, padding: "7px 11px", fontSize: 14 }}>{selectedIndex + 1} / {safeImages.length}</div> : null}
    </div> : null}
  </div>;
}
