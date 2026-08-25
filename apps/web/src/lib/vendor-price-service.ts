import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";

function vendorId(principal: SessionPrincipal) {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

function unitOfWork() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
}

export async function updateVendorRetailPrice(
  principal: SessionPrincipal,
  input: Readonly<{ offerId: string; priceMinor: number }>
) {
  if (!postgresVendorRuntimeEnabled()) throw new Error("Η αλλαγή τιμής απαιτεί ενεργή βάση δεδομένων.");
  const offerId = input.offerId?.trim();
  if (!offerId) throw new Error("Απαιτείται προϊόν.");
  if (!Number.isSafeInteger(input.priceMinor) || input.priceMinor < 0 || input.priceMinor > 100_000_000) {
    throw new Error("Η τιμή πρέπει να είναι έγκυρο ποσό από 0 € έως 1.000.000 €.");
  }

  const id = vendorId(principal);
  return unitOfWork().withTransaction(
    { actorUserId: principal.userId, vendorId: id, marketId: "sparta" },
    async (tx) => {
      const found = await tx.query<SqlRow>(`
        SELECT customer_price_minor
        FROM vendor_offers
        WHERE public_id=$1
          AND vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2 OR id::text=$2 LIMIT 1)
        FOR UPDATE
      `, [offerId, id]);
      if (found.rowCount !== 1) throw new Error("Δεν έχετε πρόσβαση στην τιμή αυτού του προϊόντος.");

      const previousPriceMinor = Number(found.rows[0]?.customer_price_minor);
      if (!Number.isSafeInteger(previousPriceMinor)) throw new Error("Η τρέχουσα τιμή του προϊόντος δεν είναι έγκυρη.");
      if (previousPriceMinor === input.priceMinor) return { ok: true, changed: false, previousPriceMinor, priceMinor: input.priceMinor };

      const changed = await tx.query<SqlRow>(`
        UPDATE vendor_offers
        SET customer_price_minor=$2, updated_at=now()
        WHERE public_id=$1
          AND vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$3 OR id::text=$3 LIMIT 1)
        RETURNING customer_price_minor, customer_price_updated_at
      `, [offerId, input.priceMinor, id]);
      if (changed.rowCount !== 1) throw new Error("Η αλλαγή τιμής δεν αποθηκεύτηκε.");

      return {
        ok: true,
        changed: true,
        previousPriceMinor,
        priceMinor: Number(changed.rows[0]?.customer_price_minor),
        changedAt: String(changed.rows[0]?.customer_price_updated_at ?? "")
      };
    },
    { isolation: "serializable" }
  );
}
