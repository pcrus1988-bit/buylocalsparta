import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";

export type VendorProductDeliverySetting = Readonly<{
  offerId: string;
  canonicalVariantId: string;
  title: string;
  vendorSku?: string;
  deliveryEligible: boolean;
  pickupEligible: boolean;
  pickupOnly: boolean;
  fulfilmentModes: readonly string[];
  explicitVendorChoice: boolean;
}>;

export type VendorProductDeliveryFilter = "all" | "delivery" | "pickup" | "custom";

export type VendorProductDeliveryPage = Readonly<{
  products: readonly VendorProductDeliverySetting[];
  summary: Readonly<{ total: number; delivery: number; pickup: number; custom: number }>;
  filteredTotal: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  hasPrevious: boolean;
}>;

type FulfilmentPreference = Readonly<{
  deliveryEligible: boolean;
  pickupEligible: boolean;
  source?: "products" | "quickadd";
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

function safeInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function normalizedFilter(value: unknown): VendorProductDeliveryFilter {
  return value === "delivery" || value === "pickup" || value === "custom" ? value : "all";
}

function validatePreference(input: FulfilmentPreference) {
  if (typeof input.deliveryEligible !== "boolean" || typeof input.pickupEligible !== "boolean") {
    throw new Error("Οι επιλογές παράδοσης και παραλαβής δεν είναι έγκυρες.");
  }
  if (!input.deliveryEligible && !input.pickupEligible) {
    throw new Error("Κράτησε ενεργό τουλάχιστον έναν τρόπο διάθεσης: παράδοση ή παραλαβή.");
  }
}

function preferenceLabel(input: FulfilmentPreference): string {
  if (input.deliveryEligible && input.pickupEligible) return "pickup_and_delivery";
  if (input.deliveryEligible) return "delivery_only";
  return "pickup_only";
}

function countForFilter(summary: VendorProductDeliveryPage["summary"], filter: VendorProductDeliveryFilter): number {
  if (filter === "delivery") return summary.delivery;
  if (filter === "pickup") return summary.pickup;
  if (filter === "custom") return summary.custom;
  return summary.total;
}

function mapSetting(row: SqlRow): VendorProductDeliverySetting {
  const fulfilmentModes = modesFromRow(row.fulfilment_modes);
  const deliveryEligible = fulfilmentModes.includes("local_delivery");
  const pickupEligible = fulfilmentModes.includes("pickup");
  return {
    offerId: String(row.offer_id ?? ""),
    canonicalVariantId: String(row.canonical_variant_id ?? ""),
    title: String(row.title ?? "Προϊόν"),
    vendorSku: typeof row.vendor_sku === "string" && row.vendor_sku ? row.vendor_sku : undefined,
    deliveryEligible,
    pickupEligible,
    pickupOnly: pickupEligible && !deliveryEligible,
    fulfilmentModes,
    explicitVendorChoice: Boolean(row.explicit_vendor_choice)
  };
}

export async function vendorProductDeliverySettings(
  principal: SessionPrincipal,
  options: Readonly<{ query?: string; filter?: VendorProductDeliveryFilter; limit?: number; offset?: number }> = {}
): Promise<VendorProductDeliveryPage> {
  if (!postgresVendorRuntimeEnabled()) throw new Error("Οι ρυθμίσεις παράδοσης απαιτούν ενεργή βάση δεδομένων.");
  const id = vendorId(principal);
  const query = (options.query ?? "").trim().slice(0, 120);
  const filter = normalizedFilter(options.filter);
  const limit = Math.min(100, Math.max(1, safeInt(options.limit, 40)));
  const offset = Math.max(0, safeInt(options.offset, 0));

  return unitOfWork().withTransaction(
    { actorUserId: principal.userId, vendorId: id, marketId: "sparta" },
    async (tx) => {
      const summaryResult = await tx.query<SqlRow>(`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE 'local_delivery'::public.fulfilment_mode = ANY(COALESCE(vo.fulfilment_modes, ARRAY[]::public.fulfilment_mode[])))::int AS delivery,
               count(*) FILTER (WHERE 'pickup'::public.fulfilment_mode = ANY(COALESCE(vo.fulfilment_modes, ARRAY[]::public.fulfilment_mode[])))::int AS pickup,
               count(*) FILTER (WHERE COALESCE(vo.source_payload->>'fulfilmentPreferenceSource',vo.source_payload->>'deliveryEligibilitySource','')='vendor')::int AS custom
        FROM public.vendor_offers vo
        JOIN public.vendor_businesses vb ON vb.id=vo.vendor_id
        WHERE (vb.public_id=$1 OR vb.id::text=$1)
          AND vo.status <> 'rejected'
      `, [id]);
      const summaryRow = summaryResult.rows[0] ?? {};
      const summary = {
        total: safeInt(summaryRow.total, 0),
        delivery: safeInt(summaryRow.delivery, 0),
        pickup: safeInt(summaryRow.pickup, 0),
        custom: safeInt(summaryRow.custom, 0)
      };

      let filteredTotal = countForFilter(summary, filter);
      if (query) {
        const filteredCount = await tx.query<SqlRow>(`
          SELECT count(*)::int AS filtered_total
          FROM public.vendor_offers vo
          JOIN public.vendor_businesses vb ON vb.id=vo.vendor_id
          JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
          LEFT JOIN public.product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
          LEFT JOIN public.product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
          WHERE (vb.public_id=$1 OR vb.id::text=$1)
            AND vo.status <> 'rejected'
            AND (
              COALESCE(el.title,en.title,cv.model,cv.slug,'') ILIKE '%' || $2 || '%'
              OR COALESCE(vo.vendor_sku,'') ILIKE '%' || $2 || '%'
              OR cv.public_id ILIKE '%' || $2 || '%'
            )
            AND (
              $3::text='all'
              OR ($3::text='delivery' AND 'local_delivery'::public.fulfilment_mode = ANY(COALESCE(vo.fulfilment_modes, ARRAY[]::public.fulfilment_mode[])))
              OR ($3::text='pickup' AND 'pickup'::public.fulfilment_mode = ANY(COALESCE(vo.fulfilment_modes, ARRAY[]::public.fulfilment_mode[])))
              OR ($3::text='custom' AND COALESCE(vo.source_payload->>'fulfilmentPreferenceSource',vo.source_payload->>'deliveryEligibilitySource','')='vendor')
            )
        `, [id, query, filter]);
        filteredTotal = safeInt(filteredCount.rows[0]?.filtered_total, 0);
      }

      const result = query
        ? await tx.query<SqlRow>(`
            SELECT vo.public_id AS offer_id,
                   cv.public_id AS canonical_variant_id,
                   COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
                   vo.vendor_sku,
                   ARRAY(SELECT mode::text FROM unnest(vo.fulfilment_modes) AS mode) AS fulfilment_modes,
                   COALESCE(vo.source_payload->>'fulfilmentPreferenceSource',vo.source_payload->>'deliveryEligibilitySource','')='vendor' AS explicit_vendor_choice
            FROM public.vendor_offers vo
            JOIN public.vendor_businesses vb ON vb.id=vo.vendor_id
            JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
            LEFT JOIN public.product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
            LEFT JOIN public.product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
            WHERE (vb.public_id=$1 OR vb.id::text=$1)
              AND vo.status <> 'rejected'
              AND (
                COALESCE(el.title,en.title,cv.model,cv.slug,'') ILIKE '%' || $2 || '%'
                OR COALESCE(vo.vendor_sku,'') ILIKE '%' || $2 || '%'
                OR cv.public_id ILIKE '%' || $2 || '%'
              )
              AND (
                $3::text='all'
                OR ($3::text='delivery' AND 'local_delivery'::public.fulfilment_mode = ANY(COALESCE(vo.fulfilment_modes, ARRAY[]::public.fulfilment_mode[])))
                OR ($3::text='pickup' AND 'pickup'::public.fulfilment_mode = ANY(COALESCE(vo.fulfilment_modes, ARRAY[]::public.fulfilment_mode[])))
                OR ($3::text='custom' AND COALESCE(vo.source_payload->>'fulfilmentPreferenceSource',vo.source_payload->>'deliveryEligibilitySource','')='vendor')
              )
            ORDER BY vo.updated_at DESC,vo.public_id DESC
            LIMIT $4 OFFSET $5
          `, [id, query, filter, limit, offset])
        : await tx.query<SqlRow>(`
            WITH selected_offers AS (
              SELECT vo.public_id AS offer_id,
                     vo.canonical_variant_id,
                     vo.vendor_sku,
                     vo.fulfilment_modes,
                     vo.updated_at,
                     COALESCE(vo.source_payload->>'fulfilmentPreferenceSource',vo.source_payload->>'deliveryEligibilitySource','')='vendor' AS explicit_vendor_choice
              FROM public.vendor_offers vo
              JOIN public.vendor_businesses vb ON vb.id=vo.vendor_id
              WHERE (vb.public_id=$1 OR vb.id::text=$1)
                AND vo.status <> 'rejected'
                AND (
                  $2::text='all'
                  OR ($2::text='delivery' AND 'local_delivery'::public.fulfilment_mode = ANY(COALESCE(vo.fulfilment_modes, ARRAY[]::public.fulfilment_mode[])))
                  OR ($2::text='pickup' AND 'pickup'::public.fulfilment_mode = ANY(COALESCE(vo.fulfilment_modes, ARRAY[]::public.fulfilment_mode[])))
                  OR ($2::text='custom' AND COALESCE(vo.source_payload->>'fulfilmentPreferenceSource',vo.source_payload->>'deliveryEligibilitySource','')='vendor')
                )
              ORDER BY vo.updated_at DESC,vo.public_id DESC
              LIMIT $3 OFFSET $4
            )
            SELECT so.offer_id,
                   cv.public_id AS canonical_variant_id,
                   COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
                   so.vendor_sku,
                   ARRAY(SELECT mode::text FROM unnest(so.fulfilment_modes) AS mode) AS fulfilment_modes,
                   so.explicit_vendor_choice
            FROM selected_offers so
            JOIN public.canonical_variants cv ON cv.id=so.canonical_variant_id
            LEFT JOIN public.product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
            LEFT JOIN public.product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
            ORDER BY so.updated_at DESC,so.offer_id DESC
          `, [id, filter, limit, offset]);

      const products = result.rows.map(mapSetting);
      return {
        products,
        summary,
        filteredTotal,
        limit,
        offset,
        hasMore: offset + products.length < filteredTotal,
        hasPrevious: offset > 0
      };
    },
    { readOnly: true }
  );
}

export async function setVendorProductFulfilmentPreference(
  principal: SessionPrincipal,
  input: FulfilmentPreference & Readonly<{ offerId: string }>
): Promise<Readonly<{ ok: true; offerId: string; deliveryEligible: boolean; pickupEligible: boolean; fulfilmentModes: readonly string[] }>> {
  if (!postgresVendorRuntimeEnabled()) throw new Error("Η αλλαγή τρόπου διάθεσης απαιτεί ενεργή βάση δεδομένων.");
  const offerId = input.offerId?.trim();
  if (!offerId) throw new Error("Απαιτείται προϊόν.");
  validatePreference(input);
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
      if (found.rowCount !== 1) throw new Error("Δεν έχετε πρόσβαση στις ρυθμίσεις διάθεσης αυτού του προϊόντος.");

      const modes = new Set(modesFromRow(found.rows[0]?.fulfilment_modes));
      if (input.pickupEligible) modes.add("pickup");
      else modes.delete("pickup");
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
              'deliveryEligibility',$4::text,
              'deliveryEligibilitySource','vendor',
              'deliveryEligibilityChannel',$5::text,
              'deliveryEligibilityUpdatedAt',to_jsonb(now()),
              'pickupEligibility',$6::boolean,
              'fulfilmentPreferenceSource','vendor',
              'fulfilmentPreferenceUpdatedAt',to_jsonb(now())
            ),
            updated_at=now()
        WHERE id=$1::uuid
          AND vendor_id=(SELECT id FROM public.vendor_businesses WHERE public_id=$2 OR id::text=$2 LIMIT 1)
        RETURNING public_id
      `, [String(found.rows[0]?.offer_uuid ?? ""), id, fulfilmentModes, preferenceLabel(input), input.source ?? "products", input.pickupEligible]);
      if (changed.rowCount !== 1) throw new Error("Η αλλαγή τρόπου διάθεσης δεν αποθηκεύτηκε.");
      return { ok: true, offerId, deliveryEligible: input.deliveryEligible, pickupEligible: input.pickupEligible, fulfilmentModes };
    },
    { isolation: "serializable" }
  );
}

export async function setVendorProductFulfilmentBulk(
  principal: SessionPrincipal,
  input: FulfilmentPreference & Readonly<{ offerIds?: readonly string[]; applyToAll?: boolean }>
): Promise<Readonly<{ ok: true; updatedCount: number; deliveryEligible: boolean; pickupEligible: boolean }>> {
  if (!postgresVendorRuntimeEnabled()) throw new Error("Η μαζική αλλαγή τρόπου διάθεσης απαιτεί ενεργή βάση δεδομένων.");
  validatePreference(input);
  const id = vendorId(principal);
  const applyToAll = input.applyToAll === true;
  const offerIds = [...new Set((input.offerIds ?? []).map((value) => value.trim()).filter(Boolean))];
  if (!applyToAll && offerIds.length === 0) throw new Error("Επίλεξε τουλάχιστον ένα προϊόν.");
  if (!applyToAll && offerIds.length > 5_000) throw new Error("Η μαζική αλλαγή υποστηρίζει έως 5.000 επιλεγμένα προϊόντα κάθε φορά.");

  return unitOfWork().withTransaction(
    { actorUserId: principal.userId, vendorId: id, marketId: "sparta" },
    async (tx) => {
      const changed = await tx.query<SqlRow>(`
        UPDATE public.vendor_offers vo
        SET fulfilment_modes=(
              array_remove(
                array_remove(COALESCE(vo.fulfilment_modes,ARRAY[]::public.fulfilment_mode[]),'pickup'::public.fulfilment_mode),
                'local_delivery'::public.fulfilment_mode
              )
              || CASE WHEN $3::boolean THEN ARRAY['pickup'::public.fulfilment_mode] ELSE ARRAY[]::public.fulfilment_mode[] END
              || CASE WHEN $4::boolean THEN ARRAY['local_delivery'::public.fulfilment_mode] ELSE ARRAY[]::public.fulfilment_mode[] END
            ),
            source_payload=COALESCE(vo.source_payload,'{}'::jsonb)||jsonb_build_object(
              'deliveryEligibility',$5::text,
              'deliveryEligibilitySource','vendor',
              'deliveryEligibilityChannel',$6::text,
              'deliveryEligibilityUpdatedAt',to_jsonb(now()),
              'pickupEligibility',$3::boolean,
              'fulfilmentPreferenceSource','vendor',
              'fulfilmentPreferenceUpdatedAt',to_jsonb(now())
            ),
            updated_at=now()
        WHERE vo.vendor_id=(SELECT id FROM public.vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)
          AND vo.status <> 'rejected'
          AND ($2::boolean OR vo.public_id=ANY($7::text[]))
        RETURNING vo.public_id
      `, [id, applyToAll, input.pickupEligible, input.deliveryEligible, preferenceLabel(input), input.source ?? "products", offerIds]);
      if (!applyToAll && changed.rowCount !== offerIds.length) {
        throw new Error("Κάποια από τα επιλεγμένα προϊόντα δεν είναι πλέον διαθέσιμα για αλλαγή.");
      }
      return { ok: true, updatedCount: changed.rowCount, deliveryEligible: input.deliveryEligible, pickupEligible: input.pickupEligible };
    },
    { isolation: "serializable" }
  );
}

export async function setVendorProductDeliveryEligibility(
  principal: SessionPrincipal,
  input: Readonly<{ offerId: string; deliveryEligible: boolean; source?: "products" | "quickadd" }>
): Promise<Readonly<{ ok: true; offerId: string; deliveryEligible: boolean; fulfilmentModes: readonly string[] }>> {
  const result = await setVendorProductFulfilmentPreference(principal, {
    offerId: input.offerId,
    deliveryEligible: input.deliveryEligible,
    pickupEligible: true,
    source: input.source
  });
  return { ok: true, offerId: result.offerId, deliveryEligible: result.deliveryEligible, fulfilmentModes: result.fulfilmentModes };
}
