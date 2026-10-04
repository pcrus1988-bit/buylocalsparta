import { createHash, randomBytes } from "node:crypto";
import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import {
  scoreGreekRetail2026,
  validateResearchAnswers,
  type ResearchAnswer,
  type ResearchAnswerMap,
  type ResearchQuestion
} from "./research-survey-model";

export const GREEK_RETAIL_2026_SLUG = "greek-retail-2026";

function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function optionalText(value: unknown): string | undefined {
  const valueText = typeof value === "string" ? value.trim() : "";
  return valueText || undefined;
}
function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }

export type ResearchExperimentAssignment = Readonly<{
  taskNumber: number;
  alternativeA: Record<string, string | number>;
  alternativeB: Record<string, string | number>;
  selected?: "a" | "b" | "none";
}>;

export type ResearchSurveyContext = Readonly<{
  study: {
    slug: string;
    title: string;
    subtitle?: string;
    sponsor: string;
    populationDefinition: string;
    methodologySummary: string;
    status: string;
  };
  instrument: {
    version: string;
    status: string;
    contentSha256: string;
    consentStatementVersion: string;
  };
  invite: {
    status: string;
    expiresAt?: string;
  };
  response?: {
    status: string;
    startedAt: string;
    completedAt?: string;
  };
  questions: readonly ResearchQuestion[];
  answers: ResearchAnswerMap;
  experiments: readonly ResearchExperimentAssignment[];
  consents: Readonly<Partial<Record<"results_notification" | "thank_you_code" | "marketing", boolean>>>;
}>;

function questionFromRow(row: SqlRow): ResearchQuestion {
  return {
    id: text(row.id),
    code: text(row.code),
    sectionCode: text(row.section_code),
    position: numberValue(row.position),
    type: text(row.question_type) as ResearchQuestion["type"],
    prompt: text(row.prompt_el),
    help: optionalText(row.help_el),
    required: Boolean(row.required),
    analysisKey: text(row.analysis_key),
    config: objectValue(row.config)
  };
}

function deterministicChoice<T>(values: readonly T[], seed: string): T {
  if (!values.length) throw new Error("Experiment attribute has no levels");
  const digest = createHash("sha256").update(seed).digest();
  return values[digest.readUInt32BE(0) % values.length]!;
}

const experimentLevels = {
  monthly_fee_eur: [0, 29, 69, 129] as const,
  commission_pct: [0, 3, 7, 12] as const,
  reach: ["local", "national", "local_national"] as const,
  catalog: ["manual", "single_import", "automatic_sync"] as const,
  customer_relationship: ["platform_only", "merchant_access"] as const,
  stock_sync: ["none", "daily", "realtime"] as const,
  operations: ["listing_only", "payments", "payments_shipping_returns"] as const
};

function experimentProfile(seed: string, side: "a" | "b"): Record<string, string | number> {
  return Object.fromEntries(Object.entries(experimentLevels).map(([attribute, values]) => [
    attribute,
    deterministicChoice(values, `${seed}:${attribute}:${side}`)
  ]));
}

function experimentAssignments(seed: string): readonly ResearchExperimentAssignment[] {
  return [1, 2, 3].map((taskNumber) => {
    const taskSeed = `${seed}:task:${taskNumber}`;
    const alternativeA = experimentProfile(taskSeed, "a");
    const alternativeB = experimentProfile(taskSeed, "b");
    if (JSON.stringify(alternativeA) === JSON.stringify(alternativeB)) {
      const fees = experimentLevels.monthly_fee_eur;
      const currentIndex = fees.indexOf(alternativeB.monthly_fee_eur as typeof fees[number]);
      alternativeB.monthly_fee_eur = fees[(currentIndex + 1) % fees.length]!;
    }
    return { taskNumber, alternativeA, alternativeB };
  });
}

