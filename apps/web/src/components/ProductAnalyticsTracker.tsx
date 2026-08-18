"use client";

import { useEffect } from "react";
import { recordProductAnalyticsEvent } from "../lib/product-analytics-client";

const HEARTBEAT_SECONDS = 15;
const ACTIVE_WINDOW_MS = 60_000;

export function ProductAnalyticsTracker({ canonicalVariantId }: { canonicalVariantId: string }) {
  useEffect(() => {
    const viewId = crypto.randomUUID();
    let lastActivityAt = Date.now();

    const markActivity = () => { lastActivityAt = Date.now(); };
    const active = () => document.visibilityState === "visible" && document.hasFocus() && Date.now() - lastActivityAt <= ACTIVE_WINDOW_MS;

    recordProductAnalyticsEvent({ eventType: "page_view", canonicalVariantId, viewId, surface: "product_page" });

    const interval = window.setInterval(() => {
      if (!active()) return;
      recordProductAnalyticsEvent({
        eventType: "engagement",
        canonicalVariantId,
        viewId,
        engagedSeconds: HEARTBEAT_SECONDS,
        surface: "product_page"
      });
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
