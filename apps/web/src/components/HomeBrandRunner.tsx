"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { publicBrandLogoUrl } from "../lib/brand-logo";

type HomepageBrand = Readonly<{
  name: string;
  logoObjectKey: string;
  productCount: number;
}>;

type HomepageBrandPayload = Readonly<{ brands?: unknown }>;

function safeBrands(payload: HomepageBrandPayload): readonly HomepageBrand[] {
  if (!Array.isArray(payload.brands)) return [];
  return payload.brands.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const record = value as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const logoObjectKey = typeof record.logoObjectKey === "string" ? record.logoObjectKey.trim() : "";
    const rawCount = Number(record.productCount);
    if (!name || !logoObjectKey) return [];
    return [{
      name,
      logoObjectKey,
      productCount: Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 0
    }];
  });
}

function BrandRunnerItem({ brand, duplicate = false }: { brand: HomepageBrand; duplicate?: boolean }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logoUrl = publicBrandLogoUrl(brand.logoObjectKey);
  const showLogo = Boolean(logoUrl) && !logoFailed;
  const title = brand.productCount > 0
    ? `${brand.name} · ${brand.productCount} προϊόντα`
    : brand.name;

  return (
    <Link
      className="brand-runner-item"
      href={`/shop?brand=${encodeURIComponent(brand.name)}`}
      aria-label={duplicate ? undefined : `Δες προϊόντα ${brand.name}`}
      title={duplicate ? undefined : title}
      tabIndex={duplicate ? -1 : undefined}
    >
      {showLogo ? (
        <img
          src={logoUrl}
          alt={duplicate ? "" : brand.name}
          loading="lazy"
          decoding="async"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <span>{brand.name}</span>
      )}
      <style jsx>{`
        .brand-runner-item {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          width: clamp(112px, 12vw, 168px);
          height: 38px;
          padding: 4px 8px;
          color: var(--ink, #173c34);
          opacity: .72;
          transition: opacity .18s ease, transform .18s ease;
        }
        .brand-runner-item:hover {
          opacity: 1;
          transform: translateY(-1px);
        }
        .brand-runner-item:focus-visible {
          opacity: 1;
          outline: 2px solid var(--brass, #a3834d);
          outline-offset: 4px;
          border-radius: 8px;
        }
        .brand-runner-item img {
          display: block;
          width: auto;
          height: auto;
          max-width: 100%;
          max-height: 30px;
          object-fit: contain;
          filter: grayscale(1);
        }
        .brand-runner-item span {
          display: block;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: Georgia, 'Times New Roman', serif;
          font-size: clamp(.92rem, 1.45vw, 1.12rem);
          letter-spacing: -.015em;
        }
        @media (max-width: 620px) {
          .brand-runner-item {
            width: 106px;
            height: 32px;
            padding-inline: 6px;
          }
          .brand-runner-item img { max-height: 24px; }
          .brand-runner-item span { font-size: .88rem; }
        }
      `}</style>
    </Link>
  );
}

export function HomeBrandRunner() {
  const [brands, setBrands] = useState<readonly HomepageBrand[]>([]);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/home/brands", {
      method: "GET",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal: controller.signal
    })
      .then(async (response) => response.ok ? await response.json() as HomepageBrandPayload : { brands: [] })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setBrands(safeBrands(payload));
        setResolved(true);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setBrands([]);
        setResolved(true);
      });

    return () => controller.abort();
  }, []);

  const visibleBrands = useMemo(() => brands.slice(0, 24), [brands]);

  if (resolved && visibleBrands.length === 0) return null;

  return (
    <section className={`brand-runner${visibleBrands.length ? " is-ready" : ""}`} aria-label="Brands στο ΚΟΝΤΑ ΜΟΥ">
      <div className="brand-runner-label">BRANDS ΣΤΟ ΚΟΝΤΑ ΜΟΥ</div>
      <div className="brand-runner-viewport">
        {visibleBrands.length ? (
          <div className="brand-runner-track">
            <div className="brand-runner-group">
              {visibleBrands.map((brand) => <BrandRunnerItem brand={brand} key={brand.name} />)}
            </div>
            <div className="brand-runner-group" aria-hidden="true">
              {visibleBrands.map((brand) => <BrandRunnerItem brand={brand} duplicate key={`duplicate-${brand.name}`} />)}
            </div>
          </div>
        ) : (
          <div className="brand-runner-loading" aria-hidden="true" />
        )}
      </div>

      <style jsx>{`
        .brand-runner {
          position: relative;
          width: 100%;
          min-height: 86px;
          padding: 13px 0 12px;
          overflow: hidden;
          border-top: 1px solid rgba(23, 60, 52, .09);
          border-bottom: 1px solid rgba(23, 60, 52, .09);
          background: rgba(251, 248, 239, .78);
        }
        .brand-runner-label {
          margin: 0 auto 8px;
          padding-inline: 20px;
          color: rgba(23, 60, 52, .58);
          font-size: .61rem;
          font-weight: 700;
          letter-spacing: .18em;
          text-align: center;
        }
        .brand-runner-viewport {
          width: 100%;
          min-height: 40px;
          overflow: hidden;
          -webkit-mask-image: linear-gradient(to right, transparent, #000 6%, #000 94%, transparent);
          mask-image: linear-gradient(to right, transparent, #000 6%, #000 94%, transparent);
        }
        .brand-runner-track {
          display: flex;
          align-items: center;
          width: max-content;
          animation: brand-runner-scroll 48s linear infinite;
          will-change: transform;
        }
        .brand-runner:hover .brand-runner-track,
        .brand-runner:focus-within .brand-runner-track {
          animation-play-state: paused;
        }
        .brand-runner-group {
          display: flex;
          align-items: center;
          flex: 0 0 auto;
          gap: clamp(18px, 2.6vw, 42px);
          padding-right: clamp(18px, 2.6vw, 42px);
        }
        .brand-runner-loading {
          width: min(82%, 720px);
          height: 26px;
          margin: 5px auto 0;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(23,60,52,.04), rgba(23,60,52,.10), rgba(23,60,52,.04));
          background-size: 220% 100%;
          animation: brand-runner-pulse 1.7s ease-in-out infinite;
        }
        @keyframes brand-runner-scroll {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
        }
        @keyframes brand-runner-pulse {
          0%, 100% { background-position: 100% 0; opacity: .55; }
          50% { background-position: 0 0; opacity: .9; }
        }
        @media (max-width: 620px) {
          .brand-runner {
            min-height: 76px;
            padding-block: 11px 10px;
          }
          .brand-runner-label {
            margin-bottom: 6px;
            font-size: .56rem;
            letter-spacing: .16em;
          }
          .brand-runner-viewport {
            min-height: 34px;
            -webkit-mask-image: linear-gradient(to right, transparent, #000 10%, #000 90%, transparent);
            mask-image: linear-gradient(to right, transparent, #000 10%, #000 90%, transparent);
          }
          .brand-runner-group {
            gap: 16px;
            padding-right: 16px;
          }
          .brand-runner-track { animation-duration: 38s; }
        }
        @media (prefers-reduced-motion: reduce) {
          .brand-runner-viewport {
            overflow-x: auto;
            -webkit-mask-image: none;
            mask-image: none;
            scrollbar-width: none;
          }
          .brand-runner-viewport::-webkit-scrollbar { display: none; }
          .brand-runner-track { animation: none; }
          .brand-runner-group[aria-hidden='true'] { display: none; }
          .brand-runner-loading { animation: none; }
        }
      `}</style>
    </section>
  );
}
