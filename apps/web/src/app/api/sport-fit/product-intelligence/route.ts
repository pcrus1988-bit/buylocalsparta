import { productionDatabaseConfigured, getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { sportProductRole, type SportFitKnowledge, type SportFitProduct } from "../../../../lib/sport-fit-engine";

type IntelligenceRow = Readonly<{
  id: string;
  slug: string;
  title: string;
  category_code: string;
  knowledge_status: string | null;
  identity_quality: string | null;
  completeness_score: number | string | null;
  evidence_score: number | string | null;
  queue_status: string | null;
  sport_facts: unknown;
}>;

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600"
};

function safeProductId(value: string | null): string {
  const productId = value?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{3,160}$/.test(productId)) throw new Error("INVALID_PRODUCT");
  return productId;
}

function objectValue(value: unknown): Readonly<Record<string, unknown>> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function stringList(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    return value.find((item): item is string => typeof item === "string" && item.trim().length > 0)?.trim();
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function unitInterval(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

function knowledgeFromRow(row: IntelligenceRow): SportFitKnowledge | undefined {
  const facts = objectValue(row.sport_facts);
  const status = row.knowledge_status && ["pending","researching","partial","verified","conflict","insufficient"].includes(row.knowledge_status)
    ? row.knowledge_status as SportFitKnowledge["status"]
    : undefined;
  const queueStatus = row.queue_status && ["pending","leased","completed","partial","failed","blocked"].includes(row.queue_status)
    ? row.queue_status as SportFitKnowledge["queueStatus"]
    : undefined;
  const identityQuality = row.identity_quality === "weak" || row.identity_quality === "medium" || row.identity_quality === "strong"
    ? row.identity_quality
    : undefined;

  if (!status && !queueStatus && !identityQuality && Object.keys(facts).length === 0) return undefined;

  return {
    status,
    queueStatus,
    identityQuality,
    completenessScore: unitInterval(row.completeness_score),
    evidenceScore: unitInterval(row.evidence_score),
    activities: stringList(facts.sport_activity),
    surfaces: stringList(facts.sport_surface),
    useCases: stringList(facts.sport_use_case),
    cushioningLevel: stringValue(facts.cushioning_level),
    supportLevel: stringValue(facts.support_level),
    fitLengthProfile: stringValue(facts.fit_length_profile),
    widthProfile: stringValue(facts.footwear_width_profile),
    dropMm: numberValue(facts.heel_to_toe_drop_mm),
    weightG: numberValue(facts.shoe_weight_g),
    footballSurfaceCode: stringValue(facts.football_surface_code),
    weatherProtection: stringList(facts.weather_protection),
    breathabilityLevel: stringValue(facts.breathability_level),
    reflectiveDetails: booleanValue(facts.reflective_details)
  };
}

export async function GET(request: Request) {
  if (!productionDatabaseConfigured()) {
    return Response.json({ eligible: false, reason: "knowledge_unavailable" }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const productId = safeProductId(new URL(request.url).searchParams.get("productId"));
    const result = await getProductionPostgresRuntime().nativePool.query<IntelligenceRow>(`
      SELECT
        cv.public_id AS id,
        cv.slug,
        COALESCE(NULLIF(el.title,''),NULLIF(en.title,''),NULLIF(cv.model,''),NULLIF(pf.model,''),cv.slug) AS title,
        c.code AS category_code,
        sk.knowledge_status,
        sk.identity_quality,
        sk.completeness_score,
        sk.evidence_score,
        sq.status AS queue_status,
        sportfacts.facts AS sport_facts
      FROM canonical_variants cv
      LEFT JOIN product_families pf ON pf.id=cv.family_id
      JOIN categories c ON c.id=cv.category_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      LEFT JOIN sport_product_knowledge sk ON sk.family_id=pf.id
      LEFT JOIN sport_knowledge_enrichment_queue sq ON sq.family_id=pf.id
      LEFT JOIN LATERAL (
        SELECT COALESCE(jsonb_object_agg(fact.code,fact.value),'{}'::jsonb) AS facts
        FROM (
          SELECT
            ad.code,
            CASE
              WHEN ad.data_type='multienum'
                THEN to_jsonb(array_agg(av.code ORDER BY pfav.position) FILTER (WHERE av.code IS NOT NULL))
              WHEN ad.data_type='enum'
                THEN to_jsonb(max(av.code))
              WHEN ad.data_type='number'
                THEN to_jsonb(max(pfav.number_value))
              WHEN ad.data_type='boolean'
                THEN to_jsonb(bool_or(pfav.boolean_value))
              ELSE to_jsonb(max(pfav.text_value))
            END AS value
          FROM product_family_attribute_values pfav
          JOIN attribute_definitions ad ON ad.id=pfav.attribute_id
          LEFT JOIN attribute_values av ON av.id=pfav.attribute_value_id
          WHERE pfav.family_id=pf.id
            AND ad.group_code LIKE 'sport%'
            AND COALESCE(pfav.confidence,0)>=0.70
          GROUP BY ad.code,ad.data_type
        ) fact
        WHERE fact.value IS NOT NULL
          AND fact.value <> 'null'::jsonb
      ) sportfacts ON true
      WHERE cv.public_id=$1
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
      LIMIT 1
    `, [productId]);

    const row = result.rows[0];
    if (!row) return Response.json({ eligible: false, reason: "product_not_found" }, { headers: CACHE_HEADERS });

    const knowledge = knowledgeFromRow(row);
    const role = sportProductRole({
      id: row.id,
      slug: row.slug,
      title: row.title,
      priceMinor: 0,
      categoryCode: row.category_code,
      sizes: [],
      available: true,
      availableToSell: 1,
      knowledge
    } satisfies SportFitProduct);

    const eligible = role === "footwear"
      && Boolean(knowledge)
      && knowledge?.status !== "conflict"
      && knowledge?.status !== "insufficient"
      && knowledge?.queueStatus !== "blocked";

    return Response.json({
      eligible,
      role,
      knowledge: eligible ? knowledge : undefined
    }, { headers: CACHE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const invalid = message === "INVALID_PRODUCT";
    console.error(JSON.stringify({
      level: "error",
      event: "sport_fit.product_intelligence_failed",
      message
    }));
    return Response.json(
      { eligible: false, error: invalid ? "sport_fit_invalid_product" : "sport_fit_product_intelligence_unavailable" },
      { status: invalid ? 400 : 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
