import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";

export type VendorProductDeliverySetting = Readonly<{
  offerId: string;
  canonicalVariantId: string;
  title: string;
  vendorSku?: string;
  deliveryEligible: boolean;
  pickupOnly: boolean;
  fulfilmentModes: readonly string[];
  explicitVendorChoice: boolean;
}>;

function vendorId(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

function unitOfWork() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
}

function modesFromRow(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

export async function vendorProductDeliverySettings(principal: SessionPrincipal): Promise<readonly VendorProductDeliverySetting[]> {
  if (!postgresVendorRuntimeEnabled()) throw new Error("Οι ρυθμίσεις παράδοσης απαιτούν ενεργή βάση δεδομένων.");
  const id = vendorId(principal);
  return unitOfWork().withTransaction(
    { actorUserId: principal.userId, vendorId: id, marketId: "sparta" },
    async (tx) => {
      const result = await tx.query<SqlRow>(`
        SELECT vo.public_id AS offer_id,
               cv.public_id AS canonical_variant_id,
               COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
               vo.vendor_sku,
               ARRAY(SELECT mode::text FROM unnest(vo.fulfilment_modes) AS mode) AS fulfilment_modes,
               COALESCE(vo.source_payload->>'deliveryEligibilitySource','')='vendor' AS explicit_vendor_choice
        FROM public.vendor_offers vo
        JOIN public.vendor_businesses vb ON vb.id=vo.vendor_id
        JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
        LEFT JOIN public.product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN public.product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE (vb.public_id=$1 OR vb.id::text=$1)
          AND vo.status <> 'rejected'
        ORDER BY lower(COALESCE(el.title,en.title,cv.model,cv.slug)),vo.public_id
      `, [id]);
      return result.rows.map((row) => {
        const fulfilmentModes = modesFromRow(row.fulfilment_modes);
        const deliveryEligible = fulfilmentModes.includes("local_delivery");
        return {
          offerId: String(row.offer_id ?? ""),
          canonicalVariantId: String(row.canonical_variant_id ?? ""),
          title: String(row.title ?? "Προϊόν"),
          vendorSku: typeof row.vendor_sku === "string" && row.vendor_sku ? row.vendor_sku : undefined,
          deliveryEligible,
          pickupOnly: !deliveryEligible,
          fulfilmentModes,
          explicitVendorChoice: Boolean(row.explicit_vendor_choice)
        };
      });
    },
    { readOnly: true }
  );
}

export async function setVendorProductDeliveryEligibility(
  principal: SessionPrincipal,
  input: Readonly<{ offerId: string; deliveryEligible: boolean; source?: "products" | "quickadd" }>
): Promise<Readonly<{ ok: true; offerId: string; deliveryEligible: boolean; fulfilmentModes: readonly string[] }>> {
  if (!postgresVendorRuntimeEnabled()) throw new Error("Η αλλαγή τρόπου διάθεσης απαιτεί ενεργή βάση δεδομένων.");
  const offerId = input.offerId?.trim();
  if (!offerId) throw new Error("Απαιτείται προϊόν.");
  if (typeof input.deliveryEligible !== "boolean") throw new Error("Η επιλογή παράδοσης δεν είναι έγκυρη.");
  const id = vendorId(principal);

  return unitOfWork().withTransaction(
    { actorUserId: principal.userId, vendorId: id, marketId: "sparta" },
    async (tx) => {
      const found = await tx.query<SqlRow>(`
        SELECT vo.id::text AS offer_uuid,
               ARRAY(SELECT mode::text FROM unnest(vo.fulfilment_modes) AS mode) AS fulfilment_modes
        FROM public.vendor_offers vo
        JOIN public.vendor_businesses vb ON vb.id=vo.vendor_id
        WHERE vo.public_id=$1
          AND (vb.public_id=$2 OR vb.id::text=$2)
        FOR UPDATE OF vo
      `, [offerId, id]);
      if (found.rowCount !== 1) throw new Error("Δεν έχετε πρόσβαση στις ρυθμίσεις παράδοσης αυτού του προϊόντος.");

      const modes = new Set(modesFromRow(found.rows[0]?.fulfilment_modes));
      modes.add("pickup");
      if (input.deliveryEligible) modes.add("local_delivery");
      else modes.delete("local_delivery");
      const fulfilmentModes = [...modes];

      const changed = await tx.query<SqlRow>(`
        UPDATE public.vendor_offers
        SET fulfilment_modes=ARRAY(
              SELECT value::public.fulfilment_mode
              FROM unnest($3::text[]) AS value
            ),
            source_payload=COALESCE(source_payload,'{}'::jsonb)||jsonb_build_object(
              'deliveryEligibility',CASE WHEN $4::boolean THEN 'delivery' ELSE 'pickup_only' END,
              'deliveryEligibilitySource','vendor',
              'deliveryEligibilityChannel',$5::text,
              'deliveryEligibilityUpdatedAt',to_jsonb(now())
            ),
            updated_at=now()
        WHERE id=$1::uuid
          AND vendor_id=(SELECT id FROM public.vendor_businesses WHERE public_id=$2 OR id::text=$2 LIMIT 1)
        RETURNING public_id
      `, [String(found.rows[0]?.offer_uuid ?? ""), id, fulfilmentModes, input.deliveryEligible, input.source ?? "products"]);
      if (changed.rowCount !== 1) throw new Error("Η αλλαγή τρόπου διάθεσης δεν αποθηκεύτηκε.");
      return { ok: true, offerId, deliveryEligible: input.deliveryEligible, fulfilmentModes };
    },
    { isolation: "serializable" }
  );
}