async function invitationRow(
  executor: { query<Row extends SqlRow = SqlRow>(text: string, params?: readonly unknown[]): Promise<{ rows: readonly Row[] }> },
  slug: string,
  token: string
): Promise<SqlRow> {
  if (token.length < 32 || token.length > 200) throw new Error("SURVEY_INVITE_INVALID");
  const result = await executor.query<SqlRow>(`
    SELECT
      ri.id AS invite_id,
      ri.status AS invite_status,
      ri.expires_at,
      rs.id AS study_id,
      rs.slug,
      rs.title,
      rs.subtitle,
      rs.sponsor,
      rs.population_definition,
      rs.methodology_summary,
      rs.status AS study_status,
      rin.id AS instrument_id,
      rin.version AS instrument_version,
      rin.status AS instrument_status,
      rin.content_sha256,
      rin.consent_statement_version
    FROM research_invites ri
    JOIN research_studies rs ON rs.id = ri.study_id
    JOIN research_instruments rin ON rin.id = ri.instrument_id
    WHERE rs.slug = $1 AND ri.token_hash = $2
    LIMIT 1
  `, [slug, sha256(token)]);
  const row = result.rows[0];
  if (!row) throw new Error("SURVEY_INVITE_NOT_FOUND");
  if (row.expires_at && new Date(String(row.expires_at)).getTime() < Date.now()) throw new Error("SURVEY_INVITE_EXPIRED");
  return row;
}

async function questionsForInstrument(
  executor: { query<Row extends SqlRow = SqlRow>(text: string, params?: readonly unknown[]): Promise<{ rows: readonly Row[] }> },
  instrumentId: string
): Promise<readonly ResearchQuestion[]> {
  const result = await executor.query<SqlRow>(`
    SELECT id, code, section_code, position, question_type, prompt_el, help_el, required, analysis_key, config
    FROM research_questions
    WHERE instrument_id = $1
    ORDER BY position
  `, [instrumentId]);
  return result.rows.map(questionFromRow);
}

export async function publicResearchSurvey(slug: string, token: string): Promise<ResearchSurveyContext> {
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const pool = getProductionPostgresRuntime().sqlPool;
  const invite = await invitationRow(pool, slug, token);
  const questions = await questionsForInstrument(pool, text(invite.instrument_id));

  const responseResult = await pool.query<SqlRow>(`
    SELECT id, status, started_at, completed_at
    FROM research_responses
    WHERE invite_id = $1
    LIMIT 1
  `, [invite.invite_id]);
  const response = responseResult.rows[0];

  let answers: ResearchAnswerMap = {};
  let experiments: readonly ResearchExperimentAssignment[] = [];
  let consents: Partial<Record<"results_notification" | "thank_you_code" | "marketing", boolean>> = {};
  if (response) {
    const [answerResult, experimentResult, consentResult] = await Promise.all([
      pool.query<SqlRow>(`
        SELECT q.code, a.answer
        FROM research_answers a
        JOIN research_questions q ON q.id = a.question_id
        WHERE a.response_id = $1
      `, [response.id]),
      pool.query<SqlRow>(`
        SELECT task_number, alternative_a, alternative_b, selected
        FROM research_experiment_assignments
        WHERE response_id = $1 AND experiment_code = 'EXP01'
        ORDER BY task_number
      `, [response.id])
    ]);
    answers = Object.fromEntries(answerResult.rows.map((row) => [text(row.code), row.answer as ResearchAnswer]));
    experiments = experimentResult.rows.map((row) => ({
      taskNumber: numberValue(row.task_number),
      alternativeA: objectValue(row.alternative_a) as Record<string, string | number>,
      alternativeB: objectValue(row.alternative_b) as Record<string, string | number>,
      selected: optionalText(row.selected) as "a" | "b" | "none" | undefined
    }));
    consents = Object.fromEntries(consentResult.rows.map((row) => [text(row.consent_kind), Boolean(row.granted)])) as typeof consents;
  }

  return {
    study: {
      slug: text(invite.slug),
      title: text(invite.title),
      subtitle: optionalText(invite.subtitle),
      sponsor: text(invite.sponsor),
      populationDefinition: text(invite.population_definition),
      methodologySummary: text(invite.methodology_summary),
      status: text(invite.study_status)
    },
    instrument: {
      version: text(invite.instrument_version),
      status: text(invite.instrument_status),
      contentSha256: text(invite.content_sha256),
      consentStatementVersion: text(invite.consent_statement_version)
    },
    invite: {
      status: text(invite.invite_status),
      expiresAt: optionalText(invite.expires_at)
    },
    response: response ? {
      status: text(response.status),
      startedAt: text(response.started_at),
      completedAt: optionalText(response.completed_at)
    } : undefined,
    questions,
    answers,
    experiments,
    consents
  };
}

