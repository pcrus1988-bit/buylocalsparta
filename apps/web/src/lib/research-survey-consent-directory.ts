import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, hasAdminPermission, recordAdminPersonalDataAccess } from "./admin-runtime";
import { getAdminPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

/**
 * Consent evidence is study-wide, including closed/published waves. This is
 * separate from the responses/analysis surface: show choices and identity only
 * to the administrator roles already permitted to read contact identities.
 *
 * Contact identity may legitimately be unavailable after a GDPR erasure or
 * the governed identity-destruction deadline. Never reconstruct it from hashes.
 */
const SLUG = /^[a-z0-9][a-z0-9-]{2,79}$/;
const CONSENT_KINDS = ["research_participation", "results_notification", "thank_you_code", "marketing"] as const;
const PAGE_SIZE = 25;
const MAX_BIGINT = 9223372036854775807n;

export type ConsentKind = "" | (typeof CONSENT_KINDS)[number];
export type ConsentDecision = "" | "yes" | "no";
export type ResearchConsentFilters = Readonly<{ kind?: string; decision?: string; cursor?: string }>;

export type ConsentEvidenceRow = Readonly<{
  id: string;
  kind: string;
  granted: boolean;
  occurredAt: string;
  lastOptInAt?: string;
  responseStatus: string;
  contactStatus?: string;
  email?: string;
  statementVersion: string;
  source: string;
}>;

export type ConsentKindSummary = Readonly<{ kind: string; granted: number; declined: number; total: number }>;

export type ResearchConsentDirectoryResult = Readonly<{
  kind: ConsentKind;
  decision: ConsentDecision;
  canViewEmail: boolean;
  summary: readonly ConsentKindSummary[];
  rows: readonly ConsentEvidenceRow[];
  nextCursor?: string;
}>;

function asString(value: unknown): string {
  return value == null ? "" : String(value);
}
function optional(value: unknown): string | undefined {
  return asString(value).trim() || undefined;
}
function isoDate(value: unknown): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(asString(value));
  return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
}
export function normalizeConsentKind(value?: string): ConsentKind {
  return CONSENT_KINDS.includes(value as (typeof CONSENT_KINDS)[number]) ? value as ConsentKind : "";
}
export function normalizeConsentDecision(value?: string): ConsentDecision {
  return value === "yes" || value === "no" ? value : "";
}
export function consentEvidenceCursor(date: string, eventId: string): string {
  return Buffer.from(date + "|" + eventId).toString("base64url");
}
function parseCursor(value?: string): { occurredAt: string; id: string } | undefined {
  if (!value || value.length > 160) return undefined;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const delimiter = decoded.lastIndexOf("|");
    if (delimiter < 1) return undefined;
    const timestamp = decoded.slice(0, delimiter);
    const id = decoded.slice(delimiter + 1);
    if (!/^\d{1,19}$/.test(id) || BigInt(id) > MAX_BIGINT) return undefined;
    const occurredAt = isoDate(timestamp);
    return occurredAt ? { occurredAt, id } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The latest recorded decision for each (participant response, consent kind).
 * Filtering on granted happens AFTER selecting the latest event, so withdrawn
 * permissions never leak into the affirmative filter.
 */
const LATEST_CONSENT = [
  "WITH latest AS MATERIALIZED (",
  " SELECT DISTINCT ON (rc.response_id,rc.consent_kind)",
  " rc.id,rc.response_id,rc.consent_kind,rc.granted,rc.occurred_at,",
  " rc.statement_version,rc.source,rr.status AS response_status,ri.contact_point_id",
  " FROM research_consents rc",
  " JOIN research_responses rr ON rr.id=rc.response_id",
  " JOIN research_invites ri ON ri.id=rr.invite_id",
  " WHERE rr.study_id=$1",
  " AND ($2::text IS NULL OR rc.consent_kind=$2)",
  " ORDER BY rc.response_id,rc.consent_kind,rc.occurred_at DESC,rc.id DESC",
  ")"
].join("\n");

export async function researchSurveyConsentDirectory(
  principal: SessionPrincipal, slug: string, input: ResearchConsentFilters = {}
): Promise<ResearchConsentDirectoryResult | undefined> {
  assertAdminPermission(principal, "research.read");
  if (!productionDatabaseConfigured() || !SLUG.test(slug)) return undefined;

  const kind = normalizeConsentKind(input.kind);
  const decision = normalizeConsentDecision(input.decision);
  const cursor = parseCursor(input.cursor);
  const canViewEmail =
    hasAdminPermission(principal, "research.privacy.manage") ||
    hasAdminPermission(principal, "research.fieldwork.manage") ||
    hasAdminPermission(principal, "research.manage");

  const pool = getAdminPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>(
    "SELECT id FROM research_studies WHERE slug=$1 LIMIT 1", [slug]
  );
  if (!study.rows[0]) return undefined;
  const studyId = study.rows[0].id;

  // Counts are across *all* study waves, not just the current fieldwork wave.
  const counts = await pool.query<SqlRow>([
    LATEST_CONSENT,
    "SELECT consent_kind,",
    "count(*) FILTER (WHERE granted)::int AS granted,",
    "count(*) FILTER (WHERE NOT granted)::int AS declined,",
    "count(*)::int AS total",
    "FROM latest GROUP BY consent_kind ORDER BY consent_kind"
  ].join("\n"), [studyId, null]);

  // First page a bounded set of consent IDs; only then may the privileged
  // identity vault be joined. This prevents an unbounded private-PII scan.
  const privateJoin = canViewEmail
    ? "LEFT JOIN research_private.contact_vault pv ON pv.contact_point_id=page.contact_point_id"
    : "";
  const privateSelect = canViewEmail ? "pv.contact_value AS email" : "NULL::text AS email";
  const result = await pool.query<SqlRow>([
    LATEST_CONSENT + ",",
    "page AS MATERIALIZED (",
    " SELECT * FROM latest",
    " WHERE ($3::boolean IS NULL OR granted=$3)",
    " AND ($4::timestamptz IS NULL OR (occurred_at,id)<($4::timestamptz,$5::bigint))",
    " ORDER BY occurred_at DESC,id DESC LIMIT 26",
    ")",
    "SELECT page.*,cp.suppression_status AS contact_status,",
    privateSelect + ",",
    " (SELECT prior.occurred_at FROM research_consents prior",
    "  WHERE prior.response_id=page.response_id",
    "  AND prior.consent_kind=page.consent_kind AND prior.granted=true",
    "  ORDER BY prior.occurred_at DESC,prior.id DESC LIMIT 1) AS last_opt_in_at",
    "FROM page",
    "LEFT JOIN research_contact_points cp ON cp.id=page.contact_point_id",
    privateJoin,
    "ORDER BY page.occurred_at DESC,page.id DESC"
  ].filter(Boolean).join("\n"), [
    studyId, kind || null, decision === "" ? null : decision === "yes",
    cursor?.occurredAt ?? null, cursor?.id ?? null
  ]);

  const page = result.rows.slice(0, PAGE_SIZE);
  // Access to actual contact values is permission-gated and audit-logged.
  if (canViewEmail && page.some(row => Boolean(optional(row.email)))) {
    await recordAdminPersonalDataAccess(principal, {
      route: "/admin/research/surveys/" + encodeURIComponent(slug) + "/consent",
      resourceType: "research_consent_identity_list",
      resourceId: slug,
      purpose: "privacy_operations",
      dataClasses: ["research_contact_email", "research_consent_choice", "research_consent_timestamp"],
      recordCount: page.filter(row => Boolean(optional(row.email))).length,
      accessScope: "bulk"
    });
  }

  const mapped = page.map((row): ConsentEvidenceRow => ({
    id: asString(row.id),
    kind: asString(row.consent_kind),
    granted: row.granted === true,
    occurredAt: isoDate(row.occurred_at) ?? "",
    lastOptInAt: isoDate(row.last_opt_in_at),
    responseStatus: asString(row.response_status),
    contactStatus: optional(row.contact_status),
    email: canViewEmail ? optional(row.email) : undefined,
    statementVersion: asString(row.statement_version),
    source: asString(row.source)
  }));
  const last = mapped[mapped.length - 1];
  return {
    kind, decision, canViewEmail,
    summary: counts.rows.map(row => ({
      kind: asString(row.consent_kind),
      granted: Number(row.granted ?? 0),
      declined: Number(row.declined ?? 0),
      total: Number(row.total ?? 0)
    })),
    rows: mapped,
    nextCursor: result.rows.length > PAGE_SIZE && last?.occurredAt
      ? consentEvidenceCursor(last.occurredAt, last.id) : undefined
  };
}
