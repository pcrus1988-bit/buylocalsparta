import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, hasAdminPermission, recordAdminPersonalDataAccess } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function optionalText(value: unknown): string | undefined {
  const valueText = text(value).trim();
  return valueText || undefined;
}

function numberValue(value: unknown): number {
  const valueNumber = Number(value ?? 0);
  return Number.isFinite(valueNumber) ? valueNumber : 0;
}

function stringArray(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return [];
}

export type ResearchAdminTemplate = Readonly<{
  id: string;
  version: string;
  purpose: "research_invitation" | "research_reminder";
  status: string;
  subject: string;
  bodyText: string;
  createdAt: string;
  lockedAt?: string;
}>;

export type ResearchAdminContact = Readonly<{
  id: string;
  businessName: string;
  gemiReference: string;
  email?: string;
  emailHash: string;
  sourceKind: string;
  suppressionStatus: string;
  prefecture?: string;
  municipality?: string;
  city?: string;
  sectorCode: string;
  kadCodes: readonly string[];
  selected: boolean;
  inviteStatus?: string;
  inviteSentAt?: string;
}>;

export type ResearchAdminKadRow = Readonly<{
  kadCode: string;
  sectorCode: string;
  businesses: number;
  contactable: number;
  selected: number;
  invited: number;
  completed: number;
}>;

export type ResearchAdminInvite = Readonly<{
  id: string;
  businessName: string;
  email?: string;
  fieldworkPhase: string;
  status: string;
  sentAt?: string;
  openedAt?: string;
  expiresAt?: string;
  latestAttemptKind?: string;
  latestAttemptStatus?: string;
  latestAttemptAt?: string;
}>;

export type ResearchAdminConsentSummary = Readonly<{
  consentKind: string;
  granted: number;
  declined: number;
  total: number;
}>;

export type ResearchAdminConsentEvent = Readonly<{
  id: string;
  consentKind: string;
  granted: boolean;
  statementVersion: string;
  occurredAt: string;
  responseStatus: string;
}>;

export type ResearchAdminOperationalWorkspace = Readonly<{
  databaseConfigured: boolean;
  canViewContactValues: boolean;
  templates: readonly ResearchAdminTemplate[];
  contacts: readonly ResearchAdminContact[];
  contactsTotal: number;
  kad: readonly ResearchAdminKadRow[];
  invites: readonly ResearchAdminInvite[];
  invitesTotal: number;
  consentSummary: readonly ResearchAdminConsentSummary[];
  recentConsentEvents: readonly ResearchAdminConsentEvent[];
}>;

const EMPTY_WORKSPACE: ResearchAdminOperationalWorkspace = {
  databaseConfigured: false,
  canViewContactValues: false,
  templates: [],
  contacts: [],
  contactsTotal: 0,
  kad: [],
  invites: [],
  invitesTotal: 0,
  consentSummary: [],
  recentConsentEvents: []
};

