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

export function dropshipFamilyGroupKey(
  record: Pick<DropshipFamilyProjectionRecord, "familyId" | "supplierId" | "externalProductId">
): string {
  return record.familyId
    ? `family:${record.familyId}`
    : `source:${record.supplierId}:${record.externalProductId}`;
}

function representativeOrder(left: DropshipFamilyProjectionRecord, right: DropshipFamilyProjectionRecord): number {
  return left.priceMinor - right.priceMinor || left.id.localeCompare(right.id);
}

/**
 * Collapse sellable supplier children only after child-level catalogue filters have
 * been evaluated. A family qualifies when any child matches. The matching child is
 * preferred as the representative, while stock and size facets are aggregated
 * across every currently sellable sibling.
 */
export function projectDropshipFamilies<T extends DropshipFamilyProjectionRecord>(
  records: readonly T[],
  matchingRecordIds: ReadonlySet<string>
): readonly DropshipFamilyProjection<T>[] {
  const grouped = new Map<string, T[]>();
  for (const record of records) {
    const key = dropshipFamilyGroupKey(record);
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
