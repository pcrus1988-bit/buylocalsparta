export type DemandSignalSource = "localWatch" | "askLocal" | "savedSearch" | "zeroResultSearch" | "quickAddMiss";
export type ActiveDemandSignalSource = Exclude<DemandSignalSource, "quickAddMiss">;

export type DemandSignalRow = Readonly<{
  actorKey: string;
  source: ActiveDemandSignalSource;
  canonicalVariantId?: string;
  categoryCode?: string;
  title?: string;
  categoryName?: string;
  availableLocal?: boolean;
}>;

export type DemandSignalCounts = Readonly<{
  localWatch: number;
  askLocal: number;
  savedSearch: number;
  zeroResultSearch: number;
  quickAddMiss: number;
  distinctActors: number;
}>;

export type DemandOpportunity = Readonly<{
  key: string;
  kind: "variant" | "category";
  title: string;
  canonicalVariantId?: string;
  categoryCode?: string;
  score: number;
  confidence: "qualified" | "strong" | "very_strong";
  availableLocal?: boolean;
  signals: DemandSignalCounts;
}>;

export type DemandSourceCoverage = Readonly<Record<DemandSignalSource, "active" | "not_instrumented">>;

export const LOCAL_DEMAND_MIN_ACTORS = 5;
export const LOCAL_DEMAND_WINDOW_DAYS = 90;
export const LOCAL_DEMAND_SOURCE_COVERAGE: DemandSourceCoverage = {
  localWatch: "active",
  askLocal: "active",
  savedSearch: "active",
  zeroResultSearch: "active",
  quickAddMiss: "not_instrumented"
};

const WEIGHTS: Readonly<Record<ActiveDemandSignalSource, number>> = {
  localWatch: 4,
  askLocal: 3,
  zeroResultSearch: 2,
  savedSearch: 1
};

type MutableBucket = {
  key: string;
  kind: "variant" | "category";
  title: string;
  canonicalVariantId?: string;
  categoryCode?: string;
  availableLocal?: boolean;
  actors: Set<string>;
  bySource: Record<ActiveDemandSignalSource, Set<string>>;
};

function bucket(map: Map<string, MutableBucket>, input: Omit<MutableBucket, "actors" | "bySource">): MutableBucket {
  const existing = map.get(input.key);
  if (existing) {
    if (existing.availableLocal === undefined && input.availableLocal !== undefined) existing.availableLocal = input.availableLocal;
    return existing;
  }
  const created: MutableBucket = {
    ...input,
    actors: new Set(),
    bySource: { localWatch: new Set(), askLocal: new Set(), savedSearch: new Set(), zeroResultSearch: new Set() }
  };
  map.set(input.key, created);
  return created;
}

function addSignal(target: MutableBucket, row: DemandSignalRow) {
  target.actors.add(row.actorKey);
  target.bySource[row.source].add(row.actorKey);
}

function finish(item: MutableBucket): DemandOpportunity {
  const localWatch = item.bySource.localWatch.size;
  const askLocal = item.bySource.askLocal.size;
  const savedSearch = item.bySource.savedSearch.size;
  const zeroResultSearch = item.bySource.zeroResultSearch.size;
  const distinctActors = item.actors.size;
  const sourceFamilies = [localWatch, askLocal, savedSearch, zeroResultSearch].filter((count) => count > 0).length;
  const score = localWatch * WEIGHTS.localWatch
    + askLocal * WEIGHTS.askLocal
    + zeroResultSearch * WEIGHTS.zeroResultSearch
    + savedSearch * WEIGHTS.savedSearch;
  const confidence = distinctActors >= 12 || (distinctActors >= 8 && sourceFamilies >= 2)
    ? "very_strong"
    : distinctActors >= 7 || sourceFamilies >= 2
      ? "strong"
      : "qualified";
  return {
    key: item.key,
    kind: item.kind,
    title: item.title,
    canonicalVariantId: item.canonicalVariantId,
    categoryCode: item.categoryCode,
    score,
    confidence,
    availableLocal: item.availableLocal,
    signals: { localWatch, askLocal, savedSearch, zeroResultSearch, quickAddMiss: 0, distinctActors }
  };
}

export function buildLocalDemandIntelligence(
  rows: readonly DemandSignalRow[],
  options: Readonly<{
    minActors?: number;
    vendorCategoryCodes?: ReadonlySet<string>;
    vendorCanonicalVariantIds?: ReadonlySet<string>;
  }> = {}
): readonly DemandOpportunity[] {
  const minActors = Math.max(LOCAL_DEMAND_MIN_ACTORS, options.minActors ?? LOCAL_DEMAND_MIN_ACTORS);
  const groups = new Map<string, MutableBucket>();

  for (const row of rows) {
    const actorKey = row.actorKey.trim();
    if (!actorKey) continue;
    const categoryCode = row.categoryCode?.trim() || undefined;
    const canonicalVariantId = row.canonicalVariantId?.trim() || undefined;

    if (canonicalVariantId && categoryCode) {
      const variant = bucket(groups, {
        key: `variant:${canonicalVariantId}`,
        kind: "variant",
        title: row.title?.trim() || canonicalVariantId,
        canonicalVariantId,
        categoryCode,
        availableLocal: row.availableLocal
      });
      addSignal(variant, row);
    }

    if (categoryCode) {
      const category = bucket(groups, {
        key: `category:${categoryCode}`,
        kind: "category",
        title: row.categoryName?.trim() || categoryCode,
        categoryCode
      });
      addSignal(category, row);
    }
  }

  return [...groups.values()]
    .filter((item) => item.actors.size >= minActors)
    .filter((item) => !options.vendorCategoryCodes || (item.categoryCode ? options.vendorCategoryCodes.has(item.categoryCode) : false))
    .filter((item) => item.kind !== "variant" || !item.canonicalVariantId || !options.vendorCanonicalVariantIds?.has(item.canonicalVariantId))
    .map(finish)
    .sort((a, b) => b.score - a.score || b.signals.distinctActors - a.signals.distinctActors || a.key.localeCompare(b.key));
}
