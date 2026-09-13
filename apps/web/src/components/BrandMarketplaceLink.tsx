"use client";

import Link from "next/link";
import { useState } from "react";
import { publicBrandLogoUrl } from "../lib/brand-logo";

type BrandMarketplaceLinkProps = Readonly<{
  brand: string;
  logoObjectKey?: string;
  variant?: "card" | "detail";
  eager?: boolean;
}>;

export function BrandMarketplaceLink({ brand, logoObjectKey, variant = "card", eager = false }: BrandMarketplaceLinkProps) {
  const logoUrl = publicBrandLogoUrl(logoObjectKey);
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = Boolean(logoUrl) && !logoFailed;
  const href = `/shop?brand=${encodeURIComponent(brand)}`;

  return <Link
    href={href}
    className={`brand-marketplace-link brand-marketplace-link-${variant}`}
    aria-label={`Όλα τα προϊόντα ${brand}`}
    title={`Όλα τα προϊόντα ${brand}`}
  >
    {showLogo ? <img
      src={logoUrl}
      alt={brand}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setLogoFailed(true)}
    /> : <span>{brand}</span>}
    <style jsx>{`
      .brand-marketplace-link {
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        flex: 0 0 auto;
        min-width: 0;
        max-width: 100%;
        border-radius: 7px;
        color: var(--ink);
        transition: opacity .18s ease;
      }
      .brand-marketplace-link:hover { opacity: .68; }
      .brand-marketplace-link:focus-visible {
        outline: 3px solid var(--brass);
        outline-offset: 3px;
      }
      .brand-marketplace-link img {
        display: block;
        width: auto;
        object-fit: contain;
      }
      .brand-marketplace-link span {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: Georgia, 'Times New Roman', serif;
        font-weight: 500;
      }
      .brand-marketplace-link-card {
        height: 28px;
        max-width: 132px;
      }
      .brand-marketplace-link-card img {
        height: 28px;
        max-width: 132px;
      }
      .brand-marketplace-link-card span {
        max-width: 132px;
        font-size: 27px;
        line-height: 1.04;
        letter-spacing: -.02em;
      }
      .brand-marketplace-link-detail {
        height: clamp(52px, 6vw, 86px);
        max-width: min(220px, 36vw);
      }
      .brand-marketplace-link-detail img {
        height: clamp(52px, 6vw, 86px);
        max-width: min(220px, 36vw);
      }
      .brand-marketplace-link-detail span {
        max-width: min(220px, 36vw);
        font-size: clamp(52px, 6vw, 86px);
        line-height: .96;
        letter-spacing: -.05em;
      }
      @media (max-width: 620px) {
        .brand-marketplace-link-card,
        .brand-marketplace-link-card img,
        .brand-marketplace-link-card span { max-width: 118px; }
        .brand-marketplace-link-detail,
        .brand-marketplace-link-detail img,
        .brand-marketplace-link-detail span { max-width: 34vw; }
      }
    `}</style>
  </Link>;
}
