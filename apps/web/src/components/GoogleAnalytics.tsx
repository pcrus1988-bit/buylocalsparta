"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  GOOGLE_ANALYTICS_ID,
  ensureGoogleAnalytics,
  googleAnalyticsCartPayload,
  isGoogleAnalyticsPublicPath,
  readGoogleAnalyticsCart
} from "../lib/google-analytics-client";

type GoogleAnalyticsWindow = Window & typeof globalThis & {
  gtag?: (...args: unknown[]) => void;
  [key: `ga-disable-${string}`]: boolean | undefined;
};

function analyticsWindow(): GoogleAnalyticsWindow {
  return window as GoogleAnalyticsWindow;
}

function expireCookie(name: string, domain?: string): void {
  const domainPart = domain ? `; Domain=${domain}` : "";
  document.cookie = `${name}=; Max-Age=0; Path=/${domainPart}; SameSite=Lax`;
}

function expireGoogleAnalyticsCookies(): void {
  const hostname = window.location.hostname;
  for (const part of document.cookie.split(";")) {
    const separator = part.indexOf("=");
    const name = (separator >= 0 ? part.slice(0, separator) : part).trim();
    if (name !== "_ga" && !name.startsWith("_ga_")) continue;
    expireCookie(name);
    expireCookie(name, hostname);
    if (hostname === "kontamou.site" || hostname.endsWith(".kontamou.site")) expireCookie(name, ".kontamou.site");
  }
}

function disableGoogleAnalyticsForCurrentRoute(): void {
  const target = analyticsWindow();
  target[`ga-disable-${GOOGLE_ANALYTICS_ID}`] = true;
  target.gtag?.("consent", "update", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  });
}

function GoogleAnalyticsInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  useEffect(() => {
    if (!isGoogleAnalyticsPublicPath(pathname)) {
      disableGoogleAnalyticsForCurrentRoute();
      return;
    }

    const target = ensureGoogleAnalytics();
    if (!target?.gtag) return;

    target.gtag("event", "page_view", {
      page_title: document.title,
      page_location: window.location.href,
      page_path: `${pathname}${window.location.search}`
    });

    if (pathname === "/shop") {
      const searchTerm = searchParams.get("q")?.trim();
      if (searchTerm) {
        target.gtag("event", "search", {
          search_term: searchTerm,
          surface: "shop"
        });
      }
    }

    if (pathname === "/cart" || pathname === "/checkout") {
      const cart = readGoogleAnalyticsCart();
      if (cart.length > 0) {
        target.gtag("event", pathname === "/cart" ? "view_cart" : "begin_checkout", {
          ...googleAnalyticsCartPayload(cart),
          surface: pathname === "/cart" ? "cart" : "checkout"
        });
      }
    }

    if (pathname === "/ask-local") {
      target.gtag("event", "view_ask_local", { surface: "ask_local" });
    }

    if (pathname.startsWith("/vendor/")) {
      const storeId = pathname.split("/")[2];
      if (storeId) target.gtag("event", "view_store", { store_id: decodeURIComponent(storeId), surface: "public_vendor_page" });
    }
  }, [pathname, queryString, searchParams]);

  useEffect(() => () => {
    disableGoogleAnalyticsForCurrentRoute();
    expireGoogleAnalyticsCookies();
  }, []);

  return null;
}

export function GoogleAnalytics() {
  return <Suspense fallback={null}><GoogleAnalyticsInner /></Suspense>;
}
