import {
  buildCustomerGuide,
  resolveBuildProjectGuidance,
  validateBuildGuidanceInput,
  type BuildCustomerGuide,
  type BuildProjectGuidance
} from "./build-guidance-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type BuildStudioProjectGuideRequest = Readonly<{
  project?: Readonly<{
    eyebrow?: unknown;
    title?: unknown;
    summary?: unknown;
    colour?: unknown;
  }>;
  scenarioKey?: unknown;
  facts?: unknown;
  manufacturerProductId?: unknown;
}>;

export type BuildStudioVerifiedProductSnapshot = Readonly<{
  manufacturerProductId: string;
  manufacturer: string;
  brandName: string;
  productName: string;
  canonicalPublicId: string;
  canonicalSlug: string;
  priceMinor?: number;
  currency?: string;
  officialProductCode?: string;
  eanGtin?: string;
  officialUrl?: string;
  eligibilityStatus: "eligible" | "eligible_with_preparation" | "requires_specific_primer" | "requires_system_component";
  eligibilityRuleKey: string;
}>;

export type BuildStudioProjectSnapshot = Readonly<{
  snapshotVersion: 1;
  rendererVersion: 1;
  createdAt: string;
  project: Readonly<{
    eyebrow: string;
    title: string;
    summary: string;
    colour?: string;
    scenarioKey: string;
    facts: Readonly<Record<string, unknown>>;
  }>;
  product: BuildStudioVerifiedProductSnapshot;
  guide: BuildCustomerGuide;
  rawGuidance: BuildProjectGuidance;
}>;

export type CustomerBuildStudioDocumentSummary = Readonly<{
  id: string;
  title: string;
  scenarioKey: string;
  productName: string;
  brandName: string;
  createdAt: string;
}>;

type VerifiedProductRow = Readonly<{
  manufacturer_product_id: string;
  manufacturer: string;
  brand_name: string | null;
  product_name: string;
  official_product_code: string | null;
  ean_gtin: string | null;
  official_url: string | null;
  canonical_public_id: string;
  canonical_slug: string;
  price_minor: number | string | null;
  currency: string | null;
  result_status: BuildStudioVerifiedProductSnapshot["eligibilityStatus"];
  rule_key: string;
}>;

type StoredDocumentRow = Readonly<{
  public_id: string;
  title: string;
  scenario_key: string;
  snapshot: BuildStudioProjectSnapshot;
  created_at: Date | string;
}>;

const ALLOWED_ELIGIBILITY = new Set<BuildStudioVerifiedProductSnapshot["eligibilityStatus"]>([
  "eligible",
  "eligible_with_preparation",
  "requires_specific_primer",
  "requires_system_component"
]);

function safeText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeColour(value: unknown): string | undefined {
  const colour = safeText(value, 24);
  return /^#[0-9a-f]{6}$/i.test(colour) ? colour.toUpperCase() : undefined;
}

function requestValues(input: BuildStudioProjectGuideRequest) {
  const project = input.project && typeof input.project === "object" && !Array.isArray(input.project)
    ? input.project
    : {};
  const scenarioKey = safeText(input.scenarioKey, 96);
  const manufacturerProductId = safeText(input.manufacturerProductId, 64);
  const facts = input.facts && typeof input.facts === "object" && !Array.isArray(input.facts)
    ? input.facts as Readonly<Record<string, unknown>>
    : {};

  const validated = validateBuildGuidanceInput({
    scenarioKey,
    facts,
    manufacturerProductId
  });

  return {
    project: {
      eyebrow: safeText(project.eyebrow, 120) || "PAINT & BUILD STUDIO",
      title: safeText(project.title, 180) || "Ο οδηγός του έργου σου",
      summary: safeText(project.summary, 360),
      colour: safeColour(project.colour)
    },
    scenarioKey: validated.scenarioKey,
    facts: validated.facts ?? {},
    manufacturerProductId: validated.manufacturerProductId
  };
}

