import type { SqlRow } from "@buy-local-sparta/core";
import { hasAdminPermission, recordAdminPersonalDataAccess } from "../../../../../../../lib/admin-runtime";
import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { getAdminPostgresRuntime, productionDatabaseConfigured } from "../../../../../../../lib/postgres-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Explicitly limited to a known study. CSV is generated in the authorised
// server session, never as a public URL or a Google Sheets IMPORTDATA feed.
const STUDY_SLUG = "greek-retail-2026";
const EXPORT_LIMIT = 5000;

type EvidenceRow = SqlRow & {
  response_id: string;
  business_name: string | null;
  gemi_number: string | null;
  email: string | null;
  email_source: string;
  marketing_status: string;
  marketing_opt_in_at: string | null;
  marketing_statement_version: string | null;
  code_status: string;
  code_opt_in_at: string | null;
  code_statement_version: string | null;
  results_status: string;
  results_opt_in_at: string | null;
  results_statement_version: string | null;
  response_status: string;
  suppression_status: string | null;
};

/**
 * Last recorded choice and last affirmative event are intentionally different.
 * A historic opt-in is retained as evidence even after a later revocation, but
 * the resulting CSV clearly marks current permission and "DO NOT CONTACT".
 *
 * Only page-sized consent identities are selected before accessing the private
 * vault, and the materialised target has a hard count cap.
 */
const CONSENT_EXPORT_SQL = `
WITH history AS MATERIALIZED (
  SELECT c.id, c.response_id, c.consent_kind, c.granted,
         c.occurred_at, c.statement_version,
         max(c.occurred_at) FILTER (WHERE c.granted)
           OVER (PARTITION BY c.response_id, c.consent_kind) AS last_opt_in_at
  FROM research_consents c
  JOIN research_responses rr ON rr.id = c.response_id
  WHERE rr.study_id = $1
    AND c.consent_kind IN ('marketing', 'thank_you_code', 'results_notification')
),
latest AS MATERIALIZED (
  SELECT DISTINCT ON (response_id, consent_kind)
    response_id, consent_kind, granted, last_opt_in_at, statement_version
  FROM history
  ORDER BY response_id, consent_kind, occurred_at DESC, id DESC
),
target AS MATERIALIZED (
  SELECT rr.id AS response_id, rr.status AS response_status,
         cp.id AS contact_point_id, cp.suppression_status,
         coalesce(fu.sampling_attributes->>'legalName', '') AS business_name,
         regexp_replace(coalesce(fu.source_record_ref,''), '^gemi:', '') AS gemi_number
  FROM research_responses rr
  JOIN research_invites ri ON ri.id = rr.invite_id
  JOIN research_contact_points cp ON cp.id = ri.contact_point_id
  JOIN research_frame_units fu ON fu.id = cp.frame_unit_id
  WHERE rr.study_id = $1
    AND EXISTS (
      SELECT 1 FROM latest l
      WHERE l.response_id = rr.id AND l.last_opt_in_at IS NOT NULL
    )
  ORDER BY rr.id
  LIMIT 5001
)
SELECT target.response_id::text AS response_id,
       target.business_name, target.gemi_number, vault.contact_value AS email,
       CASE WHEN vault.contact_value IS NOT NULL
         THEN 'PRIVATE_CONTACT_VAULT' ELSE 'MISSING_OR_ERASED' END AS email_source,
       coalesce(max(CASE WHEN l.consent_kind='marketing'
         THEN CASE WHEN l.granted THEN 'GRANTED' ELSE 'DECLINED_OR_REVOKED' END END),
         'NOT_RECORDED') AS marketing_status,
       to_char(max(l.last_opt_in_at) FILTER (WHERE l.consent_kind='marketing')
         AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS marketing_opt_in_at,
       max(l.statement_version) FILTER (WHERE l.consent_kind='marketing') AS marketing_statement_version,
       coalesce(max(CASE WHEN l.consent_kind='thank_you_code'
         THEN CASE WHEN l.granted THEN 'GRANTED' ELSE 'DECLINED_OR_REVOKED' END END),
         'NOT_RECORDED') AS code_status,
       to_char(max(l.last_opt_in_at) FILTER (WHERE l.consent_kind='thank_you_code')
         AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS code_opt_in_at,
       max(l.statement_version) FILTER (WHERE l.consent_kind='thank_you_code') AS code_statement_version,
       coalesce(max(CASE WHEN l.consent_kind='results_notification'
         THEN CASE WHEN l.granted THEN 'GRANTED' ELSE 'DECLINED_OR_REVOKED' END END),
         'NOT_RECORDED') AS results_status,
       to_char(max(l.last_opt_in_at) FILTER (WHERE l.consent_kind='results_notification')
         AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS results_opt_in_at,
       max(l.statement_version) FILTER (WHERE l.consent_kind='results_notification') AS results_statement_version,
       target.response_status, target.suppression_status
FROM target
LEFT JOIN research_private.contact_vault vault ON vault.contact_point_id = target.contact_point_id
LEFT JOIN latest l ON l.response_id = target.response_id
GROUP BY target.response_id, target.business_name, target.gemi_number,
         target.response_status, target.suppression_status, vault.contact_value
ORDER BY target.business_name, target.response_id
`;

