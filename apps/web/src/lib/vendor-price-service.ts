import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";
import {
  calculateRetailPriceMinor,
  validPriceMinor,
  validateAdjustment,
  type VendorPricingAdjustmentType,
  type VendorPricingMode
} from "./vendor-pricing-calculation";

function vendorId(principal: SessionPrincipal) {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

function unitOfWork() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
}

function optionalSafeInteger(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalAdjustmentType(value: unknown): VendorPricingAdjustmentType | undefined {
  return value === "percent" || value === "fixed" ? value : undefined;
}

function pricingMode(value: unknown): VendorPricingMode {
  return value === "calculated" ? "calculated" : "manual";
}

export type VendorStructuredPricingUpdate = Readonly<{
  offerId: string;
  pricingMode: VendorPricingMode;
  priceMinor?: number;
  buyingPriceMinor?: number | null;
  markupType?: VendorPricingAdjustmentType;
  markupValue?: number;
  discountType?: VendorPricingAdjustmentType;
  discountValue?: number;
  msrpMinor?: number | null;
  showMsrp?: boolean;
}>;

export async function readVendorStructuredPricing(principal: SessionPrincipal) {
  if (!postgresVendorRuntimeEnabled()) return [];
  const id = vendorId(principal);
  return unitOfWork().withTransaction(
    { actorUserId: principal.userId, vendorId: id, marketId: "sparta" },
    async (tx) => {
      const rows = await tx.query<SqlRow>(`
        SELECT vo.public_id AS offer_id,vo.customer_price_minor,vo.msrp_minor,vo.show_msrp,
               COALESCE(p.pricing_mode,'manual') AS pricing_mode,p.buying_price_minor,
               p.markup_type,p.markup_value,p.discount_type,p.discount_value
        FROM vendor_offers vo
        LEFT JOIN vendor_offer_pricing_private p ON p.offer_id=vo.id
        WHERE vo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)
        ORDER BY vo.public_id
      `, [id]);
      return rows.rows.map((row) => ({
        offerId: String(row.offer_id),
        retailPriceMinor: Number(row.customer_price_minor),
        buyingPriceMinor: optionalSafeInteger(row.buying_price_minor),
        pricingMode: pricingMode(row.pricing_mode),
        markupType: optionalAdjustmentType(row.markup_type),
        markupValue: optionalNumber(row.markup_value),
        discountType: optionalAdjustmentType(row.discount_type),
        discountValue: optionalNumber(row.discount_value),
        msrpMinor: optionalSafeInteger(row.msrp_minor),
        showMsrp: Boolean(row.show_msrp)
      }));
    },
    { readOnly: true }
  );
}

export async function updateVendorStructuredPricing(principal: SessionPrincipal, input: VendorStructuredPricingUpdate) {
  if (!postgresVendorRuntimeEnabled()) throw new Error("Η αλλαγή τιμολόγησης απαιτεί ενεργή βάση δεδομένων.");
  const offerId = input.offerId?.trim();
  if (!offerId) throw new Error("Απαιτείται προϊόν.");
  if (input.pricingMode !== "manual" && input.pricingMode !== "calculated") throw new Error("Μη έγκυρος τρόπος τιμολόγησης.");

  const id = vendorId(principal);
  return unitOfWork().withTransaction(
    { actorUserId: principal.userId, vendorId: id, marketId: "sparta" },
    async (tx) => {
      const found = await tx.query<SqlRow>(`
        SELECT vo.id::text AS offer_uuid,vo.vendor_id::text AS vendor_uuid,vo.customer_price_minor,vo.msrp_minor,vo.show_msrp,
               COALESCE(p.pricing_mode,'manual') AS pricing_mode,p.buying_price_minor,
               p.markup_type,p.markup_value,p.discount_type,p.discount_value
        FROM vendor_offers vo
        LEFT JOIN vendor_offer_pricing_private p ON p.offer_id=vo.id
        WHERE vo.public_id=$1
          AND vo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2 OR id::text=$2 LIMIT 1)
        FOR UPDATE OF vo
      `, [offerId, id]);
      if (found.rowCount !== 1) throw new Error("Δεν έχετε πρόσβαση στην τιμολόγηση αυτού του προϊόντος.");

      const row = found.rows[0];
      const previousPriceMinor = Number(row.customer_price_minor);
      if (!validPriceMinor(previousPriceMinor)) throw new Error("Η τρέχουσα τιμή του προϊόντος δεν είναι έγκυρη.");

      const buyingPriceMinor = input.buyingPriceMinor === undefined
        ? optionalSafeInteger(row.buying_price_minor)
        : input.buyingPriceMinor === null ? undefined : input.buyingPriceMinor;
      if (buyingPriceMinor !== undefined && !validPriceMinor(buyingPriceMinor)) {
        throw new Error("Η τιμή αγοράς πρέπει να είναι έγκυρο ποσό από 0 € έως 1.000.000 €.");
      }

      const markupType = input.markupType;
      const markupValue = input.markupValue;
      const discountType = input.discountType;
      const discountValue = input.discountValue;
      validateAdjustment(markupType, markupValue, "Προσαύξηση");
      validateAdjustment(discountType, discountValue, "Έκπτωση");

      let priceMinor: number;
      if (input.pricingMode === "calculated") {
        if (buyingPriceMinor === undefined) throw new Error("Η υπολογιζόμενη τιμή χρειάζεται τιμή αγοράς.");
        priceMinor = calculateRetailPriceMinor({ buyingPriceMinor, markupType, markupValue, discountType, discountValue });
      } else {
        if (input.priceMinor === undefined || !validPriceMinor(input.priceMinor)) {
          throw new Error("Η τιμή λιανικής πρέπει να είναι έγκυρο ποσό από 0 € έως 1.000.000 €.");
        }
        priceMinor = input.priceMinor;
      }

      const previousMsrpMinor = optionalSafeInteger(row.msrp_minor);
      const msrpMinor = input.msrpMinor === undefined ? previousMsrpMinor : input.msrpMinor === null ? undefined : input.msrpMinor;
      if (msrpMinor !== undefined && !validPriceMinor(msrpMinor)) throw new Error("Η MSRP πρέπει να είναι έγκυρο ποσό από 0 € έως 1.000.000 €.");
      const showMsrp = input.showMsrp === undefined ? Boolean(row.show_msrp) : input.showMsrp;

      await tx.query(`
        INSERT INTO vendor_offer_pricing_private(
          offer_id,vendor_id,buying_price_minor,pricing_mode,markup_type,markup_value,discount_type,discount_value,created_at,updated_at
        ) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,now(),now())
        ON CONFLICT(offer_id) DO UPDATE SET
          buying_price_minor=EXCLUDED.buying_price_minor,
          pricing_mode=EXCLUDED.pricing_mode,
          markup_type=EXCLUDED.markup_type,
          markup_value=EXCLUDED.markup_value,
          discount_type=EXCLUDED.discount_type,
          discount_value=EXCLUDED.discount_value,
          updated_at=now()
      `, [String(row.offer_uuid), String(row.vendor_uuid), buyingPriceMinor ?? null, input.pricingMode, markupType ?? null, markupValue ?? null, discountType ?? null, discountValue ?? null]);

      const changed = await tx.query<SqlRow>(`
        UPDATE vendor_offers
        SET customer_price_minor=$2,msrp_minor=$3,show_msrp=$4,updated_at=now()
        WHERE public_id=$1
          AND vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$5 OR id::text=$5 LIMIT 1)
        RETURNING customer_price_minor,msrp_minor,show_msrp,customer_price_updated_at
      `, [offerId, priceMinor, msrpMinor ?? null, showMsrp, id]);
      if (changed.rowCount !== 1) throw new Error("Η αλλαγή τιμολόγησης δεν αποθηκεύτηκε.");

      const priorPrivate = {
        pricingMode: pricingMode(row.pricing_mode),
        buyingPriceMinor: optionalSafeInteger(row.buying_price_minor),
        markupType: optionalAdjustmentType(row.markup_type),
        markupValue: optionalNumber(row.markup_value),
        discountType: optionalAdjustmentType(row.discount_type),
        discountValue: optionalNumber(row.discount_value)
      };
      const nextPrivate = { pricingMode: input.pricingMode, buyingPriceMinor, markupType, markupValue, discountType, discountValue };
      const didChange = previousPriceMinor !== priceMinor
        || previousMsrpMinor !== msrpMinor
        || Boolean(row.show_msrp) !== showMsrp
        || JSON.stringify(priorPrivate) !== JSON.stringify(nextPrivate);

      return {
        ok: true,
        changed: didChange,
        previousPriceMinor,
        priceMinor: Number(changed.rows[0]?.customer_price_minor),
        buyingPriceMinor,
        pricingMode: input.pricingMode,
        markupType,
        markupValue,
        discountType,
        discountValue,
        msrpMinor: optionalSafeInteger(changed.rows[0]?.msrp_minor),
        showMsrp: Boolean(changed.rows[0]?.show_msrp),
        changedAt: String(changed.rows[0]?.customer_price_updated_at ?? "")
      };
    },
    { isolation: "serializable" }
  );
}

export async function updateVendorRetailPrice(
  principal: SessionPrincipal,
  input: Readonly<{ offerId: string; priceMinor: number }>
) {
  return updateVendorStructuredPricing(principal, {
    offerId: input.offerId,
    pricingMode: "manual",
    priceMinor: input.priceMinor
  });
}
