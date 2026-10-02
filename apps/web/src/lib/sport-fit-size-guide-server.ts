import { unstable_cache } from "next/cache";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import {
  resolveMeasuredSportSize,
  type SportMeasuredSizeResolution,
  type SportSizeGuideAudience,
  type SportSizeGuideLabel,
  type SportSizeGuidePoint
} from "./sport-fit-size-guide";

type SizeGuideRow = Readonly<{
  guide_key: string;
  guide_version: string;
  publisher: string;
  source_url: string | null;
  measurement_help: string | null;
  measurement_mm: number | string;
  size_system: string;
  audience_scope: SportSizeGuideAudience;
  size_label: string;
}>;

export type StoredSportSizeResolution = SportMeasuredSizeResolution & Readonly<{
  guideKey: string;
  guideVersion: string;
  publisher: string;
  sourceUrl?: string;
  measurementHelp?: string;
  sizeSystem: string;
}>;

function safeBrand(value: string): string {
  const brand = value.trim().slice(0, 80);
  if (!brand || !/^[\p{L}\p{N} .&'’+_-]+$/u.test(brand)) throw new Error("INVALID_SIZE_GUIDE_BRAND");
  return brand;
}

function safeRole(value: string): string {
  const role = value.trim();
  if (!["footwear","sock","apparel","equipment","accessory"].includes(role)) throw new Error("INVALID_SIZE_GUIDE_ROLE");
  return role;
}

async function readSportSizeGuide(brand: string, productRole: string, locale: string): Promise<readonly SizeGuideRow[]> {
  if (!productionDatabaseConfigured()) return [];

  const result = await getProductionPostgresRuntime().nativePool.query<SizeGuideRow>(`
    SELECT
      g.guide_key,
      g.guide_version,
      s.publisher,
      s.url AS source_url,
      tr.measurement_help,
      e.measurement_mm,
      l.size_system,
      l.audience_scope,
      l.size_label
    FROM sport_size_guides g
    JOIN brands b ON b.id=g.brand_id
    JOIN sport_knowledge_sources s ON s.id=g.source_id AND s.active=true
    JOIN sport_size_guide_entries e ON e.guide_id=g.id
    JOIN sport_size_guide_labels l ON l.entry_id=e.id
    LEFT JOIN sport_size_guide_translations tr ON tr.guide_id=g.id AND tr.locale=$3
    WHERE g.active=true
      AND lower(b.name)=lower($1)
      AND g.product_role=$2
    ORDER BY e.measurement_mm,l.size_system,l.audience_scope
  `, [safeBrand(brand), safeRole(productRole), locale === "en" ? "en" : "el"]);

  return result.rows;
}

const cachedSportSizeGuide = unstable_cache(
  readSportSizeGuide,
  ["sport-fit-size-guide-v1"],
  { revalidate: 86_400 }
);

export async function resolveStoredSportSize(input: Readonly<{
  brand: string;
  productRole?: "footwear" | "sock" | "apparel" | "equipment" | "accessory";
  locale?: "el" | "en";
  measurementMm: number;
  sizeSystem?: string;
  audience: SportSizeGuideAudience;
}>): Promise<StoredSportSizeResolution | undefined> {
  const rows = await cachedSportSizeGuide(
    safeBrand(input.brand),
    safeRole(input.productRole ?? "footwear"),
    input.locale ?? "el"
  );
  if (!rows.length) return undefined;

  const pointMap = new Map<number, SportSizeGuideLabel[]>();
  for (const row of rows) {
    const measurementMm = Number(row.measurement_mm);
    if (!Number.isFinite(measurementMm)) continue;
    const labels = pointMap.get(measurementMm) ?? [];
    labels.push({
      sizeSystem: row.size_system,
      audienceScope: row.audience_scope,
      sizeLabel: row.size_label
    });
    pointMap.set(measurementMm, labels);
  }

  const points: SportSizeGuidePoint[] = [...pointMap.entries()].map(([measurementMm, labels]) => ({
    measurementMm,
    labels
  }));
  const sizeSystem = (input.sizeSystem ?? "EU").trim().toLocaleUpperCase("en-US");
  const resolved = resolveMeasuredSportSize(points, input.measurementMm, sizeSystem, input.audience);
  const first = rows[0]!;

  return {
    ...resolved,
    guideKey: first.guide_key,
    guideVersion: first.guide_version,
    publisher: first.publisher,
    sourceUrl: first.source_url ?? undefined,
    measurementHelp: first.measurement_help ?? undefined,
    sizeSystem
  };
}
