import { createHash, randomBytes } from "node:crypto";
import {
  KONTA_MOU_INFORMATION_PERMISSION,
  RETAIL_STUDY_2026_DEFINITION,
  RETAIL_STUDY_2026_METHODOLOGY,
  RETAIL_STUDY_2026_SLUG,
  RETAIL_STUDY_2026_VERSION,
  calibrateRetailStudyWeights,
  scoreRetailStudy,
  stableJson,
  validateRetailStudyAnswers,
  type AnalysisRecord,
  type PopulationCell,
  type SurveyAnswers,
  type WeightedRecord
} from "./retail-study-2026";
import { getAdminPostgresRuntime, getProductionPostgresRuntime } from "./postgres-runtime";

export const RETAIL_STUDY_COOKIE = "konta_retail_research_2026";

export const RETAIL_STUDY_2026_INSTRUMENT_SHA256 = sha256(stableJson(RETAIL_STUDY_2026_DEFINITION));

type StudyRow = Readonly<{
  id: string;
  status: "draft" | "fieldwork" | "closed" | "published";
  design_type: "census_invitation" | "stratified_probability_sample" | "nonprobability";
  instrument_sha256: string;
}>;

type InvitationRow = Readonly<{
  invitation_id: string;
  study_id: string;
  study_status: "draft" | "fieldwork" | "closed" | "published";
  design_type: "census_invitation" | "stratified_probability_sample" | "nonprobability";
  instrument_sha256: string;
  disposition: string;
  sector_group: string;
  prefecture: string;
  municipality: string;
  stratum_key: string | null;
  selection_probability: string | number;
  response_id: string | null;
  response_status: string | null;
  started_at: Date | string | null;
  submitted_at: Date | string | null;
}>;

export type RetailStudyParticipantState = Readonly<{
  active: boolean;
  completed: boolean;
  sectorGroup: string;
  prefecture: string;
  municipality: string;
  startedAt?: string;
  permissionStatus?: "pending" | "confirmed" | "withdrawn" | "declined";
}>;

export type PrepareInvitationInput = Readonly<{
  sourceRecordKey: string;
  contactEmail: string;
  sectorGroup: string;
  prefecture?: string;
  municipality?: string;
  stratumKey?: string;
  selectionProbability?: number;
  metadata?: Readonly<Record<string, unknown>>;
}>;

export async function ensureRetailStudy2026(): Promise<StudyRow> {
  const runtime = getAdminPostgresRuntime();
  const instrumentJson = stableJson(RETAIL_STUDY_2026_DEFINITION);
  const methodologyJson = stableJson(RETAIL_STUDY_2026_METHODOLOGY);
  await runtime.nativePool.query(
    `INSERT INTO public.retail_research_studies
      (slug,version,title,sponsor,population_definition,design_type,status,instrument_json,methodology_json,instrument_sha256)
     VALUES ($1,$2,$3,$4,$5,$6,'draft',$7::jsonb,$8::jsonb,$9)
     ON CONFLICT (slug,version) DO NOTHING`,
    [
      RETAIL_STUDY_2026_SLUG,
      RETAIL_STUDY_2026_VERSION,
      RETAIL_STUDY_2026_DEFINITION.title,
      RETAIL_STUDY_2026_DEFINITION.sponsor,
      RETAIL_STUDY_2026_METHODOLOGY.targetPopulation,
      RETAIL_STUDY_2026_METHODOLOGY.defaultDesignType,
      instrumentJson,
      methodologyJson,
      RETAIL_STUDY_2026_INSTRUMENT_SHA256
    ]
  );
  const result = await runtime.nativePool.query<StudyRow>(
    `SELECT id::text,status,design_type,instrument_sha256
       FROM public.retail_research_studies
      WHERE slug=$1 AND version=$2`,
    [RETAIL_STUDY_2026_SLUG, RETAIL_STUDY_2026_VERSION]
  );
  const row = result.rows[0];
  if (!row) throw new Error("RETAIL_STUDY_NOT_INITIALIZED");
  if (row.instrument_sha256 !== RETAIL_STUDY_2026_INSTRUMENT_SHA256) {
    throw new Error("RETAIL_STUDY_INSTRUMENT_HASH_MISMATCH");
  }
  return row;
}

