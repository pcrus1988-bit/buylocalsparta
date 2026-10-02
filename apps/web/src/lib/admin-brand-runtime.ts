import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { brandGuideQualityScore, parseBrandGuide, type BrandGuideContent, type BrandGuideStatus } from "./brand-guide";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type AdminBrandRecord = Readonly<{
  id: string;
  name: string;
  normalizedName: string;
  publicSlug: string;
  website?: string;
  logoObjectKey?: string;
  logoExternalUrl?: string;
  countryCode?: string;
  description?: string;
  status: string;
  products: number;
  guide: BrandGuideContent;
  guideQualityScore: number;
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
  totalBrands: number;
  withLogo: number;
  missingLogo: number;
  filteredTotal: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  brands: readonly AdminBrandRecord[];
}>;

type BrandRow = SqlRow & Readonly<{
  id?: unknown;
  name?: unknown;
  normalized_name?: unknown;
  public_slug?: unknown;
  website?: unknown;
  logo_object_key?: unknown;
  country_code?: unknown;
  description?: unknown;
  status?: unknown;
  products?: unknown;
  metadata?: unknown;
  total_brands?: unknown;
  with_logo?: unknown;
  filtered_total?: unknown;
}>;

type BrandIdentityRow = SqlRow & Readonly<{
  id?: unknown;
  name?: unknown;
  normalized_name?: unknown;
  public_slug?: unknown;
  website?: unknown;
  logo_object_key?: unknown;
  country_code?: unknown;
  description?: unknown;
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
  const guide = parseBrandGuide(metadata);
  const products = productCount(row.products);
  const website = optionalString(row.website);
  const logoObjectKey = optionalString(row.logo_object_key);
  const logoExternalUrl = optionalString(metadata.logo_external_url);
  const countryCode = optionalString(row.country_code);
  const description = optionalString(row.description);
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    normalizedName: String(row.normalized_name ?? ""),
    publicSlug: String(row.public_slug ?? ""),
    website,
    logoObjectKey,
    logoExternalUrl,
    countryCode,
    description,
    status: String(row.status ?? "unknown"),
    products,
    guide,
    guideQualityScore: brandGuideQualityScore({
      guide,
      description,
      countryCode,
      website,
      hasLogo: Boolean(logoObjectKey || logoExternalUrl),
      liveProductCount: products
    }),
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

export async function adminBrandWorkspace(
  principal: SessionPrincipal,
  options: Readonly<{
    q?: string;
    coverage?: "all" | "with_logo" | "missing_logo";
    guide?: "all" | BrandGuideStatus;
    limit?: number;
    offset?: number;
  }> = {}
): Promise<AdminBrandWorkspace> {
  assertAdminPermission(principal, "catalog.read");
  const limit = Math.max(12, Math.min(60, Math.trunc(options.limit ?? 30)));
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const query = options.q?.trim().slice(0, 120) || undefined;
  const coverage = options.coverage === "with_logo" || options.coverage === "missing_logo" ? options.coverage : undefined;
  const guideFilter = options.guide && options.guide !== "all" ? options.guide : undefined;
  if (!postgresAdminRuntimeEnabled()) {
    return {
      csrfToken: principal.csrfToken,
      databaseBacked: false,
      totalBrands: 0,
      withLogo: 0,
      missingLogo: 0,
      filteredTotal: 0,
      offset,
      limit,
      hasMore: false,
      brands: []
    };
  }

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
      ),
      brand_usage AS (
        SELECT brand_id, COUNT(*)::int AS products
          FROM used_brand_families
         GROUP BY brand_id
      ),
      base AS MATERIALIZED (
        SELECT b.id,
               b.name,
               b.normalized_name,
               b.public_slug,
               b.website,
               b.logo_object_key,
               b.country_code,
               b.description,
               b.status,
               b.metadata,
               u.products
          FROM brands b
          JOIN brand_usage u ON u.brand_id = b.id
      ),
      stats AS (
        SELECT COUNT(*)::int AS total_brands,
               COUNT(*) FILTER (WHERE NULLIF(logo_object_key,'') IS NOT NULL OR NULLIF(metadata->>'logo_external_url','') IS NOT NULL)::int AS with_logo
          FROM base
      ),
      filtered AS (
        SELECT *
          FROM base
         WHERE (
           $1::text IS NULL
           OR name ILIKE '%' || $1 || '%'
           OR normalized_name ILIKE '%' || $1 || '%'
           OR public_slug ILIKE '%' || $1 || '%'
           OR COALESCE(website,'') ILIKE '%' || $1 || '%'
           OR COALESCE(metadata->>'logo_source_domain','') ILIKE '%' || $1 || '%'
         )
           AND (
             $2::text IS NULL
             OR ($2 = 'with_logo' AND (NULLIF(logo_object_key,'') IS NOT NULL OR NULLIF(metadata->>'logo_external_url','') IS NOT NULL))
             OR ($2 = 'missing_logo' AND NULLIF(logo_object_key,'') IS NULL AND NULLIF(metadata->>'logo_external_url','') IS NULL)
           )
           AND (
             $3::text IS NULL
             OR COALESCE(metadata->'brand_guide'->>'status', 'empty') = $3
           )
      ),
      page AS (
        SELECT *
          FROM filtered
         ORDER BY products DESC, LOWER(name), id
         LIMIT $4::integer OFFSET $5::integer
      )
      SELECT p.*,
             s.total_brands,
             s.with_logo,
             (SELECT COUNT(*)::int FROM filtered) AS filtered_total
        FROM stats s
        LEFT JOIN page p ON TRUE
       ORDER BY p.products DESC NULLS LAST, LOWER(p.name) NULLS LAST, p.id
    `, [query ?? null, coverage ?? null, guideFilter ?? null, limit, offset]);

    const meta = result.rows[0] ?? {};
    const totalBrands = productCount(meta.total_brands);
    const withLogo = productCount(meta.with_logo);
    const filteredTotal = productCount(meta.filtered_total);
    const brands = result.rows.filter((row) => Boolean(row.id)).map(mapBrand);
    return {
      csrfToken: principal.csrfToken,
      databaseBacked: true,
      totalBrands,
      withLogo,
      missingLogo: Math.max(0, totalBrands - withLogo),
      filteredTotal,
      offset,
      limit,
      hasMore: offset + brands.length < filteredTotal,
      brands
    };
  }, { readOnly: true });
}

export async function adminBrandIdentity(principal: SessionPrincipal, brandId: string) {
  assertAdminPermission(principal, "catalog.write");
  const runtime = requirePostgres();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<BrandIdentityRow>(
      "SELECT id,name,normalized_name,public_slug,website,logo_object_key,country_code,description,metadata FROM brands WHERE id=$1::uuid LIMIT 1",
      [brandId]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Brand not found");
    return {
      id: String(row.id),
      name: String(row.name ?? ""),
      normalizedName: String(row.normalized_name ?? ""),
      publicSlug: String(row.public_slug ?? ""),
      website: optionalString(row.website),
      logoObjectKey: optionalString(row.logo_object_key),
      countryCode: optionalString(row.country_code),
      description: optionalString(row.description),
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

async function updateBrandGuideMetadata(
  principal: SessionPrincipal,
  brandId: string,
  guidePatch: Record<string, unknown>,
  fields?: Readonly<{ description?: string; countryCode?: string }>
): Promise<void> {
  assertAdminPermission(principal, "catalog.write");
  const runtime = requirePostgres();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query(
      `UPDATE brands
          SET description = CASE WHEN $4::boolean THEN NULLIF($2::text, '') ELSE description END,
              country_code = CASE WHEN $5::boolean THEN NULLIF($3::text, '')::char(2) ELSE country_code END,
              metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{brand_guide}',
                COALESCE(metadata->'brand_guide', '{}'::jsonb) || $6::jsonb,
                true
              ),
              updated_at = NOW()
        WHERE id = $1::uuid`,
      [
        brandId,
        fields?.description ?? "",
        fields?.countryCode ?? "",
        fields ? Object.prototype.hasOwnProperty.call(fields, "description") : false,
        fields ? Object.prototype.hasOwnProperty.call(fields, "countryCode") : false,
        JSON.stringify(guidePatch)
      ]
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

export async function adminUpdateBrandGuide(principal: SessionPrincipal, input: Readonly<{
  brandId: string;
  description?: string;
  countryCode?: string;
  guidePatch: Record<string, unknown>;
}>): Promise<void> {
  await updateBrandGuideMetadata(principal, input.brandId, input.guidePatch, {
    description: input.description ?? "",
    countryCode: input.countryCode ?? ""
  });
}

export async function adminQueueBrandGuideEnrichment(principal: SessionPrincipal, brandId: string): Promise<void> {
  await updateBrandGuideMetadata(principal, brandId, {
    agent_status: "queued",
    agent_requested_at: new Date().toISOString(),
    agent_last_error: null
  });
}

export async function adminBrandGuideAgentQueue(principal: SessionPrincipal, limit = 100): Promise<readonly Readonly<{
  id: string;
  name: string;
  publicSlug: string;
  website?: string;
}>[]> {
  assertAdminPermission(principal, "catalog.read");
  const runtime = requirePostgres();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<BrandRow>(`
      SELECT id,name,public_slug,website,metadata
      FROM brands
      WHERE status='active'
        AND metadata->'brand_guide'->>'agent_status'='queued'
      ORDER BY COALESCE((metadata->'brand_guide'->>'agent_requested_at')::timestamptz, updated_at), id
      LIMIT $1::integer
    `, [Math.max(1, Math.min(500, Math.trunc(limit)))]);
    return result.rows.map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      publicSlug: String(row.public_slug ?? ""),
      website: optionalString(row.website)
    }));
  }, { readOnly: true });
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
    logo_external_url: null,
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
    logo_external_url: null,
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
