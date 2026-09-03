import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type AdminQuickAddIcecatPreview = Readonly<{
  gtin: string;
  found: boolean;
  status: string;
  productId?: string;
  sourceProductId?: string;
  title?: string;
  description?: string;
  brand?: string;
  model?: string;
  mpn?: string;
  imageUrl?: string;
  categoryLabel?: string;
  qualityStatus?: string;
  greekCompleteness?: number;
  specifications: readonly Readonly<{ name: string; value: string }>[];
}>;

const clean = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const optionalText = (value: unknown): string | undefined => clean(value) || undefined;

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch { return {}; }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function jsonArray(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

function localizedValue(value: unknown): string | undefined {
  if (typeof value === "string") return optionalText(value);
  const record = jsonObject(value);
  return optionalText(record.value) ?? optionalText(record.Value) ?? optionalText(record.text);
}

function firstImage(value: unknown): string | undefined {
  for (const item of jsonArray(value)) {
    const row = jsonObject(item);
    const url = optionalText(row.url) ?? optionalText(row.URL);
    if (url) return url;
  }
  return undefined;
}

function specifications(value: unknown): readonly Readonly<{ name: string; value: string }>[] {
  const output: Array<Readonly<{ name: string; value: string }>> = [];
  for (const item of jsonArray(value)) {
    const row = jsonObject(item);
    const name = localizedValue(row.name) ?? optionalText(row.name);
    const presentation = localizedValue(row.value) ?? optionalText(row.value) ?? optionalText(row.rawValue);
    if (!name || !presentation) continue;
    output.push({ name, value: presentation });
    if (output.length >= 12) break;
  }
  return output;
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function uow(): PostgresUnitOfWork {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
}

/**
 * Reads already-ingested Open Icecat evidence from the governed source catalogue.
 * Provider credentials remain isolated in the Icecat worker; Quick Add never calls
 * the provider directly and never writes canonical/vendor/commercial state here.
 */
export async function adminQuickAddIcecatLookup(principal: SessionPrincipal, rawGtin: string): Promise<AdminQuickAddIcecatPreview> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Admin Quick Add requires PostgreSQL runtime");

  const gtin = clean(rawGtin).replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(gtin.length)) {
    return { gtin, found: false, status: "invalid_gtin", specifications: [] };
  }

  return uow().withTransaction(platformScope(principal.userId, "quickadd-icecat"), async (tx) => {
    const valid = await tx.query<SqlRow>(`SELECT bls_private.catalog_gtin_is_valid($1) AS ok`, [gtin]);
    if (valid.rows[0]?.ok !== true) return { gtin, found: false, status: "invalid_gtin", specifications: [] };

    const result = await tx.query<SqlRow>(`
      SELECT
        i.product_id,
        i.model_name,
        i.product_code,
        COALESCE(j.status, 'index_only') AS detail_status,
        j.source_product_id::text AS source_product_id,
        sp.title AS source_title,
        sp.source_image_url,
        sp.source_identity,
        sp.normalized_payload,
        sp.quality_payload,
        l.title AS localized_title,
        l.description AS localized_description,
        l.category_label,
        l.specifications AS localized_specifications,
        l.quality_status,
        l.greek_completeness
      FROM public.catalog_sources s
      JOIN public.markets m ON m.id=s.market_id AND m.code='sparta'
      JOIN public.open_icecat_index_products i ON i.source_id=s.id
      LEFT JOIN public.open_icecat_detail_enrichment_jobs j
        ON j.source_id=i.source_id AND j.product_id=i.product_id
      LEFT JOIN public.catalog_source_products sp ON sp.id=j.source_product_id
      LEFT JOIN public.catalog_source_product_localizations l
        ON l.source_product_id=sp.id AND upper(l.locale)='EL'
      WHERE s.code='open_icecat'
        AND s.active=true
        AND i.record_state='active'
        AND $1 = ANY(i.gtins)
      ORDER BY
        CASE COALESCE(j.status,'index_only')
          WHEN 'ready' THEN 0
          WHEN 'needs_enrichment' THEN 1
          WHEN 'processing' THEN 2
          WHEN 'pending' THEN 3
          WHEN 'retry' THEN 4
          ELSE 5
        END,
        j.updated_at DESC NULLS LAST,
        i.product_id
      LIMIT 1
    `, [gtin]);

    const row = result.rows[0];
    if (!row) return { gtin, found: false, status: "not_indexed", specifications: [] };

    const normalized = jsonObject(row.normalized_payload);
    const identity = jsonObject(row.source_identity);
    const quality = jsonObject(row.quality_payload);
    const localizedSpecifications = row.localized_specifications ?? normalized.specifications;

    return {
      gtin,
      found: true,
      status: optionalText(row.detail_status) ?? "index_only",
      productId: optionalText(row.product_id),
      sourceProductId: optionalText(row.source_product_id),
      title: optionalText(row.localized_title) ?? optionalText(row.source_title) ?? localizedValue(normalized.title),
      description: optionalText(row.localized_description) ?? localizedValue(normalized.description),
      brand: optionalText(normalized.brand) ?? optionalText(identity.brand),
      model: optionalText(row.model_name) ?? optionalText(identity.modelName),
      mpn: optionalText(normalized.brandPartCode) ?? optionalText(identity.brandPartCode) ?? optionalText(row.product_code),
      imageUrl: optionalText(row.source_image_url) ?? firstImage(normalized.images),
      categoryLabel: optionalText(row.category_label) ?? localizedValue(normalized.category),
      qualityStatus: optionalText(row.quality_status) ?? optionalText(quality.status),
      greekCompleteness: numberOrUndefined(row.greek_completeness) ?? numberOrUndefined(quality.score),
      specifications: specifications(localizedSpecifications)
    };
  }, { readOnly: true });
}