async function verifiedProductForProject(input: {
  scenarioKey: string;
  facts: Readonly<Record<string, unknown>>;
  manufacturerProductId: string;
}): Promise<BuildStudioVerifiedProductSnapshot> {
  const result = await getProductionPostgresRuntime().nativePool.query<VerifiedProductRow>(`
    WITH scenario AS (
      SELECT p.scenario_key,p.substrate,p.interior_exterior
      FROM public.build_solution_profiles p
      WHERE p.scenario_key=$1
        AND p.published=true
        AND p.review_status='approved'
        AND p.evidence_status='verified'
      LIMIT 1
    ),
    product AS (
      SELECT
        mp.id AS manufacturer_product_id,
        mp.manufacturer,
        mp.brand_name,
        mp.product_name,
        mp.official_product_code,
        mp.ean_gtin,
        mp.official_url,
        cv.public_id AS canonical_public_id,
        cv.slug AS canonical_slug,
        cv.platform_price_minor AS price_minor,
        cv.currency
      FROM public.manufacturer_products mp
      JOIN public.canonical_variants cv
        ON cv.id=mp.canonical_variant_id
       AND cv.active=true
       AND cv.suppressed=false
       AND cv.recalled=false
      WHERE mp.id=$3::uuid
        AND mp.product_system_status='current'
        AND mp.verification_status='verified'
        AND (mp.valid_from IS NULL OR mp.valid_from<=CURRENT_DATE)
        AND (mp.valid_to IS NULL OR mp.valid_to>=CURRENT_DATE)
      LIMIT 1
    ),
    applicable AS (
      SELECT
        ar.result_status,
        ar.rule_key,
        ar.priority
      FROM scenario s
      CROSS JOIN product p
      JOIN public.manufacturer_application_profiles ap
        ON ap.product_id=p.manufacturer_product_id
       AND ap.source_layer='manufacturer'
       AND ap.verification_status='verified'
       AND ap.is_current=true
       AND (ap.valid_from IS NULL OR ap.valid_from<=CURRENT_DATE)
       AND (ap.valid_to IS NULL OR ap.valid_to>=CURRENT_DATE)
      JOIN public.manufacturer_application_rules ar
        ON ar.product_id=p.manufacturer_product_id
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
        COALESCE($2::jsonb,'{}'::jsonb)
        || jsonb_build_object(
          'scenario_key',s.scenario_key,
          'substrate',s.substrate,
          'interior_exterior',s.interior_exterior
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
          WHERE blocked.result_status IN ('not_recommended','blocked')
        )
      ORDER BY a.priority DESC,a.rule_key
      LIMIT 1
    )
    SELECT
      p.manufacturer_product_id::text,
      p.manufacturer,
      p.brand_name,
      p.product_name,
      p.official_product_code,
      p.ean_gtin,
      p.official_url,
      p.canonical_public_id,
      p.canonical_slug,
      p.price_minor,
      p.currency,
      a.result_status,
      a.rule_key
    FROM product p
    JOIN allowed a ON true
  `, [input.scenarioKey, JSON.stringify(input.facts), input.manufacturerProductId]);

  const row = result.rows[0];
  if (!row || !ALLOWED_ELIGIBILITY.has(row.result_status)) {
    throw new Error("Selected product is not technically verified for this project.");
  }

  const priceMinorRaw = Number(row.price_minor);
  const priceMinor = Number.isSafeInteger(priceMinorRaw) && priceMinorRaw > 0 ? priceMinorRaw : undefined;

  return {
    manufacturerProductId: row.manufacturer_product_id,
    manufacturer: row.manufacturer,
    brandName: row.brand_name?.trim() || row.manufacturer,
    productName: row.product_name,
    canonicalPublicId: row.canonical_public_id,
    canonicalSlug: row.canonical_slug,
    priceMinor,
    currency: row.currency?.trim() || undefined,
    officialProductCode: row.official_product_code?.trim() || undefined,
    eanGtin: row.ean_gtin?.trim() || undefined,
    officialUrl: row.official_url?.trim() || undefined,
    eligibilityStatus: row.result_status,
    eligibilityRuleKey: row.rule_key
  };
}

