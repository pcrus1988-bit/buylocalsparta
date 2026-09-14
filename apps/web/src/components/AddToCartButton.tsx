"use client";

import { useCallback, useEffect, useState } from "react";
import { useCart } from "./CartProvider";
import { useCustomerMobileCommerce } from "./CustomerMobileCommerceNav";
import { recordProductAnalyticsEvent } from "../lib/product-analytics-client";
import { googleAnalyticsItem, trackGoogleAnalyticsEvent } from "../lib/google-analytics-client";
import { requestVariantPurchase } from "../lib/variant-purchase-events";

type AddToCartProduct = Readonly<{
  id: string;
  title: string;
  priceMinor: number;
  price: string;
  available: boolean;
  imageUrl?: string;
  imageAlt?: string;
  sku?: string;
  gtin?: string;
  color?: string;
  size?: string;
}>;

export function AddToCartButton({ product }: { product: AddToCartProduct }) {
  const { addItem } = useCart();
  const { registerProduct } = useCustomerMobileCommerce();
  const [added, setAdded] = useState(false);
  const [variantSheetAvailable, setVariantSheetAvailable] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 620px)");
    const update = () => {
      setVariantSheetAvailable(media.matches && Boolean(document.querySelector('[data-km-variant-sheet-trigger="true"]')));
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    registerProduct({ ...product, variantSheetAvailable });
    return () => registerProduct(undefined);
  }, [product, registerProduct, variantSheetAvailable]);

  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 1800);
    return () => window.clearTimeout(timer);
  }, [added]);

  const addCurrentProduct = useCallback(() => {
    if (variantSheetAvailable) {
      requestVariantPurchase("product_page");
      return;
    }
    if (!product.available) return;
    addItem({
      canonicalVariantId: product.id,
      title: product.title,
      priceMinor: product.priceMinor,
      price: product.price,
      imageUrl: product.imageUrl,
      imageAlt: product.imageAlt,
      sku: product.sku,
      gtin: product.gtin,
      color: product.color,
      size: product.size
    });
    recordProductAnalyticsEvent({ eventType: "add_to_cart", canonicalVariantId: product.id, surface: "product_page" });
    trackGoogleAnalyticsEvent("add_to_cart", {
      currency: "EUR",
      value: product.priceMinor / 100,
      items: [googleAnalyticsItem({ id: product.id, name: product.title, priceMinor: product.priceMinor, quantity: 1 })],
      surface: "product_page_desktop"
    });
    setAdded(true);
  }, [addItem, product, variantSheetAvailable]);

  const actionAvailable = product.available || variantSheetAvailable;
  const buttonLabel = !actionAvailable
    ? "Μη διαθέσιμο"
    : variantSheetAvailable
      ? "Επιλογή παραλλαγής"
      : added
        ? "Προστέθηκε ✓"
        : "Προσθήκη στο καλάθι";

  return <div className="add-to-cart-wrap">
    <button className="button" type="button" disabled={!actionAvailable} onClick={addCurrentProduct}>{buttonLabel}</button>
    <span className={`cart-add-toast${added ? " is-visible" : ""}`} role="status" aria-live="polite" aria-atomic="true">
      {added ? "Προστέθηκε στο καλάθι σου." : ""}
    </span>
  </div>;
}
