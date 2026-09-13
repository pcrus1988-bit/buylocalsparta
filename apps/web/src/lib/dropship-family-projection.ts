export type DropshipFamilyProjectionRecord = Readonly<{
  id: string;
  familyId: string | null;
  supplierId: string;
  externalProductId: string;
  priceMinor: number;
  availableToSell: number;
  sizes: readonly string[];
}>;

export type DropshipFamilyProjection<T extends DropshipFamilyProjectionRecord> = Readonly<{
  key: string;
  representative: T;
  members: readonly T[];
  availableToSell: number;
  sizes: readonly string[];
}>;

function sourceParentKey(
  record: Pick<DropshipFamilyProjectionRecord, "supplierId" | "externalProductId">
): string {
  return `${record.supplierId}:${record.externalProductId}`;
}

export function dropshipFamilyGroupKey(
  record: Pick<DropshipFamilyProjectionRecord, "familyId" | "supplierId" | "externalProductId">
): string {
  return record.familyId
    ? `family:${record.familyId}`
    : `source:${sourceParentKey(record)}`;
}

function representativeOrder(left: DropshipFamilyProjectionRecord, right: DropshipFamilyProjectionRecord): number {
  return left.priceMinor - right.priceMinor || left.id.localeCompare(right.id);
}

/**
 * Collapse sellable supplier children only after child-level catalogue filters have
 * been evaluated. A family qualifies when any child matches. The matching child is
 * preferred as the representative, while stock and size facets are aggregated
 * across every currently sellable sibling.
 *
 * During a family-sync/backfill race, one supplier parent can temporarily contain a
 * governed child with `familyId` plus a newly materialized sibling without it. In
 * that mixed state, source-parent identity inherits the single observed family so
 * the storefront cannot regress to one card for the family plus another card for
 * the family-less size. If the same supplier parent is ever observed with multiple
 * different families, no inheritance is attempted; that integrity conflict remains
 * visible instead of being silently papered over.
 */
export function projectDropshipFamilies<T extends DropshipFamilyProjectionRecord>(
  records: readonly T[],
  matchingRecordIds: ReadonlySet<string>
): readonly DropshipFamilyProjection<T>[] {
  const observedFamiliesBySource = new Map<string, Set<string>>();
  for (const record of records) {
    if (!record.familyId) continue;
    const sourceKey = sourceParentKey(record);
    const observed = observedFamiliesBySource.get(sourceKey);
    if (observed) observed.add(record.familyId);
    else observedFamiliesBySource.set(sourceKey, new Set([record.familyId]));
  }

  const inheritedFamilyBySource = new Map<string, string>();
  for (const [sourceKey, families] of observedFamiliesBySource) {
    if (families.size !== 1) continue;
    const [familyId] = families;
    if (familyId) inheritedFamilyBySource.set(sourceKey, familyId);
  }

  const grouped = new Map<string, T[]>();
  for (const record of records) {
    const inheritedFamilyId = record.familyId ?? inheritedFamilyBySource.get(sourceParentKey(record));
    const key = inheritedFamilyId
      ? `family:${inheritedFamilyId}`
      : dropshipFamilyGroupKey(record);
    const members = grouped.get(key);
    if (members) members.push(record);
    else grouped.set(key, [record]);
  }

  const output: DropshipFamilyProjection<T>[] = [];
  for (const [key, members] of grouped) {
    const matchingMembers = members.filter((record) => matchingRecordIds.has(record.id));
    if (!matchingMembers.length) continue;

    const representative = [...matchingMembers].sort(representativeOrder)[0]!;
    const sizes = [...new Set(members.flatMap((record) => record.sizes).filter(Boolean))];
    const availableToSell = members.reduce((sum, record) => {
      const next = sum + Math.max(0, record.availableToSell);
      return Number.isSafeInteger(next) ? next : Number.MAX_SAFE_INTEGER;
    }, 0);

    output.push({ key, representative, members, availableToSell, sizes });
  }

  return output;
}
