import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { getShopCatalogPage } from "../../../../lib/shop-catalog-page";
import { getVisitorKey } from "../../../../lib/visitor";
import { productPublicPath } from "../../../../lib/product-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Candidate = Readonly<{
  id: string;
  slug: string;
  url: string;
  title: string;
  price: string;
  priceMinor: number;
  categoryCode: string;
  categoryLabel?: string;
  brand?: string;
  mediaId?: string;
  mediaAlt?: string;
  vendorName?: string;
  score: number;
  matchedTerms: readonly string[];
  manufacturerProductId: string;
  manufacturerEligibilityStatus:
    | "eligible"
    | "eligible_with_preparation"
    | "requires_specific_primer"
    | "requires_system_component";
  manufacturerRuleKey: string;
  technicalVerificationStatus: "verified";
}>;

type VerifiedManufacturerRow = Readonly<{
  canonical_public_id: string;
  manufacturer_product_id: string;
  result_status: Candidate["manufacturerEligibilityStatus"];
  rule_key: string;
}>;

const scenarioKeyPattern = /^[a-z0-9_]{1,96}$/;
const ALLOWED_ELIGIBILITY = new Set<Candidate["manufacturerEligibilityStatus"]>([
  "eligible",
  "eligible_with_preparation",
  "requires_specific_primer",
  "requires_system_component"
]);

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeTerms(url: URL): readonly string[] {
  const terms = url.searchParams
    .getAll("term")
    .flatMap((value) => value.split("|"))
    .map((value) => value.trim().slice(0, 90))
    .filter(Boolean);

  return [...new Set(terms)].slice(0, 8);
}

function safeScenario(url: URL): Readonly<{ scenarioKey: string; facts: Readonly<Record<string, unknown>> }> | null {
  const scenarioKey = url.searchParams.get("scenario")?.trim() ?? "";
  if (!scenarioKeyPattern.test(scenarioKey)) return null;

  const rawFacts = url.searchParams.get("facts")?.trim() ?? "";
  if (!rawFacts) return { scenarioKey, facts: {} };
  if (rawFacts.length > 6_000) return null;

  try {
    const parsed = JSON.parse(rawFacts) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return null;
    return { scenarioKey, facts: parsed as Readonly<Record<string, unknown>> };
  } catch {
    return null;
  }
}

function candidateScore(
  product: Readonly<{
    title: string;
    categoryCode: string;
    categoryLabel?: string;
    brand?: string;
    description?: string;
  }>,
  terms: readonly string[]
): Readonly<{ score: number; matchedTerms: readonly string[] }> {
  const haystack = normalize([
    product.title,
    product.categoryCode,
    product.categoryLabel,
    product.brand,
    product.description
  ].filter(Boolean).join(" "));

  const matchedTerms = terms.filter((term) => {
    const normalized = normalize(term);
    if (!normalized) return false;
    if (haystack.includes(normalized)) return true;
    return normalized.split(" ").filter((token) => token.length >= 4).some((token) => haystack.includes(token));
  });

  return {
    score: matchedTerms.length * 20,
    matchedTerms
  };
}

/**
 * Product discovery remains keyword-based, but technical eligibility never is.
 *
 * A catalogue item is allowed into the customer-facing project chooser only when:
 * - it has an exact canonical-variant link to a current manufacturer product,
 * - both the manufacturer product and application profile are verified/current,
 * - a current manufacturer application rule, backed by current manufacturer
 *   instruction evidence, explicitly permits the current scenario/facts, and
 * - no matching manufacturer rule blocks or marks the product not recommended.
 *
 * This intentionally returns zero rows while manufacturer evidence is incomplete.
 */