export async function savePublicResearchSurvey(input: Readonly<{
  slug: string;
  token: string;
  answers?: ResearchAnswerMap;
  researchConsent?: boolean;
  complete?: boolean;
  optionalConsents?: Partial<Record<"results_notification" | "thank_you_code" | "marketing", boolean>>;
  experimentChoices?: Readonly<Record<string, "a" | "b" | "none">>;
}>): Promise<Readonly<{ status: string; experiments: readonly ResearchExperimentAssignment[] }>> {
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.sqlPool.connect();

  try {
    await client.query("BEGIN");
    const invite = await invitationRow(client, input.slug, input.token);
    if (!["pilot", "fielding"].includes(text(invite.study_status)) || !["locked", "fielding"].includes(text(invite.instrument_status))) {
      throw new Error("SURVEY_NOT_OPEN");
    }
    if (["completed", "expired", "suppressed"].includes(text(invite.invite_status))) {
      throw new Error(text(invite.invite_status) === "completed" ? "SURVEY_ALREADY_COMPLETED" : "SURVEY_INVITE_CLOSED");
    }

    let responseResult = await client.query<SqlRow>(`
      SELECT id, status, started_at
      FROM research_responses
      WHERE invite_id = $1
      FOR UPDATE
    `, [invite.invite_id]);
    let response = responseResult.rows[0];

    if (!response) {
      if (input.researchConsent !== true) throw new Error("RESEARCH_CONSENT_REQUIRED");
      responseResult = await client.query<SqlRow>(`
        INSERT INTO research_responses (study_id, instrument_id, invite_id, status, locale)
        VALUES ($1, $2, $3, 'in_progress', 'el-GR')
        RETURNING id, status, started_at
      `, [invite.study_id, invite.instrument_id, invite.invite_id]);
      response = responseResult.rows[0]!;
      await client.query(`
        INSERT INTO research_consents (response_id, consent_kind, statement_version, granted, source)
        VALUES ($1, 'research_participation', $2, true, 'survey_ui')
        ON CONFLICT (response_id, consent_kind)
        DO UPDATE SET granted = EXCLUDED.granted, statement_version = EXCLUDED.statement_version, occurred_at = now()
      `, [response.id, invite.consent_statement_version]);
      await client.query(`
        UPDATE research_invites
        SET status = 'started', first_opened_at = COALESCE(first_opened_at, now())
        WHERE id = $1
      `, [invite.invite_id]);
      await client.query(`
        INSERT INTO research_invite_events (invite_id, event_type, metadata)
        VALUES ($1, 'started', '{"source":"survey_ui"}'::jsonb)
      `, [invite.invite_id]);

      for (const assignment of experimentAssignments(text(response.id))) {
        await client.query(`
          INSERT INTO research_experiment_assignments
            (response_id, experiment_code, task_number, randomization_seed, alternative_a, alternative_b)
          VALUES ($1, 'EXP01', $2, $3, $4::jsonb, $5::jsonb)
          ON CONFLICT (response_id, experiment_code, task_number) DO NOTHING
        `, [
          response.id,
          assignment.taskNumber,
          `${response.id}:task:${assignment.taskNumber}`,
          JSON.stringify(assignment.alternativeA),
          JSON.stringify(assignment.alternativeB)
        ]);
      }
    }

    if (text(response.status) !== "in_progress") throw new Error("SURVEY_RESPONSE_CLOSED");

    const questions = await questionsForInstrument(client, text(invite.instrument_id));
    const suppliedAnswers = input.answers ?? {};
    const suppliedCodes = new Set(Object.keys(suppliedAnswers));
    const suppliedQuestions = questions
      .filter((question) => suppliedCodes.has(question.code) && question.type !== "experiment")
      .map((question) => ({ ...question, required: false }));
    const partialValidation = validateResearchAnswers(suppliedQuestions, suppliedAnswers);
    if (partialValidation.invalid.length) throw new Error(`SURVEY_ANSWERS_INVALID:${partialValidation.invalid.join(",")}`);

    const questionByCode = new Map(questions.map((question) => [question.code, question]));
    for (const [code, answer] of Object.entries(suppliedAnswers)) {
      const question = questionByCode.get(code);
      if (!question || question.type === "experiment") continue;
      await client.query(`
        INSERT INTO research_answers (response_id, question_id, answer, answered_at)
        VALUES ($1, $2, $3::jsonb, now())
        ON CONFLICT (response_id, question_id)
        DO UPDATE SET answer = EXCLUDED.answer, answered_at = now()
      `, [response.id, question.id, JSON.stringify(answer)]);
    }

    for (const [taskKey, selected] of Object.entries(input.experimentChoices ?? {})) {
      const taskNumber = Number(taskKey);
      if (!Number.isInteger(taskNumber) || taskNumber < 1 || taskNumber > 3 || !["a", "b", "none"].includes(selected)) continue;
      await client.query(`
        UPDATE research_experiment_assignments
        SET selected = $3, answered_at = now()
        WHERE response_id = $1 AND experiment_code = 'EXP01' AND task_number = $2
      `, [response.id, taskNumber, selected]);
    }

    for (const [consentKind, granted] of Object.entries(input.optionalConsents ?? {})) {
      if (!["results_notification", "thank_you_code", "marketing"].includes(consentKind)) continue;
      await client.query(`
        INSERT INTO research_consents (response_id, consent_kind, statement_version, granted, source)
        VALUES ($1, $2, $3, $4, 'survey_ui')
        ON CONFLICT (response_id, consent_kind)
        DO UPDATE SET granted = EXCLUDED.granted, statement_version = EXCLUDED.statement_version, occurred_at = now()
      `, [response.id, consentKind, invite.consent_statement_version, Boolean(granted)]);
    }

    await client.query(`
      UPDATE research_responses SET last_saved_at = now() WHERE id = $1
    `, [response.id]);
    await client.query(`
      INSERT INTO research_invite_events (invite_id, event_type, metadata)
      VALUES ($1, 'saved', '{"source":"survey_ui"}'::jsonb)
    `, [invite.invite_id]);

    if (input.complete) {
      const allAnswersResult = await client.query<SqlRow>(`
        SELECT q.code, a.answer
        FROM research_answers a
        JOIN research_questions q ON q.id = a.question_id
        WHERE a.response_id = $1
      `, [response.id]);
      const allAnswers = Object.fromEntries(allAnswersResult.rows.map((row) => [text(row.code), row.answer as ResearchAnswer]));
      const validation = validateResearchAnswers(questions, allAnswers);
      if (!validation.ok) {
        throw new Error(`SURVEY_INCOMPLETE:missing=${validation.missing.join(",")};invalid=${validation.invalid.join(",")}`);
      }

      const experimentCount = await client.query<SqlRow>(`
        SELECT count(*)::int AS count
        FROM research_experiment_assignments
        WHERE response_id = $1 AND experiment_code = 'EXP01' AND selected IS NOT NULL
      `, [response.id]);
      if (numberValue(experimentCount.rows[0]?.count) < 3) throw new Error("SURVEY_EXPERIMENT_INCOMPLETE");

      const score = scoreGreekRetail2026(allAnswers);
      await client.query(`
        INSERT INTO research_response_scores
          (response_id, scoring_version, digital_readiness_score, friction_overall_score, friction_dimensions, calculated_at)
        VALUES ($1, $2, $3, $4, $5::jsonb, now())
        ON CONFLICT (response_id)
        DO UPDATE SET
          scoring_version = EXCLUDED.scoring_version,
          digital_readiness_score = EXCLUDED.digital_readiness_score,
          friction_overall_score = EXCLUDED.friction_overall_score,
          friction_dimensions = EXCLUDED.friction_dimensions,
          calculated_at = now()
      `, [
        response.id,
        score.scoringVersion,
        score.digitalReadinessScore ?? null,
        score.frictionOverallScore ?? null,
        JSON.stringify(score.frictionDimensions)
      ]);
      await client.query(`
        UPDATE research_responses
        SET status = 'completed',
            completed_at = now(),
            last_saved_at = now(),
            duration_seconds = GREATEST(0, floor(extract(epoch from (now() - started_at)))::int)
        WHERE id = $1
      `, [response.id]);
      await client.query(`
        UPDATE research_invites SET status = 'completed' WHERE id = $1
      `, [invite.invite_id]);
      await client.query(`
        INSERT INTO research_invite_events (invite_id, event_type, metadata)
        VALUES ($1, 'completed', '{"source":"survey_ui"}'::jsonb)
      `, [invite.invite_id]);
    }

    const experimentResult = await client.query<SqlRow>(`
      SELECT task_number, alternative_a, alternative_b, selected
      FROM research_experiment_assignments
      WHERE response_id = $1 AND experiment_code = 'EXP01'
      ORDER BY task_number
    `, [response.id]);
    await client.query("COMMIT");
    return {
      status: input.complete ? "completed" : "in_progress",
      experiments: experimentResult.rows.map((row) => ({
        taskNumber: numberValue(row.task_number),
        alternativeA: objectValue(row.alternative_a) as Record<string, string | number>,
        alternativeB: objectValue(row.alternative_b) as Record<string, string | number>,
        selected: optionalText(row.selected) as "a" | "b" | "none" | undefined
      }))
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function researchSurveyAdminOverview(principal: SessionPrincipal) {
  assertAdminPermission(principal, "research.read");
  if (!productionDatabaseConfigured()) {
    return { databaseConfigured: false, studies: [] as const };
  }
  const rows = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT
      s.id, s.slug, s.title, s.status, s.fieldwork_starts_at, s.fieldwork_ends_at,
      latest_i.version AS instrument_version, latest_i.status AS instrument_status,
      COALESCE(f.frames, 0)::int AS frame_count,
      COALESCE(f.population, 0)::int AS frame_population,
      COALESCE(sd.draws, 0)::int AS sample_draw_count,
      COALESCE(sd.sample_units, 0)::int AS sample_units,
      COALESCE(i.invites, 0)::int AS invites,
      COALESCE(i.sent, 0)::int AS sent,
      COALESCE(r.started, 0)::int AS started,
      COALESCE(r.completed, 0)::int AS completed,
      COALESCE(a.analysis_runs, 0)::int AS analysis_runs,
      COALESCE(rel.releases, 0)::int AS releases
    FROM research_studies s
    LEFT JOIN LATERAL (
      SELECT version, status FROM research_instruments
      WHERE study_id = s.id ORDER BY created_at DESC LIMIT 1
    ) latest_i ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS frames, COALESCE(max(population_size), 0) AS population
      FROM research_frame_snapshots WHERE study_id = s.id
    ) f ON true
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT d.id) AS draws, count(u.id) AS sample_units
      FROM research_sample_draws d
      LEFT JOIN research_sample_units u ON u.sample_draw_id = d.id
      WHERE d.study_id = s.id
    ) sd ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS invites, count(*) FILTER (WHERE status IN ('sent','opened','started','completed')) AS sent
      FROM research_invites WHERE study_id = s.id
    ) i ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS started, count(*) FILTER (WHERE status = 'completed') AS completed
      FROM research_responses WHERE study_id = s.id
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS analysis_runs FROM research_analysis_runs WHERE study_id = s.id
    ) a ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS releases FROM research_release_snapshots WHERE study_id = s.id
    ) rel ON true
    ORDER BY s.created_at DESC
  `);
  return {
    databaseConfigured: true,
    studies: rows.rows.map((row) => ({
      id: text(row.id),
      slug: text(row.slug),
      title: text(row.title),
      status: text(row.status),
      fieldworkStartsAt: optionalText(row.fieldwork_starts_at),
      fieldworkEndsAt: optionalText(row.fieldwork_ends_at),
      instrumentVersion: optionalText(row.instrument_version),
      instrumentStatus: optionalText(row.instrument_status),
      frameCount: numberValue(row.frame_count),
      framePopulation: numberValue(row.frame_population),
      sampleDrawCount: numberValue(row.sample_draw_count),
      sampleUnits: numberValue(row.sample_units),
      invites: numberValue(row.invites),
      sent: numberValue(row.sent),
      started: numberValue(row.started),
      completed: numberValue(row.completed),
      analysisRuns: numberValue(row.analysis_runs),
      releases: numberValue(row.releases)
    }))
  };
}

export async function generateResearchInvitationBatch(
  principal: SessionPrincipal,
  input: Readonly<{ slug: string; limit?: number }>
): Promise<readonly { contact: string; url: string }[]> {
  assertAdminPermission(principal, "research.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.sqlPool.connect();
  const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 100)));
  try {
    await client.query("BEGIN");
    const studyResult = await client.query<SqlRow>(`
      SELECT s.id AS study_id, i.id AS instrument_id
      FROM research_studies s
      JOIN research_instruments i ON i.study_id = s.id
      WHERE s.slug = $1 AND i.status IN ('locked','fielding')
      ORDER BY i.created_at DESC
      LIMIT 1
    `, [input.slug]);
    const study = studyResult.rows[0];
    if (!study) throw new Error("SURVEY_INSTRUMENT_NOT_LOCKED");

    const candidates = await client.query<SqlRow>(`
      SELECT su.id AS sample_unit_id, cp.id AS contact_point_id, cp.contact_value
      FROM research_sample_units su
      JOIN research_sample_draws sd ON sd.id = su.sample_draw_id AND sd.study_id = $1
      JOIN research_contact_points cp ON cp.frame_unit_id = su.frame_unit_id
        AND cp.contact_type = 'email'
        AND cp.suppression_status = 'active'
      LEFT JOIN research_invites ri ON ri.sample_unit_id = su.id AND ri.study_id = $1
      WHERE ri.id IS NULL
      ORDER BY su.selection_order
      LIMIT $2
      FOR UPDATE OF su SKIP LOCKED
    `, [study.study_id, limit]);

    const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://kontamou.site";
    const created: Array<{ contact: string; url: string }> = [];
    for (const candidate of candidates.rows) {
      const token = randomBytes(32).toString("base64url");
      const insert = await client.query<SqlRow>(`
        INSERT INTO research_invites
          (study_id, instrument_id, sample_unit_id, contact_point_id, token_hash, channel, status)
        VALUES ($1, $2, $3, $4, $5, 'email', 'created')
        RETURNING id
      `, [study.study_id, study.instrument_id, candidate.sample_unit_id, candidate.contact_point_id, sha256(token)]);
      await client.query(`
        INSERT INTO research_invite_events (invite_id, event_type, metadata)
        VALUES ($1, 'created', '{"source":"admin_batch"}'::jsonb)
      `, [insert.rows[0]!.id]);
      created.push({
        contact: text(candidate.contact_value),
        url: `${base.replace(/\/$/, "")}/research/${encodeURIComponent(input.slug)}/t/${encodeURIComponent(token)}`
      });
    }
    await client.query("COMMIT");
    return created;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}


export type ResearchLifecycleAction =
  | "lock_instrument"
  | "start_pilot"
  | "start_fielding"
  | "close_fieldwork"
  | "begin_analysis";

export async function transitionResearchStudy(
  principal: SessionPrincipal,
  input: Readonly<{ slug: string; action: ResearchLifecycleAction }>
): Promise<Readonly<{ studyStatus: string; instrumentStatus: string }>> {
  assertAdminPermission(principal, "research.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const client = await getProductionPostgresRuntime().sqlPool.connect();
  try {
    await client.query("BEGIN");
    const rowResult = await client.query<SqlRow>(`
      SELECT
        s.id AS study_id, s.status AS study_status,
        i.id AS instrument_id, i.status AS instrument_status
      FROM research_studies s
      JOIN LATERAL (
        SELECT id, status FROM research_instruments
        WHERE study_id = s.id ORDER BY created_at DESC LIMIT 1
      ) i ON true
      WHERE s.slug = $1
      FOR UPDATE OF s
    `, [input.slug]);
    const row = rowResult.rows[0];
    if (!row) throw new Error("RESEARCH_STUDY_NOT_FOUND");

    let studyStatus = text(row.study_status);
    let instrumentStatus = text(row.instrument_status);

    if (input.action === "lock_instrument") {
      if (studyStatus !== "draft" || instrumentStatus !== "draft") throw new Error("RESEARCH_LIFECYCLE_INVALID");
      await client.query(`
        UPDATE research_instruments SET status = 'locked', published_at = now()
        WHERE id = $1
      `, [row.instrument_id]);
      instrumentStatus = "locked";
    } else if (input.action === "start_pilot") {
      if (!["draft", "pilot"].includes(studyStatus) || !["locked", "fielding"].includes(instrumentStatus)) {
        throw new Error("RESEARCH_LIFECYCLE_INVALID");
      }
      await client.query(`
        UPDATE research_studies
        SET status = 'pilot', fieldwork_starts_at = COALESCE(fieldwork_starts_at, now()), updated_at = now()
        WHERE id = $1
      `, [row.study_id]);
      await client.query("UPDATE research_instruments SET status = 'fielding' WHERE id = $1", [row.instrument_id]);
      studyStatus = "pilot";
      instrumentStatus = "fielding";
    } else if (input.action === "start_fielding") {
      if (!["draft", "pilot"].includes(studyStatus) || !["locked", "fielding"].includes(instrumentStatus)) {
        throw new Error("RESEARCH_LIFECYCLE_INVALID");
      }
      const readiness = await client.query<SqlRow>(`
        SELECT
          EXISTS(SELECT 1 FROM research_frame_snapshots WHERE study_id = $1 AND status = 'frozen') AS frozen_frame,
          EXISTS(SELECT 1 FROM research_sample_draws WHERE study_id = $1 AND status IN ('locked','fielded')) AS locked_sample
      `, [row.study_id]);
      if (!Boolean(readiness.rows[0]?.frozen_frame) || !Boolean(readiness.rows[0]?.locked_sample)) {
        throw new Error("RESEARCH_FIELDING_REQUIRES_FRAME_AND_SAMPLE");
      }
      await client.query(`
        UPDATE research_studies
        SET status = 'fielding', fieldwork_starts_at = COALESCE(fieldwork_starts_at, now()), updated_at = now()
        WHERE id = $1
      `, [row.study_id]);
      await client.query("UPDATE research_instruments SET status = 'fielding' WHERE id = $1", [row.instrument_id]);
      studyStatus = "fielding";
      instrumentStatus = "fielding";
    } else if (input.action === "close_fieldwork") {
      if (!["pilot", "fielding"].includes(studyStatus)) throw new Error("RESEARCH_LIFECYCLE_INVALID");
      await client.query(`
        UPDATE research_studies SET status = 'closed', fieldwork_ends_at = now(), updated_at = now()
        WHERE id = $1
      `, [row.study_id]);
      await client.query("UPDATE research_instruments SET status = 'retired' WHERE id = $1", [row.instrument_id]);
      studyStatus = "closed";
      instrumentStatus = "retired";
    } else if (input.action === "begin_analysis") {
      if (studyStatus !== "closed") throw new Error("RESEARCH_LIFECYCLE_INVALID");
      await client.query("UPDATE research_studies SET status = 'analysis', updated_at = now() WHERE id = $1", [row.study_id]);
      studyStatus = "analysis";
    }

    await client.query("COMMIT");
    return { studyStatus, instrumentStatus };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
