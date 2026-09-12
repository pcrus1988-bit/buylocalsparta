import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type AdminBrandRecord = Readonly<{
  id: string;
  name: string;
  normalizedName: string;
  website?: string;
  logoObjectKey?: string;
  status: string;
  products: number;
  sourceUrl?: string;
  sourceDomain?: string;
  sourceType?: string;
  sourcePage?: string;
  sourceDiscovery?: string;
  verifiedAt?: string;
  enrichmentStatus?: string;
  enrichmentReason?: string;
}>;

export type AdminBrandWorkspace = Readonly<{
  csrfToken: string;
  databaseBacked: boolean;
  brands: readonly AdminBrandRecord[];
}>;

type BrandRow = SqlRow & Readonly<{
  id?: unknown;
  name?: unknown;
  normalized_name?: unknown;
  website?: unknown;
  logo_object_key?: unknown;
  status?: unknown;
  products?: unknown;
  metadata?: unknown;
}>;

type BrandIdentityRow = SqlRow & Readonly<{
  id?: unknown;
  name?: unknown;
  normalized_name?: unknown;
  website?: unknown;
  logo_object_key?: unknown;
  metadata?: unknown;
}>;

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function metadataObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* malformed legacy metadata is treated as empty */ }
  }
  return {};
}

function productCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function mapBrand(row: BrandRow): AdminBrandRecord {
  const metadata = metadataObject(row.metadata);
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    normalizedName: String(row.normalized_name ?? ""),
    website: optionalString(row.website),
    logoObjectKey: optionalString(row.logo_object_key),
    status: String(row.status ?? "unknown"),
    products: productCount(row.products),
    sourceUrl: optionalString(metadata.logo_source_url),
    sourceDomain: optionalString(metadata.logo_source_domain),
    sourceType: optionalString(metadata.logo_source_type),
    sourcePage: optionalString(metadata.logo_source_page),
    sourceDiscovery: optionalString(metadata.logo_source_discovery),
    verifiedAt: optionalString(metadata.logo_verified_at),
    enrichmentStatus: optionalString(metadata.logo_enrichment_status),
    enrichmentReason: optionalString(metadata.logo_enrichment_reason)
  };
}

function requirePostgres(): ReturnType<typeof getProductionPostgresRuntime> {
  if (!postgresAdminRuntimeEnabled()) throw new Error("Brand management requires the PostgreSQL runtime");
  return getProductionPostgresRuntime();
}

export async function adminBrandWorkspace(principal: SessionPrincipal): Promise<AdminBrandWorkspace> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) return { csrfToken: principal.csrfToken, databaseBacked: false, brands: [] };

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<BrandRow>(`
      WITH used_brand_families AS (
        SELECT pf.brand_id, pf.id AS family_id
          FROM product_families pf
         WHERE pf.active = TRUE
           AND pf.brand_id IS NOT NULL
        UNION
        SELECT cv.brand_id, cv.family_id
          FROM canonical_variants cv
         WHERE cv.active = TRUE
           AND COALESCE(cv.suppressed, FALSE) = FALSE
           AND COALESCE(cv.recalled, FALSE) = FALSE
           AND cv.brand_id IS NOT NULL
      )
      SELECT b.id,
             b.name,
             b.normalized_name,
             b.website,
             b.logo_object_key,
             b.status,
             b.metadata,
             COUNT(ubf.family_id)::int AS products
        FROM brands b
        JOIN used_brand_families ubf ON ubf.brand_id = b.id
       GROUP BY b.id, b.name, b.normalized_name, b.website, b.logo_object_key, b.status, b.metadata
       ORDER BY COUNT(ubf.family_id) DESC, LOWER(b.name), b.id
    `);
    return {
      csrfToken: principal.csrfToken,
      databaseBacked: true,
      brands: result.rows.map(mapBrand)
    };
  }, { readOnly: true });
}

export async function adminBrandIdentity(principal: SessionPrincipal, brandId: string) {
  assertAdminPermission(principal, "catalog.write");
  const runtime = requirePostgres();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<BrandIdentityRow>(
      "SELECT id,name,normalized_name,website,logo_object_key,metadata FROM brands WHERE id=$1::uuid LIMIT 1",
      [brandId]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Brand not found");
    return {
      id: String(row.id),
      name: String(row.name ?? ""),
      normalizedName: String(row.normalized_name ?? ""),
      website: optionalString(row.website),
      logoObjectKey: optionalString(row.logo_object_key),
      metadata: metadataObject(row.metadata)
    } as const;
  }, { readOnly: true });
}

async function updateMetadata(principal: SessionPrincipal, brandId: string, patch: Record<string, unknown>, extraSql = "", params: readonly unknown[] = []): Promise<void> {
  assertAdminPermission(principal, "catalog.write");
  const runtime = requirePostgres();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query(
      `UPDATE brands
          SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
              updated_at = NOW()
              ${extraSql}
        WHERE id = $1::uuid`,
      [brandId, JSON.stringify(patch), ...params]
    );
    if (result.rowCount !== 1) throw new Error("Brand not found");
  });
}

export async function adminUpdateBrandWebsite(principal: SessionPrincipal, brandId: string, website?: string): Promise<void> {
  assertAdminPermission(principal, "catalog.write");
  const runtime = requirePostgres();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query(
      "UPDATE brands SET website=$2,updated_at=NOW() WHERE id=$1::uuid",
      [brandId, website ?? null]
    );
    if (result.rowCount !== 1) throw new Error("Brand not found");
  });
}

export async function adminQueueBrandEnrichment(principal: SessionPrincipal, brandId: string): Promise<void> {
  await updateMetadata(principal, brandId, {
    logo_enrichment_status: "pending",
    logo_enrichment_reason: "admin_retry_requested",
    logo_checked_at: null,
    logo_retry_requested_at: new Date().toISOString()
  });
}

export async function adminRemoveBrandLogo(principal: SessionPrincipal, brandId: string): Promise<void> {
  await updateMetadata(principal, brandId, {
    logo_enrichment_status: "pending",
    logo_enrichment_reason: "removed_by_admin",
    logo_removed_at: new Date().toISOString()
  }, ", logo_object_key = NULL");
}

export async function adminSetBrandLogo(principal: SessionPrincipal, input: {
  brandId: string;
  objectKey: string;
  sourceUrl?: string;
  sourceType: string;
  sha256: string;
}): Promise<void> {
  const source = input.sourceUrl ? new URL(input.sourceUrl) : undefined;
  await updateMetadata(principal, input.brandId, {
    logo_source_url: source?.toString() ?? null,
    logo_source_domain: source?.hostname ?? null,
    logo_source_type: input.sourceType,
    logo_source_discovery: "admin_upload",
    logo_verified_at: new Date().toISOString(),
    logo_sha256: input.sha256,
    logo_enrichment_status: "complete",
    logo_enrichment_reason: null
  }, ", logo_object_key = $3", [input.objectKey]);
}
