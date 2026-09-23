import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, formatMoney, money, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";

export type VendorAssignedCatalogueProduct = Readonly<{
  id: string;
  title: string;
  vendorSku?: string;
  brand?: string;
  model?: string;
  sourceName: string;
  sourceCode: string;
  assortmentStatus: string;
  availabilityMode: string;
  canonicalVariantId?: string;
  sourcePriceMinor?: number;
  sourcePrice?: string;
  sourcePriceKind?: string;
  verifiedSupplierPriceMinor?: number;
  verifiedSupplierPrice?: string;
  verifiedStockOnHand?: number;
  priceCheckStatus: "pending" | "confirmed" | "rejected";
  stockCheckStatus: "pending" | "confirmed" | "unavailable";
  offerId?: string;
  offerStatus?: string;
  activationRequestStatus?: string;
  activationReady: boolean;
  demoMode: boolean;
  vendorStatus: string;
  updatedAt: number;
}>;

export type VendorAssignedCatalogueWorkspace = Readonly<{
  products: readonly VendorAssignedCatalogueProduct[];
  totalAssigned: number;
  pendingPrice: number;
  pendingStock: number;
  canonicalMatched: number;
  offset: number;
  limit: number;
}>;

function requiredVendorId(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

function vendorScope(principal: SessionPrincipal) {
  return { actorUserId: principal.userId, vendorId: requiredVendorId(principal), marketId: "sparta" } as const;
}

function unitOfWork() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 12_000, lockTimeoutMs: 3_000 });
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.length) throw new Error(`Invalid ${field}`);
  return value;
}
function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.length ? value : undefined; }
function integer(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid ${field}`);
  return parsed;
}
function optionalInteger(value: unknown): number | undefined { return value == null ? undefined : integer(value, "integer"); }
function epoch(value: unknown): number {
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(parsed)) throw new Error("Invalid timestamp");
  return parsed;
}
const euro = (minor: number) => formatMoney(money(minor, "EUR"));

export async function vendorAssignedCatalogueWorkspace(
  principal: SessionPrincipal,
  input: Readonly<{ offset?: number; limit?: number }> = {}
): Promise<VendorAssignedCatalogueWorkspace> {
  const limit = Number.isSafeInteger(input.limit) ? Math.max(1, Math.min(100, Number(input.limit))) : 40;
  const offset = Number.isSafeInteger(input.offset) ? Math.max(0, Number(input.offset)) : 0;
  if (!postgresVendorRuntimeEnabled()) return { products: [], totalAssigned: 0, pendingPrice: 0, pendingStock: 0, canonicalMatched: 0, offset, limit };
  const vendorId = requiredVendorId(principal);
  return unitOfWork().withTransaction(vendorScope(principal), async (tx) => {
    const summary = await tx.query<SqlRow>(`
      SELECT count(*)::integer AS total_assigned,
             count(*) FILTER (WHERE vca.price_check_status='pending')::integer AS pending_price,
             count(*) FILTER (WHERE vca.stock_check_status='pending')::integer AS pending_stock,
             count(*) FILTER (
               WHERE vca.canonical_variant_id IS NOT NULL
                  OR EXISTS (
                    SELECT 1 FROM public.catalog_source_product_links l
                    WHERE l.source_product_id=vca.source_product_id AND l.link_status='approved'
                  )
             )::integer AS canonical_matched
      FROM public.vendor_catalog_assortments vca
      JOIN public.vendor_businesses vb ON vb.id=vca.vendor_id
      WHERE vca.vendor_id=(SELECT id FROM public.vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)
        AND vca.source_product_id IS NOT NULL
        AND vca.assortment_status NOT IN ('rejected','discontinued')
        AND (vb.demo_mode=true OR vb.status='active')
    `, [vendorId]);

    const result = await tx.query<SqlRow>(`
      SELECT vca.public_id,
             sp.title,
             COALESCE(vca.vendor_sku,sp.supplier_code) AS vendor_sku,
             NULLIF(sp.source_identity->>'brand','') AS brand,
             COALESCE(
               NULLIF(sp.source_identity->>'model',''),
               NULLIF(sp.source_identity->>'modelName',''),
               NULLIF(sp.normalized_payload->>'modelName','')
             ) AS model,
             cs.name AS source_name,
             cs.code AS source_code,
             vca.assortment_status,
             vca.availability_mode,
             COALESCE(own_cv.public_id,linked_cv.public_id) AS canonical_variant_id,
             latest_price.amount_minor AS source_price_minor,
             latest_price.price_kind AS source_price_kind,
             vca.verified_supplier_price_minor,
             vca.verified_stock_on_hand,
             vca.price_check_status,
             vca.stock_check_status,
             current_offer.public_id AS offer_id,
             current_offer.status::text AS offer_status,
             activation_request.status AS activation_request_status,
             vb.demo_mode,
             vb.status::text AS vendor_status,
             vca.updated_at
      FROM public.vendor_catalog_assortments vca
      JOIN public.vendor_businesses vb ON vb.id=vca.vendor_id
      JOIN public.catalog_source_products sp ON sp.id=vca.source_product_id
      JOIN public.catalog_sources cs ON cs.id=sp.source_id
      LEFT JOIN public.canonical_variants own_cv ON own_cv.id=vca.canonical_variant_id
      LEFT JOIN LATERAL (
        SELECT l.canonical_variant_id
        FROM public.catalog_source_product_links l
        WHERE l.source_product_id=sp.id AND l.link_status='approved'
        ORDER BY l.reviewed_at DESC NULLS LAST,l.created_at DESC,l.id DESC
        LIMIT 1
      ) approved_link ON true
      LEFT JOIN public.canonical_variants linked_cv ON linked_cv.id=approved_link.canonical_variant_id
      LEFT JOIN LATERAL (
        SELECT vo.id,vo.public_id,vo.status,vo.updated_at
        FROM public.vendor_offers vo
        WHERE vo.vendor_id=vca.vendor_id
          AND vo.location_id=vca.location_id
          AND vo.canonical_variant_id=COALESCE(vca.canonical_variant_id,approved_link.canonical_variant_id)
        ORDER BY vo.updated_at DESC,vo.created_at DESC
        LIMIT 1
      ) current_offer ON true
      LEFT JOIN LATERAL (
        SELECT r.status
        FROM public.vendor_product_activation_requests r
        WHERE r.offer_id=current_offer.id
        ORDER BY (r.status='pending') DESC,r.requested_at DESC
        LIMIT 1
      ) activation_request ON true
      LEFT JOIN LATERAL (
        SELECT po.amount_minor,po.price_kind
        FROM public.catalog_price_observations po
        WHERE po.source_product_id=sp.id
          AND po.observation_status IN ('observed','review_required','conflict')
        ORDER BY po.observed_at DESC NULLS LAST,po.created_at DESC,po.id DESC
        LIMIT 1
      ) latest_price ON true
      WHERE vca.vendor_id=(SELECT id FROM public.vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)
        AND vca.source_product_id IS NOT NULL
        AND vca.assortment_status NOT IN ('rejected','discontinued')
        AND (vb.demo_mode=true OR vb.status='active')
      ORDER BY
        (vca.price_check_status='pending' OR vca.stock_check_status='pending') DESC,
        vca.updated_at DESC,
        sp.title,
        vca.id
      LIMIT $2 OFFSET $3
    `, [vendorId, limit, offset]);

    const products = result.rows.map((row) => {
      const sourcePriceMinor = optionalInteger(row.source_price_minor);
      const verifiedSupplierPriceMinor = optionalInteger(row.verified_supplier_price_minor);
      const priceCheckStatus = text(row.price_check_status, "price check status");
      const stockCheckStatus = text(row.stock_check_status, "stock check status");
      if (!["pending", "confirmed", "rejected"].includes(priceCheckStatus)) throw new Error("Invalid assigned-catalogue price status");
      if (!["pending", "confirmed", "unavailable"].includes(stockCheckStatus)) throw new Error("Invalid assigned-catalogue stock status");
      return {
        id: text(row.public_id, "assortment public id"),
        title: text(row.title, "title"),
        vendorSku: optionalText(row.vendor_sku),
        brand: optionalText(row.brand),
        model: optionalText(row.model),
        sourceName: text(row.source_name, "source name"),
        sourceCode: text(row.source_code, "source code"),
        assortmentStatus: text(row.assortment_status, "assortment status"),
        availabilityMode: text(row.availability_mode, "availability mode"),
        canonicalVariantId: optionalText(row.canonical_variant_id),
        sourcePriceMinor,
        sourcePrice: sourcePriceMinor === undefined ? undefined : euro(sourcePriceMinor),
        sourcePriceKind: optionalText(row.source_price_kind),
        verifiedSupplierPriceMinor,
        verifiedSupplierPrice: verifiedSupplierPriceMinor === undefined ? undefined : euro(verifiedSupplierPriceMinor),
        verifiedStockOnHand: optionalInteger(row.verified_stock_on_hand),
        priceCheckStatus: priceCheckStatus as VendorAssignedCatalogueProduct["priceCheckStatus"],
        stockCheckStatus: stockCheckStatus as VendorAssignedCatalogueProduct["stockCheckStatus"],
        offerId: optionalText(row.offer_id),
        offerStatus: optionalText(row.offer_status),
        activationRequestStatus: optionalText(row.activation_request_status),
        activationReady:
          priceCheckStatus === "confirmed"
          && stockCheckStatus === "confirmed"
          && (optionalInteger(row.verified_stock_on_hand) ?? 0) > 0
          && Boolean(optionalText(row.canonical_variant_id))
          && optionalText(row.offer_status) === "draft"
          && optionalText(row.activation_request_status) !== "pending",
        demoMode: row.demo_mode === true,
        vendorStatus: text(row.vendor_status, "vendor status"),
        updatedAt: epoch(row.updated_at)
      } satisfies VendorAssignedCatalogueProduct;
    });
    const row = summary.rows[0] ?? {};
    return {
      products,
      totalAssigned: integer(row.total_assigned ?? 0, "total assigned"),
      pendingPrice: integer(row.pending_price ?? 0, "pending price"),
      pendingStock: integer(row.pending_stock ?? 0, "pending stock"),
      canonicalMatched: integer(row.canonical_matched ?? 0, "canonical matched"),
      offset,
      limit
    };
  }, { readOnly: true, statementTimeoutMs: 12_000 });
}

export async function confirmVendorAssignedCatalogueEvidence(
  principal: SessionPrincipal,
  input: Readonly<{ assortmentId: string; supplierPriceMinor?: number; stockOnHand?: number; stockUnavailable?: boolean }>
): Promise<{ ok: true; priceConfirmed: boolean; stockConfirmed: boolean; offerId?: string; activationReady: boolean }> {
  if (!postgresVendorRuntimeEnabled()) throw new Error("Assigned catalogue review requires the PostgreSQL vendor runtime");
  const vendorId = requiredVendorId(principal);
  const assortmentId = input.assortmentId.trim();
  if (!assortmentId) throw new Error("Assigned product is required");
  const hasPrice = input.supplierPriceMinor !== undefined;
  const hasStock = input.stockOnHand !== undefined || input.stockUnavailable === true;
  if (!hasPrice && !hasStock) throw new Error("Enter a supplier price or physical stock confirmation");
  if (hasPrice && (!Number.isSafeInteger(input.supplierPriceMinor) || Number(input.supplierPriceMinor) < 0 || Number(input.supplierPriceMinor) > 10_000_000_000)) {
    throw new Error("Supplier price must be a non-negative amount in cents");
  }
  if (input.stockOnHand !== undefined && (!Number.isSafeInteger(input.stockOnHand) || input.stockOnHand < 0 || input.stockOnHand > 1_000_000)) {
    throw new Error("Physical stock must be a non-negative whole number");
  }
  if (input.stockUnavailable && input.stockOnHand !== undefined) throw new Error("Choose either a physical stock quantity or unavailable");

  return unitOfWork().withTransaction(vendorScope(principal), async (tx) => {
    const changed = await tx.query<SqlRow>(`
      UPDATE public.vendor_catalog_assortments vca
      SET verified_supplier_price_minor=CASE WHEN $3::boolean THEN $4::bigint ELSE verified_supplier_price_minor END,
          price_check_status=CASE WHEN $3::boolean THEN 'confirmed' ELSE price_check_status END,
          price_checked_by=CASE WHEN $3::boolean THEN NULLIF(current_setting('app.actor_user_id',true),'')::uuid ELSE price_checked_by END,
          price_checked_at=CASE WHEN $3::boolean THEN now() ELSE price_checked_at END,
          verified_stock_on_hand=CASE WHEN $5::boolean THEN $6::integer WHEN $7::boolean THEN NULL ELSE verified_stock_on_hand END,
          stock_check_status=CASE WHEN $5::boolean THEN 'confirmed' WHEN $7::boolean THEN 'unavailable' ELSE stock_check_status END,
          stock_checked_by=CASE WHEN ($5::boolean OR $7::boolean) THEN NULLIF(current_setting('app.actor_user_id',true),'')::uuid ELSE stock_checked_by END,
          stock_checked_at=CASE WHEN ($5::boolean OR $7::boolean) THEN now() ELSE stock_checked_at END,
          metadata=COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
            'assignedCatalogueEvidenceSource','vendor',
            'assignedCatalogueEvidenceUpdatedAt',now(),
            'evidenceOnly',true
          ),
          updated_at=now()
      FROM public.vendor_businesses vb
      WHERE vca.public_id=$1
        AND vb.id=vca.vendor_id
        AND vca.vendor_id=(SELECT id FROM public.vendor_businesses WHERE public_id=$2 OR id::text=$2 LIMIT 1)
        AND vca.source_product_id IS NOT NULL
        AND vca.assortment_status NOT IN ('rejected','discontinued')
        AND (vb.demo_mode=true OR vb.status='active')
      RETURNING vca.id::text AS id
    `, [
      assortmentId,
      vendorId,
      hasPrice,
      hasPrice ? input.supplierPriceMinor : null,
      input.stockOnHand !== undefined,
      input.stockOnHand ?? null,
      input.stockUnavailable === true
    ]);
    if (!changed.rowCount) throw new Error("This assigned product is not available for vendor review");

    const state = await tx.query<SqlRow>(`
      SELECT
        vca.id::text AS assortment_uuid,
        vca.vendor_id::text AS vendor_uuid,
        vca.location_id::text AS location_uuid,
        vca.vendor_sku,
        vca.price_check_status,
        vca.stock_check_status,
        vca.verified_supplier_price_minor,
        vca.verified_stock_on_hand,
        COALESCE(vca.canonical_variant_id,approved_link.canonical_variant_id)::text AS canonical_uuid,
        cv.platform_price_minor,
        cv.tax_rate_bps,
        cv.active,
        cv.suppressed,
        cv.recalled,
        vb.demo_mode,
        vb.status::text AS vendor_status
      FROM public.vendor_catalog_assortments vca
      JOIN public.vendor_businesses vb ON vb.id=vca.vendor_id
      LEFT JOIN LATERAL (
        SELECT l.canonical_variant_id
        FROM public.catalog_source_product_links l
        WHERE l.source_product_id=vca.source_product_id AND l.link_status='approved'
        ORDER BY l.reviewed_at DESC NULLS LAST,l.created_at DESC,l.id DESC
        LIMIT 1
      ) approved_link ON true
      LEFT JOIN public.canonical_variants cv ON cv.id=COALESCE(vca.canonical_variant_id,approved_link.canonical_variant_id)
      WHERE vca.id=$1::uuid
      FOR UPDATE OF vca
    `, [text(changed.rows[0].id, "assortment id")]);
    const row = state.rows[0];
    if (!row) throw new Error("Assigned product state could not be resolved");

    const evidenceComplete = row.price_check_status === "confirmed" && row.stock_check_status === "confirmed";
    const canonicalUuid = optionalText(row.canonical_uuid);
    const stockOnHand = optionalInteger(row.verified_stock_on_hand) ?? 0;
    const supplierPriceMinor = optionalInteger(row.verified_supplier_price_minor);
    const referencePriceMinor = optionalInteger(row.platform_price_minor);
    let offerId: string | undefined;
    let activationReady = false;

    if (evidenceComplete && canonicalUuid && supplierPriceMinor !== undefined) {
      if (row.active !== true || row.suppressed === true || row.recalled === true) {
        throw new Error("The matched canonical product is not currently publishable");
      }

      const existing = await tx.query<SqlRow>(`
        SELECT id::text AS id,public_id,status::text AS status,customer_price_minor
        FROM public.vendor_offers
        WHERE vendor_id=$1::uuid AND location_id=$2::uuid AND canonical_variant_id=$3::uuid
        ORDER BY updated_at DESC,created_at DESC
        LIMIT 1
        FOR UPDATE
      `, [row.vendor_uuid,row.location_uuid,canonicalUuid]);

      let offerUuid: string;
      let offerStatus: string;
      if (existing.rows[0]) {
        offerUuid = text(existing.rows[0].id, "offer id");
        offerId = text(existing.rows[0].public_id, "offer public id");
        offerStatus = text(existing.rows[0].status, "offer status");
        if (offerStatus === "draft" || offerStatus === "pending_review" || offerStatus === "approved") {
          await tx.query(`
            UPDATE public.vendor_offers
            SET supplier_unit_price_minor=$2,
                customer_price_minor=CASE
                  WHEN customer_price_minor>0 THEN customer_price_minor
                  WHEN $3::bigint IS NOT NULL AND $3::bigint>0 THEN $3::bigint
                  ELSE customer_price_minor
                END,
                source_payload=COALESCE(source_payload,'{}'::jsonb) || jsonb_build_object(
                  'assignedCatalogueEvidenceConfirmed',true,
                  'assignedCatalogueEvidenceConfirmedAt',now(),
                  'commercialConfirmationRequired',false
                ),
                updated_at=now()
            WHERE id=$1::uuid
          `, [offerUuid,supplierPriceMinor,referencePriceMinor ?? null]);
        }
      } else {
        if (!referencePriceMinor || referencePriceMinor <= 0) {
          throw new Error("A positive customer reference price is required before this assigned product can be prepared for activation");
        }
        offerUuid = randomUUID();
        offerId = `offer_${randomUUID().replaceAll("-", "")}`;
        offerStatus = "draft";
        await tx.query(`
          INSERT INTO public.vendor_offers(
            id,public_id,market_id,vendor_id,location_id,canonical_variant_id,vendor_sku,status,
            supplier_unit_price_minor,customer_price_minor,currency,supplier_tax_rate_bps,
            source_payload,created_at,updated_at
          )
          SELECT
            $1::uuid,$2,vca.market_id,vca.vendor_id,vca.location_id,$3::uuid,vca.vendor_sku,'draft',
            $4,$5,'EUR',$6,
            jsonb_build_object(
              'assignedCatalogueEvidenceConfirmed',true,
              'assignedCatalogueEvidenceConfirmedAt',now(),
              'commercialConfirmationRequired',false,
              'source','assigned_catalogue'
            ),
            now(),now()
          FROM public.vendor_catalog_assortments vca
          WHERE vca.id=$7::uuid
        `, [offerUuid,offerId,canonicalUuid,supplierPriceMinor,referencePriceMinor,integer(row.tax_rate_bps ?? 0, "tax rate"),row.assortment_uuid]);
      }

      if (offerStatus === "draft" || offerStatus === "pending_review" || offerStatus === "approved") {
        await tx.query(`
          INSERT INTO public.inventory_balances(
            offer_id,on_hand,active_reservations,safety_stock,blocked,source,source_confidence,
            stock_confirmed_at,freshness_ttl_seconds,freshness_status,updated_at
          ) VALUES($1::uuid,$2,0,0,0,'manual','merchant_confirmed',now(),86400,'fresh',now())
          ON CONFLICT(offer_id) DO UPDATE SET
            on_hand=GREATEST(inventory_balances.active_reservations,$2),
            source='manual',
            source_confidence='merchant_confirmed',
            stock_confirmed_at=now(),
            freshness_status='fresh',
            updated_at=now()
        `, [offerUuid,stockOnHand]);

        await tx.query(`
          UPDATE public.vendor_catalog_assortments
          SET canonical_variant_id=$2::uuid,
              assortment_status='confirmed',
              availability_mode=CASE WHEN $3::integer>0 THEN 'in_stock' ELSE 'ask_vendor' END,
              confirmation_source='vendor',
              confirmed_at=now(),
              metadata=COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
                'evidenceOnly',false,
                'activationPrepared',true,
                'activationPreparedAt',now(),
                'offerPublicId',$4
              ),
              updated_at=now()
          WHERE id=$1::uuid
        `, [row.assortment_uuid,canonicalUuid,stockOnHand,offerId]);
        activationReady = offerStatus === "draft"
          && stockOnHand > 0
          && row.vendor_status === "active"
          && row.demo_mode !== true;
      }
    }

    return { ok: true, priceConfirmed: hasPrice, stockConfirmed: hasStock, offerId, activationReady };
  }, { isolation: "serializable" });
}