function cell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Excel / LibreOffice formula injection, including whitespace before a formula.
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function csv(rows: readonly EvidenceRow[]): string {
  const headings = [
    "Business Name", "Email", "Email Source", "GEMI Number",
    "Marketing Consent (latest)", "Marketing Last Opt-In (UTC)", "Marketing Statement Version",
    "Thank-you Code Consent (latest)", "Thank-you Code Last Opt-In (UTC)", "Code Statement Version",
    "Survey Results Consent (latest)", "Survey Results Last Opt-In (UTC)", "Results Statement Version",
    "Response Status", "Suppression Status", "Contact Safety", "Response ID"
  ];
  const output: string[] = [headings.map(cell).join(",")];
  for (const row of rows) {
    const restricted = row.response_status === "withdrawn" ||
      row.suppression_status !== "active";
    output.push([
      row.business_name, row.email, row.email_source, row.gemi_number,
      row.marketing_status, row.marketing_opt_in_at, row.marketing_statement_version,
      row.code_status, row.code_opt_in_at, row.code_statement_version,
      row.results_status, row.results_opt_in_at, row.results_statement_version,
      row.response_status, row.suppression_status,
      restricted ? "DO NOT CONTACT" : "PURPOSE CONSENT REQUIRED",
      row.response_id
    ].map(cell).join(","));
  }
  return "\ufeff" + output.join("\r\n") + "\r\n";
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
  try {
    const principal = await requireAdminSession(request, { permission: "research.read" });
    const { slug } = await context.params;
    if (slug !== STUDY_SLUG) {
      return Response.json({ error: "RESEARCH_STUDY_NOT_FOUND" }, { status: 404, headers });
    }
    if (!(
      hasAdminPermission(principal, "research.privacy.manage") ||
      hasAdminPermission(principal, "research.fieldwork.manage") ||
      hasAdminPermission(principal, "research.manage")
    )) {
      return Response.json({ error: "RESEARCH_IDENTITY_EXPORT_FORBIDDEN" }, { status: 403, headers });
    }
    if (!productionDatabaseConfigured()) {
      return Response.json({ error: "RESEARCH_DATABASE_UNAVAILABLE" }, { status: 503, headers });
    }
    const pool = getAdminPostgresRuntime().sqlPool;
    const study = await pool.query<SqlRow>("SELECT id FROM research_studies WHERE slug=$1 LIMIT 1", [slug]);
    if (!study.rows[0]) {
      return Response.json({ error: "RESEARCH_STUDY_NOT_FOUND" }, { status: 404, headers });
    }
    const result = await pool.query<EvidenceRow>(CONSENT_EXPORT_SQL, [study.rows[0].id]);
    if (result.rows.length > EXPORT_LIMIT) {
      return Response.json({ error: "RESEARCH_CONSENT_EXPORT_TOO_LARGE" }, { status: 413, headers });
    }
    // An audit failure must prevent release of private addresses.
    await recordAdminPersonalDataAccess(principal, {
      route: "/api/admin/research/surveys/" + slug + "/consent-export",
      resourceType: "research_consent_identity_export",
      resourceId: slug,
      purpose: "privacy_operations",
      dataClasses: ["research_contact_email", "research_consent_choice", "research_consent_timestamp", "research_business_identity"],
      recordCount: result.rows.filter(row => Boolean(row.email)).length,
      accessScope: "bulk"
    });
    return new Response(csv(result.rows), {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="KONTA_MOU_Retail_2026_Consent_Emails.csv"'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RESEARCH_CONSENT_EXPORT_FAILED";
    const status = message === "ADMIN_AUTH_REQUIRED" ? 401 :
      message === "ADMIN_PERMISSION_DENIED" ? 403 : 500;
    return Response.json({ error: status === 500 ? "RESEARCH_CONSENT_EXPORT_FAILED" : message }, { status, headers });
  }
}
