import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

type SqlExecutor = {
  query<Row extends SqlRow = SqlRow>(
    text: string,
    params?: readonly unknown[]
  ): Promise<{ rows: readonly Row[] }>;
};

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function optionalText(value: unknown): string | undefined {
  const valueText = typeof value === "string" ? value.trim() : "";
  return valueText || undefined;
}

function numberValue(value: unknown): number {
  const valueNumber = Number(value ?? 0);
  return Number.isFinite(valueNumber) ? valueNumber : 0;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => text(item).trim()).filter(Boolean)
    : [];
}

export type ResearchBusinessProfile = Readonly<{
  mainActivity: string;
  isPrimaryRevenue: boolean;
  primaryRevenueActivity?: string;
}>;

export type ResearchBusinessCategory = Readonly<{
  code: string;
  parentCode?: string;
  label: string;
}>;

export type ResearchBusinessClassificationItem = Readonly<{
  frameUnitId: string;
  legalName?: string;
  prefecture?: string;
  municipality?: string;
  sourcePrimaryKad?: string;
  allKadCodes: readonly string[];
  sourceActivityDetails: readonly Readonly<{
    code: string;
    description?: string;
    type?: string;
    kadVersion?: string;
    primary: boolean;
  }>[];
  respondentMainActivity?: string;
  respondentSaysPrimaryRevenue?: boolean;
  respondentPrimaryRevenueActivity?: string;
  categoryCode?: string;
  categoryLabel?: string;
  classificationStatus?: "suggested" | "confirmed";
  classificationSource?: "respondent_alias" | "admin";
  confidence?: number;
  updatedAt?: string;
}>;

export type ResearchBusinessClassificationWorkspace = Readonly<{
  databaseConfigured: boolean;
  studyFound: boolean;
  categories: readonly ResearchBusinessCategory[];
  items: readonly ResearchBusinessClassificationItem[];
  counts: Readonly<{
    contactable: number;
    withRespondentActivity: number;
    suggested: number;
    confirmed: number;
    pending: number;
  }>;
}>;

export function normalizeResearchBusinessActivity(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("el-GR")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

export function validateResearchBusinessProfile(value: unknown): ResearchBusinessProfile {
  const input = objectValue(value);
  const mainActivity = text(input.mainActivity).trim().replace(/\s+/g, " ").slice(0, 200);
  if (mainActivity.length < 2) throw new Error("RESEARCH_BUSINESS_ACTIVITY_REQUIRED");

  if (typeof input.isPrimaryRevenue !== "boolean") {
    throw new Error("RESEARCH_PRIMARY_REVENUE_CONFIRMATION_REQUIRED");
  }

  const isPrimaryRevenue = input.isPrimaryRevenue;
  const primaryRevenueActivity = text(input.primaryRevenueActivity)
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 200);

  if (!isPrimaryRevenue && primaryRevenueActivity.length < 2) {
    throw new Error("RESEARCH_PRIMARY_REVENUE_ACTIVITY_REQUIRED");
  }

  return {
    mainActivity,
    isPrimaryRevenue,
    primaryRevenueActivity: isPrimaryRevenue ? undefined : primaryRevenueActivity
  };
}

export async function publicResearchBusinessProfile(
  executor: SqlExecutor,
  responseId?: string
): Promise<ResearchBusinessProfile | undefined> {
  if (!responseId) return undefined;
  const result = await executor.query<SqlRow>(`
    SELECT
      declared_main_activity,
      declared_main_activity_is_primary_revenue,
      declared_primary_revenue_activity
    FROM research_business_activity_observations
    WHERE response_id=$1
    LIMIT 1
  `, [responseId]);
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    mainActivity: text(row.declared_main_activity),
    isPrimaryRevenue: Boolean(row.declared_main_activity_is_primary_revenue),
    primaryRevenueActivity: optionalText(row.declared_primary_revenue_activity)
  };
}

