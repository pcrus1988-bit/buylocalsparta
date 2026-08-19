import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

function text(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Database field ${field} is not a string`);
  return value;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

export async function hardDeleteVendorApplication(principal: SessionPrincipal, input: {
  applicationId: string;
  confirmation: string;
  reason: string;
  now?: number;
}) {
  const reason = input.reason.trim();
  const confirmation = input.confirmation.trim();
  if (reason.length < 3) throw new Error("Deletion reason is required");
  if (!confirmation) throw new Error("Application ID confirmation is required");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  const now = input.now ?? Date.now();

  const deleted = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const current = await tx.query<SqlRow>(`SELECT a.id::text AS application_uuid,a.public_id,a.status::text AS status,a.trading_name,a.vendor_id::text AS vendor_uuid,v.public_id AS vendor_public_id
      FROM vendor_applications a
      LEFT JOIN vendor_businesses v ON v.id=a.vendor_id
      WHERE a.public_id=$1 OR a.id::text=$1
      FOR UPDATE OF a`, [input.applicationId]);

    if (!current.rowCount) throw new Error("Vendor application not found");
    const row = current.rows[0];
    const publicId = text(row.public_id, "application.public_id");
    const state = text(row.status, "application.status");
    if (confirmation !== publicId) throw new Error(`Type the exact application ID (${publicId}) to confirm permanent deletion`);
    if (state === "active") throw new Error("Active applications cannot be hard-deleted. Restrict or close the vendor first so operational, contractual and financial records remain governed.");

    const applicationUuid = text(row.application_uuid, "application_uuid");
    await tx.query("DELETE FROM vendor_applications WHERE id=$1::uuid", [applicationUuid]);

    return {
      id: publicId,
      tradingName: text(row.trading_name, "trading_name"),
      previousState: state,
      retainedVendorId: optionalText(row.vendor_public_id),
      deletedAt: now
    };
  }, { isolation: "serializable" });

  await runtime.persistence.trust.saveAudit({
    scope: platformScope(principal.userId),
    event: {
      id: `audit_${randomUUID()}`,
      actorId: principal.userId,
      actorRole: principal.roles[0],
      action: "vendor.application_deleted",
      entityType: "vendor_application",
      entityId: deleted.id,
      reason,
      after: {
        deleted: true,
        previousState: deleted.previousState,
        retainedVendorId: deleted.retainedVendorId ?? null
      },
      createdAt: now
    }
  });

  return deleted;
}