export async function researchAdminOperationalWorkspace(
  principal: SessionPrincipal,
  slug: string
): Promise<ResearchAdminOperationalWorkspace> {
  assertAdminPermission(principal, "research.read");
  if (!productionDatabaseConfigured()) return EMPTY_WORKSPACE;

  const canViewContactValues =
    hasAdminPermission(principal, "research.fieldwork.manage")
    || hasAdminPermission(principal, "research.privacy.manage");
  const pool = getProductionPostgresRuntime().sqlPool;

  const templateRows = await pool.query<SqlRow>(`
    SELECT rt.id,rt.version,rt.purpose,rt.status,rt.subject,rt.body_text,rt.created_at,rt.locked_at
    FROM research_recruitment_templates rt
    JOIN research_studies s ON s.id=rt.study_id
    WHERE s.slug=$1
      AND (rt.wave_id=s.current_wave_id OR rt.wave_id IS NULL)
    ORDER BY rt.purpose,rt.created_at DESC,rt.id DESC
    LIMIT 100
  `, [slug]);

  const contactQuery = canViewContactValues ? `
    WITH study AS (
      SELECT id,current_wave_id
      FROM research_studies
      WHERE slug=$1
      LIMIT 1
    ),
    latest_frame AS (
      SELECT fs.id
      FROM research_frame_snapshots fs
      JOIN study s ON s.id=fs.study_id
      WHERE fs.wave_id=s.current_wave_id
      ORDER BY fs.created_at DESC
      LIMIT 1
    )
    SELECT
      cp.id,
      COALESCE(NULLIF(fu.sampling_attributes->>'legalName',''),fu.source_record_ref,'—') AS business_name,
      COALESCE(fu.source_record_ref,'') AS gemi_reference,
      cpv.contact_value AS email,
      cp.contact_value_hash,
      cp.source_kind,
      cp.suppression_status,
      fu.sector_code,
      fu.sampling_attributes->>'prefecture' AS prefecture,
      fu.sampling_attributes->>'municipality' AS municipality,
      fu.sampling_attributes->>'city' AS city,
      COALESCE(fu.sampling_attributes->'matchedActivityCodes','[]'::jsonb) AS kad_codes,
      EXISTS (
        SELECT 1
        FROM research_sample_units su
        JOIN research_sample_draws sd ON sd.id=su.sample_draw_id
        JOIN study s ON s.id=sd.study_id
        WHERE su.frame_unit_id=fu.id
          AND sd.wave_id=s.current_wave_id
      ) AS selected,
      latest_invite.status AS invite_status,
      latest_invite.sent_at AS invite_sent_at
    FROM latest_frame lf
    JOIN research_frame_units fu ON fu.frame_snapshot_id=lf.id
    JOIN research_contact_points cp ON cp.frame_unit_id=fu.id AND cp.contact_type='email'
    LEFT JOIN research_private.contact_points_with_value cpv ON cpv.id=cp.id
    LEFT JOIN LATERAL (
      SELECT ri.status,ri.sent_at
      FROM research_invites ri
      JOIN research_sample_units su ON su.id=ri.sample_unit_id
      JOIN research_sample_draws sd ON sd.id=su.sample_draw_id
      JOIN study s ON s.id=ri.study_id
      WHERE su.frame_unit_id=fu.id
        AND ri.wave_id=s.current_wave_id
      ORDER BY ri.created_at DESC,ri.id DESC
      LIMIT 1
    ) latest_invite ON true
    ORDER BY business_name,cp.created_at
    LIMIT 200
  ` : `
    WITH study AS (
      SELECT id,current_wave_id
      FROM research_studies
      WHERE slug=$1
      LIMIT 1
    ),
    latest_frame AS (
      SELECT fs.id
      FROM research_frame_snapshots fs
      JOIN study s ON s.id=fs.study_id
      WHERE fs.wave_id=s.current_wave_id
      ORDER BY fs.created_at DESC
      LIMIT 1
    )
    SELECT
      cp.id,
      COALESCE(NULLIF(fu.sampling_attributes->>'legalName',''),fu.source_record_ref,'—') AS business_name,
      COALESCE(fu.source_record_ref,'') AS gemi_reference,
      NULL::text AS email,
      cp.contact_value_hash,
      cp.source_kind,
      cp.suppression_status,
      fu.sector_code,
      fu.sampling_attributes->>'prefecture' AS prefecture,
      fu.sampling_attributes->>'municipality' AS municipality,
      fu.sampling_attributes->>'city' AS city,
      COALESCE(fu.sampling_attributes->'matchedActivityCodes','[]'::jsonb) AS kad_codes,
      EXISTS (
        SELECT 1
        FROM research_sample_units su
        JOIN research_sample_draws sd ON sd.id=su.sample_draw_id
        JOIN study s ON s.id=sd.study_id
        WHERE su.frame_unit_id=fu.id
          AND sd.wave_id=s.current_wave_id
      ) AS selected,
      latest_invite.status AS invite_status,
      latest_invite.sent_at AS invite_sent_at
    FROM latest_frame lf
    JOIN research_frame_units fu ON fu.frame_snapshot_id=lf.id
    JOIN research_contact_points cp ON cp.frame_unit_id=fu.id AND cp.contact_type='email'
    LEFT JOIN LATERAL (
      SELECT ri.status,ri.sent_at
      FROM research_invites ri
      JOIN research_sample_units su ON su.id=ri.sample_unit_id
      JOIN research_sample_draws sd ON sd.id=su.sample_draw_id
      JOIN study s ON s.id=ri.study_id
      WHERE su.frame_unit_id=fu.id
        AND ri.wave_id=s.current_wave_id
      ORDER BY ri.created_at DESC,ri.id DESC
      LIMIT 1
    ) latest_invite ON true
    ORDER BY business_name,cp.created_at
    LIMIT 200
  `;

  const contactRows = await pool.query<SqlRow>(contactQuery, [slug]);
  if (canViewContactValues && contactRows.rows.length > 0) {
    await recordAdminPersonalDataAccess(principal, {
      route: "/admin/research/surveys",
      resourceType: "research_contact_directory",
      resourceId: slug,
      purpose: "research_fieldwork",
      dataClasses: ["email", "business_identity", "research_sampling_metadata"],
      recordCount: contactRows.rows.length,
      accessScope: "bulk"
    });
  }
  const contactsTotalResult = await pool.query<SqlRow>(`
    WITH study AS (
      SELECT id,current_wave_id FROM research_studies WHERE slug=$1 LIMIT 1
    ),
    latest_frame AS (
      SELECT fs.id
      FROM research_frame_snapshots fs
      JOIN study s ON s.id=fs.study_id
      WHERE fs.wave_id=s.current_wave_id
      ORDER BY fs.created_at DESC
      LIMIT 1
    )
    SELECT count(*)::int AS total
    FROM latest_frame lf
    JOIN research_frame_units fu ON fu.frame_snapshot_id=lf.id
    JOIN research_contact_points cp ON cp.frame_unit_id=fu.id AND cp.contact_type='email'
  `, [slug]);

  const kadRows = await pool.query<SqlRow>(`
    WITH study AS (
      SELECT id,current_wave_id
      FROM research_studies
      WHERE slug=$1
      LIMIT 1
    ),
    latest_frame AS (
      SELECT fs.id
      FROM research_frame_snapshots fs
      JOIN study s ON s.id=fs.study_id
      WHERE fs.wave_id=s.current_wave_id
      ORDER BY fs.created_at DESC
      LIMIT 1
    )
    SELECT
      codes.kad_code,
      fu.sector_code,
      count(DISTINCT fu.id)::int AS businesses,
      count(DISTINCT fu.id) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM research_contact_points cp
          WHERE cp.frame_unit_id=fu.id
            AND cp.contact_type='email'
            AND cp.suppression_status='active'
            AND NOT public.research_contact_is_suppressed(cp.contact_type,cp.contact_value_hash)
        )
      )::int AS contactable,
      count(DISTINCT fu.id) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM research_sample_units su
          JOIN research_sample_draws sd ON sd.id=su.sample_draw_id
          JOIN study s ON s.id=sd.study_id
          WHERE su.frame_unit_id=fu.id
            AND sd.wave_id=s.current_wave_id
        )
      )::int AS selected,
      count(DISTINCT fu.id) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM research_invites ri
          JOIN research_sample_units su ON su.id=ri.sample_unit_id
          JOIN study s ON s.id=ri.study_id
          WHERE su.frame_unit_id=fu.id
            AND ri.wave_id=s.current_wave_id
            AND ri.sent_at IS NOT NULL
        )
      )::int AS invited,
      count(DISTINCT fu.id) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM research_responses rr
          JOIN research_invites ri ON ri.id=rr.invite_id
          JOIN research_sample_units su ON su.id=ri.sample_unit_id
          JOIN study s ON s.id=rr.study_id
          WHERE su.frame_unit_id=fu.id
            AND ri.wave_id=s.current_wave_id
            AND rr.status='completed'
        )
      )::int AS completed
    FROM latest_frame lf
    JOIN research_frame_units fu ON fu.frame_snapshot_id=lf.id
    CROSS JOIN LATERAL jsonb_array_elements_text(
      COALESCE(fu.sampling_attributes->'matchedActivityCodes','[]'::jsonb)
    ) AS codes(kad_code)
    GROUP BY codes.kad_code,fu.sector_code
    ORDER BY businesses DESC,codes.kad_code
    LIMIT 250
  `, [slug]);

  const inviteEmailSelect = canViewContactValues ? "cpv.contact_value AS email," : "NULL::text AS email,";
  const inviteEmailJoin = canViewContactValues
    ? "LEFT JOIN research_private.contact_points_with_value cpv ON cpv.id=ri.contact_point_id"
    : "";

  const inviteRows = await pool.query<SqlRow>(`
    WITH study AS (
      SELECT id,current_wave_id
      FROM research_studies
      WHERE slug=$1
      LIMIT 1
    )
    SELECT
      ri.id,
      COALESCE(NULLIF(fu.sampling_attributes->>'legalName',''),fu.source_record_ref,'—') AS business_name,
      ${inviteEmailSelect}
      ri.fieldwork_phase,
      ri.status,
      ri.sent_at,
      ri.first_opened_at,
      ri.expires_at,
      latest_message.attempt_kind AS latest_attempt_kind,
      latest_message.status AS latest_attempt_status,
      COALESCE(latest_message.sent_at,latest_message.updated_at,latest_message.created_at) AS latest_attempt_at
    FROM research_invites ri
    JOIN study s ON s.id=ri.study_id
    LEFT JOIN research_sample_units su ON su.id=ri.sample_unit_id
    LEFT JOIN research_frame_units fu ON fu.id=su.frame_unit_id
    ${inviteEmailJoin}
    LEFT JOIN LATERAL (
      SELECT m.attempt_kind,m.status,m.sent_at,m.updated_at,m.created_at
      FROM research_invite_messages m
      WHERE m.invite_id=ri.id
      ORDER BY m.created_at DESC,m.id DESC
      LIMIT 1
    ) latest_message ON true
    WHERE ri.wave_id=s.current_wave_id
    ORDER BY ri.created_at DESC,ri.id DESC
    LIMIT 200
  `, [slug]);

  const invitesTotalResult = await pool.query<SqlRow>(`
    SELECT count(*)::int AS total
    FROM research_invites ri
    JOIN research_studies s ON s.id=ri.study_id
    WHERE s.slug=$1
      AND ri.wave_id=s.current_wave_id
  `, [slug]);

  const consentRows = await pool.query<SqlRow>(`
    WITH study AS (
      SELECT id,current_wave_id FROM research_studies WHERE slug=$1 LIMIT 1
    ),
    latest AS (
      SELECT DISTINCT ON (rc.response_id,rc.consent_kind)
        rc.response_id,rc.consent_kind,rc.granted
      FROM research_consents rc
      JOIN research_responses rr ON rr.id=rc.response_id
      JOIN research_invites ri ON ri.id=rr.invite_id
      JOIN study s ON s.id=rr.study_id
      WHERE ri.wave_id=s.current_wave_id
        AND rc.consent_kind IN ('research_participation','results_notification','thank_you_code')
      ORDER BY rc.response_id,rc.consent_kind,rc.occurred_at DESC,rc.id DESC
    )
    SELECT
      consent_kind,
      count(*) FILTER (WHERE granted)::int AS granted,
      count(*) FILTER (WHERE NOT granted)::int AS declined,
      count(*)::int AS total
    FROM latest
    GROUP BY consent_kind
    ORDER BY consent_kind
  `, [slug]);

  const recentConsentRows = await pool.query<SqlRow>(`
    WITH study AS (
      SELECT id,current_wave_id FROM research_studies WHERE slug=$1 LIMIT 1
    )
    SELECT
      rc.id,rc.consent_kind,rc.granted,rc.statement_version,rc.occurred_at,rr.status AS response_status
    FROM research_consents rc
    JOIN research_responses rr ON rr.id=rc.response_id
    JOIN research_invites ri ON ri.id=rr.invite_id
    JOIN study s ON s.id=rr.study_id
    WHERE ri.wave_id=s.current_wave_id
      AND rc.consent_kind IN ('research_participation','results_notification','thank_you_code')
    ORDER BY rc.occurred_at DESC,rc.id DESC
    LIMIT 100
  `, [slug]);

  return {
    databaseConfigured: true,
    canViewContactValues,
    templates: templateRows.rows.map((row) => ({
      id: text(row.id),
      version: text(row.version),
      purpose: text(row.purpose) as ResearchAdminTemplate["purpose"],
      status: text(row.status),
      subject: text(row.subject),
      bodyText: text(row.body_text),
      createdAt: new Date(row.created_at as string | Date).toISOString(),
      lockedAt: row.locked_at ? new Date(row.locked_at as string | Date).toISOString() : undefined
    })),
    contacts: contactRows.rows.map((row) => ({
      id: text(row.id),
      businessName: text(row.business_name),
      gemiReference: text(row.gemi_reference),
      email: optionalText(row.email),
      emailHash: text(row.contact_value_hash),
      sourceKind: text(row.source_kind),
      suppressionStatus: text(row.suppression_status),
      prefecture: optionalText(row.prefecture),
      municipality: optionalText(row.municipality),
      city: optionalText(row.city),
      sectorCode: text(row.sector_code),
      kadCodes: stringArray(row.kad_codes),
      selected: Boolean(row.selected),
      inviteStatus: optionalText(row.invite_status),
      inviteSentAt: row.invite_sent_at ? new Date(row.invite_sent_at as string | Date).toISOString() : undefined
    })),
    contactsTotal: numberValue(contactsTotalResult.rows[0]?.total),
    kad: kadRows.rows.map((row) => ({
      kadCode: text(row.kad_code),
      sectorCode: text(row.sector_code),
      businesses: numberValue(row.businesses),
      contactable: numberValue(row.contactable),
      selected: numberValue(row.selected),
      invited: numberValue(row.invited),
      completed: numberValue(row.completed)
    })),
    invites: inviteRows.rows.map((row) => ({
      id: text(row.id),
      businessName: text(row.business_name),
      email: optionalText(row.email),
      fieldworkPhase: text(row.fieldwork_phase),
      status: text(row.status),
      sentAt: row.sent_at ? new Date(row.sent_at as string | Date).toISOString() : undefined,
      openedAt: row.first_opened_at ? new Date(row.first_opened_at as string | Date).toISOString() : undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at as string | Date).toISOString() : undefined,
      latestAttemptKind: optionalText(row.latest_attempt_kind),
      latestAttemptStatus: optionalText(row.latest_attempt_status),
      latestAttemptAt: row.latest_attempt_at ? new Date(row.latest_attempt_at as string | Date).toISOString() : undefined
    })),
    invitesTotal: numberValue(invitesTotalResult.rows[0]?.total),
    consentSummary: consentRows.rows.map((row) => ({
      consentKind: text(row.consent_kind),
      granted: numberValue(row.granted),
      declined: numberValue(row.declined),
      total: numberValue(row.total)
    })),
    recentConsentEvents: recentConsentRows.rows.map((row) => ({
      id: text(row.id),
      consentKind: text(row.consent_kind),
      granted: Boolean(row.granted),
      statementVersion: text(row.statement_version),
      occurredAt: new Date(row.occurred_at as string | Date).toISOString(),
      responseStatus: text(row.response_status)
    }))
  };
}
