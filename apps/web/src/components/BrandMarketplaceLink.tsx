"use client";

import Link from "next/link";
import { useState } from "react";
import { publicBrandLogoUrl } from "../lib/brand-logo";
import styles from "./BrandMarketplaceLink.module.css";

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
    className={`${styles.root} ${variant === "card" ? styles.card : styles.detail}`}
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
  </Link>;
}
