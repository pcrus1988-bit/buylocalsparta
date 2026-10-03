"use client";

import { BrandMarketplaceLink } from "./BrandMarketplaceLink";

export function ProductBrandTitle({ title, brand, logoObjectKey }: Readonly<{
  title: string;
  brand?: string;
  logoObjectKey?: string;
}>) {
  return <div className="product-brand-title-row">
    {brand ? <BrandMarketplaceLink brand={brand} logoObjectKey={logoObjectKey} variant="detail" eager /> : null}
    <h1>{title}</h1>
    <style jsx>{`
      .product-brand-title-row {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        min-width: 0;
        margin: 8px 0 14px;
      }
      .product-brand-title-row h1 {
        flex: 1 1 auto;
        min-width: 0;
        margin: 0;
        font-size: clamp(28px, 3.2vw, 42px);
        line-height: 1.02;
        letter-spacing: -0.035em;
      }
      @media (max-width: 620px) {
        .product-brand-title-row { gap: 9px; margin-bottom: 12px; }
        .product-brand-title-row h1 { font-size: clamp(27px, 8vw, 34px); }
      }
    `}</style>
  </div>;
}
