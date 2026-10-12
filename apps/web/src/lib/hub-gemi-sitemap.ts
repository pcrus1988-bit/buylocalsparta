import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { getExpansionHubBySlug } from "./expansion-hubs";

export const GEMI_HUB_SITEMAP_SHARD_SIZE = 4000;
export const GEMI_HUB_SITEMAP_MAX_SHARDS_PER_HUB = 50;

export type HubGemiSitemapCount = Readonly<{ hub_slug: string; entry_count: string | number }>;
type HubGemiSitemapRow = Readonly<{ public_slug: string }>;

const GOOD_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Suppress verified existing partners and converted CLAIM across HUBs. Only
// publicly approved, independently SEO-reviewed unclaimed GEMI rows qualify.
const QUALIFIED_DIRECTORY = [
  "d.display_status='published'",
  "AND d.seo_approved=true",
  "AND d.registry_verified_at IS NOT NULL",
  "AND d.registry_verification_ref ~ '^gemi-opendata-active:sha256:[a-f0-9]{64}$'",
  "AND length(d.public_slug)<=128",
  "AND d.public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'",
  "AND (",
  "  (d.publication_basis='municipality' AND d.registry_verified_at IS NOT NULL",
  "    AND d.directory_hub_slug IS NOT NULL)",
  "  OR",
  "  (d.publication_basis='premise' AND d.assignment_status='assigned'",
  "    AND d.assigned_hub_slug IS NOT NULL)",
  ")",
  "AND NOT EXISTS (SELECT 1 FROM public.vendor_businesses v",
  "  WHERE v.gemi_number=d.gemi_number AND v.status='active'",
  "    AND v.public_directory_visible=true)",
  "AND NOT EXISTS (SELECT 1 FROM public.hub_expansion_prospects h",
  "  WHERE h.gemi_number=d.gemi_number",
  "    AND h.status='converted' AND h.owner_user_id IS NOT NULL)"
].join("\n");

const DIRECTORY_HUB = "CASE WHEN d.publication_basis='municipality' " +
  "THEN d.directory_hub_slug ELSE d.assigned_hub_slug END";

export const publicGemiHubSitemapCountSql =
  "SELECT " + DIRECTORY_HUB + " AS hub_slug,count(*)::integer AS entry_count " +
  "FROM research_private.hub_gemi_directory d WHERE " + QUALIFIED_DIRECTORY +
  " GROUP BY " + DIRECTORY_HUB + " ORDER BY hub_slug LIMIT 131";

export const publicGemiHubSitemapShardSql =
  "SELECT d.public_slug FROM research_private.hub_gemi_directory d WHERE " +
  QUALIFIED_DIRECTORY + " AND " + DIRECTORY_HUB + "=$1" +
  " ORDER BY d.public_slug,d.gemi_number LIMIT $2 OFFSET $3";

export function hubGemiSitemapShardPaths(
  counts: readonly HubGemiSitemapCount[]
): string[] {
  const paths: string[] = [];
  for (const row of counts) {
    const hub = row.hub_slug;
    const count = Number(row.entry_count);
    if (!hub || !GOOD_SLUG.test(hub) || !getExpansionHubBySlug(hub) ||
        !Number.isSafeInteger(count) || count <= 0) continue;
    const shards = Math.min(GEMI_HUB_SITEMAP_MAX_SHARDS_PER_HUB,
      Math.ceil(count / GEMI_HUB_SITEMAP_SHARD_SIZE));
    for (let shard = 0; shard < shards; shard += 1) {
      paths.push("/sitemaps/hubs/" + hub + "/" + shard + ".xml");
    }
  }
  return paths;
}

/** HUB landing/directory pages become indexable only after 10 reviewed entries. */
export function indexReadyHubGemiSlugsFromCounts(counts: readonly HubGemiSitemapCount[]): string[] {
  return counts.filter(row => Number(row.entry_count) >= 10 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.hub_slug) &&
    Boolean(getExpansionHubBySlug(row.hub_slug)))
    .map(row => row.hub_slug);
}

export async function listIndexReadyHubGemiSitemapSlugs(): Promise<string[]> {
  if (!productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().sqlPool.query<HubGemiSitemapCount>(
    publicGemiHubSitemapCountSql
  );
  return indexReadyHubGemiSlugsFromCounts(result.rows);
}

/** Discovery for the sitemap index. Never promote unpublished GEMI research. */
export async function listIndexableHubGemiSitemapPaths(): Promise<string[]> {
  if (!productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().sqlPool.query<HubGemiSitemapCount>(
    publicGemiHubSitemapCountSql
  );
  return hubGemiSitemapShardPaths(result.rows);
}

/**
 * Strictly public projection for an XML shard. Never SELECT personal contacts,
 * AFM, research notes or other private registry/prospect fields.
 */
export async function listIndexableHubGemiSitemapPage(
  hubSlug: string, shard: number
): Promise<string[]> {
  if (!GOOD_SLUG.test(hubSlug) || !getExpansionHubBySlug(hubSlug) ||
      !Number.isSafeInteger(shard) || shard < 0 ||
      shard >= GEMI_HUB_SITEMAP_MAX_SHARDS_PER_HUB ||
      !productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().sqlPool.query<HubGemiSitemapRow>(
    publicGemiHubSitemapShardSql,
    [hubSlug, GEMI_HUB_SITEMAP_SHARD_SIZE, shard * GEMI_HUB_SITEMAP_SHARD_SIZE]
  );
  return [...new Set(result.rows.map(row => row.public_slug)
    .filter(slug => GOOD_SLUG.test(slug) && slug.length <= 128))]
    .map(slug => "/hubs/" + hubSlug + "/business/" + slug);
}
