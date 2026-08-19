import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { setAdminVendorOperationalState } from "./vendor-admin-controls";

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * The operational toggle is intentionally not an alternative onboarding path.
 * Formal applications must reach test-ready and be activated from the governed
 * application queue. The toggle remains useful for later suspend/reactivate
 * operations, but reactivation still requires documented cooperation.
 */
export async function setGovernedAdminVendorOperationalState(principal: SessionPrincipal, input: {
  vendorId: string;
  active: boolean;
  reason: string;
  now?: number;
}) {
  if (!input.active) return setAdminVendorOperationalState(principal, input);
  if (!productionDatabaseConfigured()) throw new Error("Vendor shop controls require the production database");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const vendorResult = await tx.query<SqlRow>(`
      SELECT id::text AS vendor_uuid,public_id,status::text AS status
      FROM vendor_businesses
      WHERE public_id=$1 OR id::text=$1`, [input.vendorId]);
    const vendor = vendorResult.rows[0];
    if (!vendor) throw new Error("Vendor shop not found");
    const vendorUuid = text(vendor.vendor_uuid);
    const vendorPublicId = text(vendor.public_id);

    if (vendorPublicId.startsWith("vendor_research_")) {
      throw new Error("Research prospects must complete formal onboarding before activation");
    }

    const application = await tx.query<SqlRow>(`
      SELECT public_id,status::text AS status
      FROM vendor_applications
      WHERE vendor_id=$1::uuid
      ORDER BY updated_at DESC,created_at DESC
      LIMIT 1`, [vendorUuid]);
    const applicationState = optionalText(application.rows[0]?.status);
    if (applicationState && !["active", "restricted", "suspended"].includes(applicationState)) {
      throw new Error(`This shop is still in ${applicationState}. Complete the application queue and use the governed activation action there.`);
    }

    const agreement = await tx.query<SqlRow>(`
      SELECT status::text AS status,signed_at,source_document_reference
      FROM vendor_commercial_agreements
      WHERE vendor_id=$1::uuid
      ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,updated_at DESC,created_at DESC
      LIMIT 1`, [vendorUuid]);
    const current = agreement.rows[0];
    if (!current || text(current.status) !== "active" || !current.signed_at || !optionalText(current.source_document_reference)) {
      throw new Error("Activation is blocked until an active signed cooperation agreement with a signed-document reference is recorded.");
    }
  }, { readOnly: true });

  return setAdminVendorOperationalState(principal, input);
}
