"use client";

import { useEffect } from "react";
import { recordProductAnalyticsEvent } from "../lib/product-analytics-client";
import { googleAnalyticsItem, trackGoogleAnalyticsEvent } from "../lib/google-analytics-client";

const HEARTBEAT_SECONDS = 15;
const ACTIVE_WINDOW_MS = 60_000;

export function ProductAnalyticsTracker({ canonicalVariantId }: { canonicalVariantId: string }) {
  useEffect(() => {
    const viewId = globalThis.crypto?.randomUUID?.();
    if (!viewId) return;
    let lastActivityAt = Date.now();
    const markActivity = () => { lastActivityAt = Date.now(); };
    const active = () => document.visibilityState === "visible" && document.hasFocus() && Date.now() - lastActivityAt <= ACTIVE_WINDOW_MS;

    const productName = document.querySelector(".product-detail-copy h1")?.textContent?.trim() || document.title.replace(/\s*\|.*$/, "").trim() || canonicalVariantId;
    trackGoogleAnalyticsEvent("view_item", {
      currency: "EUR",
      items: [googleAnalyticsItem({ id: canonicalVariantId, name: productName, quantity: 1 })],
      surface: "product_page"
    });
    recordProductAnalyticsEvent({ eventType: "page_view", canonicalVariantId, viewId, surface: "product_page" });

    const interval = window.setInterval(() => {
      if (!active()) return;
      recordProductAnalyticsEvent({ eventType: "engagement", canonicalVariantId, viewId, engagedSeconds: HEARTBEAT_SECONDS, surface: "product_page" });
    }, HEARTBEAT_SECONDS * 1000);

    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "scroll", "touchstart"];
    for (const event of events) window.addEventListener(event, markActivity, { passive: true });
    return () => {
      window.clearInterval(interval);
      for (const event of events) window.removeEventListener(event, markActivity);
    };
  }, [canonicalVariantId]);
  return null;
}