export async function setRetailStudyFieldworkStatus(
  status: "draft" | "fieldwork" | "closed" | "published",
  designType?: "census_invitation" | "stratified_probability_sample" | "nonprobability"
): Promise<StudyRow> {
  const study = await ensureRetailStudy2026();
  if (study.status !== "draft" && designType && designType !== study.design_type) {
    throw new Error("RETAIL_STUDY_DESIGN_IS_FROZEN");
  }
  const runtime = getAdminPostgresRuntime();
  const result = await runtime.nativePool.query<StudyRow>(
    `UPDATE public.retail_research_studies
        SET status=$2,
            design_type=COALESCE($3,design_type),
            fieldwork_started_at=CASE WHEN $2='fieldwork' THEN COALESCE(fieldwork_started_at,now()) ELSE fieldwork_started_at END,
            fieldwork_closed_at=CASE WHEN $2 IN ('closed','published') THEN COALESCE(fieldwork_closed_at,now()) ELSE fieldwork_closed_at END
      WHERE id=$1
      RETURNING id::text,status,design_type,instrument_sha256`,
    [study.id, status, designType ?? null]
  );
  return result.rows[0] ?? study;
}

export async function upsertRetailStudyStratum(input: Readonly<{
  stratumKey: string;
  sectorGroup: string;
  prefecture?: string;
  populationCount: number;
  sampleTarget?: number;
  frameSnapshotAt: string | Date;
  metadata?: Readonly<Record<string, unknown>>;
}>): Promise<string> {
  const study = await ensureRetailStudy2026();
  const runtime = getAdminPostgresRuntime();
  const result = await runtime.nativePool.query<{ id: string }>(
    `INSERT INTO public.retail_research_strata
       (study_id,stratum_key,sector_group,prefecture,population_count,sample_target,frame_snapshot_at,metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     ON CONFLICT (study_id,stratum_key) DO UPDATE SET
       sector_group=EXCLUDED.sector_group,
       prefecture=EXCLUDED.prefecture,
       population_count=EXCLUDED.population_count,
       sample_target=EXCLUDED.sample_target,
       frame_snapshot_at=EXCLUDED.frame_snapshot_at,
       metadata=EXCLUDED.metadata
     RETURNING id::text`,
    [
      study.id,
      input.stratumKey,
      input.sectorGroup,
      input.prefecture?.trim() ?? "",
      Math.max(0, Math.floor(input.populationCount)),
      input.sampleTarget == null ? null : Math.max(0, Math.floor(input.sampleTarget)),
      input.frameSnapshotAt,
      JSON.stringify(input.metadata ?? {})
    ]
  );
  if (!result.rows[0]) throw new Error("RETAIL_STUDY_STRATUM_WRITE_FAILED");
  return result.rows[0].id;
}

export async function prepareRetailStudyInvitation(input: PrepareInvitationInput): Promise<Readonly<{ token: string; url: string }>> {
  const study = await ensureRetailStudy2026();
  if (!["draft", "fieldwork"].includes(study.status)) throw new Error("RETAIL_STUDY_NOT_ACCEPTING_INVITATIONS");
  const rawToken = randomBytes(32).toString("base64url");
  const email = normalizeEmail(input.contactEmail);
  if (!email) throw new Error("RETAIL_STUDY_EMAIL_REQUIRED");
  const runtime = getAdminPostgresRuntime();
  const stratum = input.stratumKey
    ? await runtime.nativePool.query<{ id: string }>(
        `SELECT id::text FROM public.retail_research_strata WHERE study_id=$1 AND stratum_key=$2`,
        [study.id, input.stratumKey]
      )
    : null;
  const stratumId = stratum?.rows[0]?.id ?? null;
  const probability = input.selectionProbability ?? 1;
  if (!(probability > 0 && probability <= 1)) throw new Error("RETAIL_STUDY_SELECTION_PROBABILITY_INVALID");

  await runtime.nativePool.query(
    `INSERT INTO public.retail_research_invitations
       (study_id,stratum_id,token_digest,source_record_key,contact_email,contact_email_digest,sector_group,prefecture,municipality,selection_probability,metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
     ON CONFLICT (study_id,source_record_key) DO UPDATE SET
       stratum_id=COALESCE(EXCLUDED.stratum_id,retail_research_invitations.stratum_id),
       contact_email=EXCLUDED.contact_email,
       contact_email_digest=EXCLUDED.contact_email_digest,
       sector_group=EXCLUDED.sector_group,
       prefecture=EXCLUDED.prefecture,
       municipality=EXCLUDED.municipality,
       selection_probability=EXCLUDED.selection_probability,
       metadata=retail_research_invitations.metadata || EXCLUDED.metadata`,
    [
      study.id,
      stratumId,
      sha256(rawToken),
      input.sourceRecordKey.trim(),
      email,
      sha256(email),
      input.sectorGroup.trim(),
      input.prefecture?.trim() ?? "",
      input.municipality?.trim() ?? "",
      probability,
      JSON.stringify(input.metadata ?? {})
    ]
  );

  return {
    token: rawToken,
    url: `https://kontamou.site/research/retail-2026/i/${encodeURIComponent(rawToken)}`
  };
}

