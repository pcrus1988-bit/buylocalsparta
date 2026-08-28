"use client";

import { hasAnalyticsConsent } from "./privacy-consent";

export const GOOGLE_ANALYTICS_ID = "G-NC8QWH2WTD";
export const GOOGLE_ANALYTICS_SCRIPT_ID = "kontamou-google-analytics";
const CART_STORAGE_KEY = "buy-local-sparta-cart-v1";

const PRIVATE_EXACT_PATHS = new Set(["/vendor"]);
const PRIVATE_PREFIXES = [
  "/admin",
  "/driver",
  "/delivery/manage",
  "/daily",
  "/vendor/login",
  "/vendor/advice",
  "/vendor/analytics",
  "/vendor/catalog",
  "/vendor/daily-access",
  "/vendor/finance",
  "/vendor/notifications",
  "/vendor/orders",
  "/vendor/pickup",
  "/vendor/reports",
  "/vendor/returns",
  "/vendor/shipping",
  "/vendor/storefront",
  "/vendor/trust"
] as const;

type GoogleAnalyticsWindow = Window & typeof globalThis & {
  dataLayer?: IArguments[];
  gtag?: (...args: unknown[]) => void;
  __kontamouGaInitialized?: boolean;
  [key: `ga-disable-${string}`]: boolean | undefined;
};

export type GoogleAnalyticsItem = Readonly<{
  item_id: string;
  item_name: string;
  price?: number;
  quantity?: number;
  item_brand?: string;
  item_category?: string;
  item_variant?: string;
  vendor_id?: string;
}>;

export type GoogleAnalyticsCartItem = Readonly<{
  canonicalVariantId: string;
  title: string;
  priceMinor: number;
  quantity: number;
  brand?: string;
  category?: string;
  variant?: string;
  vendorId?: string;
}>;

export function isGoogleAnalyticsPublicPath(pathname: string): boolean {
  const normalized = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  if (PRIVATE_EXACT_PATHS.has(normalized)) return false;
  return !PRIVATE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function analyticsWindow(): GoogleAnalyticsWindow {
  return window as GoogleAnalyticsWindow;
}

export function ensureGoogleAnalytics(): GoogleAnalyticsWindow | undefined {
  if (typeof window === "undefined" || typeof document === "undefined") return undefined;
  if (!hasAnalyticsConsent(document.cookie) || !isGoogleAnalyticsPublicPath(window.location.pathname)) return undefined;

  const target = analyticsWindow();
  target.dataLayer = target.dataLayer ?? [];
  target.gtag = target.gtag ?? function gtag(..._args: unknown[]) {
    target.dataLayer?.push(arguments);
  };
  target[`ga-disable-${GOOGLE_ANALYTICS_ID}`] = false;

  if (!target.__kontamouGaInitialized) {
    target.__kontamouGaInitialized = true;
    target.gtag("consent", "default", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
    target.gtag("js", new Date());
    target.gtag("config", GOOGLE_ANALYTICS_ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
  } else {
    target.gtag("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
  }

  if (!document.getElementById(GOOGLE_ANALYTICS_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = GOOGLE_ANALYTICS_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_ANALYTICS_ID)}`;
    document.head.appendChild(script);
  }

  return target;
}

export function trackGoogleAnalyticsEvent(eventName: string, parameters: Record<string, unknown> = {}): void {
  const target = ensureGoogleAnalytics();
  target?.gtag?.("event", eventName, parameters);
}

export function googleAnalyticsItem(input: Readonly<{
  id: string;
  name: string;
  priceMinor?: number;
  quantity?: number;
  brand?: string;
  category?: string;
  variant?: string;
  vendorId?: string;
}>): GoogleAnalyticsItem {
  return {
    item_id: input.id,
    item_name: input.name,
    price: Number.isSafeInteger(input.priceMinor) ? input.priceMinor! / 100 : undefined,
    quantity: input.quantity,
    item_brand: input.brand,
    item_category: input.category,
    item_variant: input.variant,
    vendor_id: input.vendorId
  };
}

export function readGoogleAnalyticsCart(): readonly GoogleAnalyticsCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value): GoogleAnalyticsCartItem[] => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      if (typeof item.canonicalVariantId !== "string" || !item.canonicalVariantId
        || typeof item.title !== "string" || !item.title
        || typeof item.priceMinor !== "number" || !Number.isSafeInteger(item.priceMinor) || item.priceMinor < 0
        || typeof item.quantity !== "number" || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) return [];
      return [{
        canonicalVariantId: item.canonicalVariantId,
        title: item.title,
        priceMinor: item.priceMinor,
        quantity: Math.min(99, item.quantity),
        brand: typeof item.brand === "string" ? item.brand : undefined,
        category: typeof item.category === "string" ? item.category : undefined,
        variant: typeof item.variant === "string" ? item.variant : undefined,
        vendorId: typeof item.vendorId === "string" ? item.vendorId : undefined
      }];
    });
  } catch {
    return [];
  }
}

export function googleAnalyticsCartPayload(items: readonly GoogleAnalyticsCartItem[]) {
  return {
    currency: "EUR",
    value: items.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0) / 100,
    items: items.map((item) => googleAnalyticsItem({
      id: item.canonicalVariantId,
      name: item.title,
      priceMinor: item.priceMinor,
      quantity: item.quantity,
      brand: item.brand,
      category: item.category,
      variant: item.variant,
      vendorId: item.vendorId
    }))
  };
}
