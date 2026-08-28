"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const GOOGLE_ANALYTICS_ID = "G-NC8QWH2WTD";
const GOOGLE_ANALYTICS_SCRIPT_ID = "kontamou-google-analytics";
const INTERNAL_PREFIXES = ["/admin", "/vendor", "/driver", "/delivery/manage", "/daily"] as const;

type GoogleAnalyticsWindow = Window & typeof globalThis & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  __kontamouGaInitialized?: boolean;
  [key: `ga-disable-${string}`]: boolean | undefined;
};

function isTrackablePath(pathname: string): boolean {
  return !INTERNAL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

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

function ensureGoogleAnalytics(): GoogleAnalyticsWindow {
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

export function GoogleAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isTrackablePath(pathname)) return;

    const target = ensureGoogleAnalytics();
    target.gtag?.("event", "page_view", {
      page_title: document.title,
      page_location: window.location.href,
      page_path: `${pathname}${window.location.search}`
    });
  }, [pathname]);

  useEffect(() => () => {
    const target = analyticsWindow();
    target[`ga-disable-${GOOGLE_ANALYTICS_ID}`] = true;
    target.gtag?.("consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
    expireGoogleAnalyticsCookies();
  }, []);

  return null;
}