export async function resolveRetailStudyInvitation(rawToken: string): Promise<InvitationRow | null> {
  if (!rawToken || rawToken.length < 24 || rawToken.length > 128) return null;
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.nativePool.query<InvitationRow>(
    `SELECT i.id::text AS invitation_id,
            i.study_id::text,
            s.status AS study_status,
            s.design_type,
            s.instrument_sha256,
            i.disposition,
            i.sector_group,
            i.prefecture,
            i.municipality,
            st.stratum_key,
            i.selection_probability,
            r.id::text AS response_id,
            r.status AS response_status,
            r.started_at,
            r.submitted_at
       FROM public.retail_research_invitations i
       JOIN public.retail_research_studies s ON s.id=i.study_id
       LEFT JOIN public.retail_research_strata st ON st.id=i.stratum_id
       LEFT JOIN public.retail_research_responses r ON r.invitation_id=i.id
      WHERE i.token_digest=$1
      LIMIT 1`,
    [sha256(rawToken)]
  );
  const row = result.rows[0] ?? null;
  if (row && row.instrument_sha256 !== RETAIL_STUDY_2026_INSTRUMENT_SHA256) throw new Error("RETAIL_STUDY_INSTRUMENT_HASH_MISMATCH");
  return row;
}

export async function getRetailStudyParticipantState(rawToken: string): Promise<RetailStudyParticipantState | null> {
  const invitation = await resolveRetailStudyInvitation(rawToken);
  if (!invitation) return null;
  const runtime = getProductionPostgresRuntime();
  const permission = await runtime.nativePool.query<{ status: RetailStudyParticipantState["permissionStatus"] }>(
    `SELECT status
       FROM public.retail_research_permissions
      WHERE invitation_id=$1 AND purpose='konta_mou_information'
      LIMIT 1`,
    [invitation.invitation_id]
  );
  return {
    active: invitation.study_status === "fieldwork",
    completed: invitation.response_status === "complete",
    sectorGroup: invitation.sector_group,
    prefecture: invitation.prefecture,
    municipality: invitation.municipality,
    startedAt: invitation.started_at ? new Date(invitation.started_at).toISOString() : undefined,
    permissionStatus: permission.rows[0]?.status
  };
}

export async function startRetailStudyResponse(rawToken: string): Promise<RetailStudyParticipantState> {
  const invitation = await requireActiveInvitation(rawToken);
  const runtime = getProductionPostgresRuntime();
  await runtime.nativePool.query("BEGIN");
  try {
    await runtime.nativePool.query(
      `INSERT INTO public.retail_research_responses (invitation_id,instrument_sha256,status)
       VALUES ($1,$2,'started')
       ON CONFLICT (invitation_id) DO NOTHING`,
      [invitation.invitation_id, RETAIL_STUDY_2026_INSTRUMENT_SHA256]
    );
    await runtime.nativePool.query(
      `UPDATE public.retail_research_invitations
          SET disposition=CASE WHEN disposition IN ('prepared','sent','delivered') THEN 'started' ELSE disposition END,
              first_started_at=COALESCE(first_started_at,now())
        WHERE id=$1`,
      [invitation.invitation_id]
    );
    await runtime.nativePool.query("COMMIT");
  } catch (error) {
    await runtime.nativePool.query("ROLLBACK");
    throw error;
  }
  const state = await getRetailStudyParticipantState(rawToken);
  if (!state) throw new Error("RETAIL_STUDY_INVITATION_NOT_FOUND");
  return state;
}

