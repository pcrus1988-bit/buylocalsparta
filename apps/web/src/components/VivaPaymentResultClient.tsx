"use client";

import { useEffect } from "react";
import { useCart } from "./CartProvider";
import { googleAnalyticsCartPayload, readGoogleAnalyticsCart, trackGoogleAnalyticsEvent } from "../lib/google-analytics-client";

export function VivaPaymentResultClient({ confirmed, transactionId }: { confirmed: boolean; transactionId?: string }) {
  const { clear } = useCart();

  useEffect(() => {
    if (!confirmed) return;

    if (transactionId) {
      const dedupeKey = `kontamou-ga-purchase-${transactionId}`;
      let alreadySent = false;
      try { alreadySent = window.sessionStorage.getItem(dedupeKey) === "1"; } catch { /* fail soft */ }
      if (!alreadySent) {
        const cart = readGoogleAnalyticsCart();
        if (cart.length > 0) {
          trackGoogleAnalyticsEvent("purchase", {
            transaction_id: transactionId,
            ...googleAnalyticsCartPayload(cart),
            surface: "viva_confirmed_return"
          });
          try { window.sessionStorage.setItem(dedupeKey, "1"); } catch { /* fail soft */ }
        }
      }
    }

    clear();
    try { sessionStorage.removeItem("buy-local-sparta-checkout-v1"); } catch { /* fail soft */ }
  }, [confirmed, transactionId, clear]);

  return null;
}