async function verifiedManufacturerMatches(
  canonicalPublicIds: readonly string[],
  scenarioKey: string,
  facts: Readonly<Record<string, unknown>>
): Promise<ReadonlyMap<string, VerifiedManufacturerRow>> {
  if (!canonicalPublicIds.length) return new Map();

  const result = await getProductionPostgresRuntime().nativePool.query<VerifiedManufacturerRow>(`
    WITH scenario AS (
      SELECT p.id, p.scenario_key, p.substrate, p.interior_exterior
      FROM public.build_solution_profiles p
      WHERE p.scenario_key=$2
        AND p.published=true
        AND p.review_status='approved'
        AND p.evidence_status='verified'
      LIMIT 1
    ),
    applicable AS (
      SELECT
        cv.public_id AS canonical_public_id,
        mp.id AS manufacturer_product_id,
        ar.result_status,
        ar.rule_key,
        ar.priority
      FROM scenario s
      JOIN public.canonical_variants cv
        ON cv.public_id=ANY($1::text[])
       AND cv.active=true
       AND cv.suppressed=false
       AND cv.recalled=false
      JOIN public.manufacturer_products mp
        ON mp.canonical_variant_id=cv.id
       AND mp.product_system_status='current'
       AND mp.verification_status='verified'
       AND (mp.valid_from IS NULL OR mp.valid_from<=CURRENT_DATE)
       AND (mp.valid_to IS NULL OR mp.valid_to>=CURRENT_DATE)
      JOIN public.manufacturer_application_profiles ap
        ON ap.product_id=mp.id
       AND ap.source_layer='manufacturer'
       AND ap.verification_status='verified'
       AND ap.is_current=true
       AND (ap.valid_from IS NULL OR ap.valid_from<=CURRENT_DATE)
       AND (ap.valid_to IS NULL OR ap.valid_to>=CURRENT_DATE)
      JOIN public.manufacturer_application_rules ar
        ON ar.product_id=mp.id
       AND ar.source_layer='manufacturer'
       AND ar.active=true
       AND (ar.valid_from IS NULL OR ar.valid_from<=CURRENT_DATE)
       AND (ar.valid_to IS NULL OR ar.valid_to>=CURRENT_DATE)
      JOIN public.manufacturer_instruction_evidence ie
        ON ie.id=ar.source_evidence_id
       AND ie.is_current=true
      JOIN public.manufacturer_technical_sources ts
        ON ts.id=ie.source_id
       AND ts.is_current=true
      WHERE (
        COALESCE($3::jsonb,'{}'::jsonb)
        || jsonb_build_object(
          'scenario_key', s.scenario_key,
          'substrate', s.substrate,
          'interior_exterior', s.interior_exterior
        )
      ) @> ar.condition_expression
    ),
    allowed AS (
      SELECT a.*
      FROM applicable a
      WHERE a.result_status IN (
        'eligible',
        'eligible_with_preparation',
        'requires_specific_primer',
        'requires_system_component'
      )
        AND NOT EXISTS (
          SELECT 1
          FROM applicable blocked
          WHERE blocked.manufacturer_product_id=a.manufacturer_product_id
            AND blocked.result_status IN ('not_recommended','blocked')
        )
    )
    SELECT DISTINCT ON (canonical_public_id)
      canonical_public_id,
      manufacturer_product_id::text,
      result_status,
      rule_key
    FROM allowed
    ORDER BY canonical_public_id, priority DESC, rule_key
  `, [canonicalPublicIds, scenarioKey, JSON.stringify(facts)]);

  return new Map(
    result.rows.flatMap((row) =>
      ALLOWED_ELIGIBILITY.has(row.result_status)
        ? [[row.canonical_public_id, row] as const]
        : []
    )
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const terms = safeTerms(url);
  const scenario = safeScenario(url);
  const postcode = url.searchParams.get("postcode")?.trim().slice(0, 16) || "23100";

  if (!terms.length || !scenario) {
    return Response.json({
      products: [],
      degraded: false,
      technicalVerificationRequired: true
    });
  }

  try {
    const visitorKey = await getVisitorKey();
    const queryTerms = terms.slice(0, 4);
    const pages = await Promise.all(queryTerms.map((query) =>
      getShopCatalogPage({
        visitorKey,
        postcode,
        query,
        limit: 18,
        offset: 0
      }).catch(() => ({ products: [], total: 0, hasMore: false }))
    ));

    const discovered = new Map<string, (typeof pages)[number]["products"][number]>();
    for (const product of pages.flatMap((page) => page.products)) {
      if (!product.available || product.availableToSell <= 0 || product.priceMinor <= 0) continue;
      discovered.set(product.id, product);
    }

    const verified = await verifiedManufacturerMatches(
      [...discovered.keys()],
      scenario.scenarioKey,
      scenario.facts
    );

    const unique = new Map<string, Candidate>();
    for (const product of discovered.values()) {
      const technical = verified.get(product.id);
      if (!technical) continue;

      const match = candidateScore(product, terms);
      if (match.score <= 0) continue;

      const candidate: Candidate = {
        id: product.id,
        slug: product.slug,
        url: productPublicPath(product),
        title: product.title,
        price: product.price,
        priceMinor: product.priceMinor,
        categoryCode: product.categoryCode,
        categoryLabel: product.categoryLabel,
        brand: product.brand,
        mediaId: product.mediaId,
        mediaAlt: product.mediaAlt,
        vendorName: product.vendorName,
        score: match.score,
        matchedTerms: match.matchedTerms,
        manufacturerProductId: technical.manufacturer_product_id,
        manufacturerEligibilityStatus: technical.result_status,
        manufacturerRuleKey: technical.rule_key,
        technicalVerificationStatus: "verified"
      };

      const existing = unique.get(candidate.id);
      if (!existing || candidate.score > existing.score) unique.set(candidate.id, candidate);
    }

    const products = [...unique.values()]
      .sort((left, right) =>
        right.score - left.score
        || left.priceMinor - right.priceMinor
        || left.title.localeCompare(right.title, "el")
      )
      .slice(0, 18);

    return Response.json(
      {
        products,
        degraded: false,
        technicalVerificationRequired: true
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch (error) {
    console.warn(JSON.stringify({
      level: "warn",
      event: "build_studio.candidates_degraded",
      message: error instanceof Error ? error.message : String(error)
    }));
    return Response.json({
      products: [],
      degraded: true,
      technicalVerificationRequired: true
    });
  }
}
