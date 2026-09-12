"use client";

import { useEffect, useState } from "react";

export type ProductMediaGalleryImage = Readonly<{
  id: string;
  src: string;
  alt: string;
}>;

type ProductMediaGalleryProps = Readonly<{
  images: readonly ProductMediaGalleryImage[];
  badge: string;
  placeholderLabel: string;
  placeholderSymbol: string;
  artClass?: string;
}>;

const iconButtonStyle = {
  position: "absolute",
  zIndex: 4,
  width: 42,
  height: 42,
  borderRadius: 999,
  border: "1px solid rgba(17, 24, 39, 0.16)",
  background: "rgba(255,255,255,0.94)",
  color: "#111827",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)"
} as const;

function MagnifierIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M11 8v6M8 11h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function Chevron({ direction }: Readonly<{ direction: "left" | "right" }>) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={direction === "left" ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ProductMediaGallery({ images, badge, placeholderLabel, placeholderSymbol, artClass = "" }: ProductMediaGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const imageCount = images.length;
  const activeImage = images[activeIndex] ?? images[0];

  const selectIndex = (index: number) => {
    if (!imageCount) return;
    const normalized = (index + imageCount) % imageCount;
    setActiveIndex(normalized);
    setZoom(1);
  };

  useEffect(() => {
    if (!lightboxOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowLeft") selectIndex(activeIndex - 1);
      if (event.key === "ArrowRight") selectIndex(activeIndex + 1);
      if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(3, value + 0.5));
      if (event.key === "-") setZoom((value) => Math.max(1, value - 0.5));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeIndex, imageCount, lightboxOpen]);

  return (
    <div style={{ display: "grid", gap: 12, alignSelf: "start", minWidth: 0 }}>
      <div className={`product-detail-art ${artClass}`} style={{ position: "relative", overflow: "hidden" }}>
        {!activeImage ? <span className="detail-category">{placeholderLabel}</span> : null}
        {!activeImage ? <span className="detail-symbol" aria-hidden="true">{placeholderSymbol}</span> : null}
        {activeImage ? (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label="Άνοιγμα φωτογραφίας σε μεγέθυνση"
            style={{ position: "absolute", inset: 0, border: 0, padding: 0, margin: 0, background: "#fff", cursor: "zoom-in", zIndex: 1 }}
          >
            <img
              src={activeImage.src}
              alt={activeImage.alt}
              loading="eager"
              fetchPriority="high"
              draggable={false}
              style={{ width: "100%", height: "100%", objectFit: "contain", padding: 18, display: "block", background: "#fff" }}
            />
          </button>
        ) : null}

        {activeImage ? (
          <button
            type="button"
            aria-label="Μεγέθυνση φωτογραφίας"
            title="Μεγέθυνση"
            onClick={() => setLightboxOpen(true)}
            style={{ ...iconButtonStyle, top: 14, right: 14 }}
          >
            <MagnifierIcon />
          </button>
        ) : null}

        {imageCount > 1 ? (
          <>
            <button type="button" aria-label="Προηγούμενη φωτογραφία" onClick={() => selectIndex(activeIndex - 1)} style={{ ...iconButtonStyle, left: 12, top: "50%", transform: "translateY(-50%)" }}>
              <Chevron direction="left" />
            </button>
            <button type="button" aria-label="Επόμενη φωτογραφία" onClick={() => selectIndex(activeIndex + 1)} style={{ ...iconButtonStyle, right: 12, top: "50%", transform: "translateY(-50%)" }}>
              <Chevron direction="right" />
            </button>
            <span style={{ position: "absolute", zIndex: 4, right: 14, bottom: 14, borderRadius: 999, padding: "6px 10px", background: "rgba(17,24,39,.78)", color: "#fff", fontSize: 12, fontWeight: 800 }}>
              {activeIndex + 1} / {imageCount}
            </span>
          </>
        ) : null}

        <span className="product-badge" style={{ zIndex: 5 }}>{badge}</span>
      </div>

      {imageCount > 1 ? (
        <div aria-label="Φωτογραφίες προϊόντος" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 2px 6px", scrollSnapType: "x proximity" }}>
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              aria-label={`Προβολή φωτογραφίας ${index + 1} από ${imageCount}`}
              aria-current={index === activeIndex ? "true" : undefined}
              onClick={() => selectIndex(index)}
              style={{
                position: "relative",
                flex: "0 0 78px",
                width: 78,
                height: 78,
                overflow: "hidden",
                border: index === activeIndex ? "2px solid currentColor" : "1px solid var(--line)",
                borderRadius: 12,
                background: "#fff",
                cursor: "pointer",
                padding: 4,
                scrollSnapAlign: "start"
              }}
            >
              <img src={image.src} alt="" loading="lazy" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
            </button>
          ))}
        </div>
      ) : null}

      {lightboxOpen && activeImage ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Μεγέθυνση φωτογραφιών προϊόντος"
          onClick={(event) => { if (event.target === event.currentTarget) setLightboxOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(8, 12, 20, .94)", display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto", gap: 12, padding: "max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left))" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, color: "#fff" }}>
            <strong>{activeIndex + 1} / {imageCount}</strong>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setZoom((value) => value >= 2.5 ? 1 : value + 0.75)} aria-label={zoom > 1 ? "Αλλαγή επιπέδου μεγέθυνσης" : "Μεγέθυνση"} style={{ ...iconButtonStyle, position: "static" }}>
                <MagnifierIcon />
              </button>
              <button type="button" onClick={() => setLightboxOpen(false)} aria-label="Κλείσιμο" style={{ ...iconButtonStyle, position: "static", fontSize: 28, lineHeight: 1 }}>×</button>
            </div>
          </div>

          <div style={{ position: "relative", minHeight: 0, overflow: zoom > 1 ? "auto" : "hidden", display: "grid", placeItems: "center" }}>
            <img
              src={activeImage.src}
              alt={activeImage.alt}
              draggable={false}
              onDoubleClick={() => setZoom((value) => value > 1 ? 1 : 2)}
              style={{ maxWidth: zoom === 1 ? "100%" : "none", maxHeight: zoom === 1 ? "100%" : "none", width: zoom === 1 ? "auto" : `${zoom * 100}%`, height: zoom === 1 ? "100%" : "auto", objectFit: "contain", transformOrigin: "center", cursor: zoom > 1 ? "zoom-out" : "zoom-in", userSelect: "none" }}
            />
            {imageCount > 1 ? (
              <>
                <button type="button" aria-label="Προηγούμενη φωτογραφία" onClick={() => selectIndex(activeIndex - 1)} style={{ ...iconButtonStyle, left: 10, top: "50%", transform: "translateY(-50%)" }}><Chevron direction="left" /></button>
                <button type="button" aria-label="Επόμενη φωτογραφία" onClick={() => selectIndex(activeIndex + 1)} style={{ ...iconButtonStyle, right: 10, top: "50%", transform: "translateY(-50%)" }}><Chevron direction="right" /></button>
              </>
            ) : null}
          </div>

          {imageCount > 1 ? (
            <div style={{ display: "flex", gap: 8, overflowX: "auto", justifyContent: imageCount <= 6 ? "center" : "flex-start", paddingTop: 4 }}>
              {images.map((image, index) => (
                <button key={`lightbox-${image.id}`} type="button" onClick={() => selectIndex(index)} aria-label={`Φωτογραφία ${index + 1}`} style={{ width: 66, height: 66, flex: "0 0 66px", borderRadius: 10, border: index === activeIndex ? "2px solid #fff" : "1px solid rgba(255,255,255,.35)", padding: 3, background: "rgba(255,255,255,.08)", cursor: "pointer" }}>
                  <img src={image.src} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                </button>
              ))}
            </div>
          ) : <span />}
        </div>
      ) : null}
    </div>
  );
}
