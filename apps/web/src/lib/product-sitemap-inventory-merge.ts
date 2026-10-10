/**
 * Recover global duplicate-title eligibility across the 64 independently
 * cached sitemap shards. The SQL duplicate count is partition-local when
 * reading one shard; the former unsharded SEO projection counted globally.
 */
export type ShardedSitemapCandidate = Readonly<{
  id: string;
  title: string;
  duplicateTitleCount: number;
}>;

export function mergeProductSitemapShards<T extends ShardedSitemapCandidate>(
  shards: readonly (readonly T[])[]
): readonly T[] {
  const items = shards.flat();
  const byTitle = new Map<string, number>();
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Duplicate sitemap candidate across shards: ${item.id}`);
    ids.add(item.id);
    const key = item.title.trim().toLowerCase();
    byTitle.set(key, (byTitle.get(key) ?? 0) + 1);
  }
  return items.map((item) => ({
    ...item,
    duplicateTitleCount: Math.max(item.duplicateTitleCount, byTitle.get(item.title.trim().toLowerCase()) ?? 1)
  })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
