import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CatalogueVendorOption = Readonly<{
  id: string;
  name: string;
  status: string;
  demoMode: boolean;
  locationId?: string;
  locationName?: string;
}>;

export type CatalogueVendorAssignmentResult = Readonly<{
  snapshotId: string;
  sourceName: string;
  vendorId: string;
  vendorName: string;
  locationId: string;
  locationName: string;
  sourceRows: number;
  newlyAssigned: number;
  alreadyAssigned: number;
}>;

export async function adminCatalogueVendorOptions(principal: SessionPrincipal): Promise<readonly CatalogueVendorOption[]> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) return [];
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT vb.id::text AS vendor_id,
             vb.trading_name,
             vb.status::text AS vendor_status,
             vb.demo_mode,
             vl.id::text AS location_id,
             vl.name AS location_name
      FROM public.vendor_businesses vb
      LEFT JOIN LATERAL (
        SELECT id,name
        FROM public.vendor_locations
        WHERE vendor_id=vb.id AND active=true
        ORDER BY is_primary DESC, created_at ASC, id ASC
        LIMIT 1
      ) vl ON true
      ORDER BY vb.trading_name, vb.id
      LIMIT 1500
    `);
    return result.rows.map((row) => ({
      id: required(row.vendor_id, "vendor.id"),
      name: required(row.trading_name, "vendor.trading_name"),
      status: String(row.vendor_status ?? "unknown"),
      demoMode: row.demo_mode === true,
      locationId: optional(row.location_id),
      locationName: optional(row.location_name)
    }));
  }, { readOnly: true, statementTimeoutMs: 8_000 });
}

export async function assignCatalogueSnapshotToVendor(
  principal: SessionPrincipal,
  input: { snapshotId: string; vendorId: string }
): Promise<CatalogueVendorAssignmentResult> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Postgres catalogue runtime is not enabled");
  const snapshotId = input.snapshotId.trim();
  const vendorId = input.vendorId.trim();
  if (!snapshotId || !vendorId) throw new Error("Snapshot and vendor are required");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 30_000, lockTimeoutMs: 3_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const contextResult = await tx.query<SqlRow>(`
      SELECT ss.id::text AS snapshot_id,
             ss.source_id::text AS source_id,
             s.name AS source_name,
             s.code AS source_code,
             s.market_id::text AS market_id,
             vb.trading_name AS vendor_name,
             vb.market_id::text AS vendor_market_id,
             vl.id::text AS location_id,
             vl.name AS location_name
      FROM public.catalog_source_snapshots ss
      JOIN public.catalog_sources s ON s.id=ss.source_id
      JOIN public.vendor_businesses vb ON vb.id=$2::uuid
      LEFT JOIN LATERAL (
        SELECT id,name
        FROM public.vendor_locations
        WHERE vendor_id=vb.id AND active=true
        ORDER BY is_primary DESC, created_at ASC, id ASC
        LIMIT 1
      ) vl ON true
      WHERE ss.id=$1::uuid
      LIMIT 1
    `, [snapshotId, vendorId]);
    const context = contextResult.rows[0];
    if (!context) throw new Error("Supplier snapshot or vendor was not found");
    const marketId = required(context.market_id, "snapshot.market_id");
    if (required(context.vendor_market_id, "vendor.market_id") !== marketId) throw new Error("Vendor and catalogue source belong to different markets");
    const locationId = optional(context.location_id);
    if (!locationId) throw new Error("Vendor has no active location. Create or activate a vendor location before assigning the catalogue.");

    const countsResult = await tx.query<SqlRow>(`
      SELECT
        count(*)::integer AS source_rows,
        count(vca.id)::integer AS already_assigned
      FROM public.catalog_source_products sp
      LEFT JOIN public.vendor_catalog_assortments vca
        ON vca.vendor_id=$2::uuid
       AND vca.location_id=$3::uuid
       AND vca.source_product_id=sp.id
      WHERE sp.snapshot_id=$1::uuid
    `, [snapshotId, vendorId, locationId]);
    const sourceRows = numberValue(countsResult.rows[0]?.source_rows);
    const alreadyAssigned = numberValue(countsResult.rows[0]?.already_assigned);
    if (sourceRows === 0) throw new Error("This Supplier PIM snapshot contains no source products to assign");

    await tx.query(`
      INSERT INTO public.vendor_catalog_assortments(
        market_id,vendor_id,location_id,source_product_id,canonical_variant_id,
        vendor_sku,assortment_status,availability_mode,confirmation_source,
        metadata,created_at,updated_at
      )
      SELECT
        $4::uuid,$2::uuid,$3::uuid,sp.id,NULL,
        NULLIF(sp.supplier_code,''),'candidate','ask_vendor','import',
        jsonb_build_object(
          'commercialConfirmationRequired',true,
          'vendorWorkspaceAvailable',true,
          'adminConfirmedAt',now(),
          'adminConfirmedBy',$6::text,
          'sourceCode',$5::text,
          'snapshotId',$1::uuid,
          'assignment','bulk_snapshot_v2',
          'assignedBy',$6::text
        ),
        now(),now()
      FROM public.catalog_source_products sp
      WHERE sp.snapshot_id=$1::uuid
      ON CONFLICT (vendor_id,location_id,source_product_id)
        WHERE source_product_id IS NOT NULL
      DO UPDATE
      SET vendor_sku=COALESCE(EXCLUDED.vendor_sku,public.vendor_catalog_assortments.vendor_sku),
          metadata=public.vendor_catalog_assortments.metadata||EXCLUDED.metadata,
          updated_at=now()
    `, [snapshotId, vendorId, locationId, marketId, required(context.source_code, "source.code"), principal.userId]);

    return {
      snapshotId,
      sourceName: required(context.source_name, "source.name"),
      vendorId,
      vendorName: required(context.vendor_name, "vendor.name"),
      locationId,
      locationName: required(context.location_name, "location.name"),
      sourceRows,
      newlyAssigned: Math.max(0, sourceRows - alreadyAssigned),
      alreadyAssigned
    };
  }, { statementTimeoutMs: 30_000 });
}

function required(value: unknown, name: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
}
function optional(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}
function numberValue(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}