function sourceActivityDetails(attributes: Record<string, unknown>): readonly Record<string, unknown>[] {
  return Array.isArray(attributes.activityDetails)
    ? attributes.activityDetails.flatMap((item) => {
        const value = objectValue(item);
        return value.code ? [value] : [];
      })
    : stringArray(attributes.activityCodes).map((code) => ({ code }));
}

export async function savePublicResearchBusinessProfile(
  executor: SqlExecutor,
  input: Readonly<{
    responseId: string;
    sampleUnitId?: string;
    profile: unknown;
  }>
): Promise<ResearchBusinessProfile> {
  const profile = validateResearchBusinessProfile(input.profile);
  if (!input.sampleUnitId) throw new Error("RESEARCH_BUSINESS_FRAME_UNIT_MISSING");

  const frame = await executor.query<SqlRow>(`
    SELECT fu.id,fu.external_key_hash,fu.sampling_attributes
    FROM research_sample_units su
    JOIN research_frame_units fu ON fu.id=su.frame_unit_id
    WHERE su.id=$1
    LIMIT 1
  `, [input.sampleUnitId]);
  const frameRow = frame.rows[0];
  if (!frameRow) throw new Error("RESEARCH_BUSINESS_FRAME_UNIT_MISSING");

  const attributes = objectValue(frameRow.sampling_attributes);
  const activityCodes = stringArray(attributes.activityCodes);
  const activityDetails = sourceActivityDetails(attributes);
  const sourcePrimaryActivityCode = optionalText(attributes.sourcePrimaryActivityCode);
  const normalizedMain = normalizeResearchBusinessActivity(profile.mainActivity);
  const normalizedRevenue = profile.primaryRevenueActivity
    ? normalizeResearchBusinessActivity(profile.primaryRevenueActivity)
    : undefined;

  if (normalizedMain.length < 2 || (!profile.isPrimaryRevenue && (!normalizedRevenue || normalizedRevenue.length < 2))) {
    throw new Error("RESEARCH_BUSINESS_ACTIVITY_INVALID");
  }

  await executor.query(`
    INSERT INTO research_business_activity_observations (
      response_id,
      frame_unit_id,
      source_activity_codes,
      source_activity_details,
      source_primary_activity_code,
      declared_main_activity,
      declared_main_activity_normalized,
      declared_main_activity_is_primary_revenue,
      declared_primary_revenue_activity,
      declared_primary_revenue_activity_normalized,
      updated_at
    )
    VALUES ($1,$2,$3::text[],$4::jsonb,$5,$6,$7,$8,$9,$10,now())
    ON CONFLICT (response_id)
    DO UPDATE SET
      source_activity_codes=EXCLUDED.source_activity_codes,
      source_activity_details=EXCLUDED.source_activity_details,
      source_primary_activity_code=EXCLUDED.source_primary_activity_code,
      declared_main_activity=EXCLUDED.declared_main_activity,
      declared_main_activity_normalized=EXCLUDED.declared_main_activity_normalized,
      declared_main_activity_is_primary_revenue=EXCLUDED.declared_main_activity_is_primary_revenue,
      declared_primary_revenue_activity=EXCLUDED.declared_primary_revenue_activity,
      declared_primary_revenue_activity_normalized=EXCLUDED.declared_primary_revenue_activity_normalized,
      updated_at=now()
  `, [
    input.responseId,
    frameRow.id,
    activityCodes,
    JSON.stringify(activityDetails),
    sourcePrimaryActivityCode ?? null,
    profile.mainActivity,
    normalizedMain,
    profile.isPrimaryRevenue,
    profile.primaryRevenueActivity ?? null,
    normalizedRevenue ?? null
  ]);

  const stableActivity = profile.isPrimaryRevenue ? profile.mainActivity : profile.primaryRevenueActivity!;
  const stableNormalized = profile.isPrimaryRevenue ? normalizedMain : normalizedRevenue!;
  const currentAssignment = await executor.query<SqlRow>(`
    SELECT category_code,status
    FROM research_business_canonical_assignments
    WHERE external_key_hash=$1
    LIMIT 1
  `, [frameRow.external_key_hash]);

  if (text(currentAssignment.rows[0]?.status) !== "confirmed") {
    const alias = await executor.query<SqlRow>(`
      SELECT
        normalized_activity,
        category_code,
        CASE
          WHEN normalized_activity=$1 THEN 1::numeric
          ELSE similarity(normalized_activity,$1)
        END AS confidence
      FROM research_business_activity_aliases
      WHERE status='confirmed'
        AND (
          normalized_activity=$1
          OR similarity(normalized_activity,$1) >= 0.86
        )
      ORDER BY
        CASE WHEN normalized_activity=$1 THEN 0 ELSE 1 END,
        similarity(normalized_activity,$1) DESC,
        updated_at DESC
      LIMIT 1
    `, [stableNormalized]);
    const match = alias.rows[0];

    if (match) {
      const previousCategory = optionalText(currentAssignment.rows[0]?.category_code);
      const previousStatus = optionalText(currentAssignment.rows[0]?.status);
      const categoryCode = text(match.category_code);
      const confidence = Math.max(0, Math.min(1, numberValue(match.confidence)));

      await executor.query(`
        INSERT INTO research_business_canonical_assignments (
          external_key_hash,category_code,status,assignment_source,
          basis_activity,basis_activity_normalized,suggestion_confidence,
          reviewed_by,review_note,reviewed_at,updated_at
        )
        VALUES ($1,$2,'suggested','respondent_alias',$3,$4,$5,NULL,NULL,NULL,now())
        ON CONFLICT (external_key_hash)
        DO UPDATE SET
          category_code=EXCLUDED.category_code,
          status='suggested',
          assignment_source='respondent_alias',
          basis_activity=EXCLUDED.basis_activity,
          basis_activity_normalized=EXCLUDED.basis_activity_normalized,
          suggestion_confidence=EXCLUDED.suggestion_confidence,
          reviewed_by=NULL,
          review_note=NULL,
          reviewed_at=NULL,
          updated_at=now()
        WHERE research_business_canonical_assignments.status<>'confirmed'
      `, [
        frameRow.external_key_hash,
        categoryCode,
        stableActivity,
        stableNormalized,
        confidence
      ]);

      if (previousCategory !== categoryCode || previousStatus !== "suggested") {
        await executor.query(`
          INSERT INTO research_business_classification_events (
            external_key_hash,frame_unit_id,response_id,
            previous_category_code,category_code,previous_status,status,
            source,confidence,note
          )
          VALUES ($1,$2,$3,$4,$5,$6,'suggested','respondent_alias',$7,'Confirmed activity alias match')
        `, [
          frameRow.external_key_hash,
          frameRow.id,
          input.responseId,
          previousCategory ?? null,
          categoryCode,
          previousStatus ?? null,
          confidence
        ]);
      }
    }
  }

  return profile;
}

