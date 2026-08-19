import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { createReport, type ReportActorKind, type ReportSpec } from "./reporting-engine";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function runSavedReport(actor: ReportActorKind, principal: SessionPrincipal, templatePublicId: string) {
  if (!UUID_RE.test(templatePublicId)) throw new Error("REPORT_TEMPLATE_NOT_FOUND");
  const pool = getProductionPostgresRuntime().nativePool;
  const result = await pool.query(`SELECT owner_kind,vendor_id,report_spec FROM saved_report_definitions
    WHERE public_id=$1 AND owner_user_id=$2`, [templatePublicId, principal.userId]);
  const row = result.rows[0];
  if (!row || String(row.owner_kind) !== actor) throw new Error("REPORT_TEMPLATE_NOT_FOUND");
  const raw = row.report_spec && typeof row.report_spec === "object" ? row.report_spec : {};
  const spec: ReportSpec = {
    preset: ["sales_commissions","inventory","performance","full","custom"].includes(raw.preset) ? raw.preset : "full",
    title: String(raw.title ?? "Saved report").slice(0, 240),
    prompt: typeof raw.prompt === "string" ? raw.prompt.slice(0, 2000) : undefined,
    fromDate: typeof raw.fromDate === "string" ? raw.fromDate : new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
    toDate: typeof raw.toDate === "string" ? raw.toDate : new Date().toISOString().slice(0, 10),
    domains: Array.isArray(raw.domains) ? raw.domains : ["sales","commissions","inventory","performance"],
    vendorId: actor === "vendor" ? principal.vendorId : (typeof raw.vendorId === "string" ? raw.vendorId : undefined),
    categoryId: typeof raw.categoryId === "string" ? raw.categoryId : undefined,
    productId: typeof raw.productId === "string" ? raw.productId : undefined,
    locationId: typeof raw.locationId === "string" ? raw.locationId : undefined,
    brandId: typeof raw.brandId === "string" ? raw.brandId : undefined,
    comparePrevious: Boolean(raw.comparePrevious),
    includeDetails: raw.includeDetails !== false
  };
  if (actor === "vendor" && String(row.vendor_id ?? "") !== principal.vendorId) throw new Error("REPORT_TEMPLATE_SCOPE_DENIED");
  return createReport(actor, principal, spec);
}
