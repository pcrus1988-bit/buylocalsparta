import { createHash, randomUUID } from "node:crypto";
import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getAdminPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import type { ResearchQuestion, ResearchQuestionType } from "./research-survey-model";
import { RETAIL_SENTIMENT_2026_QUESTIONS, withRetailConfidencePreregistration } from "./research-retail-sentiment-2026";
import { planWithCurrentQuestionCoverage } from "./research-survey-evaluation-coverage";
import { canonicalResearchResultsUrl } from "./research-results-url";

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function optionalText(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  const result = typeof value === "string" ? value.trim() : "";
  return result || undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map((key) => JSON.stringify(key) + ":" + canonical(record[key])).join(",") + "}";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function questionFromRow(row: SqlRow): ResearchQuestion {
  return {
    id: text(row.id),
    code: text(row.code),
    sectionCode: text(row.section_code),
    position: Number(row.position ?? 0),
    type: text(row.question_type) as ResearchQuestionType,
    prompt: text(row.prompt_el),
    help: optionalText(row.help_el),
    required: Boolean(row.required),
    analysisKey: text(row.analysis_key),
    config: objectValue(row.config)
  };
}

export type ResearchLaterEvaluationDefinition = Readonly<{
  eventId: string;
  definitionId: string;
  revision: number;
  title: string;
  researchQuestion: string;
  metricKey: string;
  method: string;
  segments: readonly string[];
  filters: string;
  interpretation: string;
  publicationLabel: string;
  createdAt: string;
  contentSha256: string;
}>;

export type ResearchSurveyDesignAdminOverview = Readonly<{
  databaseConfigured: boolean;
  studyFound: boolean;
  study: Readonly<{
    id: string;
    slug: string;
    title: string;
    subtitle?: string;
    status: string;
    pilotDeadlineMutable: boolean;
    populationDefinition: string;
    methodologySummary: string;
    defaultLocale: string;
    fieldworkEndsAt?: string;
    publicResultsUrl?: string;
  }>;
  instrument?: Readonly<{
    id: string;
    version: string;
    status: string;
    contentSha256: string;
    consentStatementVersion: string;
  }>;
  questions: readonly ResearchQuestion[];
  laterEvaluations: readonly ResearchLaterEvaluationDefinition[];
  analysisPlan?: Readonly<{
    id: string;
    version: string;
    title: string;
    status: string;
    contentSha256: string;
    lockedAt?: string;
    plan: Record<string, unknown>;
  }>;
}>;

const EMPTY_OVERVIEW: ResearchSurveyDesignAdminOverview = {
  databaseConfigured: false,
  studyFound: false,
  study: {
    id: "",
    slug: "",
    title: "",
    status: "",
    pilotDeadlineMutable: false,
    populationDefinition: "",
    methodologySummary: "",
    defaultLocale: "el-GR"
  },
  questions: [],
  laterEvaluations: []
};

export async function researchSurveyDesignAdminOverview(
  principal: SessionPrincipal,
  slug: string
): Promise<ResearchSurveyDesignAdminOverview> {
  assertAdminPermission(principal, "research.read");
  if (!productionDatabaseConfigured()) return EMPTY_OVERVIEW;

  const pool = getAdminPostgresRuntime().sqlPool;
  const result = await pool.query<SqlRow>(
    "SELECT s.id AS study_id,s.slug,s.title,s.subtitle,s.status,s.population_definition,s.methodology_summary,s.default_locale,s.fieldwork_ends_at,s.public_results_url," +
    " COALESCE(w.slug,s.slug) AS results_wave_slug," +
    " (s.status='pilot' AND s.fieldwork_starts_at IS NULL" +
    " AND NOT EXISTS (SELECT 1 FROM research_invites ri WHERE ri.study_id=s.id)" +
    " AND NOT EXISTS (SELECT 1 FROM research_invite_batches rb WHERE rb.study_id=s.id)) AS pilot_deadline_mutable," +
    " i.id AS instrument_id,i.version AS instrument_version,i.status AS instrument_status,i.content_sha256 AS instrument_sha256,i.consent_statement_version," +
    " ap.id AS analysis_plan_id,ap.version AS analysis_plan_version,ap.title AS analysis_plan_title,ap.status AS analysis_plan_status,ap.plan_json,ap.content_sha256 AS analysis_plan_sha256,ap.locked_at AS analysis_plan_locked_at" +
    " FROM research_studies s" +
    " LEFT JOIN research_waves w ON w.id=s.current_wave_id AND w.study_id=s.id" +
    " LEFT JOIN LATERAL (SELECT id,version,status,content_sha256,consent_statement_version FROM research_instruments WHERE study_id=s.id AND wave_id=s.current_wave_id ORDER BY created_at DESC LIMIT 1) i ON true" +
    " LEFT JOIN LATERAL (SELECT id,version,title,status,plan_json,content_sha256,locked_at FROM research_analysis_plans WHERE study_id=s.id AND wave_id=s.current_wave_id AND instrument_id=i.id ORDER BY created_at DESC LIMIT 1) ap ON true" +
    " WHERE s.slug=$1 LIMIT 1",
    [slug]
  );
  const row = result.rows[0];
  if (!row) return { ...EMPTY_OVERVIEW, databaseConfigured: true };

  const questions = row.instrument_id
    ? await pool.query<SqlRow>(
        "SELECT id,code,section_code,position,question_type,prompt_el,help_el,required,analysis_key,config FROM research_questions WHERE instrument_id=$1 ORDER BY position,code",
        [row.instrument_id]
      )
    : { rows: [] as readonly SqlRow[] };

  const laterEvaluationRows = await pool.query<SqlRow>(`
    SELECT DISTINCT ON (pe.evidence_json->>'definitionId')
      pe.id,pe.evidence_json,pe.content_sha256,pe.occurred_at
    FROM research_protocol_events pe
    WHERE pe.study_id=$1
      AND pe.category='analysis'
      AND pe.evidence_json->>'schema'='kontamou.research.exploratory-evaluation.v1'
    ORDER BY
      pe.evidence_json->>'definitionId',
      COALESCE(NULLIF(pe.evidence_json->>'revision','')::int,1) DESC,
      pe.recorded_at DESC,
      pe.id DESC
  `, [row.study_id]);

  const laterEvaluations = laterEvaluationRows.rows.flatMap((laterRow) => {
    const evidence = objectValue(laterRow.evidence_json);
    if (text(evidence.action) === "archive") return [];
    return [{
      eventId: text(laterRow.id),
      definitionId: text(evidence.definitionId),
      revision: Number(evidence.revision ?? 1),
      title: text(evidence.title),
      researchQuestion: text(evidence.researchQuestion),
      metricKey: text(evidence.metricKey),
      method: text(evidence.method),
      segments: Array.isArray(evidence.segments) ? evidence.segments.map(String).filter(Boolean) : [],
      filters: text(evidence.filters),
      interpretation: text(evidence.interpretation),
      publicationLabel: text(evidence.publicationLabel),
      createdAt: new Date(laterRow.occurred_at as string | Date).toISOString(),
      contentSha256: text(laterRow.content_sha256)
    }];
  }).sort((a, b) => a.title.localeCompare(b.title, "el"));

  return {
    databaseConfigured: true,
    studyFound: true,
    study: {
      id: text(row.study_id),
      slug: text(row.slug),
      title: text(row.title),
      subtitle: optionalText(row.subtitle),
      status: text(row.status),
      pilotDeadlineMutable: row.pilot_deadline_mutable === true,
      populationDefinition: text(row.population_definition),
      methodologySummary: text(row.methodology_summary),
      defaultLocale: text(row.default_locale) || "el-GR",
      fieldworkEndsAt: optionalText(row.fieldwork_ends_at),
      publicResultsUrl: canonicalResearchResultsUrl(text(row.results_wave_slug))
    },
    instrument: row.instrument_id ? {
      id: text(row.instrument_id),
      version: text(row.instrument_version),
      status: text(row.instrument_status),
      contentSha256: text(row.instrument_sha256),
      consentStatementVersion: text(row.consent_statement_version)
    } : undefined,
    questions: questions.rows.map(questionFromRow),
    laterEvaluations,
    analysisPlan: row.analysis_plan_id ? {
      id: text(row.analysis_plan_id),
      version: text(row.analysis_plan_version),
      title: text(row.analysis_plan_title),
      status: text(row.analysis_plan_status),
      contentSha256: text(row.analysis_plan_sha256),
      lockedAt: optionalText(row.analysis_plan_locked_at),
      plan: objectValue(row.plan_json)
    } : undefined
  };
}

async function latestInstrumentForUpdate(
  client: { query<Row extends SqlRow = SqlRow>(sql: string, params?: readonly unknown[]): Promise<{ rows: readonly Row[] }> },
  slug: string
): Promise<SqlRow> {
  const studyResult = await client.query<SqlRow>(
    "SELECT id,status,current_wave_id FROM research_studies WHERE slug=$1 FOR UPDATE",
    [slug]
  );
  const study = studyResult.rows[0];
  if (!study) throw new Error("RESEARCH_STUDY_NOT_FOUND");
  const instrumentResult = await client.query<SqlRow>(
    "SELECT id,version,status,content_sha256,consent_statement_version FROM research_instruments WHERE study_id=$1 AND wave_id=$2 ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
    [study.id, study.current_wave_id]
  );
  const instrument = instrumentResult.rows[0];
  if (!instrument) throw new Error("RESEARCH_INSTRUMENT_NOT_FOUND");
  return { ...instrument, study_id: study.id, study_status: study.status, wave_id: study.current_wave_id };
}

async function refreshInstrumentHash(
  client: { query<Row extends SqlRow = SqlRow>(sql: string, params?: readonly unknown[]): Promise<{ rows: readonly Row[] }> },
  instrumentId: string
): Promise<string> {
  const questions = await client.query<SqlRow>(
    "SELECT code,section_code,position,question_type,prompt_el,help_el,required,analysis_key,config FROM research_questions WHERE instrument_id=$1 ORDER BY position,code",
    [instrumentId]
  );
  const payload = questions.rows.map((row) => ({
    code: text(row.code),
    sectionCode: text(row.section_code),
    position: Number(row.position ?? 0),
    type: text(row.question_type),
    prompt: text(row.prompt_el),
    help: optionalText(row.help_el) ?? null,
    required: Boolean(row.required),
    analysisKey: text(row.analysis_key),
    config: objectValue(row.config)
  }));
  const digest = sha256(canonical(payload));
  await client.query("UPDATE research_instruments SET content_sha256=$2 WHERE id=$1", [instrumentId, digest]);
  return digest;
}

function revisionSuffix(): string {
  return Date.now().toString(36);
}

function defaultAnalysisPlan(slug: string, instrumentVersion: string): Record<string, unknown> {
  return {
    schema: "kontamou.research.analysis-plan.v1",
    studySlug: slug,
    instrumentVersion,
    classificationRule: "Primary and secondary analyses are defined before fieldwork. Later additions must be labelled exploratory.",
    primaryOutcomes: [],
    secondaryAnalyses: {
      scope: "Descriptive distributions and question-level summaries.",
      segments: ["overall"],
      classification: "prespecified_secondary"
    },
    exploratoryAnalyses: [],
    weighting: {
      baseWeight: "inverse_recorded_inclusion_probability",
      nonresponseAdjustment: "within_sampling_stratum",
      calibrationAdjustment: "bounded_raking_frozen_frame_v1"
    },
    variance: {
      method: "stratified_srs_fpc_v1",
      confidenceLevel: 0.95,
      withholdWhenUnsupported: true
    },
    disclosure: {
      minimumUnweightedBase: 30,
      smallBaseSuppression: true,
      publishConventionalMarginOfError: false
    },
    interpretation: {
      probabilitySamplingRequiredForDesignBasedSamplingError: true,
      pairwiseResultsAreExploratory: true,
      effectSizeAndIntervalTakePriorityOverThresholdOnlyInterpretation: true
    }
  };
}

export async function createResearchSurveyDesignRevision(
  principal: SessionPrincipal,
  slug: string
): Promise<Readonly<{ instrumentVersion: string; analysisPlanVersion: string }>> {
  assertAdminPermission(principal, "research.design.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const client = await getAdminPostgresRuntime().sqlPool.connect();
  try {
    await client.query("BEGIN");
    const source = await latestInstrumentForUpdate(client, slug);
    if (text(source.study_status) !== "draft") throw new Error("RESEARCH_DESIGN_REVISION_REQUIRES_DRAFT_STUDY");

    const sourcePlanResult = await client.query<SqlRow>(
      "SELECT id,version,title,status,plan_json FROM research_analysis_plans WHERE study_id=$1 AND wave_id=$2 AND instrument_id=$3 ORDER BY created_at DESC LIMIT 1",
      [source.study_id, source.wave_id, source.id]
    );
    const sourcePlan = sourcePlanResult.rows[0];

    if (text(source.status) === "draft" && (!sourcePlan || text(sourcePlan.status) === "draft")) {
      if (!sourcePlan) {
        const planVersion = text(source.version) + "-plan-draft";
        const plan = defaultAnalysisPlan(slug, text(source.version));
        await client.query(
          "INSERT INTO research_analysis_plans (study_id,wave_id,instrument_id,version,title,status,plan_json,content_sha256) VALUES ($1,$2,$3,$4,$5,'draft',$6::jsonb,$7)",
          [source.study_id, source.wave_id, source.id, planVersion, "Analysis plan · " + text(source.version), JSON.stringify(plan), sha256(canonical(plan))]
        );
        await client.query("COMMIT");
        return { instrumentVersion: text(source.version), analysisPlanVersion: planVersion };
      }
      await client.query("COMMIT");
      return { instrumentVersion: text(source.version), analysisPlanVersion: text(sourcePlan.version) };
    }

    const suffix = revisionSuffix();
    const instrumentVersion = text(source.version) + "-r" + suffix;
    const insertedInstrument = await client.query<SqlRow>(
      "INSERT INTO research_instruments (study_id,wave_id,version,content_sha256,status,consent_statement_version) VALUES ($1,$2,$3,$4,'draft',$5) RETURNING id",
      [source.study_id, source.wave_id, instrumentVersion, source.content_sha256, source.consent_statement_version]
    );
    const newInstrumentId = text(insertedInstrument.rows[0]?.id);
    if (!newInstrumentId) throw new Error("RESEARCH_INSTRUMENT_REVISION_FAILED");

    await client.query(
      "INSERT INTO research_questions (instrument_id,code,section_code,position,question_type,prompt_el,help_el,required,analysis_key,config)" +
      " SELECT $2,code,section_code,position,question_type,prompt_el,help_el,required,analysis_key,config FROM research_questions WHERE instrument_id=$1 ORDER BY position",
      [source.id, newInstrumentId]
    );

    const sourcePlanJson = sourcePlan ? objectValue(sourcePlan.plan_json) : defaultAnalysisPlan(slug, instrumentVersion);
    const nextPlanJson = { ...sourcePlanJson, instrumentVersion };
    const analysisPlanVersion = (sourcePlan ? text(sourcePlan.version) : text(source.version) + "-plan") + "-r" + suffix;
    await client.query(
      "INSERT INTO research_analysis_plans (study_id,wave_id,instrument_id,version,title,status,plan_json,content_sha256) VALUES ($1,$2,$3,$4,$5,'draft',$6::jsonb,$7)",
      [
        source.study_id,
        source.wave_id,
        newInstrumentId,
        analysisPlanVersion,
        sourcePlan ? text(sourcePlan.title) : "Analysis plan · " + instrumentVersion,
        JSON.stringify(nextPlanJson),
        sha256(canonical(nextPlanJson))
      ]
    );
    await refreshInstrumentHash(client, newInstrumentId);
    await client.query("COMMIT");
    return { instrumentVersion, analysisPlanVersion };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export type ResearchQuestionDraftInput = Readonly<{
  id?: string;
  code: string;
  sectionCode: string;
  type: ResearchQuestionType;
  prompt: string;
  help?: string;
  required: boolean;
  analysisKey: string;
  config: Record<string, unknown>;
}>;

function validateQuestionInput(input: ResearchQuestionDraftInput) {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(input.code.trim())) throw new Error("RESEARCH_QUESTION_CODE_INVALID");
  if (!/^[A-Za-z0-9._-]{1,96}$/.test(input.analysisKey.trim())) throw new Error("RESEARCH_QUESTION_ANALYSIS_KEY_INVALID");
  if (!input.sectionCode.trim() || input.sectionCode.trim().length > 32) throw new Error("RESEARCH_QUESTION_SECTION_INVALID");
  if (!input.prompt.trim() || input.prompt.trim().length > 4000) throw new Error("RESEARCH_QUESTION_PROMPT_INVALID");
  if (!new Set<ResearchQuestionType>(["single","multi","scale","matrix","text","experiment"]).has(input.type)) {
    throw new Error("RESEARCH_QUESTION_TYPE_INVALID");
  }
}

/**
 * Admin-triggered installation. Never edits a locked instrument/plan and never
 * silently changes a questionnaire with invitations already bound to it.
 * Requires an explicit revision first when the original design is frozen.
 */
export async function installRetailSentiment2026(
  principal: SessionPrincipal,
  slug: string
): Promise<Readonly<{ installed: number; instrumentVersion: string; contentSha256: string }>> {
  assertAdminPermission(principal, "research.design.manage");
  assertAdminPermission(principal, "research.analysis.manage");
  if (slug !== "greek-retail-2026") throw new Error("RESEARCH_MODULE_STUDY_MISMATCH");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const client = await getAdminPostgresRuntime().sqlPool.connect();
  try {
    await client.query("BEGIN");
    const instrument = await latestInstrumentForUpdate(client, slug);
    if (text(instrument.study_status) !== "draft" || text(instrument.status) !== "draft") {
      throw new Error("RESEARCH_MODULE_REQUIRES_EDITABLE_REVISION");
    }
    const invites = await client.query<SqlRow>(
      "SELECT id FROM research_invites WHERE instrument_id=$1 LIMIT 1",
      [instrument.id]
    );
    if (invites.rows.length) throw new Error("RESEARCH_MODULE_INSTRUMENT_ALREADY_INVITED");

    const planResult = await client.query<SqlRow>(
      "SELECT id,status,plan_json FROM research_analysis_plans WHERE study_id=$1 AND wave_id=$2 AND instrument_id=$3 ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
      [instrument.study_id, instrument.wave_id, instrument.id]
    );
    const plan = planResult.rows[0];
    if (!plan || text(plan.status) !== "draft") throw new Error("RESEARCH_MODULE_REQUIRES_DRAFT_ANALYSIS_PLAN");

    const existing = await client.query<SqlRow>(
      "SELECT code FROM research_questions WHERE instrument_id=$1 AND code=ANY($2::text[])",
      [instrument.id, RETAIL_SENTIMENT_2026_QUESTIONS.map((q) => q.code)]
    );
    if (existing.rows.length && existing.rows.length !== RETAIL_SENTIMENT_2026_QUESTIONS.length) {
      throw new Error("RESEARCH_MODULE_PARTIAL_INSTALL_REQUIRES_MANUAL_REVIEW");
    }
    let installed = 0;
    if (!existing.rows.length) {
      const nextPosition = await client.query<SqlRow>(
        "SELECT COALESCE(MAX(position),0)::int AS position FROM research_questions WHERE instrument_id=$1",
        [instrument.id]
      );
      const basePosition = Number(nextPosition.rows[0]?.position ?? 0);
      for (const [index, question] of RETAIL_SENTIMENT_2026_QUESTIONS.entries()) {
        await client.query(
          "INSERT INTO research_questions (instrument_id,code,section_code,position,question_type,prompt_el,help_el,required,analysis_key,config)" +
          " VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)",
          [
            instrument.id,question.code,question.sectionCode,basePosition+index+1,
            question.type,question.prompt,question.help ?? null,question.required,
            question.analysisKey,JSON.stringify(question.config)
          ]
        );
        installed += 1;
      }
    }
    const revisedPlan = withRetailConfidencePreregistration(objectValue(plan.plan_json), text(instrument.version));
    await client.query(
      "UPDATE research_analysis_plans SET plan_json=$2::jsonb WHERE id=$1 AND status='draft'",
      [plan.id, JSON.stringify(revisedPlan)]
    );
    const contentSha256 = await refreshInstrumentHash(client, text(instrument.id));
    await client.query("COMMIT");
    return { installed, instrumentVersion: text(instrument.version), contentSha256 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function saveResearchQuestionDraft(
  principal: SessionPrincipal,
  slug: string,
  input: ResearchQuestionDraftInput
): Promise<Readonly<{ id: string; contentSha256: string }>> {
  assertAdminPermission(principal, "research.design.manage");
  validateQuestionInput(input);
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const client = await getAdminPostgresRuntime().sqlPool.connect();
  try {
    await client.query("BEGIN");
    const instrument = await latestInstrumentForUpdate(client, slug);
    if (text(instrument.study_status) !== "draft" || text(instrument.status) !== "draft") {
      throw new Error("RESEARCH_QUESTIONNAIRE_LOCKED");
    }

    let id = input.id?.trim() || "";
    if (id) {
      const updated = await client.query<SqlRow>(
        "UPDATE research_questions SET code=$3,section_code=$4,question_type=$5,prompt_el=$6,help_el=NULLIF($7,''),required=$8,analysis_key=$9,config=$10::jsonb WHERE id=$1 AND instrument_id=$2 RETURNING id",
        [
          id,
          instrument.id,
          input.code.trim(),
          input.sectionCode.trim(),
          input.type,
          input.prompt.trim(),
          input.help?.trim() || "",
          input.required,
          input.analysisKey.trim(),
          JSON.stringify(input.config)
        ]
      );
      if (!updated.rows[0]) throw new Error("RESEARCH_QUESTION_NOT_FOUND");
    } else {
      const inserted = await client.query<SqlRow>(
        "INSERT INTO research_questions (instrument_id,code,section_code,position,question_type,prompt_el,help_el,required,analysis_key,config)" +
        " SELECT $1,$2,$3,COALESCE(max(position),0)+1,$4,$5,NULLIF($6,''),$7,$8,$9::jsonb FROM research_questions WHERE instrument_id=$1 RETURNING id",
        [
          instrument.id,
          input.code.trim(),
          input.sectionCode.trim(),
          input.type,
          input.prompt.trim(),
          input.help?.trim() || "",
          input.required,
          input.analysisKey.trim(),
          JSON.stringify(input.config)
        ]
      );
      id = text(inserted.rows[0]?.id);
    }
    const contentSha256 = await refreshInstrumentHash(client, text(instrument.id));
    await client.query("COMMIT");
    return { id, contentSha256 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteResearchQuestionDraft(
  principal: SessionPrincipal,
  slug: string,
  questionId: string
): Promise<Readonly<{ contentSha256: string }>> {
  assertAdminPermission(principal, "research.design.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const client = await getAdminPostgresRuntime().sqlPool.connect();
  try {
    await client.query("BEGIN");
    const instrument = await latestInstrumentForUpdate(client, slug);
    if (text(instrument.study_status) !== "draft" || text(instrument.status) !== "draft") {
      throw new Error("RESEARCH_QUESTIONNAIRE_LOCKED");
    }
    const countResult = await client.query<SqlRow>("SELECT count(*)::int AS count FROM research_questions WHERE instrument_id=$1", [instrument.id]);
    if (Number(countResult.rows[0]?.count ?? 0) <= 1) throw new Error("RESEARCH_QUESTIONNAIRE_REQUIRES_QUESTION");
    const deleted = await client.query<SqlRow>("DELETE FROM research_questions WHERE id=$1 AND instrument_id=$2 RETURNING id", [questionId, instrument.id]);
    if (!deleted.rows[0]) throw new Error("RESEARCH_QUESTION_NOT_FOUND");
    const contentSha256 = await refreshInstrumentHash(client, text(instrument.id));
    await client.query("COMMIT");
    return { contentSha256 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function moveResearchQuestionDraft(
  principal: SessionPrincipal,
  slug: string,
  questionId: string,
  direction: "up" | "down"
): Promise<Readonly<{ contentSha256: string }>> {
  assertAdminPermission(principal, "research.design.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const client = await getAdminPostgresRuntime().sqlPool.connect();
  try {
    await client.query("BEGIN");
    const instrument = await latestInstrumentForUpdate(client, slug);
    if (text(instrument.study_status) !== "draft" || text(instrument.status) !== "draft") {
      throw new Error("RESEARCH_QUESTIONNAIRE_LOCKED");
    }
    const currentResult = await client.query<SqlRow>(
      "SELECT id,position FROM research_questions WHERE id=$1 AND instrument_id=$2 FOR UPDATE",
      [questionId, instrument.id]
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("RESEARCH_QUESTION_NOT_FOUND");
    const operator = direction === "up" ? "<" : ">";
    const order = direction === "up" ? "DESC" : "ASC";
    const targetResult = await client.query<SqlRow>(
      "SELECT id,position FROM research_questions WHERE instrument_id=$1 AND position " + operator + " $2 ORDER BY position " + order + " LIMIT 1 FOR UPDATE",
      [instrument.id, current.position]
    );
    const target = targetResult.rows[0];
    if (target) {
      const maxResult = await client.query<SqlRow>("SELECT COALESCE(max(position),0)::int AS max_position FROM research_questions WHERE instrument_id=$1", [instrument.id]);
      const temporary = Number(maxResult.rows[0]?.max_position ?? 0) + 1000;
      await client.query("UPDATE research_questions SET position=$2 WHERE id=$1", [current.id, temporary]);
      await client.query("UPDATE research_questions SET position=$2 WHERE id=$1", [target.id, current.position]);
      await client.query("UPDATE research_questions SET position=$2 WHERE id=$1", [current.id, target.position]);
    }
    const contentSha256 = await refreshInstrumentHash(client, text(instrument.id));
    await client.query("COMMIT");
    return { contentSha256 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}


/**
 * Pilot-only exception for initially scheduling a study close date.
 * Never unlocks the instrument or other frozen design fields. Once any
 * invitation/batch exists, extensions require a governed protocol amendment.
 */
export async function updateResearchPilotDeadline(
  principal: SessionPrincipal,
  slug: string,
  newDeadline: string
): Promise<Readonly<{ previousDeadline?: string; newDeadline: string }>> {
  assertAdminPermission(principal, "research.design.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const normalized = newDeadline.trim();
  const parsed = new Date(normalized);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(normalized)
    || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== normalized
    || parsed.getTime() <= Date.now()) {
    throw new Error("RESEARCH_PILOT_DEADLINE_MUST_BE_FUTURE");
  }
  const result = await getAdminPostgresRuntime().sqlPool.query<SqlRow>(`
    WITH previous AS (
      SELECT id,fieldwork_ends_at
      FROM research_studies WHERE slug=$1 FOR UPDATE
    )
    UPDATE research_studies AS s
    SET fieldwork_ends_at=$2::timestamptz,updated_at=now()
    FROM previous AS p
    WHERE s.id=p.id
      AND s.status='pilot'
      AND s.fieldwork_starts_at IS NULL
      AND $2::timestamptz>now()
      AND NOT EXISTS (SELECT 1 FROM research_invites ri WHERE ri.study_id=s.id)
      AND NOT EXISTS (SELECT 1 FROM research_invite_batches rb WHERE rb.study_id=s.id)
    RETURNING p.fieldwork_ends_at AS previous_deadline,s.fieldwork_ends_at AS new_deadline
  `, [slug, normalized]);
  const row = result.rows[0];
  if (!row) throw new Error("RESEARCH_PILOT_DEADLINE_LOCKED_OR_STUDY_NOT_FOUND");
  return {
    previousDeadline: optionalText(row.previous_deadline),
    newDeadline: optionalText(row.new_deadline) || normalized
  };
}

export async function updateResearchStudyDraftSettings(
  principal: SessionPrincipal,
  slug: string,
  input: Readonly<{
    title: string;
    subtitle?: string;
    populationDefinition: string;
    methodologySummary: string;
    defaultLocale: string;
    fieldworkEndsAt?: string;
    publicResultsUrl?: string;
  }>
): Promise<void> {
  assertAdminPermission(principal, "research.design.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const title = input.title.trim();
  const population = input.populationDefinition.trim();
  const methodology = input.methodologySummary.trim();
  const locale = input.defaultLocale.trim() || "el-GR";
  if (title.length < 3 || title.length > 240) throw new Error("RESEARCH_STUDY_TITLE_INVALID");
  if (population.length < 10 || methodology.length < 10) throw new Error("RESEARCH_STUDY_DESCRIPTION_INVALID");
  const fieldworkEndsAt = input.fieldworkEndsAt?.trim() || "";
  if (fieldworkEndsAt && !Number.isFinite(new Date(fieldworkEndsAt).getTime())) throw new Error("RESEARCH_FIELDWORK_END_INVALID");
  // Public results URLs are generated from the immutable current-wave slug.
  // An editable settings request must never override the publication destination.
  const result = await getAdminPostgresRuntime().sqlPool.query<SqlRow>(
    "UPDATE research_studies SET title=$2,subtitle=NULLIF($3,''),population_definition=$4,methodology_summary=$5,default_locale=$6,fieldwork_ends_at=NULLIF($7,'')::timestamptz," +
    " public_results_url='https://kontamou.site/research/' || COALESCE((SELECT w.slug FROM research_waves w WHERE w.id=research_studies.current_wave_id AND w.study_id=research_studies.id),slug) || '/results'," +
    " updated_at=now() WHERE slug=$1 AND status='draft' RETURNING id",
    [slug, title, input.subtitle?.trim() || "", population, methodology, locale, fieldworkEndsAt]
  );
  if (!result.rows[0]) throw new Error("RESEARCH_STUDY_SETTINGS_REQUIRE_DRAFT");
}

export async function saveResearchAnalysisPlanDraft(
  principal: SessionPrincipal,
  slug: string,
  input: Readonly<{ title: string; plan: Record<string, unknown> }>
): Promise<Readonly<{ contentSha256: string }>> {
  assertAdminPermission(principal, "research.analysis.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const overview = await researchSurveyDesignAdminOverview(principal, slug);
  if (!overview.studyFound || !overview.instrument || !overview.analysisPlan) throw new Error("RESEARCH_ANALYSIS_PLAN_NOT_FOUND");
  if (overview.study.status !== "draft" || overview.analysisPlan.status !== "draft") throw new Error("RESEARCH_ANALYSIS_PLAN_LOCKED");
  const title = input.title.trim();
  if (title.length < 3 || title.length > 240) throw new Error("RESEARCH_ANALYSIS_PLAN_TITLE_INVALID");
  // Always rebuild the question-level registry from the server's current
  // instrument. A stale Admin tab cannot silently omit newly added questions.
  // This changes neither registered primary outcomes nor locked plans.
  const plan = planWithCurrentQuestionCoverage(
    { ...input.plan, studySlug: slug },
    overview.questions,
    overview.instrument.version,
    overview.instrument.contentSha256
  );
  const result = await getAdminPostgresRuntime().sqlPool.query<SqlRow>(
    "UPDATE research_analysis_plans SET title=$2,plan_json=$3::jsonb WHERE id=$1 AND status='draft' RETURNING content_sha256",
    [overview.analysisPlan.id, title, JSON.stringify(plan)]
  );
  if (!result.rows[0]) throw new Error("RESEARCH_ANALYSIS_PLAN_LOCKED");
  return { contentSha256: text(result.rows[0].content_sha256) };
}

export async function saveResearchLaterEvaluation(
  principal: SessionPrincipal,
  slug: string,
  input: Readonly<{
    priorEventId?: string;
    title: string;
    researchQuestion: string;
    metricKey: string;
    method: string;
    segments: readonly string[];
    filters?: string;
    interpretation?: string;
    publicationLabel?: string;
  }>
): Promise<Readonly<{ eventId: string; definitionId: string; revision: number; contentSha256: string }>> {
  assertAdminPermission(principal, "research.analysis.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");

  const title = input.title.trim();
  const researchQuestion = input.researchQuestion.trim();
  const metricKey = input.metricKey.trim();
  const method = input.method.trim();
  const filters = input.filters?.trim() || "";
  const interpretation = input.interpretation?.trim() || "";
  const publicationLabel = input.publicationLabel?.trim() || title;
  const segments = [...new Set(input.segments.map((item) => item.trim()).filter(Boolean))];

  if (title.length < 3 || title.length > 180) throw new Error("RESEARCH_LATER_EVALUATION_TITLE_INVALID");
  if (researchQuestion.length < 5 || researchQuestion.length > 2_000) throw new Error("RESEARCH_LATER_EVALUATION_QUESTION_INVALID");
  if (!/^[A-Za-z0-9._-]{1,96}$/.test(metricKey)) throw new Error("RESEARCH_LATER_EVALUATION_METRIC_KEY_INVALID");
  if (method.length < 3 || method.length > 180) throw new Error("RESEARCH_LATER_EVALUATION_METHOD_INVALID");
  if (segments.length > 24) throw new Error("RESEARCH_LATER_EVALUATION_SEGMENTS_INVALID");
  if (filters.length > 2_000 || interpretation.length > 4_000 || publicationLabel.length > 240) {
    throw new Error("RESEARCH_LATER_EVALUATION_TEXT_INVALID");
  }

  const client = await getAdminPostgresRuntime().sqlPool.connect();
  try {
    await client.query("BEGIN");
    const studyResult = await client.query<SqlRow>(
      "SELECT id,status FROM research_studies WHERE slug=$1 FOR UPDATE",
      [slug]
    );
    const study = studyResult.rows[0];
    if (!study) throw new Error("RESEARCH_STUDY_NOT_FOUND");
    if (text(study.status) === "draft") throw new Error("RESEARCH_LATER_EVALUATION_REQUIRES_STARTED_STUDY");
    if (text(study.status) === "archived") throw new Error("RESEARCH_STUDY_ARCHIVED");

    let definitionId: string = randomUUID();
    let revision = 1;
    let relatedEventId = "";
    const priorEventId = input.priorEventId?.trim() || "";
    if (priorEventId) {
      const priorResult = await client.query<SqlRow>(`
        SELECT pe.id,pe.evidence_json
        FROM research_protocol_events pe
        WHERE pe.id=$1
          AND pe.study_id=$2
          AND pe.category='analysis'
          AND pe.evidence_json->>'schema'='kontamou.research.exploratory-evaluation.v1'
        FOR UPDATE
      `, [priorEventId, study.id]);
      const prior = priorResult.rows[0];
      if (!prior) throw new Error("RESEARCH_LATER_EVALUATION_NOT_FOUND");
      const priorEvidence = objectValue(prior.evidence_json);
      definitionId = text(priorEvidence.definitionId) || definitionId;
      revision = Math.max(1, Number(priorEvidence.revision ?? 1)) + 1;
      relatedEventId = text(prior.id);
    }

    const lifecyclePhase = text(study.status) === "pilot"
      ? "pilot"
      : ["fielding","closed"].includes(text(study.status))
        ? "main"
        : text(study.status) === "published"
          ? "publication"
          : "analysis";
    const occurredAt = new Date().toISOString();
    const evidence = {
      schema: "kontamou.research.exploratory-evaluation.v1",
      action: "upsert",
      studySlug: slug,
      definitionId,
      revision,
      classification: "exploratory_post_registration",
      title,
      researchQuestion,
      metricKey,
      method,
      segments,
      filters: filters || null,
      interpretation: interpretation || null,
      publicationLabel,
      basedOnEventId: relatedEventId || null,
      occurredAt
    };
    const contentSha256 = sha256(canonical(evidence));
    const inserted = await client.query<SqlRow>(`
      INSERT INTO research_protocol_events (
        study_id,event_type,lifecycle_phase,category,severity,title,description,
        rationale,impact_assessment,corrective_action,related_event_id,occurred_at,
        recorded_by,evidence_json,content_sha256
      )
      VALUES (
        $1,'amendment',$2,'analysis','info',$3,$4,
        $5,$6,NULL,NULLIF($7,'')::uuid,$8::timestamptz,
        $9,$10::jsonb,$11
      )
      RETURNING id
    `, [
      study.id,
      lifecyclePhase,
      "Exploratory evaluation · " + title,
      researchQuestion,
      "Added after the preregistered evaluation plan was locked; this definition is classified as exploratory.",
      interpretation || "Interpret separately from preregistered primary and secondary analyses.",
      relatedEventId,
      occurredAt,
      principal.userId,
      JSON.stringify(evidence),
      contentSha256
    ]);
    const eventId = text(inserted.rows[0]?.id);
    if (!eventId) throw new Error("RESEARCH_LATER_EVALUATION_SAVE_FAILED");
    await client.query("COMMIT");
    return { eventId, definitionId, revision, contentSha256 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function lockResearchAnalysisPlanDraft(
  principal: SessionPrincipal,
  slug: string
): Promise<Readonly<{ version: string; contentSha256: string }>> {
  assertAdminPermission(principal, "research.analysis.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const client = await getAdminPostgresRuntime().sqlPool.connect();
  try {
    await client.query("BEGIN");
    const instrument = await latestInstrumentForUpdate(client, slug);
    if (text(instrument.study_status) !== "draft") throw new Error("RESEARCH_ANALYSIS_PLAN_LOCK_REQUIRES_DRAFT_STUDY");
    const planResult = await client.query<SqlRow>(
      "SELECT id,version,status FROM research_analysis_plans WHERE study_id=$1 AND wave_id=$2 AND instrument_id=$3 ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
      [instrument.study_id, instrument.wave_id, instrument.id]
    );
    const plan = planResult.rows[0];
    if (!plan) throw new Error("RESEARCH_ANALYSIS_PLAN_NOT_FOUND");
    if (text(plan.status) !== "draft") throw new Error("RESEARCH_ANALYSIS_PLAN_LOCKED");
    const priorLocked = await client.query<SqlRow>(
      "SELECT id FROM research_analysis_plans WHERE study_id=$1 AND instrument_id=$2 AND status='locked' AND id<>$3 LIMIT 1",
      [instrument.study_id, instrument.id, plan.id]
    );
    if (priorLocked.rows[0]) throw new Error("RESEARCH_ANALYSIS_PLAN_REQUIRES_INSTRUMENT_REVISION");
    const updated = await client.query<SqlRow>(
      "UPDATE research_analysis_plans SET status='locked',locked_at=now() WHERE id=$1 RETURNING version,content_sha256",
      [plan.id]
    );
    await client.query("COMMIT");
    return { version: text(updated.rows[0]?.version), contentSha256: text(updated.rows[0]?.content_sha256) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
