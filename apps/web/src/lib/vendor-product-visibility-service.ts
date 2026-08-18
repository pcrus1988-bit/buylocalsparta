import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";

function requiredVendorId(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

function unitOfWork() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
}

function vendorScope(principal: SessionPrincipal) {
  return { actorUserId: principal.userId, vendorId: requiredVendorId(principal), marketId: "sparta" } as const;
}

export async function setVendorProductVisibility(
  principal: SessionPrincipal,
  input: Readonly<{ offerId: string; visible: boolean }>
) {
  if (!postgresVendorRuntimeEnabled()) throw new Error("Visibility controls require the PostgreSQL vendor runtime");
  if (!input.offerId?.trim()) throw new Error("Product offer is required");
  if (typeof input.visible !== "boolean") throw new Error("Visibility must be true or false");

  return unitOfWork().withTransaction(vendorScope(principal), async (tx) => {
    const vendorId = requiredVendorId(principal);
    const changed = await tx.query<SqlRow>(`
      UPDATE vendor_offers
      SET merchant_visible=$3,
          merchant_visibility_updated_by=NULLIF(current_setting('app.actor_user_id',true),'')::uuid,
          merchant_visibility_updated_at=now(),
          updated_at=now()
      WHERE public_id=$1
        AND vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2 OR id::text=$2 LIMIT 1)
        AND (status='approved' OR merchant_pause_active=true)
      RETURNING id::text id,status::text status,merchant_visible,merchant_pause_active
    `, [input.offerId.trim(), vendorId, input.visible]);

    if (!changed.rowCount) throw new Error("This product cannot be changed by the vendor");
    const row = changed.rows[0];
    const offerUuid = String(row.id);

    await tx.query(`
      INSERT INTO vendor_catalog_visibility_events(vendor_id,offer_id,scope,visible,actor_id,metadata)
      VALUES(
        (SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1),
        $2::uuid,
        'product',
        $3,
        NULLIF(current_setting('app.actor_user_id',true),'')::uuid,
        jsonb_build_object('source','vendor_dashboard','offer_public_id',$4::text)
      )
    `, [vendorId, offerUuid, input.visible, input.offerId.trim()]);

    return {
      ok: true,
      status: String(row.status),
      visible: Boolean(row.merchant_visible),
      paused: Boolean(row.merchant_pause_active)
    };
  }, { isolation: "serializable" });
}
