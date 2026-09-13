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
        gap: 14px;
        min-width: 0;
        margin: 12px 0 25px;
      }
      .product-brand-title-row h1 {
        flex: 1 1 auto;
        min-width: 0;
        margin: 0;
      }
      @media (max-width: 620px) {
        .product-brand-title-row { gap: 11px; }
      }
    `}</style>
  </div>;
}
