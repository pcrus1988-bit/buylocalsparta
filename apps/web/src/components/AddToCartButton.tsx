"use client";

import { useState } from "react";
import { useCart } from "./CartProvider";
import { ProductAnalyticsTracker } from "./ProductAnalyticsTracker";
import { recordProductAnalyticsEvent } from "../lib/product-analytics-client";

export function AddToCartButton({ product }: { product: { id: string; title: string; priceMinor: number; price: string; available: boolean } }) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  return <>
    <ProductAnalyticsTracker canonicalVariantId={product.id} />
    <button className="button" type="button" disabled={!product.available} onClick={() => {
      addItem({ canonicalVariantId: product.id, title: product.title, priceMinor: product.priceMinor, price: product.price });
      recordProductAnalyticsEvent({ eventType: "add_to_cart", canonicalVariantId: product.id, surface: "product_page" });
      setAdded(true);
      window.setTimeout(() => setAdded(false), 1400);
    }}>{!product.available ? "Μη διαθέσιμο" : added ? "Προστέθηκε ✓" : "Προσθήκη στο καλάθι"}</button>
  </>;
}
