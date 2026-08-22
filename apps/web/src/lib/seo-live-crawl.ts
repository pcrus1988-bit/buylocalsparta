import "server-only";

import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminSeoCrawlGraph } from "./seo-crawl-graph";
import { getSeoGlobalSettingsSnapshot } from "./seo-settings";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_URLS = 100;
const CONCURRENCY = 6;

export type SeoLiveCrawlRow = Readonly<{
  route: string;
  url: string;
  status?: number;
  finalUrl?: string;
  contentType?: string;
  responseTimeMs: number;
  title?: string;
  canonical?: string;
  robots?: string;
  h1Count?: number;
  issues: readonly string[];
}>;

export type SeoLiveCrawlReport = Readonly<{
  generatedAt: string;
  requested: number;
  completed: number;
  healthy: number;
  withIssues: number;
  rows: readonly SeoLiveCrawlRow[];
}>;

function htmlText(source: string, expression: RegExp): string | undefined {
  const match = source.match(expression)?.[1]?.replace(/\s+/g, " ").trim();
  return match || undefined;
}

function normalizeComparableUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
    return url.toString();
  } catch {
    return value;
  }
}

async function inspectUrl(route: string, expectedUrl: URL, indexAllowed: boolean): Promise<SeoLiveCrawlRow> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(expectedUrl, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: { "user-agent": "KontaMou-SEO-Admin-Crawler/1.0" },
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") ?? undefined;
    const finalUrl = response.url || expectedUrl.toString();
    const issues: string[] = [];
    if (response.status < 200 || response.status >= 300) issues.push(`HTTP ${response.status}`);
    if (normalizeComparableUrl(finalUrl) !== normalizeComparableUrl(expectedUrl.toString())) issues.push("Redirected away from declared URL");

    let title: string | undefined;
    let canonical: string | undefined;
    let robots: string | undefined;
    let h1Count: number | undefined;
    if (contentType?.toLowerCase().includes("text/html")) {
      const html = await response.text();
      title = htmlText(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
      canonical = htmlText(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i)
        ?? htmlText(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i);
      robots = htmlText(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["'][^>]*>/i)
        ?? htmlText(html, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots["'][^>]*>/i);
      h1Count = (html.match(/<h1(?:\s|>)/gi) ?? []).length;
      if (!title) issues.push("Missing <title>");
      if (!canonical) issues.push("Missing canonical");
      else {
        const resolvedCanonical = new URL(canonical, expectedUrl).toString();
        if (normalizeComparableUrl(resolvedCanonical) !== normalizeComparableUrl(expectedUrl.toString())) issues.push("Canonical differs from declared URL");
      }
      if (indexAllowed && robots?.toLowerCase().includes("noindex")) issues.push("Unexpected noindex");
      if (!h1Count) issues.push("Missing H1");
      if (typeof h1Count === "number" && h1Count > 1) issues.push(`Multiple H1 (${h1Count})`);
    } else {
      issues.push(`Unexpected content type${contentType ? `: ${contentType}` : ""}`);
    }

    return {
      route,
      url: expectedUrl.toString(),
      status: response.status,
      finalUrl,
      contentType,
      responseTimeMs: Date.now() - started,
      title,
      canonical,
      robots,
      h1Count,
      issues
    };
  } catch (error) {
    return {
      route,
      url: expectedUrl.toString(),
      responseTimeMs: Date.now() - started,
      issues: [error instanceof Error ? error.message : "HTTP crawl failed"]
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runSeoLiveCrawl(principal: SessionPrincipal, requestedLimit = 40): Promise<SeoLiveCrawlReport> {
  const [{ settings }, graph] = await Promise.all([getSeoGlobalSettingsSnapshot(), adminSeoCrawlGraph(principal)]);
  const origin = new URL(settings.canonicalOrigin);
  const limit = Math.max(1, Math.min(MAX_URLS, Math.floor(requestedLimit)));
  const targets = graph.nodes.filter((node) => node.indexAllowed).slice(0, limit);
  const rows: SeoLiveCrawlRow[] = [];

  for (let offset = 0; offset < targets.length; offset += CONCURRENCY) {
    const batch = targets.slice(offset, offset + CONCURRENCY);
    const inspected = await Promise.all(batch.map((node) => {
      const url = new URL(node.route, origin);
      if (url.origin !== origin.origin) throw new Error("Governed crawl route escaped the canonical origin.");
      return inspectUrl(node.route, url, node.indexAllowed);
    }));
    rows.push(...inspected);
  }

  const healthy = rows.filter((row) => row.issues.length === 0).length;
  return {
    generatedAt: new Date().toISOString(),
    requested: targets.length,
    completed: rows.length,
    healthy,
    withIssues: rows.length - healthy,
    rows
  };
}