export async function researchBusinessClassificationWorkspace(
  principal: SessionPrincipal,
  slug: string
): Promise<ResearchBusinessClassificationWorkspace> {
  assertAdminPermission(principal, "research.read");
  const empty: ResearchBusinessClassificationWorkspace = {
    databaseConfigured: productionDatabaseConfigured(),
    studyFound: false,
    categories: [],
    items: [],
    counts: { contactable: 0, withRespondentActivity: 0, suggested: 0, confirmed: 0, pending: 0 }
  };
  if (!empty.databaseConfigured) return empty;

  const pool = getProductionPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>(
    "SELECT id FROM research_studies WHERE slug=$1 LIMIT 1",
    [slug]
  );
  if (!study.rows[0]) return { ...empty, databaseConfigured: true };

  const [categories, counts, items] = await Promise.all([
    pool.query<SqlRow>(`
      SELECT code,parent_code,label_el
      FROM research_business_categories
      WHERE active=true
      ORDER BY sort_order,label_el,code
    `),
    pool.query<SqlRow>(`
      WITH latest_frame AS (
        SELECT id
        FROM research_frame_snapshots
        WHERE study_id=$1
        ORDER BY created_at DESC
        LIMIT 1
      ),
      contactable AS (
        SELECT fu.id,fu.external_key_hash
        FROM research_frame_units fu
        WHERE fu.frame_snapshot_id=(SELECT id FROM latest_frame)
          AND EXISTS (
            SELECT 1
            FROM research_contact_points cp
            WHERE cp.frame_unit_id=fu.id
              AND cp.contact_type='email'
              AND cp.suppression_status='active'
              AND NOT public.research_contact_is_suppressed(cp.contact_type,cp.contact_value_hash)
          )
      ),
      observed AS (
        SELECT DISTINCT o.frame_unit_id
        FROM research_business_activity_observations o
        JOIN contactable c ON c.id=o.frame_unit_id
      )
      SELECT
        (SELECT count(*) FROM contactable)::int AS contactable,
        (SELECT count(*) FROM observed)::int AS with_respondent_activity,
        count(*) FILTER (WHERE a.status='suggested')::int AS suggested,
        count(*) FILTER (WHERE a.status='confirmed')::int AS confirmed,
        count(*) FILTER (WHERE a.external_key_hash IS NULL)::int AS pending
      FROM contactable c
      LEFT JOIN research_business_canonical_assignments a USING (external_key_hash)
    `, [study.rows[0].id]),
    pool.query<SqlRow>(`
      WITH latest_frame AS (
        SELECT id
        FROM research_frame_snapshots
        WHERE study_id=$1
        ORDER BY created_at DESC
        LIMIT 1
      )
      SELECT
        fu.id AS frame_unit_id,
        fu.sampling_attributes->>'legalName' AS legal_name,
        fu.sampling_attributes->>'prefecture' AS prefecture,
        fu.sampling_attributes->>'municipality' AS municipality,
        fu.sampling_attributes->>'sourcePrimaryActivityCode' AS source_primary_kad,
        COALESCE(fu.sampling_attributes->'activityCodes','[]'::jsonb) AS activity_codes,
        COALESCE(fu.sampling_attributes->'activityDetails','[]'::jsonb) AS activity_details,
        obs.declared_main_activity,
        obs.declared_main_activity_is_primary_revenue,
        obs.declared_primary_revenue_activity,
        assignment.category_code,
        category.label_el AS category_label,
        assignment.status AS classification_status,
        assignment.assignment_source,
        assignment.suggestion_confidence,
        assignment.updated_at
      FROM research_frame_units fu
      LEFT JOIN LATERAL (
        SELECT
          o.declared_main_activity,
          o.declared_main_activity_is_primary_revenue,
          o.declared_primary_revenue_activity,
          o.updated_at
        FROM research_business_activity_observations o
        WHERE o.frame_unit_id=fu.id
        ORDER BY o.updated_at DESC
        LIMIT 1
      ) obs ON true
      LEFT JOIN research_business_canonical_assignments assignment
        ON assignment.external_key_hash=fu.external_key_hash
      LEFT JOIN research_business_categories category
        ON category.code=assignment.category_code
      WHERE fu.frame_snapshot_id=(SELECT id FROM latest_frame)
        AND EXISTS (
          SELECT 1
          FROM research_contact_points cp
          WHERE cp.frame_unit_id=fu.id
            AND cp.contact_type='email'
            AND cp.suppression_status='active'
            AND NOT public.research_contact_is_suppressed(cp.contact_type,cp.contact_value_hash)
        )
      ORDER BY
        CASE
          WHEN obs.declared_main_activity IS NOT NULL AND assignment.status IS NULL THEN 0
          WHEN assignment.status='suggested' THEN 1
          WHEN assignment.status IS NULL THEN 2
          ELSE 3
        END,
        obs.updated_at DESC NULLS LAST,
        fu.created_at DESC
      LIMIT 300
    `, [study.rows[0].id])
  ]);

  const countRow = counts.rows[0] ?? {};
  return {
    databaseConfigured: true,
    studyFound: true,
    categories: categories.rows.map((row) => ({
      code: text(row.code),
      parentCode: optionalText(row.parent_code),
      label: text(row.label_el)
    })),
    items: items.rows.map((row) => ({
      frameUnitId: text(row.frame_unit_id),
      legalName: optionalText(row.legal_name),
      prefecture: optionalText(row.prefecture),
      municipality: optionalText(row.municipality),
      sourcePrimaryKad: optionalText(row.source_primary_kad),
      allKadCodes: stringArray(row.activity_codes),
      sourceActivityDetails: Array.isArray(row.activity_details)
        ? row.activity_details.map((raw) => {
            const item = objectValue(raw);
            return {
              code: text(item.code),
              description: optionalText(item.description),
              type: optionalText(item.type),
              kadVersion: optionalText(item.kadVersion),
              primary: Boolean(item.primary)
            };
          }).filter((item) => item.code)
        : [],
      respondentMainActivity: optionalText(row.declared_main_activity),
      respondentSaysPrimaryRevenue: row.declared_main_activity_is_primary_revenue == null
        ? undefined
        : Boolean(row.declared_main_activity_is_primary_revenue),
      respondentPrimaryRevenueActivity: optionalText(row.declared_primary_revenue_activity),
      categoryCode: optionalText(row.category_code),
      categoryLabel: optionalText(row.category_label),
      classificationStatus: optionalText(row.classification_status) as "suggested" | "confirmed" | undefined,
      classificationSource: optionalText(row.assignment_source) as "respondent_alias" | "admin" | undefined,
      confidence: row.suggestion_confidence == null ? undefined : numberValue(row.suggestion_confidence),
      updatedAt: optionalText(row.updated_at)
    })),
    counts: {
      contactable: numberValue(countRow.contactable),
      withRespondentActivity: numberValue(countRow.with_respondent_activity),
      suggested: numberValue(countRow.suggested),
      confirmed: numberValue(countRow.confirmed),
      pending: numberValue(countRow.pending)
    }
  };
}

