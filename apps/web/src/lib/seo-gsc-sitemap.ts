import "server-only";

import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { getSearchConsoleSitemapStatus, searchConsoleReadiness, submitSearchConsoleSitemap, type SearchConsoleSitemapStatus } from "./seo-search-console";
import { getSeoGlobalSettingsSnapshot } from "./seo-settings";

export type GovernedSearchConsoleSitemapWorkspace = Readonly<{
  sitemapUrl: string;
  integrationReady: boolean;
  propertyUrl?: string;
  status?: SearchConsoleSitemapStatus;
  error?: string;
}>;

function productionSitemapUrl(canonicalOrigin: string): string {
  const origin = new URL(canonicalOrigin);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash) {
    throw new Error("Canonical SEO origin is not a valid public HTTPS origin.");
  }
  return new URL("/sitemap.xml", `${origin.origin}/`).toString();
}

export async function getGovernedSearchConsoleSitemapWorkspace(principal: SessionPrincipal): Promise<GovernedSearchConsoleSitemapWorkspace> {
  assertAdminPermission(principal, "content.read");
  const seo = await getSeoGlobalSettingsSnapshot();
  const sitemapUrl = productionSitemapUrl(seo.settings.canonicalOrigin);
  const readiness = searchConsoleReadiness();
  if (!readiness.ready) {
    return { sitemapUrl, integrationReady: false, propertyUrl: readiness.siteUrl };
  }
  try {
    const status = await getSearchConsoleSitemapStatus(sitemapUrl);
    return { sitemapUrl, integrationReady: true, propertyUrl: readiness.siteUrl, status };
  } catch (error) {
    return {
      sitemapUrl,
      integrationReady: true,
      propertyUrl: readiness.siteUrl,
      error: error instanceof Error ? error.message : "Unable to read Google sitemap status."
    };
  }
}

export async function submitGovernedSearchConsoleSitemap(principal: SessionPrincipal) {
  assertAdminPermission(principal, "content.write");
  const seo = await getSeoGlobalSettingsSnapshot();
  const sitemapUrl = productionSitemapUrl(seo.settings.canonicalOrigin);
  const result = await submitSearchConsoleSitemap(sitemapUrl);
  await recordAdminAudit(
    principal,
    "seo.search_console.sitemap_submit",
    "seo_search_console_sitemap",
    sitemapUrl,
    "Submit governed production sitemap to Google Search Console",
    { sitemapUrl }
  );
  return result;
}