export async function buildCurrentBuildStudioProjectSnapshot(
  input: BuildStudioProjectGuideRequest
): Promise<BuildStudioProjectSnapshot> {
  const values = requestValues(input);
  if (!values.manufacturerProductId) throw new Error("A verified manufacturer product is required.");

  const [rawGuidance, product] = await Promise.all([
    resolveBuildProjectGuidance({
      scenarioKey: values.scenarioKey,
      facts: values.facts,
      manufacturerProductId: values.manufacturerProductId
    }),
    verifiedProductForProject({
      scenarioKey: values.scenarioKey,
      facts: values.facts,
      manufacturerProductId: values.manufacturerProductId
    })
  ]);

  if (rawGuidance.status === "scenario_not_found") throw new Error("Build Studio scenario was not found.");
  if (rawGuidance.blocked) throw new Error("This project is blocked by a KONTA MOU safety rule.");
  if (rawGuidance.guidance_conflict || rawGuidance.status === "review_required") {
    throw new Error("This project requires technical guidance review before a guide can be issued.");
  }

  return {
    snapshotVersion: 1,
    rendererVersion: 1,
    createdAt: new Date().toISOString(),
    project: {
      ...values.project,
      scenarioKey: values.scenarioKey,
      facts: values.facts
    },
    product,
    guide: buildCustomerGuide(rawGuidance),
    rawGuidance
  };
}

function rowSummary(row: StoredDocumentRow): CustomerBuildStudioDocumentSummary {
  return {
    id: row.public_id,
    title: row.title,
    scenarioKey: row.scenario_key,
    productName: row.snapshot.product.productName,
    brandName: row.snapshot.product.brandName,
    createdAt: new Date(row.created_at).toISOString()
  };
}

export async function createCustomerBuildStudioDocument(
  userPublicId: string,
  input: BuildStudioProjectGuideRequest
): Promise<CustomerBuildStudioDocumentSummary> {
  if (!productionDatabaseConfigured()) throw new Error("Customer documents are unavailable.");
  const snapshot = await buildCurrentBuildStudioProjectSnapshot(input);
  const result = await getProductionPostgresRuntime().nativePool.query<StoredDocumentRow>(`
    INSERT INTO public.customer_build_studio_documents(user_id,title,scenario_key,snapshot)
    SELECT u.id,$2,$3,$4::jsonb
    FROM public.users u
    WHERE u.public_id=$1 OR u.id::text=$1
    ORDER BY (u.public_id=$1) DESC
    LIMIT 1
    RETURNING public_id::text,title,scenario_key,snapshot,created_at
  `, [userPublicId, snapshot.project.title, snapshot.project.scenarioKey, JSON.stringify(snapshot)]);
  const row = result.rows[0];
  if (!row) throw new Error("Customer account was not found.");
  return rowSummary(row);
}

export async function listCustomerBuildStudioDocuments(
  userPublicId: string
): Promise<readonly CustomerBuildStudioDocumentSummary[]> {
  if (!productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().nativePool.query<StoredDocumentRow>(`
    SELECT d.public_id::text,d.title,d.scenario_key,d.snapshot,d.created_at
    FROM public.customer_build_studio_documents d
    JOIN public.users u ON u.id=d.user_id
    WHERE u.public_id=$1 OR u.id::text=$1
    ORDER BY d.created_at DESC
    LIMIT 100
  `, [userPublicId]);
  return result.rows.map(rowSummary);
}

export async function getCustomerBuildStudioDocument(
  userPublicId: string,
  documentId: string
): Promise<BuildStudioProjectSnapshot | undefined> {
  if (!productionDatabaseConfigured() || !/^[0-9a-f-]{36}$/i.test(documentId)) return undefined;
  const result = await getProductionPostgresRuntime().nativePool.query<{ snapshot: BuildStudioProjectSnapshot }>(`
    SELECT d.snapshot
    FROM public.customer_build_studio_documents d
    JOIN public.users u ON u.id=d.user_id
    WHERE d.public_id::text=$1
      AND (u.public_id=$2 OR u.id::text=$2)
    LIMIT 1
  `, [documentId, userPublicId]);
  return result.rows[0]?.snapshot;
}