export async function canonicalizeResearchBusiness(
  principal: SessionPrincipal,
  input: Readonly<{
    slug: string;
    frameUnitId: string;
    categoryCode: string;
    note?: string;
    rememberAlias?: boolean;
  }>
): Promise<Readonly<{
  frameUnitId: string;
  categoryCode: string;
  status: "confirmed";
  aliasRemembered: boolean;
}>> {
  assertAdminPermission(principal, "research.design.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  if (!/^[0-9a-f-]{36}$/i.test(input.frameUnitId)) throw new Error("RESEARCH_BUSINESS_FRAME_UNIT_INVALID");
  if (!/^[a-z0-9_]{2,80}$/.test(input.categoryCode)) throw new Error("RESEARCH_BUSINESS_CATEGORY_INVALID");

  const note = input.note?.trim().replace(/[\r\n]+/g, " ").slice(0, 500) || "";
  const client = await getProductionPostgresRuntime().sqlPool.connect();

  try {
    await client.query("BEGIN");
    const category = await client.query<SqlRow>(`
      SELECT code
      FROM research_business_categories
      WHERE code=$1 AND active=true
      LIMIT 1
    `, [input.categoryCode]);
    if (!category.rows[0]) throw new Error("RESEARCH_BUSINESS_CATEGORY_NOT_FOUND");

    const unitResult = await client.query<SqlRow>(`
      SELECT
        fu.id,
        fu.external_key_hash,
        fu.sampling_attributes,
        obs.response_id,
        obs.declared_main_activity,
        obs.declared_main_activity_normalized,
        obs.declared_main_activity_is_primary_revenue,
        obs.declared_primary_revenue_activity,
        obs.declared_primary_revenue_activity_normalized
      FROM research_frame_units fu
      JOIN research_frame_snapshots fs ON fs.id=fu.frame_snapshot_id
      JOIN research_studies s ON s.id=fs.study_id
      LEFT JOIN LATERAL (
        SELECT o.*
        FROM research_business_activity_observations o
        WHERE o.frame_unit_id=fu.id
        ORDER BY o.updated_at DESC
        LIMIT 1
      ) obs ON true
      WHERE s.slug=$1 AND fu.id=$2
      ORDER BY fs.created_at DESC
      LIMIT 1
      FOR UPDATE OF fu
    `, [input.slug, input.frameUnitId]);
    const unit = unitResult.rows[0];
    if (!unit) throw new Error("RESEARCH_BUSINESS_FRAME_UNIT_NOT_FOUND");

    const attributes = objectValue(unit.sampling_attributes);
    const sourcePrimary = optionalText(attributes.sourcePrimaryActivityCode);
    const sourceCodes = stringArray(attributes.activityCodes);
    const respondentUsesRevenueActivity =
      unit.declared_main_activity_is_primary_revenue != null
      && !Boolean(unit.declared_main_activity_is_primary_revenue);
    const respondentActivity = respondentUsesRevenueActivity
      ? optionalText(unit.declared_primary_revenue_activity)
      : optionalText(unit.declared_main_activity);
    const respondentNormalized = respondentUsesRevenueActivity
      ? optionalText(unit.declared_primary_revenue_activity_normalized)
      : optionalText(unit.declared_main_activity_normalized);
    const sourceActivitySummary = sourceCodes.join(", ").trim();
    const basisActivity = respondentActivity
      || sourcePrimary
      || sourceActivitySummary
      || "manual classification";
    const basisNormalized = respondentNormalized
      || normalizeResearchBusinessActivity(basisActivity)
      || "manual classification";

    const previous = await client.query<SqlRow>(`
      SELECT category_code,status
      FROM research_business_canonical_assignments
      WHERE external_key_hash=$1
      FOR UPDATE
    `, [unit.external_key_hash]);

    await client.query(`
      INSERT INTO research_business_canonical_assignments (
        external_key_hash,category_code,status,assignment_source,
        basis_activity,basis_activity_normalized,suggestion_confidence,
        reviewed_by,review_note,reviewed_at,updated_at
      )
      VALUES ($1,$2,'confirmed','admin',$3,$4,NULL,$5,$6,now(),now())
      ON CONFLICT (external_key_hash)
      DO UPDATE SET
        category_code=EXCLUDED.category_code,
        status='confirmed',
        assignment_source='admin',
        basis_activity=EXCLUDED.basis_activity,
        basis_activity_normalized=EXCLUDED.basis_activity_normalized,
        suggestion_confidence=NULL,
        reviewed_by=EXCLUDED.reviewed_by,
        review_note=EXCLUDED.review_note,
        reviewed_at=now(),
        updated_at=now()
    `, [
      unit.external_key_hash,
      input.categoryCode,
      basisActivity,
      basisNormalized,
      principal.userId,
      note || null
    ]);

    await client.query(`
      INSERT INTO research_business_classification_events (
        external_key_hash,frame_unit_id,response_id,
        previous_category_code,category_code,previous_status,status,
        source,actor_user_id,note
      )
      VALUES ($1,$2,$3,$4,$5,$6,'confirmed','admin',$7,$8)
    `, [
      unit.external_key_hash,
      unit.id,
      unit.response_id ?? null,
      previous.rows[0]?.category_code ?? null,
      input.categoryCode,
      previous.rows[0]?.status ?? null,
      principal.userId,
      note || null
    ]);

    let aliasRemembered = false;
    if (input.rememberAlias !== false && respondentActivity && respondentNormalized && respondentNormalized.length >= 2) {
      await client.query(`
        INSERT INTO research_business_activity_aliases (
          normalized_activity,example_activity,category_code,status,
          confirmed_by,confirmed_at,updated_at
        )
        VALUES ($1,$2,$3,'confirmed',$4,now(),now())
        ON CONFLICT (normalized_activity)
        DO UPDATE SET
          example_activity=EXCLUDED.example_activity,
          category_code=EXCLUDED.category_code,
          status='confirmed',
          confirmed_by=EXCLUDED.confirmed_by,
          confirmed_at=now(),
          updated_at=now()
      `, [respondentNormalized, respondentActivity, input.categoryCode, principal.userId]);
      aliasRemembered = true;
    }

    await client.query("COMMIT");
    return {
      frameUnitId: input.frameUnitId,
      categoryCode: input.categoryCode,
      status: "confirmed",
      aliasRemembered
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
