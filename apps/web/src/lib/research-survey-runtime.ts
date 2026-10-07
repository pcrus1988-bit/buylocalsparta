import { createHash } from "node:crypto";
import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { researchReleaseArtifactIntegrity } from "./research-survey-release";
import {
  RESEARCH_MARKETING_CONSENT_STATEMENT_EL,
  RESEARCH_MARKETING_CONSENT_VERSION,
  researchQualitySignals,
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
  return Object.fromEntries(Object.entries(experimentLevels).map(([attribute, rawValues]) => {
    const values: readonly (string | number)[] = rawValues;
    return [
      attribute,
      deterministicChoice(values, `${seed}:${attribute}:${side}`)
    ];
  }));
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
      ri.wave_id AS wave_id,
      ri.status AS invite_status,
      ri.sample_unit_id,
      ri.contact_point_id,
      COALESCE(rat.expires_at,ri.expires_at) AS expires_at,
      rat.id AS access_token_id,
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
    LEFT JOIN research_invite_access_tokens rat
      ON rat.invite_id=ri.id
     AND rat.token_hash=$2
     AND rat.status='active'
    WHERE rs.slug = $1
      AND (ri.token_hash = $2 OR rat.id IS NOT NULL)
    LIMIT 1
  `, [slug, sha256(token)]);
  const row = result.rows[0];
  if (!row) throw new Error("SURVEY_INVITE_NOT_FOUND");
  if (row.access_token_id) {
    await executor.query(
      "UPDATE research_invite_access_tokens SET first_used_at=COALESCE(first_used_at,now()) WHERE id=$1",
      [row.access_token_id]
    );
  }
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

async function marketingConsentForContact(
  executor: { query<Row extends SqlRow = SqlRow>(text: string, params?: readonly unknown[]): Promise<{ rows: readonly Row[] }> },
  contactPointId: unknown
): Promise<boolean | undefined> {
  const id = text(contactPointId).trim();
  if (!id) return undefined;
  const result = await executor.query<SqlRow>(`
    SELECT latest.granted
    FROM research_contact_points cp
    JOIN research_frame_units fu ON fu.id=cp.frame_unit_id
    JOIN LATERAL (
      SELECT e.granted
      FROM research_private.marketing_consent_events e
      WHERE e.company_key_hash=fu.external_key_hash
        AND e.contact_value_hash=cp.contact_value_hash
      ORDER BY e.occurred_at DESC,e.id DESC
      LIMIT 1
    ) latest ON true
    WHERE cp.id=$1
      AND cp.contact_type='email'
    LIMIT 1
  `, [id]);
  if (!result.rows[0]) return undefined;
  return Boolean(result.rows[0].granted);
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
          AND consent_kind IN ('results_notification','thank_you_code')
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

  const marketingConsent = await marketingConsentForContact(pool, invite.contact_point_id);
  if (marketingConsent !== undefined) consents = { ...consents, marketing: marketingConsent };

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

    const responseResult = await client.query<SqlRow>(`
      SELECT id,status
      FROM research_responses
      WHERE invite_id=$1
      FOR UPDATE
    `, [invite.invite_id]);
    const response = responseResult.rows[0];
    const previousResponseStatus = text(response?.status);
    const withdrawalWasCompleted = previousResponseStatus === "completed";
    let responseWithdrawn = previousResponseStatus === "withdrawn";
    let dispositionRecorded = false;

    if (response && ["in_progress", "completed"].includes(previousResponseStatus)) {
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
      dispositionRecorded = true;
    } else if (!response && text(invite.invite_status) !== "suppressed") {
      dispositionRecorded = true;
    }

    if (text(invite.invite_status) !== "suppressed" && previousResponseStatus !== "withdrawn") {
      // A completed invitation remains historically completed when its response
      // is later withdrawn. The response status + append-only consent/disposition
      // ledgers carry the current participation state.
      if (text(invite.invite_status) !== "completed") {
        await client.query(`
          UPDATE research_invites
          SET status='suppressed'
          WHERE id=$1
        `, [invite.invite_id]);
      }
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
        responseWithdrawn
          ? withdrawalWasCompleted ? "participant_withdrawal_after_completion" : "participant_withdrawal"
          : "participant_refusal",
        Boolean(input.suppressFutureResearch)
      ]);
    }

    if (invite.sample_unit_id && dispositionRecorded) {
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

export async function updatePublicResearchConsents(input: Readonly<{
  slug: string;
  token: string;
  optionalConsents: Partial<Record<"results_notification" | "thank_you_code" | "marketing", boolean>>;
}>): Promise<Readonly<{
  status: "preferences_updated";
  consents: Readonly<Partial<Record<"results_notification" | "thank_you_code" | "marketing", boolean>>>;
}>> {
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const client = await getProductionPostgresRuntime().sqlPool.connect();

  try {
    await client.query("BEGIN");
    const invite = await invitationRow(client, input.slug, input.token, { allowExpired: true });
    const responseResult = await client.query<SqlRow>(`
      SELECT id,status
      FROM research_responses
      WHERE invite_id=$1
      FOR UPDATE
    `, [invite.invite_id]);
    const response = responseResult.rows[0];
    if (!response) throw new Error("RESEARCH_RESPONSE_NOT_FOUND");
    if (text(response.status) !== "completed") {
      throw new Error("RESEARCH_PREFERENCES_REQUIRE_COMPLETION");
    }

    if (Object.prototype.hasOwnProperty.call(input.optionalConsents, "marketing")) {
      if (!invite.contact_point_id) throw new Error("RESEARCH_MARKETING_CONTACT_UNAVAILABLE");
      const contactResult = await client.query<SqlRow>(`
        SELECT
          cp.id,
          cp.contact_value_hash,
          fu.external_key_hash AS company_key_hash,
          NULLIF(BTRIM(COALESCE(fu.sampling_attributes->>'legalName','')),'') AS company_name,
          cv.contact_value AS email
        FROM research_contact_points cp
        JOIN research_frame_units fu ON fu.id=cp.frame_unit_id
        JOIN research_private.contact_vault cv ON cv.contact_point_id=cp.id
        WHERE cp.id=$1
          AND cp.contact_type='email'
        FOR UPDATE OF cp
      `, [invite.contact_point_id]);
      const contact = contactResult.rows[0];
      if (!contact || !text(contact.email).trim()) throw new Error("RESEARCH_MARKETING_CONTACT_UNAVAILABLE");

      const normalizedGranted = Boolean(input.optionalConsents.marketing);
      const previous = await client.query<SqlRow>(`
        SELECT granted
        FROM research_private.marketing_consent_events
        WHERE company_key_hash=$1
          AND contact_value_hash=$2
        ORDER BY occurred_at DESC,id DESC
        LIMIT 1
      `, [contact.company_key_hash, contact.contact_value_hash]);

      await client.query(`
        INSERT INTO research_private.marketing_contacts (
          company_key_hash,contact_value_hash,email,company_name,
          source_study_id,source_contact_point_id,first_recorded_at,updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,now(),now())
        ON CONFLICT (company_key_hash,contact_value_hash)
        DO UPDATE SET
          email=EXCLUDED.email,
          company_name=COALESCE(EXCLUDED.company_name,research_private.marketing_contacts.company_name),
          source_study_id=EXCLUDED.source_study_id,
          source_contact_point_id=EXCLUDED.source_contact_point_id,
          updated_at=now()
      `, [
        contact.company_key_hash,
        contact.contact_value_hash,
        text(contact.email).trim().toLowerCase(),
        optionalText(contact.company_name) ?? null,
        invite.study_id,
        invite.contact_point_id
      ]);

      if (!previous.rows[0] || Boolean(previous.rows[0].granted) !== normalizedGranted) {
        await client.query(`
          INSERT INTO research_private.marketing_consent_events (
            company_key_hash,contact_value_hash,source_study_id,granted,
            statement_version,statement_text,source
          )
          VALUES ($1,$2,$3,$4,$5,$6,'survey_completion_preferences')
        `, [
          contact.company_key_hash,
          contact.contact_value_hash,
          invite.study_id,
          normalizedGranted,
          RESEARCH_MARKETING_CONSENT_VERSION,
          RESEARCH_MARKETING_CONSENT_STATEMENT_EL
        ]);
      }
    }

    for (const [consentKind, granted] of Object.entries(input.optionalConsents)) {
      if (!["results_notification", "thank_you_code"].includes(consentKind)) continue;
      const normalizedGranted = Boolean(granted);
      const previousConsent = await client.query<SqlRow>(`
        SELECT granted
        FROM research_consents
        WHERE response_id=$1 AND consent_kind=$2
        ORDER BY occurred_at DESC,id DESC
        LIMIT 1
      `, [response.id, consentKind]);

      if (!previousConsent.rows[0] || Boolean(previousConsent.rows[0].granted) !== normalizedGranted) {
        await client.query(`
          INSERT INTO research_consents (response_id,consent_kind,statement_version,granted,source)
          VALUES ($1,$2,$3,$4,'survey_ui_preferences')
        `, [response.id, consentKind, invite.consent_statement_version, normalizedGranted]);
      }

      if (!normalizedGranted) {
        await client.query(`
          WITH cancelled AS (
            UPDATE research_participant_deliveries
            SET status='cancelled',
                last_error='participant_consent_revoked',
                updated_at=now()
            WHERE response_id=$1
              AND consent_kind=$2
              AND status IN ('planned','failed')
            RETURNING id
          )
          INSERT INTO research_participant_delivery_events
            (delivery_id,event_type,metadata)
          SELECT
            id,
            'cancelled',
            jsonb_build_object(
              'source','survey_ui_preferences',
              'reason','participant_consent_revoked',
              'consentKind',$2::text
            )
          FROM cancelled
        `, [response.id, consentKind]);
      }
    }

    const latest = await client.query<SqlRow>(`
      SELECT DISTINCT ON (consent_kind) consent_kind,granted
      FROM research_consents
      WHERE response_id=$1
        AND consent_kind IN ('results_notification','thank_you_code')
      ORDER BY consent_kind,occurred_at DESC,id DESC
    `, [response.id]);
    let consents = Object.fromEntries(
      latest.rows.map((row) => [text(row.consent_kind), Boolean(row.granted)])
    ) as Partial<Record<"results_notification" | "thank_you_code" | "marketing", boolean>>;
    const marketingConsent = await marketingConsentForContact(client, invite.contact_point_id);
    if (marketingConsent !== undefined) consents = { ...consents, marketing: marketingConsent };

    await client.query("COMMIT");
    return { status: "preferences_updated", consents };
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
        INSERT INTO research_responses (study_id, wave_id, instrument_id, invite_id, status, locale)
        VALUES ($1, $2, $3, $4, 'in_progress', 'el-GR')
        RETURNING id, status, started_at
      `, [invite.study_id, invite.wave_id, invite.instrument_id, invite.invite_id]);
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
      const quality = researchQualitySignals(allAnswers, durationSeconds);
      const answerPatternSha256 = sha256(canonicalResearchEvidence(allAnswers));
      const duplicatePatterns = await client.query<SqlRow>(`
        SELECT count(DISTINCT qr.response_id)::int AS count
        FROM research_response_quality_reviews qr
        JOIN research_responses other ON other.id=qr.response_id
        WHERE other.study_id=$1
          AND other.status='completed'
          AND qr.response_id<>$2
          AND qr.answer_pattern_sha256=$3
      `, [invite.study_id, response.id, answerPatternSha256]);
      const duplicatePatternCount = numberValue(duplicatePatterns.rows[0]?.count);
      const reasonCodes = [...new Set([
        ...quality.reasonCodes,
        ...(duplicatePatternCount > 0 ? ["duplicate_answer_pattern"] : [])
      ])];
      const qualityScore = Math.max(0, quality.score - (duplicatePatternCount > 0 ? 30 : 0));
      const experimentCount = await client.query<SqlRow>(`
        SELECT count(*)::int AS count
        FROM research_experiment_assignments
        WHERE response_id = $1 AND experiment_code = 'EXP01' AND selected IS NOT NULL
      `, [response.id]);
      const answeredExperimentTasks = numberValue(experimentCount.rows[0]?.count);
      await client.query(`
        INSERT INTO research_response_quality_reviews
          (
            response_id, rule_version, decision, reason_codes, metrics, source,
            quality_score, answer_pattern_sha256
          )
        VALUES (
          $1, 'greek-retail-2026-qc-v3', $2, $3::text[], $4::jsonb, 'automated',
          $5,$6
        )
      `, [
        response.id,
        reasonCodes.length > 0 ? "review" : "include",
        reasonCodes,
        JSON.stringify({
          ...quality.metrics,
          requiredAnswerValidation: "passed",
          experimentTasksAnswered: answeredExperimentTasks,
          experimentModuleRequired: false,
          duplicatePatternCount,
          duplicatePatternReviewOnly: true,
          automaticExclusion: false
        }),
        qualityScore,
        answerPatternSha256
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

      // Reward eligibility follows completion only. Optional research-contact
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
      await client.query(`
        INSERT INTO research_study_jobs (study_id,wave_id,job_type,status,input)
        SELECT
          $1,$2,'reward_delivery','queued',
          jsonb_build_object('responseId',$3::text,'source','survey_completion')
        WHERE EXISTS (
          SELECT 1
          FROM research_consents rc
          WHERE rc.response_id=$3
            AND rc.consent_kind='thank_you_code'
          ORDER BY rc.occurred_at DESC,rc.id DESC
          LIMIT 1
        )
        AND (
          SELECT rc.granted
          FROM research_consents rc
          WHERE rc.response_id=$3
            AND rc.consent_kind='thank_you_code'
          ORDER BY rc.occurred_at DESC,rc.id DESC
          LIMIT 1
        ) = true
        AND NOT EXISTS (
          SELECT 1
          FROM research_study_jobs j
          WHERE j.study_id=$1
            AND j.wave_id=$2
            AND j.job_type='reward_delivery'
            AND j.input->>'responseId'=$3::text
            AND j.status IN ('queued','running','succeeded')
        )
      `, [invite.study_id, invite.wave_id, response.id]);
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

export type ResearchFieldworkStratum = Readonly<{
  code: string;
  label: string;
  dimensions: Record<string, unknown>;
  populationCount: number;
  targetCompleteCount: number;
  selected: number;
  sent: number;
  delivered: number;
  opened: number;
  started: number;
  completed: number;
  withdrawn: number;
}>;

export async function researchFieldworkStrata(
  principal: SessionPrincipal,
  slug: string
): Promise<readonly ResearchFieldworkStratum[]> {
  assertAdminPermission(principal, "research.read");
  if (!productionDatabaseConfigured()) return [];

  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    WITH study AS (
      SELECT
        id,
        CASE WHEN status IN ('draft','pilot') THEN 'pilot' ELSE 'main' END AS active_phase
      FROM research_studies
      WHERE slug=$1
      LIMIT 1
    ),
    latest_draw AS (
      SELECT d.id,d.frame_snapshot_id,d.fieldwork_phase
      FROM research_sample_draws d
      JOIN study s ON s.id=d.study_id
      WHERE d.fieldwork_phase=s.active_phase
      ORDER BY d.created_at DESC
      LIMIT 1
    ),
    sample AS (
      SELECT su.id,su.stratum_id
      FROM research_sample_units su
      JOIN latest_draw ld ON ld.id=su.sample_draw_id
    ),
    sample_counts AS (
      SELECT stratum_id,count(*)::int AS selected
      FROM sample
      GROUP BY stratum_id
    ),
    invite_base AS (
      SELECT ri.id AS invite_id,su.stratum_id,ri.status,ri.sent_at
      FROM research_invites ri
      JOIN sample su ON su.id=ri.sample_unit_id
      JOIN study s ON s.id=ri.study_id
      WHERE ri.fieldwork_phase=s.active_phase
    ),
    invite_counts AS (
      SELECT
        stratum_id,
        count(*) FILTER (WHERE sent_at IS NOT NULL)::int AS sent
      FROM invite_base
      GROUP BY stratum_id
    ),
    invite_event_counts AS (
      SELECT
        ib.stratum_id,
        count(DISTINCT ib.invite_id) FILTER (WHERE ie.event_type='delivered')::int AS delivered,
        count(DISTINCT ib.invite_id) FILTER (WHERE ie.event_type='opened')::int AS opened
      FROM invite_base ib
      JOIN research_invite_events ie ON ie.invite_id=ib.invite_id
      GROUP BY ib.stratum_id
    ),
    response_counts AS (
      SELECT
        ib.stratum_id,
        count(rr.id)::int AS started,
        count(rr.id) FILTER (WHERE rr.status='completed')::int AS completed,
        count(rr.id) FILTER (WHERE rr.status='withdrawn')::int AS withdrawn
      FROM invite_base ib
      JOIN research_responses rr ON rr.invite_id=ib.invite_id
      GROUP BY ib.stratum_id
    )
    SELECT
      st.code,
      st.label,
      st.dimensions,
      st.population_count,
      COALESCE(sds.target_complete_n,st.target_complete_count)::int AS target_complete_count,
      COALESCE(sc.selected,0)::int AS selected,
      COALESCE(ic.sent,0)::int AS sent,
      COALESCE(iec.delivered,0)::int AS delivered,
      COALESCE(iec.opened,0)::int AS opened,
      COALESCE(rc.started,0)::int AS started,
      COALESCE(rc.completed,0)::int AS completed,
      COALESCE(rc.withdrawn,0)::int AS withdrawn
    FROM latest_draw ld
    JOIN research_strata st ON st.frame_snapshot_id=ld.frame_snapshot_id
    LEFT JOIN research_sample_designs sd ON sd.sample_draw_id=ld.id
    LEFT JOIN research_sample_design_strata sds
      ON sds.design_id=sd.id
     AND sds.stratum_id=st.id
    LEFT JOIN sample_counts sc ON sc.stratum_id=st.id
    LEFT JOIN invite_counts ic ON ic.stratum_id=st.id
    LEFT JOIN invite_event_counts iec ON iec.stratum_id=st.id
    LEFT JOIN response_counts rc ON rc.stratum_id=st.id
    ORDER BY st.code
  `, [slug]);

  return result.rows.map((row) => ({
    code: text(row.code),
    label: text(row.label),
    dimensions: objectValue(row.dimensions),
    populationCount: numberValue(row.population_count),
    targetCompleteCount: numberValue(row.target_complete_count),
    selected: numberValue(row.selected),
    sent: numberValue(row.sent),
    delivered: numberValue(row.delivered),
    opened: numberValue(row.opened),
    started: numberValue(row.started),
    completed: numberValue(row.completed),
    withdrawn: numberValue(row.withdrawn)
  }));
}


export type ResearchProtocolEvent = Readonly<{
  id: string;
  eventType: "deviation" | "amendment" | "resolution";
  lifecyclePhase: "design" | "pilot" | "main" | "analysis" | "publication";
  category: "instrument" | "sampling" | "recruitment" | "fieldwork" | "privacy" | "analysis" | "publication" | "operations";
  severity: "info" | "minor" | "material" | "critical";
  title: string;
  description: string;
  rationale?: string;
  impactAssessment?: string;
  correctiveAction?: string;
  relatedEventId?: string;
  occurredAt: string;
  recordedAt: string;
  contentSha256: string;
}>;

function canonicalResearchEvidence(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalResearchEvidence).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map((key) =>
    JSON.stringify(key) + ":" + canonicalResearchEvidence(record[key])
  ).join(",") + "}";
}

export async function researchProtocolEvents(
  principal: SessionPrincipal,
  slug: string
): Promise<readonly ResearchProtocolEvent[]> {
  assertAdminPermission(principal, "research.read");
  if (!productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT
      pe.id,pe.event_type,pe.lifecycle_phase,pe.category,pe.severity,
      pe.title,pe.description,pe.rationale,pe.impact_assessment,pe.corrective_action,
      pe.related_event_id,pe.occurred_at,pe.recorded_at,pe.content_sha256
    FROM research_protocol_events pe
    JOIN research_studies s ON s.id=pe.study_id
    WHERE s.slug=$1
    ORDER BY pe.occurred_at DESC,pe.recorded_at DESC,pe.id DESC
    LIMIT 200
  `, [slug]);
  return result.rows.map((row) => ({
    id: text(row.id),
    eventType: text(row.event_type) as ResearchProtocolEvent["eventType"],
    lifecyclePhase: text(row.lifecycle_phase) as ResearchProtocolEvent["lifecyclePhase"],
    category: text(row.category) as ResearchProtocolEvent["category"],
    severity: text(row.severity) as ResearchProtocolEvent["severity"],
    title: text(row.title),
    description: text(row.description),
    rationale: optionalText(row.rationale),
    impactAssessment: optionalText(row.impact_assessment),
    correctiveAction: optionalText(row.corrective_action),
    relatedEventId: optionalText(row.related_event_id),
    occurredAt: new Date(row.occurred_at as string | Date).toISOString(),
    recordedAt: new Date(row.recorded_at as string | Date).toISOString(),
    contentSha256: text(row.content_sha256)
  }));
}

export async function recordResearchProtocolEvent(
  principal: SessionPrincipal,
  input: Readonly<{
    slug: string;
    eventType: ResearchProtocolEvent["eventType"];
    lifecyclePhase: ResearchProtocolEvent["lifecyclePhase"];
    category: ResearchProtocolEvent["category"];
    severity: ResearchProtocolEvent["severity"];
    title: string;
    description: string;
    rationale?: string;
    impactAssessment?: string;
    correctiveAction?: string;
    relatedEventId?: string;
    occurredAt?: string;
  }>
): Promise<Readonly<{ id: string; contentSha256: string }>> {
  assertAdminPermission(principal, "research.quality.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");

  const eventTypes = new Set(["deviation","amendment","resolution"]);
  const lifecyclePhases = new Set(["design","pilot","main","analysis","publication"]);
  const categories = new Set(["instrument","sampling","recruitment","fieldwork","privacy","analysis","publication","operations"]);
  const severities = new Set(["info","minor","material","critical"]);
  if (!eventTypes.has(input.eventType)) throw new Error("RESEARCH_PROTOCOL_EVENT_TYPE_INVALID");
  if (!lifecyclePhases.has(input.lifecyclePhase)) throw new Error("RESEARCH_PROTOCOL_PHASE_INVALID");
  if (!categories.has(input.category)) throw new Error("RESEARCH_PROTOCOL_CATEGORY_INVALID");
  if (!severities.has(input.severity)) throw new Error("RESEARCH_PROTOCOL_SEVERITY_INVALID");

  const title = input.title.trim();
  const description = input.description.trim();
  const rationale = input.rationale?.trim() || "";
  const impactAssessment = input.impactAssessment?.trim() || "";
  const correctiveAction = input.correctiveAction?.trim() || "";
  const relatedEventId = input.relatedEventId?.trim() || "";
  if (title.length < 5 || title.length > 180) throw new Error("RESEARCH_PROTOCOL_TITLE_INVALID");
  if (description.length < 10 || description.length > 12_000) throw new Error("RESEARCH_PROTOCOL_DESCRIPTION_INVALID");
  if (input.eventType === "resolution" && !relatedEventId) throw new Error("RESEARCH_PROTOCOL_RESOLUTION_REFERENCE_REQUIRED");
  if (["material","critical"].includes(input.severity) && !impactAssessment) {
    throw new Error("RESEARCH_PROTOCOL_IMPACT_ASSESSMENT_REQUIRED");
  }
  if (input.eventType === "resolution" && !correctiveAction) {
    throw new Error("RESEARCH_PROTOCOL_CORRECTIVE_ACTION_REQUIRED");
  }

  const occurred = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (!Number.isFinite(occurred.getTime())) throw new Error("RESEARCH_PROTOCOL_OCCURRED_AT_INVALID");
  const occurredAt = occurred.toISOString();
  const evidence = {
    schema: "kontamou.research.protocol-event.v1",
    studySlug: input.slug,
    eventType: input.eventType,
    lifecyclePhase: input.lifecyclePhase,
    category: input.category,
    severity: input.severity,
    title,
    description,
    rationale: rationale || null,
    impactAssessment: impactAssessment || null,
    correctiveAction: correctiveAction || null,
    relatedEventId: relatedEventId || null,
    occurredAt
  };
  const contentSha256 = sha256(canonicalResearchEvidence(evidence));
  const pool = getProductionPostgresRuntime().sqlPool;
  const inserted = await pool.query<SqlRow>(`
    INSERT INTO research_protocol_events (
      study_id,event_type,lifecycle_phase,category,severity,title,description,
      rationale,impact_assessment,corrective_action,related_event_id,occurred_at,
      recorded_by,evidence_json,content_sha256
    )
    SELECT
      s.id,$2,$3,$4,$5,$6,$7,
      NULLIF($8,''),NULLIF($9,''),NULLIF($10,''),NULLIF($11,'')::uuid,$12::timestamptz,
      $13,$14::jsonb,$15
    FROM research_studies s
    WHERE s.slug=$1
      AND s.status <> 'archived'
    RETURNING id
  `, [
    input.slug,input.eventType,input.lifecyclePhase,input.category,input.severity,title,description,
    rationale,impactAssessment,correctiveAction,relatedEventId,occurredAt,
    principal.userId,JSON.stringify(evidence),contentSha256
  ]);
  if (!inserted.rows[0]) throw new Error("RESEARCH_STUDY_NOT_FOUND_OR_ARCHIVED");
  return { id: text(inserted.rows[0].id), contentSha256 };
}

export type ResearchDeliveryDelayItem = Readonly<{
  id: string;
  messageKind: string;
  delayType?: string;
  smtpStatus?: string;
  diagnosticCode?: string;
  expirationTime?: string;
  occurredAt?: string;
}>;

export async function researchDeliveryDelayQueue(
  principal: SessionPrincipal,
  slug: string
): Promise<readonly ResearchDeliveryDelayItem[]> {
  assertAdminPermission(principal, "research.read");
  if (!productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    WITH target_study AS (
      SELECT id
      FROM research_studies
      WHERE slug=$1
      LIMIT 1
    ),
    invite_delays AS (
      SELECT
        m.id::text AS id,
        CASE
          WHEN m.attempt_kind='reminder' THEN 'Reminder'
          WHEN m.attempt_kind='reissue' THEN 'Reissued invitation'
          ELSE 'Initial invitation'
        END AS message_kind,
        delay_event.metadata->>'delayType' AS delay_type,
        delay_event.metadata->>'smtpStatus' AS smtp_status,
        delay_event.metadata->>'diagnosticCode' AS diagnostic_code,
        delay_event.metadata->>'expirationTime' AS expiration_time,
        delay_event.occurred_at
      FROM research_invite_messages m
      JOIN research_invites ri ON ri.id=m.invite_id
      JOIN target_study s ON s.id=ri.study_id
      LEFT JOIN LATERAL (
        SELECT e.metadata,e.occurred_at
        FROM research_invite_events e
        WHERE e.invite_id=ri.id
          AND e.metadata->>'providerEventType'='DeliveryDelay'
          AND (
            e.metadata->>'attemptId'=m.id::text
            OR e.metadata->>'providerMessageId'=m.provider_message_id
          )
        ORDER BY e.occurred_at DESC,e.id DESC
        LIMIT 1
      ) delay_event ON true
      WHERE m.status='sent'
        AND m.last_error LIKE 'SES delivery delay:%'
    ),
    participant_delays AS (
      SELECT
        d.id::text AS id,
        CASE
          WHEN d.message_kind='thank_you_code' THEN 'Thank-you code'
          ELSE 'Results notification'
        END AS message_kind,
        delay_event.metadata->>'delayType' AS delay_type,
        delay_event.metadata->>'smtpStatus' AS smtp_status,
        delay_event.metadata->>'diagnosticCode' AS diagnostic_code,
        delay_event.metadata->>'expirationTime' AS expiration_time,
        delay_event.occurred_at
      FROM research_participant_deliveries d
      JOIN target_study s ON s.id=d.study_id
      LEFT JOIN LATERAL (
        SELECT e.metadata,e.occurred_at
        FROM research_participant_delivery_events e
        WHERE e.delivery_id=d.id
          AND e.metadata->>'providerEventType'='DeliveryDelay'
        ORDER BY e.occurred_at DESC,e.id DESC
        LIMIT 1
      ) delay_event ON true
      WHERE d.status='sent'
        AND d.last_error LIKE 'SES delivery delay:%'
    )
    SELECT *
    FROM (
      SELECT * FROM invite_delays
      UNION ALL
      SELECT * FROM participant_delays
    ) delayed
    ORDER BY occurred_at DESC NULLS LAST,id
    LIMIT 25
  `, [slug]);
  return result.rows.map((row) => ({
    id: text(row.id),
    messageKind: text(row.message_kind),
    delayType: optionalText(row.delay_type),
    smtpStatus: optionalText(row.smtp_status),
    diagnosticCode: optionalText(row.diagnostic_code),
    expirationTime: optionalText(row.expiration_time),
    occurredAt: optionalText(row.occurred_at)
  }));
}

export async function researchSurveyAdminOverview(principal: SessionPrincipal) {
  assertAdminPermission(principal, "research.read");
  if (!productionDatabaseConfigured()) {
    return { databaseConfigured: false, studies: [] as const };
  }
  const rows = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT
      s.id, s.slug, s.title, s.status, s.pilot_started_at, s.pilot_ended_at,
      s.fieldwork_starts_at, s.fieldwork_ends_at, s.public_results_url,
      latest_i.version AS instrument_version, latest_i.status AS instrument_status,
      latest_ap.version AS analysis_plan_version,
      latest_ap.status AS analysis_plan_status,
      latest_ap.content_sha256 AS analysis_plan_sha256,
      latest_ap.locked_at AS analysis_plan_locked_at,
      latest_rt.version AS recruitment_template_version,
      latest_rt.subject AS recruitment_template_subject,
      latest_rrt.version AS reminder_template_version,
      latest_rrt.subject AS reminder_template_subject,
      COALESCE(f.frames, 0)::int AS frame_count,
      COALESCE(lf.population_size, 0)::int AS frame_population,
      GREATEST(
        COALESCE(lf.population_size,0)
        - CASE
            WHEN s.status IN ('fielding','closed','analysis','published','archived')
              THEN COALESCE(ph.exposed_units,0)
            ELSE 0
          END,
        0
      )::int AS phase_population,
      COALESCE(ph.exposed_units,0)::int AS pilot_holdout_units,
      COALESCE(lf.strata_count, 0)::int AS latest_frame_strata,
      lf.status AS latest_frame_status,
      lf.content_sha256 AS latest_frame_sha256,
      COALESCE(sd.draws, 0)::int AS sample_draw_count,
      COALESCE(ls.sample_units, 0)::int AS sample_units,
      ls.status AS latest_sample_status,
      ls.fieldwork_phase AS latest_sample_phase,
      ls.target_n AS latest_sample_target,
      ls.sample_design_sha256 AS latest_sample_design_sha256,
      ls.desired_complete_n AS latest_sample_desired_completes,
      ls.expected_response_rate AS latest_sample_expected_response_rate,
      ls.contactability_rate AS latest_sample_contactability_rate,
      ls.expected_complete_n AS latest_sample_expected_completes,
      COALESCE(cp.active_contacts, 0)::int AS active_contacts,
      COALESCE(cp.suppressed_contacts, 0)::int AS suppressed_contacts,
      COALESCE(cp.bounced_contacts, 0)::int AS bounced_contacts,
      COALESCE(ib.batches, 0)::int AS invite_batches,
      COALESCE(i.invites, 0)::int AS invites,
      COALESCE(i.sent, 0)::int AS sent,
      COALESCE(i.delivered, 0)::int AS delivered,
      COALESCE(i.opened, 0)::int AS opened,
      COALESCE(im.initial_delayed, 0)::int AS invitation_delayed,
      COALESCE(im.reminder_sent, 0)::int AS reminder_sent,
      COALESCE(im.reminder_delayed, 0)::int AS reminder_delayed,
      COALESCE(im.reminder_failed, 0)::int AS reminder_failed,
      COALESCE(r.started, 0)::int AS started,
      COALESCE(r.completed, 0)::int AS completed,
      COALESCE(r.withdrawn, 0)::int AS withdrawn,
      COALESCE(q.review_count, 0)::int AS quality_review,
      COALESCE(q.exclude_count, 0)::int AS quality_exclude,
      COALESCE(rw.eligible_count, 0)::int AS reward_eligible,
      COALESCE(rw.issued_count, 0)::int AS reward_issued,
      COALESCE(rw.redeemed_count, 0)::int AS reward_redeemed,
      COALESCE(pd.reward_sent, 0)::int AS reward_delivery_sent,
      COALESCE(pd.reward_delayed, 0)::int AS reward_delivery_delayed,
      COALESCE(pd.reward_failed, 0)::int AS reward_delivery_failed,
      COALESCE(pd.results_sent, 0)::int AS results_notification_sent,
      COALESCE(pd.results_delayed, 0)::int AS results_notification_delayed,
      COALESCE(pd.results_failed, 0)::int AS results_notification_failed,
      COALESCE(a.analysis_runs, 0)::int AS analysis_runs,
      COALESCE(a.succeeded_runs, 0)::int AS succeeded_analysis_runs,
      COALESCE(a.estimates, 0)::int AS analysis_estimates,
      COALESCE(rel.releases, 0)::int AS releases,
      rel.latest_release_version,
      rel.latest_release_published_at
    FROM research_studies s
    LEFT JOIN LATERAL (
      SELECT id, version, status FROM research_instruments
      WHERE study_id = s.id ORDER BY created_at DESC LIMIT 1
    ) latest_i ON true
    LEFT JOIN LATERAL (
      SELECT version, status, content_sha256, locked_at
      FROM research_analysis_plans
      WHERE study_id=s.id AND instrument_id=latest_i.id
      ORDER BY created_at DESC
      LIMIT 1
    ) latest_ap ON true
    LEFT JOIN LATERAL (
      SELECT version, subject
      FROM research_recruitment_templates
      WHERE study_id = s.id
        AND channel='email'
        AND status='locked'
        AND purpose='research_invitation'
      ORDER BY locked_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    ) latest_rt ON true
    LEFT JOIN LATERAL (
      SELECT version, subject
      FROM research_recruitment_templates
      WHERE study_id = s.id
        AND channel='email'
        AND status='locked'
        AND purpose='research_reminder'
      ORDER BY locked_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    ) latest_rrt ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS frames
      FROM research_frame_snapshots WHERE study_id = s.id
    ) f ON true
    LEFT JOIN LATERAL (
      SELECT
        fs.id,
        fs.status,
        fs.content_sha256,
        fs.population_size,
        (SELECT count(*)::int FROM research_strata st WHERE st.frame_snapshot_id=fs.id) AS strata_count
      FROM research_frame_snapshots fs
      WHERE fs.study_id = s.id
      ORDER BY fs.created_at DESC
      LIMIT 1
    ) lf ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS exposed_units
      FROM research_frame_units fu
      WHERE fu.frame_snapshot_id=lf.id
        AND EXISTS (
          SELECT 1
          FROM research_invites pri
          JOIN research_sample_units psu ON psu.id=pri.sample_unit_id
          JOIN research_frame_units pfu ON pfu.id=psu.frame_unit_id
          WHERE pri.study_id=s.id
            AND pri.fieldwork_phase='pilot'
            AND pri.sent_at IS NOT NULL
            AND pfu.external_key_hash=fu.external_key_hash
        )
    ) ph ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS draws
      FROM research_sample_draws d
      WHERE d.study_id = s.id
    ) sd ON true
    LEFT JOIN LATERAL (
      SELECT
        d.id,
        d.status,
        d.fieldwork_phase,
        d.target_n,
        rsd.content_sha256 AS sample_design_sha256,
        rsd.desired_complete_n,
        rsd.expected_response_rate,
        rsd.contactability_rate,
        rsd.expected_complete_n,
        (SELECT count(*)::int FROM research_sample_units u WHERE u.sample_draw_id=d.id) AS sample_units
      FROM research_sample_draws d
      LEFT JOIN research_sample_designs rsd ON rsd.sample_draw_id=d.id
      WHERE d.study_id = s.id
        AND d.fieldwork_phase=CASE WHEN s.status IN ('draft','pilot') THEN 'pilot' ELSE 'main' END
      ORDER BY d.created_at DESC
      LIMIT 1
    ) ls ON true
    LEFT JOIN LATERAL (
      SELECT
        count(DISTINCT fu.id) FILTER (
          WHERE cp.contact_type='email'
            AND cp.suppression_status='active'
            AND NOT public.research_contact_is_suppressed(cp.contact_type,cp.contact_value_hash)
        ) AS active_contacts,
        count(DISTINCT fu.id) FILTER (
          WHERE cp.contact_type='email'
            AND cp.suppression_status IN ('suppressed','invalid')
        ) AS suppressed_contacts,
        count(DISTINCT fu.id) FILTER (
          WHERE cp.contact_type='email'
            AND cp.suppression_status='bounced'
        ) AS bounced_contacts
      FROM research_frame_units fu
      JOIN research_contact_points cp ON cp.frame_unit_id = fu.id
      WHERE fu.frame_snapshot_id = lf.id
        AND (
          s.status IN ('draft','pilot')
          OR NOT EXISTS (
            SELECT 1
            FROM research_invites pri
            JOIN research_sample_units psu ON psu.id=pri.sample_unit_id
            JOIN research_frame_units pfu ON pfu.id=psu.frame_unit_id
            WHERE pri.study_id=s.id
              AND pri.fieldwork_phase='pilot'
              AND pri.sent_at IS NOT NULL
              AND pfu.external_key_hash=fu.external_key_hash
          )
        )
    ) cp ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS batches
      FROM research_invite_batches
      WHERE study_id = s.id
        AND fieldwork_phase=CASE WHEN s.status IN ('draft','pilot') THEN 'pilot' ELSE 'main' END
    ) ib ON true
    LEFT JOIN LATERAL (
      SELECT
        count(*) AS invites,
        count(*) FILTER (WHERE sent_at IS NOT NULL) AS sent,
        (
          SELECT count(DISTINCT ie.invite_id)
          FROM research_invite_events ie
          JOIN research_invites event_invite ON event_invite.id=ie.invite_id
          WHERE event_invite.study_id=s.id
            AND event_invite.fieldwork_phase=CASE WHEN s.status IN ('draft','pilot') THEN 'pilot' ELSE 'main' END
            AND ie.event_type='delivered'
        ) AS delivered,
        (
          SELECT count(DISTINCT ie.invite_id)
          FROM research_invite_events ie
          JOIN research_invites event_invite ON event_invite.id=ie.invite_id
          WHERE event_invite.study_id=s.id
            AND event_invite.fieldwork_phase=CASE WHEN s.status IN ('draft','pilot') THEN 'pilot' ELSE 'main' END
            AND ie.event_type='opened'
        ) AS opened
      FROM research_invites
      WHERE study_id = s.id
        AND fieldwork_phase=CASE WHEN s.status IN ('draft','pilot') THEN 'pilot' ELSE 'main' END
    ) i ON true
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (
          WHERE m.attempt_kind='initial'
            AND m.status='sent'
            AND m.last_error LIKE 'SES delivery delay:%'
        ) AS initial_delayed,
        count(*) FILTER (
          WHERE m.attempt_kind='reminder'
            AND m.status IN ('sent','delivered','opened')
        ) AS reminder_sent,
        count(*) FILTER (
          WHERE m.attempt_kind='reminder'
            AND m.status='sent'
            AND m.last_error LIKE 'SES delivery delay:%'
        ) AS reminder_delayed,
        count(*) FILTER (
          WHERE m.attempt_kind='reminder'
            AND m.status='failed'
        ) AS reminder_failed
      FROM research_invite_messages m
      JOIN research_invites ri ON ri.id=m.invite_id
      WHERE ri.study_id=s.id
        AND ri.fieldwork_phase=CASE WHEN s.status IN ('draft','pilot') THEN 'pilot' ELSE 'main' END
    ) im ON true
    LEFT JOIN LATERAL (
      SELECT
        count(*) AS started,
        count(*) FILTER (WHERE rr.status = 'completed') AS completed,
        count(*) FILTER (WHERE rr.status = 'withdrawn') AS withdrawn
      FROM research_responses rr
      JOIN research_invites ri ON ri.id=rr.invite_id
      WHERE rr.study_id = s.id
        AND ri.fieldwork_phase=CASE WHEN s.status IN ('draft','pilot') THEN 'pilot' ELSE 'main' END
    ) r ON true
    LEFT JOIN LATERAL (
      WITH latest AS (
        SELECT DISTINCT ON (qr.response_id)
          qr.response_id,
          qr.decision
        FROM research_response_quality_reviews qr
        JOIN research_responses rr ON rr.id = qr.response_id
        JOIN research_invites ri ON ri.id=rr.invite_id
        WHERE rr.study_id = s.id
          AND ri.fieldwork_phase=CASE WHEN s.status IN ('draft','pilot') THEN 'pilot' ELSE 'main' END
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
        count(*) FILTER (WHERE message_kind='thank_you_code' AND status='sent') AS reward_sent,
        count(*) FILTER (
          WHERE message_kind='thank_you_code'
            AND status='sent'
            AND last_error LIKE 'SES delivery delay:%'
        ) AS reward_delayed,
        count(*) FILTER (WHERE message_kind='thank_you_code' AND status='failed') AS reward_failed,
        count(*) FILTER (WHERE message_kind='results_notification' AND status='sent') AS results_sent,
        count(*) FILTER (
          WHERE message_kind='results_notification'
            AND status='sent'
            AND last_error LIKE 'SES delivery delay:%'
        ) AS results_delayed,
        count(*) FILTER (WHERE message_kind='results_notification' AND status='failed') AS results_failed
      FROM research_participant_deliveries
      WHERE study_id=s.id
    ) pd ON true
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
      activeFieldworkPhase: ["draft","pilot"].includes(text(row.status)) ? "pilot" : "main",
      pilotStartedAt: optionalText(row.pilot_started_at),
      pilotEndedAt: optionalText(row.pilot_ended_at),
      fieldworkStartsAt: optionalText(row.fieldwork_starts_at),
      fieldworkEndsAt: optionalText(row.fieldwork_ends_at),
      publicResultsUrl: optionalText(row.public_results_url),
      instrumentVersion: optionalText(row.instrument_version),
      instrumentStatus: optionalText(row.instrument_status),
      analysisPlanVersion: optionalText(row.analysis_plan_version),
      analysisPlanStatus: optionalText(row.analysis_plan_status),
      analysisPlanSha256: optionalText(row.analysis_plan_sha256),
      analysisPlanLockedAt: optionalText(row.analysis_plan_locked_at),
      recruitmentTemplateVersion: optionalText(row.recruitment_template_version),
      recruitmentTemplateSubject: optionalText(row.recruitment_template_subject),
      reminderTemplateVersion: optionalText(row.reminder_template_version),
      reminderTemplateSubject: optionalText(row.reminder_template_subject),
      frameCount: numberValue(row.frame_count),
      framePopulation: numberValue(row.frame_population),
      phasePopulation: numberValue(row.phase_population),
      pilotHoldoutUnits: numberValue(row.pilot_holdout_units),
      latestFrameStrata: numberValue(row.latest_frame_strata),
      latestFrameStatus: optionalText(row.latest_frame_status),
      latestFrameSha256: optionalText(row.latest_frame_sha256),
      sampleDrawCount: numberValue(row.sample_draw_count),
      sampleUnits: numberValue(row.sample_units),
      latestSampleStatus: optionalText(row.latest_sample_status),
      latestSamplePhase: optionalText(row.latest_sample_phase),
      latestSampleTarget: numberValue(row.latest_sample_target),
      latestSampleDesignSha256: optionalText(row.latest_sample_design_sha256),
      latestSampleDesiredCompletes: numberValue(row.latest_sample_desired_completes),
      latestSampleExpectedResponseRate: numberValue(row.latest_sample_expected_response_rate),
      latestSampleContactabilityRate: numberValue(row.latest_sample_contactability_rate),
      latestSampleExpectedCompletes: numberValue(row.latest_sample_expected_completes),
      activeContacts: numberValue(row.active_contacts),
      suppressedContacts: numberValue(row.suppressed_contacts),
      bouncedContacts: numberValue(row.bounced_contacts),
      inviteBatches: numberValue(row.invite_batches),
      invites: numberValue(row.invites),
      sent: numberValue(row.sent),
      delivered: numberValue(row.delivered),
      opened: numberValue(row.opened),
      invitationDelayed: numberValue(row.invitation_delayed),
      reminderSent: numberValue(row.reminder_sent),
      reminderDelayed: numberValue(row.reminder_delayed),
      reminderFailed: numberValue(row.reminder_failed),
      started: numberValue(row.started),
      completed: numberValue(row.completed),
      withdrawn: numberValue(row.withdrawn),
      qualityReview: numberValue(row.quality_review),
      qualityExclude: numberValue(row.quality_exclude),
      rewardEligible: numberValue(row.reward_eligible),
      rewardIssued: numberValue(row.reward_issued),
      rewardRedeemed: numberValue(row.reward_redeemed),
      rewardDeliverySent: numberValue(row.reward_delivery_sent),
      rewardDeliveryDelayed: numberValue(row.reward_delivery_delayed),
      rewardDeliveryFailed: numberValue(row.reward_delivery_failed),
      resultsNotificationSent: numberValue(row.results_notification_sent),
      resultsNotificationDelayed: numberValue(row.results_notification_delayed),
      resultsNotificationFailed: numberValue(row.results_notification_failed),
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
  if (input.action === "lock_instrument") {
    assertAdminPermission(principal, "research.design.manage");
  } else if (["start_pilot","start_fielding","close_fieldwork"].includes(input.action)) {
    assertAdminPermission(principal, "research.fieldwork.manage");
  } else if (input.action === "begin_analysis") {
    assertAdminPermission(principal, "research.analysis.manage");
  } else {
    assertAdminPermission(principal, "research.publish.manage");
  }
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const client = await getProductionPostgresRuntime().sqlPool.connect();
  try {
    await client.query("BEGIN");
    const rowResult = await client.query<SqlRow>(`
      SELECT
        s.id AS study_id, s.status AS study_status, s.current_wave_id AS wave_id,
        i.id AS instrument_id, i.status AS instrument_status
      FROM research_studies s
      JOIN LATERAL (
        SELECT id, status FROM research_instruments
        WHERE study_id = s.id AND wave_id = s.current_wave_id
        ORDER BY created_at DESC LIMIT 1
      ) i ON true
      WHERE s.slug = $1
      FOR UPDATE OF s
    `, [input.slug]);
    const row = rowResult.rows[0];
    if (!row) throw new Error("RESEARCH_STUDY_NOT_FOUND");
    if (!text(row.wave_id)) throw new Error("RESEARCH_CURRENT_WAVE_MISSING");

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
      const planReady = await client.query<SqlRow>(`
        SELECT EXISTS(
          SELECT 1
          FROM research_analysis_plans
          WHERE study_id=$1 AND wave_id=$2 AND instrument_id=$3 AND status='locked'
        ) AS locked_analysis_plan
      `, [row.study_id, row.wave_id, row.instrument_id]);
      if (!Boolean(planReady.rows[0]?.locked_analysis_plan)) {
        throw new Error("RESEARCH_PILOT_REQUIRES_LOCKED_ANALYSIS_PLAN");
      }
      await client.query(`
        UPDATE research_studies
        SET status = 'pilot',
            pilot_started_at = COALESCE(pilot_started_at, now()),
            updated_at = now()
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
          EXISTS(
            SELECT 1 FROM research_frame_snapshots
            WHERE study_id=$1 AND wave_id=$2 AND status='frozen'
          ) AS frozen_frame,
          EXISTS(
            SELECT 1 FROM research_analysis_plans
            WHERE study_id=$1 AND wave_id=$2 AND instrument_id=$3 AND status='locked'
          ) AS locked_analysis_plan
      `, [row.study_id, row.wave_id, row.instrument_id]);
      if (!Boolean(readiness.rows[0]?.frozen_frame)) {
        throw new Error("RESEARCH_FIELDING_REQUIRES_FROZEN_FRAME");
      }
      if (!Boolean(readiness.rows[0]?.locked_analysis_plan)) {
        throw new Error("RESEARCH_FIELDING_REQUIRES_LOCKED_ANALYSIS_PLAN");
      }

      if (studyStatus === "pilot") {
        await client.query(`
          UPDATE research_study_jobs
          SET
            status='cancelled',
            finished_at=COALESCE(finished_at,now()),
            error_message=COALESCE(error_message,'cancelled_by_pilot_closeout')
          WHERE study_id=$1
            AND wave_id=$2
            AND job_type IN ('sample_draw','invite_batch','invite_reminder')
            AND status='queued'
            AND COALESCE(input->>'fieldworkPhase','pilot')='pilot'
        `, [row.study_id, row.wave_id]);
        const runningPilotJobs = await client.query<SqlRow>(`
          SELECT count(*)::int AS count
          FROM research_study_jobs
          WHERE study_id=$1
            AND wave_id=$2
            AND job_type IN ('sample_draw','invite_batch','invite_reminder')
            AND status='running'
            AND COALESCE(input->>'fieldworkPhase','pilot')='pilot'
        `, [row.study_id, row.wave_id]);
        if (numberValue(runningPilotJobs.rows[0]?.count) > 0) {
          throw new Error("RESEARCH_PILOT_CLOSE_CONTACT_JOB_RUNNING");
        }
        await client.query(`
          WITH expired AS (
            UPDATE research_invites
            SET status='expired'
            WHERE study_id=$1
              AND wave_id=$2
              AND fieldwork_phase='pilot'
              AND status IN ('created','sent','opened','started')
            RETURNING id
          )
          INSERT INTO research_invite_events (invite_id,event_type,metadata)
          SELECT
            id,
            'expired',
            '{"source":"pilot_closeout","reason":"main_fieldwork_started"}'::jsonb
          FROM expired
        `, [row.study_id, row.wave_id]);
      }

      await client.query(`
        UPDATE research_studies
        SET status = 'fielding',
            pilot_ended_at = CASE
              WHEN $2::text='pilot' THEN COALESCE(pilot_ended_at, now())
              ELSE pilot_ended_at
            END,
            fieldwork_starts_at = COALESCE(fieldwork_starts_at, now()),
            updated_at = now()
        WHERE id = $1
      `, [row.study_id, studyStatus]);
      await client.query("UPDATE research_instruments SET status = 'fielding' WHERE id = $1", [row.instrument_id]);
      studyStatus = "fielding";
      instrumentStatus = "fielding";
    } else if (input.action === "close_fieldwork") {
      if (studyStatus !== "fielding") throw new Error("RESEARCH_LIFECYCLE_INVALID");

      const mainSampleReady = await client.query<SqlRow>(`
        SELECT EXISTS(
          SELECT 1
          FROM research_sample_draws
          WHERE study_id=$1
            AND wave_id=$2
            AND fieldwork_phase='main'
            AND status IN ('locked','fielded')
        ) AS ready
      `, [row.study_id, row.wave_id]);
      if (!Boolean(mainSampleReady.rows[0]?.ready)) {
        throw new Error("RESEARCH_FIELDWORK_CLOSE_REQUIRES_MAIN_SAMPLE");
      }

      // Prevent the fieldwork end timestamp from racing with an invitation or
      // reminder sender. Queued contact jobs are cancelled transactionally. If
      // a worker already claimed one, keep the study open until that worker has
      // finished so the frozen closeout cannot claim that sending had ended.
      await client.query(`
        UPDATE research_study_jobs
        SET
          status='cancelled',
          finished_at=COALESCE(finished_at,now()),
          error_message=COALESCE(error_message,'cancelled_by_fieldwork_closeout')
        WHERE study_id=$1
          AND wave_id=$2
          AND job_type IN ('sample_draw','invite_batch','invite_reminder')
          AND status='queued'
          AND COALESCE(input->>'fieldworkPhase','main')='main'
      `, [row.study_id, row.wave_id]);
      const runningContactJobs = await client.query<SqlRow>(`
        SELECT count(*)::int AS count
        FROM research_study_jobs
        WHERE study_id=$1
          AND wave_id=$2
          AND job_type IN ('sample_draw','invite_batch','invite_reminder')
          AND status='running'
          AND COALESCE(input->>'fieldworkPhase','main')='main'
      `, [row.study_id, row.wave_id]);
      if (numberValue(runningContactJobs.rows[0]?.count) > 0) {
        throw new Error("RESEARCH_FIELDWORK_CLOSE_CONTACT_JOB_RUNNING");
      }

      // Seal the selected sample's latest disposition before fieldwork becomes
      // immutable. Started-but-unfinished responses become partial interviews;
      // every other still-open case is conservatively retained as unknown
      // eligibility instead of being silently treated as a refusal or eligible
      // nonresponse.
      await client.query(`
        WITH active_draw AS (
          SELECT id
          FROM research_sample_draws
          WHERE study_id=$1
            AND wave_id=$2
            AND fieldwork_phase='main'
            AND status IN ('locked','fielded')
          ORDER BY drawn_at DESC NULLS LAST,created_at DESC
          LIMIT 1
        ),
        latest AS (
          SELECT DISTINCT ON (e.sample_unit_id)
            e.sample_unit_id,
            e.disposition_code
          FROM research_sample_disposition_events e
          JOIN research_sample_units su ON su.id=e.sample_unit_id
          WHERE su.sample_draw_id=(SELECT id FROM active_draw)
          ORDER BY e.sample_unit_id,e.occurred_at DESC,e.id DESC
        ),
        response_state AS (
          SELECT
            su.id AS sample_unit_id,
            latest.disposition_code AS previous_disposition,
            rr.status AS response_status
          FROM research_sample_units su
          LEFT JOIN latest ON latest.sample_unit_id=su.id
          LEFT JOIN research_invites ri
            ON ri.sample_unit_id=su.id
           AND ri.study_id=$1
           AND ri.wave_id=$2
           AND ri.fieldwork_phase='main'
          LEFT JOIN research_responses rr ON rr.invite_id=ri.id
          WHERE su.sample_draw_id=(SELECT id FROM active_draw)
        )
        INSERT INTO research_sample_disposition_events (
          sample_unit_id,disposition_code,eligibility,source,metadata
        )
        SELECT
          sample_unit_id,
          CASE WHEN response_status='in_progress' THEN 'partial' ELSE 'unknown_eligibility' END,
          CASE WHEN response_status='in_progress' THEN 'eligible' ELSE 'unknown' END,
          'fieldwork_closeout',
          jsonb_build_object(
            'previousDisposition',COALESCE(previous_disposition,'missing'),
            'closeoutVersion','greek-retail-2026-fieldwork-closeout-v1'
          )
        FROM response_state
        WHERE previous_disposition IS NULL
           OR previous_disposition IN ('selected','contact_pending','invited','delivered','opened','started')
      `, [row.study_id, row.wave_id]);

      await client.query(`
        WITH expired AS (
          UPDATE research_invites
          SET status='expired'
          WHERE study_id=$1
            AND wave_id=$2
            AND fieldwork_phase='main'
            AND status IN ('created','sent','opened','started')
          RETURNING id
        )
        INSERT INTO research_invite_events (invite_id,event_type,metadata)
        SELECT
          id,
          'expired',
          '{"source":"fieldwork_closeout","closeoutVersion":"greek-retail-2026-fieldwork-closeout-v1"}'::jsonb
        FROM expired
      `, [row.study_id, row.wave_id]);

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
          AND rs.wave_id=$2
        ORDER BY rs.created_at DESC
        LIMIT 1
        FOR UPDATE OF rs
      `, [row.study_id, row.wave_id]);
      const release = releaseResult.rows[0];
      if (!release || !text(release.artifact_sha256)) throw new Error("RESEARCH_RELEASE_NOT_READY");
      if (text(release.analysis_status) !== "succeeded") throw new Error("RESEARCH_RELEASE_ANALYSIS_NOT_SUCCEEDED");
      if (text(release.dataset_sha256) !== text(release.analysis_dataset_sha256)) {
        throw new Error("RESEARCH_RELEASE_DATASET_HASH_MISMATCH");
      }
      const artifactIntegrity = await researchReleaseArtifactIntegrity(client, text(release.id));
      if (!artifactIntegrity || !artifactIntegrity.integrityOk) {
        throw new Error("RESEARCH_RELEASE_ARTIFACT_HASH_MISMATCH");
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
      await client.query(`
        INSERT INTO research_study_jobs (study_id,wave_id,job_type,status,input)
        SELECT
          $1,$2,'results_notification','queued',
          jsonb_build_object(
            'releaseSnapshotId',$3::text,
            'limit',100,
            'source','release_publication'
          )
        WHERE NOT EXISTS (
          SELECT 1
          FROM research_study_jobs j
          WHERE j.study_id=$1
            AND j.wave_id=$2
            AND j.job_type='results_notification'
            AND j.input->>'releaseSnapshotId'=$3::text
            AND j.status IN ('queued','running','succeeded')
        )
      `, [row.study_id, row.wave_id, release.id]);
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
