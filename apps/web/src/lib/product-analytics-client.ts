"use client";

import { hasAnalyticsConsent } from "./privacy-consent";

export type ProductAnalyticsEventType = "page_view" | "engagement" | "add_to_cart";

type ProductAnalyticsPayload = Readonly<{
  eventType: ProductAnalyticsEventType;
  canonicalVariantId: string;
  eventId?: string;
  viewId?: string;
  engagedSeconds?: number;
  surface?: string;
}>;

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function recordProductAnalyticsEvent(payload: ProductAnalyticsPayload): void {
  if (typeof document === "undefined" || !hasAnalyticsConsent(document.cookie)) return;
  const body = JSON.stringify({ ...payload, eventId: payload.eventId ?? randomId() });
  void fetch("/api/analytics/product", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
    credentials: "same-origin"
  }).catch(() => undefined);
}
