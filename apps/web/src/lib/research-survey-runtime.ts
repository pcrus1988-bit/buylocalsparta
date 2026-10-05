import { createHash } from "node:crypto";
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
  token: string,
  options: Readonly<{ allowExpired?: boolean }> = {}
): Promise<SqlRow> {
  if (token.length < 32 || token.length > 200) throw new Error("SURVEY_INVITE_INVALID");
  const result = await executor.query<SqlRow>(`
    SELECT
      ri.id AS invite_id,
      ri.status AS invite_status,
      ri.sample_unit_id,
      ri.contact_point_id,
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
  if (!options.allowExpired && row.expires_at && new Date(String(row.expires_at)).getTime() < Date.now()) {
    throw new Error("SURVEY_INVITE_EXPIRED");
  }
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
  const opened = await pool.query<SqlRow>(`
    UPDATE research_invites
    SET status = 'opened', first_opened_at = COALESCE(first_opened_at, now())
    WHERE id = $1 AND status IN ('created','sent')
    RETURNING id
  `, [invite.invite_id]);
  if (opened.rows[0]) {
    await pool.query(`
      INSERT INTO research_invite_events (invite_id, event_type, metadata)
      VALUES ($1, 'opened', '{"source":"survey_link"}'::jsonb)
    `, [invite.invite_id]);
    if (invite.sample_unit_id) {
      await pool.query(`
        INSERT INTO research_sample_disposition_events
          (sample_unit_id, disposition_code, eligibility, source, metadata)
        VALUES ($1, 'opened', 'eligible', 'survey_link', '{}'::jsonb)
      `, [invite.sample_unit_id]);
    }
  }
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
      `, [response.id]),
      pool.query<SqlRow>(`
        SELECT DISTINCT ON (consent_kind) consent_kind, granted
        FROM research_consents
        WHERE response_id = $1
          AND consent_kind IN ('results_notification','thank_you_code','marketing')
        ORDER BY consent_kind, occurred_at DESC, id DESC
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
      status: opened.rows[0] ? "opened" : text(invite.invite_status),
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

export async function refusePublicResearchInvite(input: Readonly<{
  slug: string;
  token: string;
  suppressFutureResearch?: boolean;
}>): Promise<Readonly<{ status: "declined"; futureResearchSuppressed: boolean; responseWithdrawn: boolean }>> {
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const client = await getProductionPostgresRuntime().sqlPool.connect();

  try {
    await client.query("BEGIN");
    const invite = await invitationRow(client, input.slug, input.token, { allowExpired: true });
    if (text(invite.invite_status) === "completed") throw new Error("SURVEY_ALREADY_COMPLETED");

    const responseResult = await client.query<SqlRow>(`
      SELECT id,status
      FROM research_responses
      WHERE invite_id=$1
      FOR UPDATE
    `, [invite.invite_id]);
    const response = responseResult.rows[0];
    if (response && text(response.status) === "completed") throw new Error("SURVEY_ALREADY_COMPLETED");

    let responseWithdrawn = false;
    if (response && text(response.status) === "in_progress") {
      await client.query(`
        UPDATE research_responses
        SET status='withdrawn',withdrawn_at=now(),last_saved_at=now()
        WHERE id=$1
      `, [response.id]);
      await client.query(`
        INSERT INTO research_consents (response_id,consent_kind,statement_version,granted,source)
        VALUES ($1,'research_participation',$2,false,'survey_ui')
      `, [response.id, invite.consent_statement_version]);
      responseWithdrawn = true;
    }

    const alreadySuppressed = text(invite.invite_status) === "suppressed";
    if (!alreadySuppressed) {
      await client.query(`
        UPDATE research_invites
        SET status='suppressed'
        WHERE id=$1 AND status <> 'completed'
      `, [invite.invite_id]);
      await client.query(`
        INSERT INTO research_invite_events (invite_id,event_type,metadata)
        VALUES (
          $1,'suppressed',
          jsonb_build_object(
            'source','survey_ui',
            'reason',$2::text,
            'futureResearchSuppressed',$3::boolean
          )
        )
      `, [
        invite.invite_id,
        responseWithdrawn ? "participant_withdrawal" : "participant_refusal",
        Boolean(input.suppressFutureResearch)
      ]);
      if (invite.sample_unit_id) {
        await client.query(`
          INSERT INTO research_sample_disposition_events (
            sample_unit_id,disposition_code,eligibility,source,metadata
          )
          VALUES ($1,$2,'eligible','survey_ui',jsonb_build_object('inviteId',$3::text))
        `, [
          invite.sample_unit_id,
          responseWithdrawn ? "withdrawn" : "refusal",
          invite.invite_id
        ]);
      }
    }

    let futureResearchSuppressed = false;
    if (input.suppressFutureResearch && invite.contact_point_id) {
      const contact = await client.query<SqlRow>(`
        SELECT contact_type,contact_value_hash
        FROM research_contact_points
        WHERE id=$1
        LIMIT 1
      `, [invite.contact_point_id]);
      const contactRow = contact.rows[0];
      if (contactRow?.contact_value_hash) {
        const current = await client.query<SqlRow>(`
          SELECT action
          FROM research_contact_suppression_events
          WHERE contact_type=$1 AND contact_value_hash=$2
          ORDER BY occurred_at DESC,id DESC
          LIMIT 1
        `, [contactRow.contact_type, contactRow.contact_value_hash]);
        if (text(current.rows[0]?.action) !== "suppress") {
          await client.query(`
            INSERT INTO research_contact_suppression_events (
              contact_type,contact_value_hash,action,reason,study_id,invite_id,source,metadata
            )
            VALUES (
              $1,$2,'suppress','participant_research_opt_out',$3,$4,'survey_ui',
              '{"scope":"future_research_invitations"}'::jsonb
            )
          `, [
            contactRow.contact_type,
            contactRow.contact_value_hash,
            invite.study_id,
            invite.invite_id
          ]);
        }
        await client.query(`
          UPDATE research_contact_points
          SET suppression_status='suppressed'
          WHERE contact_type=$1 AND contact_value_hash=$2
        `, [contactRow.contact_type, contactRow.contact_value_hash]);
        futureResearchSuppressed = true;
      }
    }

    await client.query("COMMIT");
    return { status: "declined", futureResearchSuppressed, responseWithdrawn };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
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
      if (invite.sample_unit_id) {
        await client.query(`
          INSERT INTO research_sample_disposition_events
            (sample_unit_id, disposition_code, eligibility, source, metadata)
          VALUES ($1, 'started', 'eligible', 'survey_ui', '{}'::jsonb)
        `, [invite.sample_unit_id]);
      }

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
      const previousConsent = await client.query<SqlRow>(`
        SELECT granted
        FROM research_consents
        WHERE response_id = $1 AND consent_kind = $2
        ORDER BY occurred_at DESC, id DESC
        LIMIT 1
      `, [response.id, consentKind]);
      if (!previousConsent.rows[0] || Boolean(previousConsent.rows[0].granted) !== Boolean(granted)) {
        await client.query(`
          INSERT INTO research_consents (response_id, consent_kind, statement_version, granted, source)
          VALUES ($1, $2, $3, $4, 'survey_ui')
        `, [response.id, consentKind, invite.consent_statement_version, Boolean(granted)]);
      }
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
      const completion = await client.query<SqlRow>(`
        UPDATE research_responses
        SET status = 'completed',
            completed_at = now(),
            last_saved_at = now(),
            duration_seconds = GREATEST(0, floor(extract(epoch from (now() - started_at)))::int)
        WHERE id = $1
        RETURNING duration_seconds
      `, [response.id]);
      const durationSeconds = numberValue(completion.rows[0]?.duration_seconds);
      const fastComplete = durationSeconds > 0 && durationSeconds < 90;
      const experimentCount = await client.query<SqlRow>(`
        SELECT count(*)::int AS count
        FROM research_experiment_assignments
        WHERE response_id = $1 AND experiment_code = 'EXP01' AND selected IS NOT NULL
      `, [response.id]);
      const answeredExperimentTasks = numberValue(experimentCount.rows[0]?.count);
      await client.query(`
        INSERT INTO research_response_quality_reviews
          (response_id, rule_version, decision, reason_codes, metrics, source)
        VALUES ($1, 'greek-retail-2026-qc-v1', $2, $3::text[], $4::jsonb, 'automated')
      `, [
        response.id,
        fastComplete ? "review" : "include",
        fastComplete ? ["rapid_completion"] : [],
        JSON.stringify({
          durationSeconds,
          requiredAnswerValidation: "passed",
          experimentTasksAnswered: answeredExperimentTasks,
          experimentModuleRequired: false
        })
      ]);
      await client.query(`
        UPDATE research_invites SET status = 'completed' WHERE id = $1
      `, [invite.invite_id]);
      await client.query(`
        INSERT INTO research_invite_events (invite_id, event_type, metadata)
        VALUES ($1, 'completed', '{"source":"survey_ui"}'::jsonb)
      `, [invite.invite_id]);
      if (invite.sample_unit_id) {
        await client.query(`
          INSERT INTO research_sample_disposition_events
            (sample_unit_id, disposition_code, eligibility, source, metadata)
          VALUES ($1, 'complete', 'eligible', 'survey_ui', '{}'::jsonb)
        `, [invite.sample_unit_id]);
      }

      // Reward eligibility follows completion only. Optional contact/marketing
      // choices are recorded separately and never determine research compensation.
      await client.query(`
        INSERT INTO research_reward_entitlements
          (response_id, reward_kind, reward_version, status, metadata)
        VALUES (
          $1, 'thank_you_code', 'greek-retail-2026-v1', 'eligible',
          '{"separatedFromAnswers":true,"source":"survey_completion","eligibilityBasis":"completed_response"}'::jsonb
        )
        ON CONFLICT (response_id, reward_kind, reward_version) DO NOTHING
      `, [response.id]);
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
      s.id, s.slug, s.title, s.status, s.fieldwork_starts_at, s.fieldwork_ends_at, s.public_results_url,
      latest_i.version AS instrument_version, latest_i.status AS instrument_status,
      latest_rt.version AS recruitment_template_version,
      latest_rt.subject AS recruitment_template_subject,
      COALESCE(f.frames, 0)::int AS frame_count,
      COALESCE(f.population, 0)::int AS frame_population,
      lf.status AS latest_frame_status,
      lf.content_sha256 AS latest_frame_sha256,
      COALESCE(sd.draws, 0)::int AS sample_draw_count,
      COALESCE(sd.sample_units, 0)::int AS sample_units,
      ls.status AS latest_sample_status,
      ls.target_n AS latest_sample_target,
      COALESCE(cp.active_contacts, 0)::int AS active_contacts,
      COALESCE(cp.suppressed_contacts, 0)::int AS suppressed_contacts,
      COALESCE(cp.bounced_contacts, 0)::int AS bounced_contacts,
      COALESCE(ib.batches, 0)::int AS invite_batches,
      COALESCE(i.invites, 0)::int AS invites,
      COALESCE(i.sent, 0)::int AS sent,
      COALESCE(r.started, 0)::int AS started,
      COALESCE(r.completed, 0)::int AS completed,
      COALESCE(q.review_count, 0)::int AS quality_review,
      COALESCE(q.exclude_count, 0)::int AS quality_exclude,
      COALESCE(rw.eligible_count, 0)::int AS reward_eligible,
      COALESCE(rw.issued_count, 0)::int AS reward_issued,
      COALESCE(rw.redeemed_count, 0)::int AS reward_redeemed,
      COALESCE(a.analysis_runs, 0)::int AS analysis_runs,
      COALESCE(a.succeeded_runs, 0)::int AS succeeded_analysis_runs,
      COALESCE(a.estimates, 0)::int AS analysis_estimates,
      COALESCE(rel.releases, 0)::int AS releases,
      rel.latest_release_version,
      rel.latest_release_published_at
    FROM research_studies s
    LEFT JOIN LATERAL (
      SELECT version, status FROM research_instruments
      WHERE study_id = s.id ORDER BY created_at DESC LIMIT 1
    ) latest_i ON true
    LEFT JOIN LATERAL (
      SELECT version, subject
      FROM research_recruitment_templates
      WHERE study_id = s.id AND channel='email' AND status='locked'
      ORDER BY locked_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    ) latest_rt ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS frames, COALESCE(max(population_size), 0) AS population
      FROM research_frame_snapshots WHERE study_id = s.id
    ) f ON true
    LEFT JOIN LATERAL (
      SELECT status, content_sha256
      FROM research_frame_snapshots
      WHERE study_id = s.id
      ORDER BY created_at DESC
      LIMIT 1
    ) lf ON true
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT d.id) AS draws, count(u.id) AS sample_units
      FROM research_sample_draws d
      LEFT JOIN research_sample_units u ON u.sample_draw_id = d.id
      WHERE d.study_id = s.id
    ) sd ON true
    LEFT JOIN LATERAL (
      SELECT status, target_n
      FROM research_sample_draws
      WHERE study_id = s.id
      ORDER BY created_at DESC
      LIMIT 1
    ) ls ON true
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE cp.suppression_status = 'active') AS active_contacts,
        count(*) FILTER (WHERE cp.suppression_status IN ('suppressed','invalid')) AS suppressed_contacts,
        count(*) FILTER (WHERE cp.suppression_status = 'bounced') AS bounced_contacts
      FROM research_frame_snapshots fs
      JOIN research_frame_units fu ON fu.frame_snapshot_id = fs.id
      JOIN research_contact_points cp ON cp.frame_unit_id = fu.id
      WHERE fs.study_id = s.id
    ) cp ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS batches
      FROM research_invite_batches
      WHERE study_id = s.id
    ) ib ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS invites, count(*) FILTER (WHERE status IN ('sent','opened','started','completed')) AS sent
      FROM research_invites WHERE study_id = s.id
    ) i ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS started, count(*) FILTER (WHERE status = 'completed') AS completed
      FROM research_responses WHERE study_id = s.id
    ) r ON true
    LEFT JOIN LATERAL (
      WITH latest AS (
        SELECT DISTINCT ON (qr.response_id)
          qr.response_id,
          qr.decision
        FROM research_response_quality_reviews qr
        JOIN research_responses rr ON rr.id = qr.response_id
        WHERE rr.study_id = s.id
        ORDER BY qr.response_id, qr.created_at DESC, qr.id DESC
      )
      SELECT
        count(*) FILTER (WHERE decision = 'review') AS review_count,
        count(*) FILTER (WHERE decision = 'exclude') AS exclude_count
      FROM latest
    ) q ON true
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE re.status = 'eligible') AS eligible_count,
        count(*) FILTER (WHERE re.status = 'issued') AS issued_count,
        count(*) FILTER (WHERE re.status = 'redeemed') AS redeemed_count
      FROM research_reward_entitlements re
      JOIN research_responses rr ON rr.id = re.response_id
      WHERE rr.study_id = s.id
    ) rw ON true
    LEFT JOIN LATERAL (
      SELECT
        count(DISTINCT ar.id) AS analysis_runs,
        count(DISTINCT ar.id) FILTER (WHERE ar.status='succeeded') AS succeeded_runs,
        count(ae.id) AS estimates
      FROM research_analysis_runs ar
      LEFT JOIN research_analysis_estimates ae ON ae.analysis_run_id = ar.id
      WHERE ar.study_id = s.id
    ) a ON true
    LEFT JOIN LATERAL (
      SELECT
        count(*) AS releases,
        (array_agg(release_version ORDER BY created_at DESC))[1] AS latest_release_version,
        (array_agg(published_at ORDER BY created_at DESC))[1] AS latest_release_published_at
      FROM research_release_snapshots
      WHERE study_id = s.id
    ) rel ON true
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE status='queued') AS queued_jobs,
        count(*) FILTER (WHERE status='running') AS running_jobs,
        count(*) FILTER (WHERE status='failed') AS failed_jobs
      FROM research_study_jobs
      WHERE study_id = s.id
    ) j ON true
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
      publicResultsUrl: optionalText(row.public_results_url),
      instrumentVersion: optionalText(row.instrument_version),
      instrumentStatus: optionalText(row.instrument_status),
      recruitmentTemplateVersion: optionalText(row.recruitment_template_version),
      recruitmentTemplateSubject: optionalText(row.recruitment_template_subject),
      frameCount: numberValue(row.frame_count),
      framePopulation: numberValue(row.frame_population),
      latestFrameStatus: optionalText(row.latest_frame_status),
      latestFrameSha256: optionalText(row.latest_frame_sha256),
      sampleDrawCount: numberValue(row.sample_draw_count),
      sampleUnits: numberValue(row.sample_units),
      latestSampleStatus: optionalText(row.latest_sample_status),
      latestSampleTarget: numberValue(row.latest_sample_target),
      activeContacts: numberValue(row.active_contacts),
      suppressedContacts: numberValue(row.suppressed_contacts),
      bouncedContacts: numberValue(row.bounced_contacts),
      inviteBatches: numberValue(row.invite_batches),
      invites: numberValue(row.invites),
      sent: numberValue(row.sent),
      started: numberValue(row.started),
      completed: numberValue(row.completed),
      qualityReview: numberValue(row.quality_review),
      qualityExclude: numberValue(row.quality_exclude),
      rewardEligible: numberValue(row.reward_eligible),
      rewardIssued: numberValue(row.reward_issued),
      rewardRedeemed: numberValue(row.reward_redeemed),
      analysisRuns: numberValue(row.analysis_runs),
      succeededAnalysisRuns: numberValue(row.succeeded_analysis_runs),
      analysisEstimates: numberValue(row.analysis_estimates),
      releases: numberValue(row.releases),
      latestReleaseVersion: optionalText(row.latest_release_version),
      latestReleasePublishedAt: optionalText(row.latest_release_published_at),
      queuedJobs: numberValue(row.queued_jobs),
      runningJobs: numberValue(row.running_jobs),
      failedJobs: numberValue(row.failed_jobs)
    }))
  };
}

export type ResearchLifecycleAction =
  | "lock_instrument"
  | "start_pilot"
  | "start_fielding"
  | "close_fieldwork"
  | "begin_analysis"
  | "publish_release";

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
    } else if (input.action === "publish_release") {
      if (studyStatus !== "analysis") throw new Error("RESEARCH_LIFECYCLE_INVALID");
      const releaseResult = await client.query<SqlRow>(`
        SELECT
          rs.id,rs.public_url,rs.artifact_sha256,rs.dataset_sha256,rs.analysis_run_id,
          ar.status AS analysis_status,ar.dataset_sha256 AS analysis_dataset_sha256
        FROM research_release_snapshots rs
        JOIN research_analysis_runs ar ON ar.id=rs.analysis_run_id
        WHERE rs.study_id=$1
        ORDER BY rs.created_at DESC
        LIMIT 1
        FOR UPDATE OF rs
      `, [row.study_id]);
      const release = releaseResult.rows[0];
      if (!release || !text(release.artifact_sha256)) throw new Error("RESEARCH_RELEASE_NOT_READY");
      if (text(release.analysis_status) !== "succeeded") throw new Error("RESEARCH_RELEASE_ANALYSIS_NOT_SUCCEEDED");
      if (text(release.dataset_sha256) !== text(release.analysis_dataset_sha256)) {
        throw new Error("RESEARCH_RELEASE_DATASET_HASH_MISMATCH");
      }
      await client.query(`
        UPDATE research_release_snapshots
        SET published_at=COALESCE(published_at,now())
        WHERE id=$1
      `, [release.id]);
      await client.query(`
        UPDATE research_studies
        SET status='published',public_results_url=$2,updated_at=now()
        WHERE id=$1
      `, [row.study_id, release.public_url]);
      studyStatus = "published";
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
