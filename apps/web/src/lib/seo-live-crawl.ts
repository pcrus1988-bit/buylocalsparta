import "server-only";

import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminSeoCrawlGraph } from "./seo-crawl-graph";
import { getSeoGlobalSettingsSnapshot } from "./seo-settings";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_URLS = 100;
const CONCURRENCY = 6;

export type SeoLiveCrawlIssueSeverity = "critical" | "warning" | "info";

export type SeoLiveCrawlIssue = Readonly<{
  code: string;
  severity: SeoLiveCrawlIssueSeverity;
  detail: string;
}>;

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
  issueDetails: readonly SeoLiveCrawlIssue[];
}>;

export type SeoLiveCrawlReport = Readonly<{
  origin: string;
  limit: number;
  startedAt: string;
  generatedAt: string;
  requested: number;
  completed: number;
  healthy: number;
  withIssues: number;
  rows: readonly SeoLiveCrawlRow[];
}>;

function crawlIssue(code: string, severity: SeoLiveCrawlIssueSeverity, detail: string): SeoLiveCrawlIssue {
  return { code, severity, detail };
}

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

function normalizedGovernedRoute(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 2_048) throw new Error("Governed crawl route is invalid.");
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("?") || raw.includes("#") || /[\u0000-\u001f\u007f]/.test(raw)) {
    throw new Error("Targeted crawl accepts only a governed absolute path without query, fragment or host.");
  }
  return raw === "/" ? "/" : raw.replace(/\/+$/, "") || "/";
}

function rowWithIssues(input: Omit<SeoLiveCrawlRow, "issues"> & { issueDetails: readonly SeoLiveCrawlIssue[] }): SeoLiveCrawlRow {
  return { ...input, issues: input.issueDetails.map((issue) => issue.detail) };
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
    const issueDetails: SeoLiveCrawlIssue[] = [];
    if (response.status < 200 || response.status >= 300) issueDetails.push(crawlIssue(
      "http_status",
      response.status >= 400 ? "critical" : "warning",
      `HTTP ${response.status}`
    ));
    if (normalizeComparableUrl(finalUrl) !== normalizeComparableUrl(expectedUrl.toString())) issueDetails.push(crawlIssue(
      "redirected",
      "warning",
      "Redirected away from declared URL"
    ));

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
      if (!title) issueDetails.push(crawlIssue("missing_title", "warning", "Missing <title>"));
      if (!canonical) issueDetails.push(crawlIssue("missing_canonical", "warning", "Missing canonical"));
      else {
        const resolvedCanonical = new URL(canonical, expectedUrl).toString();
        if (normalizeComparableUrl(resolvedCanonical) !== normalizeComparableUrl(expectedUrl.toString())) issueDetails.push(crawlIssue(
          "canonical_mismatch",
          "warning",
          "Canonical differs from declared URL"
        ));
      }
      if (indexAllowed && robots?.toLowerCase().includes("noindex")) issueDetails.push(crawlIssue(
        "unexpected_noindex",
        "critical",
        "Unexpected noindex"
      ));
      if (!h1Count) issueDetails.push(crawlIssue("missing_h1", "warning", "Missing H1"));
      if (typeof h1Count === "number" && h1Count > 1) issueDetails.push(crawlIssue(
        "multiple_h1",
        "info",
        `Multiple H1 (${h1Count})`
      ));
    } else {
      issueDetails.push(crawlIssue(
        "unexpected_content_type",
        "warning",
        `Unexpected content type${contentType ? `: ${contentType}` : ""}`
      ));
    }

    return rowWithIssues({
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
      issueDetails
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "HTTP crawl failed";
    return rowWithIssues({
      route,
      url: expectedUrl.toString(),
      responseTimeMs: Date.now() - started,
      issueDetails: [crawlIssue("request_failed", "critical", detail)]
    });
  } finally {
    clearTimeout(timeout);
  }
}

function reportForRows(origin: URL, limit: number, startedAt: string, rows: readonly SeoLiveCrawlRow[]): SeoLiveCrawlReport {
  const healthy = rows.filter((row) => row.issueDetails.length === 0).length;
  return {
    origin: origin.origin,
    limit,
    startedAt,
    generatedAt: new Date().toISOString(),
    requested: rows.length,
    completed: rows.length,
    healthy,
    withIssues: rows.length - healthy,
    rows
  };
}

export async function runSeoLiveCrawl(principal: SessionPrincipal, requestedLimit = 40): Promise<SeoLiveCrawlReport> {
  const startedAt = new Date().toISOString();
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

  return reportForRows(origin, limit, startedAt, rows);
}

export async function runSeoTargetedCrawl(principal: SessionPrincipal, requestedRoute: unknown): Promise<SeoLiveCrawlReport> {
  const startedAt = new Date().toISOString();
  const route = normalizedGovernedRoute(requestedRoute);
  const [{ settings }, graph] = await Promise.all([getSeoGlobalSettingsSnapshot(), adminSeoCrawlGraph(principal)]);
  const target = graph.nodes.find((node) => normalizedGovernedRoute(node.route) === route);
  if (!target) throw new Error("Targeted crawl route is not present in the governed SEO graph.");

  const origin = new URL(settings.canonicalOrigin);
  const url = new URL(target.route, origin);
  if (url.origin !== origin.origin) throw new Error("Governed targeted crawl route escaped the canonical origin.");
  const row = await inspectUrl(target.route, url, target.indexAllowed);
  return reportForRows(origin, 1, startedAt, [row]);
}
