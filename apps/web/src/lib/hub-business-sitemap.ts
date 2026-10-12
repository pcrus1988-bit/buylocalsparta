import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { getExpansionHubBySlug } from "./expansion-hubs";

type HubBusinessSitemapRow = { hub_slug: string; slug: string };
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ENTRIES = 2000;

/**
 * Verified owner-controlled HUB detail pages eligible for the core sitemap.
 *
 * This deliberately excludes unclaimed GEMI research listings, pending CLAIM,
 * pending payment/trial upgrades, inactive vendors and demo storefronts.
 * The SQL is a slim projection with a hard cap, never a research-census scan.
 */
export async function listVerifiedHubBusinessSitemapPaths(): Promise<string[]> {
  if (!productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().sqlPool.query<HubBusinessSitemapRow>(
    "SELECT hub_slug,slug FROM (" +
      " SELECT h.hub_slug,h.public_slug AS slug" +
      " FROM public.hub_expansion_prospects h" +
      " JOIN public.users u ON u.id=h.owner_user_id" +
      " WHERE h.plan_code='claim' AND h.status='converted'" +
      " AND u.status='active' AND u.email_verified_at IS NOT NULL" +
      " AND h.public_slug IS NOT NULL" +
      " UNION" +
      " SELECT h.hub_slug,v.public_slug AS slug" +
      " FROM public.hub_expansion_prospects h" +
      " JOIN public.users u ON u.id=h.owner_user_id" +
      " JOIN public.vendor_businesses v ON v.id=h.vendor_id" +
      " WHERE h.plan_code IN ('presence','shop','growth','pro')" +
      " AND h.status='converted'" +
      " AND u.status='active' AND u.email_verified_at IS NOT NULL" +
      " AND v.status='active' AND v.public_directory_visible=true" +
      " AND coalesce(v.demo_mode,false)=false" +
      ") verified" +
      " WHERE hub_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'" +
      " AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'" +
      " ORDER BY hub_slug,slug LIMIT $1",
    [MAX_ENTRIES + 1]
  );
  if (result.rows.length > MAX_ENTRIES) {
    console.warn(JSON.stringify({ event: "seo.hub_business_sitemap_limit", limit: MAX_ENTRIES }));
  }
  return result.rows.slice(0, MAX_ENTRIES)
    .filter((row) => SAFE_SLUG.test(row.hub_slug) && SAFE_SLUG.test(row.slug) &&
      Boolean(getExpansionHubBySlug(row.hub_slug)))
    .map((row) => "/hubs/" + row.hub_slug + "/business/" + row.slug);
}
