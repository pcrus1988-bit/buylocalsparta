import { unstable_cache } from "next/cache";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import type { SportFitCompatibilityEdge, SportActivity, SportProductRole, SportFitCompatibilityRelation } from "./sport-fit-engine";

type EdgeRow = Readonly<{
  sport_code: string;
  use_case: string;
  primary_role: string;
  secondary_role: string;
  secondary_kind: string;
  relationship_type: string;
  source_url: string;
  source_title: string;
  evidence_excerpt: string;
  confidence: string | number;
}>;

const ACTIVITY_CODES: ReadonlySet<string> = new Set([
  "running", "walking", "gym", "football", "hiking", "basketball",
  "tennis", "padel", "volleyball", "handball", "badminton"
]);

const SECONDARY_ROLES: ReadonlySet<string> = new Set([
  "socks", "top", "bottom", "layer", "accessory"
]);

const RELATIONSHIP_TYPES: ReadonlySet<string> = new Set([
  "requires", "recommended_with", "compatible_with", "optional_with",
  "incompatible_with", "substitutes", "complements",
  "primary_equipment", "secondary_equipment"
]);

async function readActiveSportFitCompatibilities(): Promise<readonly SportFitCompatibilityEdge[]> {
  if (!productionDatabaseConfigured()) return [];
  // Only stable, editorially reviewed sport-level edges are cached. Offer
  // price/stock remains in the separate live sellability snapshot.
  const result = await getProductionPostgresRuntime().nativePool.query<EdgeRow>(`
    SELECT
      r.sport_code, r.use_case, r.primary_role, r.secondary_role,
      r.secondary_kind, r.relationship_type,
      s.url AS source_url, s.title AS source_title,
      r.evidence_excerpt, r.confidence
    FROM public.sport_equipment_compatibility_rules r
    JOIN public.sport_knowledge_sources s ON s.id=r.source_id AND s.active
    WHERE r.active AND r.confidence>=0.85 AND s.url LIKE 'https://%'
    ORDER BY r.sport_code, r.use_case, r.secondary_role, r.confidence DESC
    LIMIT 128
  `);
  return result.rows.flatMap((row): readonly SportFitCompatibilityEdge[] => {
    if (
      !ACTIVITY_CODES.has(row.sport_code)
      || row.primary_role !== "footwear"
      || !SECONDARY_ROLES.has(row.secondary_role)
      || !RELATIONSHIP_TYPES.has(row.relationship_type)
    ) return [];
    const confidence = Number(row.confidence);
    if (!Number.isFinite(confidence) || confidence < 0.85 || confidence > 1) return [];
    return [{
      sportCode: row.sport_code as SportActivity,
      useCase: row.use_case,
      primaryRole: "footwear" as SportProductRole,
      secondaryRole: row.secondary_role as SportProductRole,
      secondaryKind: row.secondary_kind,
      relationshipType: row.relationship_type as SportFitCompatibilityRelation,
      sourceUrl: row.source_url,
      sourceTitle: row.source_title,
      evidenceExcerpt: row.evidence_excerpt,
      confidence
    }];
  });
}

export const getActiveSportFitCompatibilities = unstable_cache(
  readActiveSportFitCompatibilities,
  ["sport-fit-governed-compatibility-v1"],
  { revalidate: 300 }
);
