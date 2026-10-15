import type { SafeRelationshipRegion } from "./research-geographic-relations-core";

/** Only pre-redacted, rounded aggregates reach the browser. */
export type RelationshipMapView = "segment" | "other" | "gap";
export type RelationshipRegionValue = Readonly<{
  value: number | null;
  base: number | null;
  available: boolean;
}>;

export function relationshipRegionValue(
  region: SafeRelationshipRegion, view: RelationshipMapView
): RelationshipRegionValue {
  if (view === "gap") {
    if (region.segment.percent === null || region.other.percent === null) {
      return { value: null, base: null, available: false };
    }
    return {
      value: region.segment.percent - region.other.percent,
      base: null,
      available: true
    };
  }
  const cell = view === "segment" ? region.segment : region.other;
  return { value: cell.percent, base: cell.base, available: cell.percent !== null };
}

export function sortedRelationshipRegions(
  regions: readonly SafeRelationshipRegion[],
  view: RelationshipMapView,
  order: "highest" | "lowest" | "alphabetical"
): SafeRelationshipRegion[] {
  return [...regions].sort((a, b) => {
    if (order === "alphabetical") return a.label.localeCompare(b.label, "el");
    const av = relationshipRegionValue(a, view).value;
    const bv = relationshipRegionValue(b, view).value;
    // Always put suppressed/undefined values after populated values.
    if (av === null) return bv === null ? a.label.localeCompare(b.label, "el") : 1;
    if (bv === null) return -1;
    const compare = order === "highest" ? bv - av : av - bv;
    return compare || a.label.localeCompare(b.label, "el");
  });
}

export function relationshipMapCellValue(value: number | null, view: RelationshipMapView) {
  if (value === null) return "Ανεπαρκής βάση";
  const formatted = Math.abs(value).toLocaleString("el-GR", { maximumFractionDigits: 0 });
  if (view === "gap") {
    return (value > 0 ? "+" : value < 0 ? "−" : "") + formatted + " π.μ.";
  }
  return formatted + "%";
}
