"use client";

import Link from "next/link";
import { useState } from "react";
import { publicBrandLogoUrl } from "../lib/brand-logo";

type BrandMarketplaceLinkProps = Readonly<{
  brand: string;
  logoObjectKey?: string;
  variant?: "card" | "detail";
  eager?: boolean;
  href?: string;
  ariaLabel?: string;
  linkTitle?: string;
}>;

export function BrandMarketplaceLink({
  brand,
  logoObjectKey,
  variant = "card",
  eager = false,
  href,
  ariaLabel,
  linkTitle
}: BrandMarketplaceLinkProps) {
  const logoUrl = publicBrandLogoUrl(logoObjectKey);
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = Boolean(logoUrl) && !logoFailed;
  const targetHref = href ?? `/shop?brand=${encodeURIComponent(brand)}`;
  const defaultLabel = `Όλα τα προϊόντα ${brand}`;

  return <Link
    href={targetHref}
    className={`brand-marketplace-link brand-marketplace-link-${variant}`}
    aria-label={ariaLabel ?? defaultLabel}
    title={linkTitle ?? defaultLabel}
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
        flex: 0 0 auto;
        min-width: 0;
        max-width: 100%;
        border-radius: 7px;
        color: var(--ink);
        transition: opacity .18s ease, box-shadow .18s ease;
      }
      .brand-marketplace-link:hover { opacity: .76; }
      .brand-marketplace-link:focus-visible {
        outline: 3px solid var(--brass);
        outline-offset: 3px;
      }
      .brand-marketplace-link img {
        display: block;
        width: auto;
        height: auto;
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
        width: 64px;
        height: 24px;
        padding: 5px 6px;
        justify-content: center;
        overflow: hidden;
        border: 1px solid rgba(13, 43, 35, .12);
        background: rgba(255, 255, 255, .92);
        box-shadow: 0 3px 10px rgba(13, 43, 35, .08);
      }
      .brand-marketplace-link-card img {
        width: auto;
        height: auto;
        max-width: 50px;
        max-height: 10px;
      }
      .brand-marketplace-link-card span {
        max-width: 50px;
        font-size: 10px;
        line-height: 1;
        text-align: center;
        letter-spacing: -.01em;
      }
      .brand-marketplace-link-detail {
        justify-content: flex-start;
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
        .brand-marketplace-link-card {
          width: 60px;
          height: 23px;
          padding-inline: 5px;
        }
        .brand-marketplace-link-card img,
        .brand-marketplace-link-card span {
          max-width: 48px;
        }
        .brand-marketplace-link-card img { max-height: 10px; }
        .brand-marketplace-link-detail,
        .brand-marketplace-link-detail img,
        .brand-marketplace-link-detail span { max-width: 34vw; }
      }
    `}</style>
  </Link>;
}
