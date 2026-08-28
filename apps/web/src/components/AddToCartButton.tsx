"use client";

import { useEffect, useState } from "react";
import { useCart } from "./CartProvider";
import { useCustomerMobileCommerce } from "./CustomerMobileCommerceNav";
import { recordProductAnalyticsEvent } from "../lib/product-analytics-client";
import { googleAnalyticsItem, trackGoogleAnalyticsEvent } from "../lib/google-analytics-client";

export function AddToCartButton({ product }: { product: { id: string; title: string; priceMinor: number; price: string; available: boolean } }) {
  const { addItem } = useCart();
  const { registerProduct } = useCustomerMobileCommerce();
  const [added, setAdded] = useState(false);

  useEffect(() => {
    registerProduct(product);
    return () => registerProduct(undefined);
  }, [product, registerProduct]);

  return <button className="button" type="button" disabled={!product.available} onClick={() => {
    addItem({ canonicalVariantId: product.id, title: product.title, priceMinor: product.priceMinor, price: product.price });
    recordProductAnalyticsEvent({ eventType: "add_to_cart", canonicalVariantId: product.id, surface: "product_page" });
    trackGoogleAnalyticsEvent("add_to_cart", {
      currency: "EUR",
      value: product.priceMinor / 100,
      items: [googleAnalyticsItem({ id: product.id, name: product.title, priceMinor: product.priceMinor, quantity: 1 })],
      surface: "product_page_desktop"
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
  }}>{!product.available ? "Μη διαθέσιμο" : added ? "Προστέθηκε ✓" : "Προσθήκη στο καλάθι"}</button>;
}
