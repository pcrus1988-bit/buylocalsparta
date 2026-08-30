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
  demoMode: boolean;
  vendorStatus: string;
  updatedAt: number;
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

export async function vendorAssignedCatalogueWorkspace(principal: SessionPrincipal): Promise<readonly VendorAssignedCatalogueProduct[]> {
  if (!postgresVendorRuntimeEnabled()) return [];
  const vendorId = requiredVendorId(principal);
  return unitOfWork().withTransaction(vendorScope(principal), async (tx) => {
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
      LIMIT 2500
    `, [vendorId]);
    return result.rows.map((row) => {
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
        demoMode: row.demo_mode === true,
        vendorStatus: text(row.vendor_status, "vendor status"),
        updatedAt: epoch(row.updated_at)
      };
    });
  }, { readOnly: true, statementTimeoutMs: 12_000 });
}

export async function confirmVendorAssignedCatalogueEvidence(
  principal: SessionPrincipal,
  input: Readonly<{ assortmentId: string; supplierPriceMinor?: number; stockOnHand?: number; stockUnavailable?: boolean }>
): Promise<{ ok: true; priceConfirmed: boolean; stockConfirmed: boolean }> {
  if (!postgresVendorRuntimeEnabled()) throw new Error("Assigned catalogue review requires the PostgreSQL vendor runtime");
  const vendorId = requiredVendorId(principal);
  const assortmentId = input.assortmentId.trim();
  if (!assortmentId) throw new Error("Assigned product is required");
  const hasPrice = input.supplierPriceMinor !== undefined;
  const hasStock = input.stockOnHand !== undefined || input.stockUnavailable === true;
  if (!hasPrice && !hasStock) throw new Error("Enter a supplier price or physical stock confirmation");
  if (hasPrice && (!Number.isSafeInteger(input.supplierPriceMinor) || Number(input.supplierPriceMinor) < 0 || Number(input.supplierPriceMinor) > 100_000_000_00)) {
    throw new Error("Supplier price must be a non-negative amount in cents");
  }
  if (input.stockOnHand !== undefined && (!Number.isSafeInteger(input.stockOnHand) || input.stockOnHand < 0 || input.stockOnHand > 1_000_000)) {
    throw new Error("Physical stock must be a non-negative whole number");
  }
  if (input.stockUnavailable && input.stockOnHand !== undefined) throw new Error("Choose either a physical stock quantity or unavailable");

  await unitOfWork().withTransaction(vendorScope(principal), async (tx) => {
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
  }, { isolation: "serializable" });
  return { ok: true, priceConfirmed: hasPrice, stockConfirmed: hasStock };
}
