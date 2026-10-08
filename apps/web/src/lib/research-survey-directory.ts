import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, hasAdminPermission, recordAdminPersonalDataAccess } from "./admin-runtime";
import { getAdminPostgresRuntime } from "./postgres-runtime";

/** A bounded, explicitly-requested search. No directory rows or row counts are read on navigation. */
export type ResearchDirectoryKind = "contacts" | "invitations";
export type ResearchDirectoryOptions = Readonly<{ search?: boolean; q?: string; status?: string; cursor?: string }>;
export type ResearchDirectoryRow = Readonly<{
  id: string;
  email?: string;
  status: string;
  legalName?: string;
  municipality?: string;
  prefecture?: string;
  sector?: string;
  source?: string;
  inviteStatus?: string;
  createdAt?: string;
  sentAt?: string;
  expiresAt?: string;
  responseStatus?: string;
}>;
export type ResearchDirectoryResult = Readonly<{
  requested: boolean;
  q: string;
  status: string;
  canViewEmail: boolean;
  rows: readonly ResearchDirectoryRow[];
  nextCursor?: string;
}>;

function string(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function optional(value: unknown): string | undefined { return string(value).trim() || undefined; }
const CONTACT_STATUSES = new Set(["active","suppressed","bounced","invalid"]);
const INVITE_STATUSES = new Set(["created","sent","opened","started","completed","expired","suppressed"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 25;

export async function researchDirectorySearch(
  principal: SessionPrincipal,
  slug: string,
  kind: ResearchDirectoryKind,
  options: ResearchDirectoryOptions
): Promise<ResearchDirectoryResult> {
  assertAdminPermission(principal, "research.read");
  const canViewEmail = hasAdminPermission(principal, "research.privacy.manage")
    || hasAdminPermission(principal, "research.fieldwork.manage")
    || hasAdminPermission(principal, "research.manage");
  const q = (options.q ?? "").trim().slice(0, 120);
  const statuses = kind === "contacts" ? CONTACT_STATUSES : INVITE_STATUSES;
  const status = statuses.has(options.status ?? "") ? options.status! : "";
  const requested = options.search === true;
  const blank = { requested, q, status, canViewEmail, rows: [] as readonly ResearchDirectoryRow[] };
  if (!requested) return blank;

  // A search is only ever issued from this section's submitted GET form.
  // Reject overly broad wildcard input; do not interpolate user input into SQL.
  const pattern = q ? "%" + q.replace(/[\\%_]/g, "\\$&") + "%" : null;
  const cursor = UUID.test(options.cursor ?? "") ? options.cursor! : null;
  const pool = getAdminPostgresRuntime().sqlPool;

  const rows = kind === "contacts"
    ? await pool.query<SqlRow>([
      "SELECT cp.id, " + (canViewEmail ? "cp.contact_value" : "NULL::text AS contact_value") + ",",
      "cp.suppression_status AS status, cp.source_kind,",
      "fu.sampling_attributes->>'legalName' AS legal_name,",
      "fu.sampling_attributes->>'municipality' AS municipality,",
      "fu.sampling_attributes->>'prefecture' AS prefecture,",
      "fu.sector_code,",
      "invite.status AS invite_status",
      "FROM " + (canViewEmail ? "research_private.contact_points_with_value" : "research_contact_points") + " cp",
      "JOIN research_frame_units fu ON fu.id=cp.frame_unit_id",
      "LEFT JOIN LATERAL (",
      " SELECT ri.status FROM research_invites ri",
      " WHERE ri.contact_point_id=cp.id AND ri.study_id=(SELECT id FROM research_studies WHERE slug=$1)",
      " ORDER BY ri.created_at DESC LIMIT 1",
      ") invite ON TRUE",
      "WHERE fu.frame_snapshot_id=(",
      " SELECT fs.id FROM research_frame_snapshots fs",
      " JOIN research_studies s ON s.id=fs.study_id",
      " WHERE s.slug=$1 ORDER BY fs.created_at DESC LIMIT 1",
      ") AND cp.contact_type='email'",
      "AND ($2::text IS NULL OR fu.sampling_attributes->>'legalName' ILIKE $2",
      " OR fu.sampling_attributes->>'municipality' ILIKE $2",
      (canViewEmail ? " OR cp.contact_value ILIKE $2" : "") + ")",
      "AND ($3::text IS NULL OR cp.suppression_status=$3)",
      "AND ($4::uuid IS NULL OR cp.id > $4::uuid)",
      "ORDER BY cp.id ASC LIMIT 26"
    ].join("\n"), [slug, pattern, status || null, cursor])
    : await pool.query<SqlRow>([
      "SELECT ri.id, " + (canViewEmail ? "cp.contact_value" : "NULL::text AS contact_value") + ",",
      "ri.status, ri.created_at, ri.sent_at, ri.expires_at, rr.status AS response_status",
      "FROM research_invites ri",
      (canViewEmail ? "LEFT JOIN research_private.contact_points_with_value cp" : "LEFT JOIN research_contact_points cp") + " ON cp.id=ri.contact_point_id",
      "LEFT JOIN research_responses rr ON rr.invite_id=ri.id",
      "JOIN research_studies s ON s.id=ri.study_id",
      "WHERE s.slug=$1",
      "AND ($2::text IS NULL OR ri.id::text ILIKE $2",
      (canViewEmail ? " OR cp.contact_value ILIKE $2" : "") + ")",
      "AND ($3::text IS NULL OR ri.status=$3)",
      "AND ($4::uuid IS NULL OR ri.id < $4::uuid)",
      "ORDER BY ri.id DESC LIMIT 26"
    ].join("\n"), [slug, pattern, status || null, cursor]);

  const page = rows.rows.slice(0, PAGE_SIZE);
  if (canViewEmail && page.length > 0) {
    await recordAdminPersonalDataAccess(principal, {
      route: "/admin/research/surveys/" + encodeURIComponent(slug) + "/" + kind,
      resourceType: kind === "contacts" ? "research_contact_list" : "research_invitation_list",
      resourceId: slug,
      purpose: "privacy_operations",
      dataClasses: ["research_contact_email"],
      recordCount: page.length,
      accessScope: "bulk"
    });
  }

  return {
    ...blank,
    rows: page.map(row => ({
      id: string(row.id),
      email: canViewEmail ? optional(row.contact_value) : undefined,
      status: string(row.status),
      legalName: optional(row.legal_name),
      municipality: optional(row.municipality),
      prefecture: optional(row.prefecture),
      sector: optional(row.sector_code),
      source: optional(row.source_kind),
      inviteStatus: optional(row.invite_status),
      createdAt: optional(row.created_at),
      sentAt: optional(row.sent_at),
      expiresAt: optional(row.expires_at),
      responseStatus: optional(row.response_status)
    })),
    nextCursor: rows.rows.length > PAGE_SIZE ? string(page[page.length - 1]?.id) : undefined
  };
}