export async function submitRetailStudyResponse(rawToken: string, answers: SurveyAnswers): Promise<RetailStudyParticipantState> {
  const invitation = await requireActiveInvitation(rawToken);
  const errors = validateRetailStudyAnswers(answers);
  if (errors.length) throw new Error("RETAIL_STUDY_ANSWERS_INVALID:" + errors.slice(0, 8).join(","));
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  try {
    await client.query("BEGIN");
    const responseResult = await client.query<{ id: string; started_at: Date | string }>(
      `INSERT INTO public.retail_research_responses (invitation_id,instrument_sha256,status)
       VALUES ($1,$2,'started')
       ON CONFLICT (invitation_id) DO UPDATE SET updated_at=now()
       RETURNING id::text,started_at`,
      [invitation.invitation_id, RETAIL_STUDY_2026_INSTRUMENT_SHA256]
    );
    const response = responseResult.rows[0];
    if (!response) throw new Error("RETAIL_STUDY_RESPONSE_WRITE_FAILED");

    await client.query(`DELETE FROM public.retail_research_answers WHERE response_id=$1`, [response.id]);
    for (const [questionId, answer] of Object.entries(answers)) {
      if (answer == null || answer === "") continue;
      await client.query(
        `INSERT INTO public.retail_research_answers (response_id,question_id,answer_json)
         VALUES ($1,$2,$3::jsonb)`,
        [response.id, questionId, JSON.stringify(answer)]
      );
    }

    const durationSeconds = Math.max(0, Math.round((Date.now() - new Date(response.started_at).getTime()) / 1000));
    const qualityFlags = durationSeconds < RETAIL_STUDY_2026_METHODOLOGY.qualityRules.speedingWarningUnderSeconds
      ? ["speeding_warning"]
      : [];
    await client.query(
      `UPDATE public.retail_research_responses
          SET status='complete',submitted_at=now(),duration_seconds=$2,quality_flags=$3::jsonb,updated_at=now()
        WHERE id=$1`,
      [response.id, durationSeconds, JSON.stringify(qualityFlags)]
    );
    await client.query(
      `UPDATE public.retail_research_invitations
          SET disposition='completed',completed_at=now(),first_started_at=COALESCE(first_started_at,now())
        WHERE id=$1`,
      [invitation.invitation_id]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const state = await getRetailStudyParticipantState(rawToken);
  if (!state) throw new Error("RETAIL_STUDY_INVITATION_NOT_FOUND");
  return state;
}

export async function requestKontaMouInformation(rawToken: string): Promise<Readonly<{ confirmationToken: string }>> {
  const invitation = await resolveRetailStudyInvitation(rawToken);
  if (!invitation || invitation.response_status !== "complete") throw new Error("RETAIL_STUDY_MUST_BE_COMPLETED_FIRST");
  const confirmationToken = randomBytes(32).toString("base64url");
  const runtime = getProductionPostgresRuntime();
  await runtime.nativePool.query(
    `INSERT INTO public.retail_research_permissions
       (invitation_id,purpose,status,consent_text_version,consent_text,consented_at,confirmation_token_digest,evidence)
     VALUES ($1,'konta_mou_information','pending',$2,$3,now(),$4,$5::jsonb)
     ON CONFLICT (invitation_id,purpose) DO UPDATE SET
       status='pending',
       consent_text_version=EXCLUDED.consent_text_version,
       consent_text=EXCLUDED.consent_text,
       consented_at=now(),
       confirmation_token_digest=EXCLUDED.confirmation_token_digest,
       confirmed_at=NULL,
       withdrawn_at=NULL,
       evidence=EXCLUDED.evidence,
       updated_at=now()`,
    [
      invitation.invitation_id,
      KONTA_MOU_INFORMATION_PERMISSION.version,
      KONTA_MOU_INFORMATION_PERMISSION.text,
      sha256(confirmationToken),
      JSON.stringify({ instrumentSha256: RETAIL_STUDY_2026_INSTRUMENT_SHA256, source: "survey_completion" })
    ]
  );
  return { confirmationToken };
}

export async function confirmKontaMouInformationPermission(confirmationToken: string): Promise<boolean> {
  if (!confirmationToken || confirmationToken.length < 24) return false;
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.nativePool.query(
    `UPDATE public.retail_research_permissions
        SET status='confirmed',confirmed_at=now(),updated_at=now()
      WHERE purpose='konta_mou_information'
        AND status='pending'
        AND confirmation_token_digest=$1`,
    [sha256(confirmationToken)]
  );
  return (result.rowCount ?? 0) > 0;
}

export type RetailStudyDashboard = Readonly<{
  study: StudyRow;
  counts: Readonly<Record<string, number>>;
  population: number;
  completed: number;
  responseRate: number | null;
  permissionPending: number;
  permissionConfirmed: number;
  weightedDigitalReadiness: number | null;
  weightedCommerceFriction: number | null;
  effectiveBase: number;
  sectorComparisons: readonly Readonly<{
    sector: string;
    rawBase: number;
    weightedDigitalReadiness: number | null;
    weightedCommerceFriction: number | null;
  }>[];
}>;

export async function getRetailStudyDashboard(): Promise<RetailStudyDashboard> {
  const study = await ensureRetailStudy2026();
  const runtime = getAdminPostgresRuntime();
  const [countResult, frameResult, responseResult, permissionResult] = await Promise.all([
    runtime.nativePool.query<{ disposition: string; count: string }>(
      `SELECT disposition,count(*)::text AS count FROM public.retail_research_invitations WHERE study_id=$1 GROUP BY disposition`,
      [study.id]
    ),
    runtime.nativePool.query<{ stratum_key: string; population_count: number | string }>(
      `SELECT stratum_key,population_count FROM public.retail_research_strata WHERE study_id=$1 ORDER BY stratum_key`,
      [study.id]
    ),
    runtime.nativePool.query<{
      id: string;
      stratum_key: string | null;
      sector_group: string;
      prefecture: string;
      selection_probability: string | number;
      answers: Record<string, unknown>;
    }>(
      `SELECT r.id::text AS id,
              st.stratum_key,
              i.sector_group,
              i.prefecture,
              i.selection_probability,
              COALESCE(jsonb_object_agg(a.question_id,a.answer_json) FILTER (WHERE a.question_id IS NOT NULL),'{}'::jsonb) AS answers
         FROM public.retail_research_responses r
         JOIN public.retail_research_invitations i ON i.id=r.invitation_id
         LEFT JOIN public.retail_research_strata st ON st.id=i.stratum_id
         LEFT JOIN public.retail_research_answers a ON a.response_id=r.id
        WHERE i.study_id=$1 AND r.status='complete'
        GROUP BY r.id,st.stratum_key,i.sector_group,i.prefecture,i.selection_probability
        ORDER BY r.id`,
      [study.id]
    ),
    runtime.nativePool.query<{ status: string; count: string }>(
      `SELECT status,count(*)::text AS count
         FROM public.retail_research_permissions p
         JOIN public.retail_research_invitations i ON i.id=p.invitation_id
        WHERE i.study_id=$1 AND p.purpose='konta_mou_information'
        GROUP BY status`,
      [study.id]
    )
  ]);

  const counts = Object.fromEntries(countResult.rows.map((row) => [row.disposition, Number(row.count)]));
  const populationCells: PopulationCell[] = frameResult.rows.map((row) => ({
    stratumKey: row.stratum_key,
    populationCount: Number(row.population_count)
  }));
  const records: AnalysisRecord[] = responseResult.rows.map((row) => ({
    id: row.id,
    stratumKey: row.stratum_key ?? row.sector_group + "|" + row.prefecture,
    sectorGroup: row.sector_group,
    prefecture: row.prefecture,
    selectionProbability: Number(row.selection_probability) || 1,
    answers: row.answers ?? {},
    scores: scoreRetailStudy(row.answers ?? {})
  }));
  const weighted = calibrateRetailStudyWeights(records, populationCells);
  const sectors = [...new Set(weighted.map((record) => record.sectorGroup))].sort();
  const sectorComparisons = sectors.map((sector) => {
    const rows = weighted.filter((record) => record.sectorGroup === sector);
    return {
      sector,
      rawBase: rows.length,
      weightedDigitalReadiness: weightedScoreMean(rows, "digitalReadiness"),
      weightedCommerceFriction: weightedScoreMean(rows, "commerceFriction")
    };
  });
  const permissionCounts = Object.fromEntries(permissionResult.rows.map((row) => [row.status, Number(row.count)]));
  const invited = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const completed = records.length;
  return {
    study,
    counts,
    population: populationCells.reduce((sum, cell) => sum + cell.populationCount, 0),
    completed,
    responseRate: invited > 0 ? completed / invited : null,
    permissionPending: permissionCounts.pending ?? 0,
    permissionConfirmed: permissionCounts.confirmed ?? 0,
    weightedDigitalReadiness: weightedScoreMean(weighted, "digitalReadiness"),
    weightedCommerceFriction: weightedScoreMean(weighted, "commerceFriction"),
    effectiveBase: weighted.length ? effectiveN(weighted) : 0,
    sectorComparisons
  };
}

export async function createRetailStudyAnalysisSnapshot(): Promise<Readonly<{ id: string; resultsSha256: string }>> {
  const dashboard = await getRetailStudyDashboard();
  const runtime = getAdminPostgresRuntime();
  const frame = await runtime.nativePool.query<{ stratum_key: string; population_count: string | number }>(
    `SELECT stratum_key,population_count FROM public.retail_research_strata WHERE study_id=$1 ORDER BY stratum_key`,
    [dashboard.study.id]
  );
  const frameJson = stableJson(frame.rows.map((row) => ({ stratumKey: row.stratum_key, populationCount: Number(row.population_count) })));
  const resultsJson = stableJson({
    generatedFrom: "retail-study-2026-runtime",
    analysisVersion: RETAIL_STUDY_2026_METHODOLOGY.analysisVersion,
    dashboard
  });
  const result = await runtime.nativePool.query<{ id: string }>(
    `INSERT INTO public.retail_research_analysis_snapshots
       (study_id,analysis_version,data_cutoff,instrument_sha256,frame_sha256,weighting_method,specification_json,results_json,results_sha256)
     VALUES ($1,$2,now(),$3,$4,$5,$6::jsonb,$7::jsonb,$8)
     RETURNING id::text`,
    [
      dashboard.study.id,
      RETAIL_STUDY_2026_METHODOLOGY.analysisVersion,
      RETAIL_STUDY_2026_INSTRUMENT_SHA256,
      sha256(frameJson),
      RETAIL_STUDY_2026_METHODOLOGY.weighting.method,
      stableJson(RETAIL_STUDY_2026_METHODOLOGY),
      resultsJson,
      sha256(resultsJson)
    ]
  );
  const row = result.rows[0];
  if (!row) throw new Error("RETAIL_STUDY_SNAPSHOT_WRITE_FAILED");
  return { id: row.id, resultsSha256: sha256(resultsJson) };
}

async function requireActiveInvitation(rawToken: string): Promise<InvitationRow> {
  const invitation = await resolveRetailStudyInvitation(rawToken);
  if (!invitation) throw new Error("RETAIL_STUDY_INVITATION_NOT_FOUND");
  if (invitation.study_status !== "fieldwork") throw new Error("RETAIL_STUDY_FIELDWORK_NOT_ACTIVE");
  if (["bounced", "complained", "declined", "ineligible"].includes(invitation.disposition)) throw new Error("RETAIL_STUDY_INVITATION_NOT_ELIGIBLE");
  return invitation;
}

function weightedScoreMean(records: readonly WeightedRecord[], key: "digitalReadiness" | "commerceFriction"): number | null {
  let numerator = 0;
  let denominator = 0;
  for (const record of records) {
    const score = record.scores?.[key];
    if (typeof score !== "number" || !Number.isFinite(score)) continue;
    numerator += score * record.weight;
    denominator += record.weight;
  }
  return denominator > 0 ? Math.round((numerator / denominator) * 10) / 10 : null;
}

function effectiveN(records: readonly WeightedRecord[]): number {
  const sum = records.reduce((total, record) => total + record.weight, 0);
  const squares = records.reduce((total, record) => total + record.weight * record.weight, 0);
  return squares > 0 ? Math.round(((sum * sum) / squares) * 10) / 10 : 0;
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
