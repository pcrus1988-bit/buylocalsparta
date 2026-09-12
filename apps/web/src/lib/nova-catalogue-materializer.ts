import type { SqlRow } from "@buy-local-sparta/core";
import { canonicalNovaSlug } from "./nova-canonical-slug";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const SOURCE_CODE = "nova-brandsgateway";
const SUPPLIER_CODE = "nova_brandsgateway";
const EXPECTED_OWNER_VENDOR = "vendor_e8cb57b3c67b469d9a9d";
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
const DEFAULT_TAX_RATE_BPS = 2400;
const MATERIALIZATION_CURSOR_KEY = "novaMaterializationCursor";

type SupplierContext = Readonly<{
  supplierId: string;
  sourceId: string;
  vendorId: string;
  vendorPublicId: string;
  locationId: string;
  marketId: string;
  materializationCursor: string | null;
}>;

type SourceProductRow = Readonly<{
  id: string;
  snapshotId: string;
  sourceProductKey: string;
  title: string;
  normalizedPayload: Readonly<Record<string, unknown>>;
}>;

type MaterializedVariant = Readonly<{
  externalVariantId: string;
  sku: string | null;
  barcode: string | null;
  mpn: string | null;
  buyingCostMinor: number | null;
  msrpMinor: number | null;
  available: boolean;
  quantity: number | null;
  stockStatus: string | null;
  attributes: unknown;
}>;

type ProductMaterializationResult = Readonly<{
  variants: number;
  canonicalCreated: number;
  offersCreated: number;
  reviewsCreated: number;
}>;

export type NovaMaterializationSliceResult = Readonly<{
  enabled: boolean;
  scanned: number;
  variants: number;
  canonicalCreated: number;
  offersCreated: number;
  reviewsCreated: number;
  message?: string;
}>;

/**
 * Materialize staged Nova evidence without publishing it.
 *
 * Schema-227 contract:
 * - missing taxonomy is routine organisation work, never an Admin exception;
 * - newly created canonicals are inactive, uncategorized and family-less;
 * - only checksum-valid global identifiers may reuse an existing canonical;
 * - ambiguous or materially conflicting strong identity fails closed;
 * - vendor offers stay draft + hidden and dropship offers stay inactive.
 *
 * The source scan is deliberately cursor-bounded. Searching the entire immutable
 * supplier history for the next missing variant made each slice increasingly
 * expensive as the catalogue grew. The cursor is persisted in catalog_sources
 * metadata only after a complete batch succeeds, so crashes replay at most one
 * bounded idempotent batch and never skip supplier evidence.
 */
export async function runNovaCatalogueMaterializationSlice(): Promise<NovaMaterializationSliceResult> {
  if (process.env.BLS_NOVA_MATERIALIZATION_ENABLED === "false") {
    return emptyResult(false, "materialization_disabled");
  }

  const pool = getProductionPostgresRuntime().sqlPool;
  const contextResult = await pool.query<SqlRow>(`
    SELECT
      ds.id AS supplier_id,
      ds.catalog_source_id AS source_id,
      ds.owner_vendor_id AS vendor_id,
      vb.public_id AS vendor_public_id,
      vl.id AS location_id,
      vl.market_id AS market_id,
      cs.metadata->>$2 AS materialization_cursor
    FROM public.dropship_suppliers ds
    JOIN public.catalog_sources cs ON cs.id=ds.catalog_source_id
    JOIN public.vendor_businesses vb ON vb.id=ds.owner_vendor_id
    JOIN LATERAL (
      SELECT l.id,l.market_id
      FROM public.vendor_locations l
      WHERE l.vendor_id=ds.owner_vendor_id
        AND l.active=true
      ORDER BY l.is_primary DESC NULLS LAST,l.created_at ASC
      LIMIT 1
    ) vl ON true
    WHERE ds.code=$1
      AND ds.active=true
      AND ds.catalogue_sync_enabled=true
      AND ds.catalog_source_id IS NOT NULL
    LIMIT 1
  `,[SUPPLIER_CODE,MATERIALIZATION_CURSOR_KEY]);

  const row = contextResult.rows[0];
  if (!row) return emptyResult(false, "supplier_disabled_or_missing_location");

  const context: SupplierContext = {
    supplierId: requiredText(row.supplier_id, "supplier id"),
    sourceId: requiredText(row.source_id, "catalog source id"),
    vendorId: requiredText(row.vendor_id, "owner vendor id"),
    vendorPublicId: requiredText(row.vendor_public_id, "owner vendor public id"),
    locationId: requiredText(row.location_id, "owner vendor location id"),
    marketId: requiredText(row.market_id, "market id"),
    materializationCursor: optionalText(row.materialization_cursor)
  };
  if (context.vendorPublicId !== EXPECTED_OWNER_VENDOR) {
    throw new Error(`Nova supplier owner mismatch: ${context.vendorPublicId}`);
  }

  const candidates = await pool.query<SqlRow>(`
    SELECT DISTINCT ON (p.source_product_key)
      p.id,p.snapshot_id,p.source_product_key,p.title,p.normalized_payload,p.created_at
    FROM public.catalog_source_products p
    WHERE p.source_id=$1::uuid
      AND ($2::text IS NULL OR p.source_product_key>$2)
    ORDER BY p.source_product_key,p.created_at DESC,p.id DESC
    LIMIT $3
  `,[context.sourceId,context.materializationCursor,batchSize()]);

  if (candidates.rows.length === 0) {
    if (context.materializationCursor) {
      await persistMaterializationCursor(context.sourceId,null);
      return emptyResult(true,"materialization_cursor_wrapped");
    }
    return emptyResult(true,"materialization_source_empty");
  }

  const result: NovaMaterializationSliceResult = {
    enabled: true,
    scanned: candidates.rowCount ?? candidates.rows.length,
    variants: 0,
    canonicalCreated: 0,
    offersCreated: 0,
    reviewsCreated: 0
  };
  const mutable = { ...result };

  let lastSourceProductKey: string | null = null;
  for (const candidate of candidates.rows) {
    const sourceProduct: SourceProductRow = {
      id: requiredText(candidate.id, "source product id"),
      snapshotId: requiredText(candidate.snapshot_id, "source snapshot id"),
      sourceProductKey: requiredText(candidate.source_product_key, "source product key"),
      title: requiredText(candidate.title, "source product title"),
      normalizedPayload: record(candidate.normalized_payload)
    };
    lastSourceProductKey = sourceProduct.sourceProductKey;
    const outcome = await materializeSourceProduct(context, sourceProduct);
    mutable.variants += outcome.variants;
    mutable.canonicalCreated += outcome.canonicalCreated;
    mutable.offersCreated += outcome.offersCreated;
    mutable.reviewsCreated += outcome.reviewsCreated;
  }

  if (lastSourceProductKey) {
    await persistMaterializationCursor(context.sourceId,lastSourceProductKey);
  }
  return mutable;
}

async function persistMaterializationCursor(sourceId: string, cursor: string | null): Promise<void> {
  const pool = getProductionPostgresRuntime().sqlPool;
  if (cursor === null) {
    await pool.query(`
      UPDATE public.catalog_sources
      SET metadata=COALESCE(metadata,'{}'::jsonb)-$2,
          updated_at=now()
      WHERE id=$1::uuid
    `,[sourceId,MATERIALIZATION_CURSOR_KEY]);
    return;
  }
  await pool.query(`
    UPDATE public.catalog_sources
    SET metadata=jsonb_set(
          COALESCE(metadata,'{}'::jsonb),
          ARRAY[$2]::text[],
          to_jsonb($3::text),
          true
        ),
        updated_at=now()
    WHERE id=$1::uuid
  `,[sourceId,MATERIALIZATION_CURSOR_KEY,cursor]);
}

async function materializeSourceProduct(
  context: SupplierContext,
  sourceProduct: SourceProductRow
): Promise<ProductMaterializationResult> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const payload = sourceProduct.normalizedPayload;
  const variants = normalizedVariants(payload);
  const brandId = await resolveOrCreateBrand(payload);
  let canonicalCreated = 0;
  let offersCreated = 0;
  let reviewsCreated = 0;

  for (const variant of variants) {
    const existingOffer = await pool.query<SqlRow>(`
      SELECT id
      FROM public.dropship_supplier_offers
      WHERE supplier_id=$1::uuid AND external_variant_id=$2
      LIMIT 1
    `,[context.supplierId,variant.externalVariantId]);
    if (existingOffer.rows[0]) continue;

    const materialAttributes = normalizeMaterialAttributes(variant.attributes);
    const globalIdentifier = normalizeGlobalIdentifier(variant.barcode);
    let canonicalVariantId: string | null = null;
    let matchMethod: "exact_gtin" | "enrichment" = "enrichment";

    const sourceScoped = await pool.query<SqlRow>(`
      SELECT id
      FROM public.canonical_variants
      WHERE market_id=$1::uuid
        AND variant_attributes->>'source'='nova_shopwoo_v1'
        AND variant_attributes->>'externalVariantId'=$2
      ORDER BY created_at,id
      LIMIT 2
    `,[context.marketId,variant.externalVariantId]);

    if (sourceScoped.rows.length > 1) {
      reviewsCreated += await upsertReview(context,sourceProduct,"canonical_identity_ambiguous",null,{
        externalVariantId: variant.externalVariantId,
        sourceScopedCollision: true
      });
      continue;
    }
    if (sourceScoped.rows[0]) {
      canonicalVariantId = requiredText(sourceScoped.rows[0].id,"source-scoped canonical variant id");
    }

    if (!canonicalVariantId && globalIdentifier) {
      const matches = await pool.query<SqlRow>(`
        SELECT
          cv.id,
          bls_private.catalog_material_variant_conflict($3::jsonb,cv.variant_attributes) AS material_conflict
        FROM public.canonical_variants cv
        WHERE cv.market_id=$1::uuid
          AND cv.recalled=false
          AND (
            (
              cv.gtin IS NOT NULL
              AND bls_private.catalog_gtin_is_valid(cv.gtin)
              AND bls_private.catalog_normalize_gtin(cv.gtin)=$2
            )
            OR EXISTS (
              SELECT 1
              FROM public.product_identifiers pi
              WHERE pi.canonical_variant_id=cv.id
                AND pi.active=true
                AND pi.identifier_scope='trade_item'
                AND pi.identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn10','isbn13')
                AND pi.normalized_value=$2
            )
          )
        ORDER BY cv.created_at,cv.id
        LIMIT 2
      `,[context.marketId,globalIdentifier.value,JSON.stringify(materialAttributes)]);

      if (matches.rows.length > 1) {
        reviewsCreated += await upsertReview(context,sourceProduct,"canonical_identity_ambiguous",null,{
          externalVariantId: variant.externalVariantId,
          identifierType: globalIdentifier.type,
          identifierValue: globalIdentifier.value
        });
        continue;
      }

      const match = matches.rows[0];
      if (match) {
        const matchId = requiredText(match.id,"canonical variant id");
        const conflict = optionalText(match.material_conflict);
        if (conflict) {
          reviewsCreated += await upsertReview(context,sourceProduct,"material_variant_conflict",matchId,{
            externalVariantId: variant.externalVariantId,
            identifierType: globalIdentifier.type,
            identifierValue: globalIdentifier.value,
            conflict
          });
          continue;
        }
        canonicalVariantId = matchId;
        matchMethod = "exact_gtin";
      }
    }

    if (!canonicalVariantId) {
      const variantAttributes = {
        ...materialAttributes,
        source: "nova_shopwoo_v1",
        externalProductId: sourceProduct.sourceProductKey,
        externalVariantId: variant.externalVariantId
      };
      const slug = canonicalNovaSlug(sourceProduct.title,sourceProduct.sourceProductKey,variant.externalVariantId);
      let created: Readonly<{ rows: readonly SqlRow[]; rowCount: number }>;
      try {
        created = await pool.query<SqlRow>(`
          INSERT INTO public.canonical_variants(
            market_id,family_id,brand_id,category_id,slug,gtin,mpn,model,condition,
            variant_attributes,platform_price_minor,currency,tax_rate_bps,active,suppressed,recalled
          ) VALUES(
            $1::uuid,NULL,$2::uuid,NULL,$3,$4,$5,$6,'new',
            $7::jsonb,NULL,'EUR',$8,false,false,false
          )
          RETURNING id
        `,[
          context.marketId,
          brandId,
          slug,
          globalIdentifier?.value ?? null,
          brandId ? variant.mpn : null,
          productModel(payload),
          JSON.stringify(variantAttributes),
          DEFAULT_TAX_RATE_BPS
        ]);
      } catch (error) {
        const conflict = canonicalInsertUniqueConflict(error);
        if (!conflict) throw error;
        reviewsCreated += await upsertReview(context,sourceProduct,"canonical_identity_ambiguous",null,{
          externalVariantId: variant.externalVariantId,
          uniqueConflict: conflict,
          canonicalSlug: slug,
          identifierType: globalIdentifier?.type ?? null,
          identifierValue: globalIdentifier?.value ?? null
        });
        continue;
      }
      canonicalVariantId = requiredText(created.rows[0]?.id,"created canonical variant id");
      canonicalCreated += 1;

      await pool.query(`
        INSERT INTO public.product_translations(
          canonical_variant_id,locale,title,description,specifications,seo_title,seo_description
        ) VALUES($1::uuid,'en',$2,$3,$4::jsonb,NULL,NULL)
        ON CONFLICT (canonical_variant_id,locale) DO NOTHING
      `,[canonicalVariantId,sourceProduct.title,optionalText(payload.description),JSON.stringify({ source: "nova_shopwoo_v1",supplierContent: true })]);

      if (globalIdentifier) {
        await pool.query(`
          INSERT INTO public.product_identifiers(
            canonical_variant_id,identifier_type,issuer_brand_id,normalized_value,display_value,
            active,is_primary,verification_status,source,source_reference,confidence,identifier_scope
          ) VALUES(
            $1::uuid,$2,NULL,$3,$4,true,true,'format_valid','import',$5,1,'trade_item'
          )
          ON CONFLICT (identifier_type,normalized_value)
            WHERE active=true
              AND identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn10','isbn13')
          DO NOTHING
        `,[canonicalVariantId,globalIdentifier.type,globalIdentifier.value,globalIdentifier.value,`nova:${sourceProduct.sourceProductKey}:${variant.externalVariantId}`]);
      }
    }

    await pool.query(`
      INSERT INTO public.catalog_source_product_links(
        source_product_id,canonical_variant_id,link_status,match_method,confidence,reasons,reviewed_at
      ) VALUES($1::uuid,$2::uuid,'approved',$3,1,$4::jsonb,now())
      ON CONFLICT (source_product_id,canonical_variant_id)
      DO UPDATE SET link_status='approved',match_method=EXCLUDED.match_method,confidence=EXCLUDED.confidence,reasons=EXCLUDED.reasons,updated_at=now()
    `,[sourceProduct.id,canonicalVariantId,matchMethod,JSON.stringify([{ source: "nova_shopwoo_v1",externalProductId: sourceProduct.sourceProductKey,externalVariantId: variant.externalVariantId,globalIdentifier: globalIdentifier?.value ?? null,rule: matchMethod === "exact_gtin" ? "global_identifier" : "automatic_inactive_draft" }])]);

    const vendorSku = `nova:${variant.externalVariantId}`;
    const vendorOffer = await pool.query<SqlRow>(`
      INSERT INTO public.vendor_offers(
        market_id,vendor_id,location_id,canonical_variant_id,vendor_sku,source_gtin,status,
        supplier_unit_price_minor,currency,supplier_tax_rate_bps,lead_time_minutes,fulfilment_modes,
        advice_capabilities,source_payload,customer_price_minor,merchant_visible,merchant_pause_active,
        msrp_minor,show_msrp
      ) VALUES(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,'draft',
        $7,'EUR',$8,NULL,ARRAY['shipping'::fulfilment_mode],
        '{}'::jsonb,$9::jsonb,$10,false,false,$11,false
      )
      ON CONFLICT (vendor_id,location_id,canonical_variant_id,vendor_sku)
      DO UPDATE SET source_gtin=COALESCE(EXCLUDED.source_gtin,public.vendor_offers.source_gtin),supplier_unit_price_minor=EXCLUDED.supplier_unit_price_minor,source_payload=public.vendor_offers.source_payload || EXCLUDED.source_payload,msrp_minor=EXCLUDED.msrp_minor,updated_at=now()
      RETURNING id
    `,[context.marketId,context.vendorId,context.locationId,canonicalVariantId,vendorSku,globalIdentifier?.value ?? variant.barcode,variant.buyingCostMinor ?? 0,DEFAULT_TAX_RATE_BPS,JSON.stringify({ dropship: true,supplierCode: SUPPLIER_CODE,externalProductId: sourceProduct.sourceProductKey,externalVariantId: variant.externalVariantId,externalSku: variant.sku,publicationState: "STAGED",pricingPending: true,supplierContentSource: "catalog_source_products",schemaPolicy: "catalog_identity_v3_simplified" }),stagedPrice(variant),positiveMinor(variant.msrpMinor) ? variant.msrpMinor : null]);
    const vendorOfferId = requiredText(vendorOffer.rows[0]?.id,"vendor offer id");

    await pool.query(`
      INSERT INTO public.vendor_offer_pricing_private(
        offer_id,vendor_id,buying_price_minor,pricing_mode,markup_type,markup_value,
        discount_type,discount_value
      ) VALUES($1::uuid,$2::uuid,$3,'manual',NULL,NULL,NULL,NULL)
      ON CONFLICT (offer_id)
      DO UPDATE SET buying_price_minor=EXCLUDED.buying_price_minor,updated_at=now()
    `,[vendorOfferId,context.vendorId,variant.buyingCostMinor]);

    const supplierOffer = await pool.query<SqlRow>(`
      INSERT INTO public.dropship_supplier_offers(
        supplier_id,vendor_offer_id,source_product_id,external_product_id,external_variant_id,
        external_sku,ean,mpn,supplier_cost_minor,supplier_currency,cached_available,cached_quantity,
        availability_checked_at,availability_expires_at,availability_payload,last_catalogue_sync_at,active
      ) VALUES(
        $1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,'EUR',$10,$11,
        now(),now()+interval '10 minutes',$12::jsonb,now(),false
      )
      ON CONFLICT (supplier_id,external_variant_id)
      DO UPDATE SET source_product_id=EXCLUDED.source_product_id,external_product_id=EXCLUDED.external_product_id,external_sku=COALESCE(EXCLUDED.external_sku,public.dropship_supplier_offers.external_sku),ean=COALESCE(EXCLUDED.ean,public.dropship_supplier_offers.ean),mpn=COALESCE(EXCLUDED.mpn,public.dropship_supplier_offers.mpn),supplier_cost_minor=EXCLUDED.supplier_cost_minor,cached_available=EXCLUDED.cached_available,cached_quantity=EXCLUDED.cached_quantity,availability_checked_at=EXCLUDED.availability_checked_at,availability_expires_at=EXCLUDED.availability_expires_at,availability_payload=public.dropship_supplier_offers.availability_payload || EXCLUDED.availability_payload,last_catalogue_sync_at=now(),updated_at=now()
      RETURNING (xmax=0) AS inserted
    `,[context.supplierId,vendorOfferId,sourceProduct.id,sourceProduct.sourceProductKey,variant.externalVariantId,variant.sku,variant.barcode,variant.mpn,variant.buyingCostMinor,variant.available,variant.quantity,JSON.stringify({ source: "nova_catalogue_materializer",stockStatus: variant.stockStatus,backordersAllowed: false,staged: true })]);
    if (supplierOffer.rows[0]?.inserted === true) offersCreated += 1;
  }

  return { variants: variants.length,canonicalCreated,offersCreated,reviewsCreated };
}

async function resolveOrCreateBrand(payload: Readonly<Record<string, unknown>>): Promise<string | null> {
  const brandName = nestedName(payload.brand);
  if (!brandName) return null;
  const normalizedName = normalizeBrandName(brandName);
  if (!normalizedName) return null;
  const pool = getProductionPostgresRuntime().sqlPool;
  // Resolve governed aliases first. A compact spelling (MichaelKors) only
  // matches when exactly one existing brand has that spelling without spaces.
  const existing = await pool.query<SqlRow>(`
    SELECT id FROM (
      SELECT b.id,0 AS priority FROM public.brands b WHERE b.normalized_name=$1
      UNION ALL
      SELECT b.id,1 FROM public.brand_aliases a JOIN public.brands b ON b.id=a.brand_id
        WHERE a.active AND a.normalized_alias=$1 AND b.status='active'
      UNION ALL
      SELECT b.id,2 FROM public.brands b
        WHERE b.status='active' AND length($2::text)>=8
          AND regexp_replace(b.normalized_name,'[[:space:]]','','g')=$2
    ) matched ORDER BY priority,id LIMIT 2
  `,[normalizedName,normalizedName.replace(/\s/g,"")]);
  const uniqueMatches = [...new Set(existing.rows.map((row) => String(row.id)))];
  if (uniqueMatches.length === 1) return uniqueMatches[0];
  if (uniqueMatches.length > 1) return null; // Ambiguous identity: never silently merge brands.
  const result = await pool.query<SqlRow>(`
    INSERT INTO public.brands(name,normalized_name,status)
    VALUES($1,$2,'active')
    ON CONFLICT (normalized_name) DO UPDATE SET updated_at=now()
    RETURNING id
  `,[brandName,normalizedName]);
  return optionalText(result.rows[0]?.id);
}

async function upsertReview(
  context: SupplierContext,
  sourceProduct: SourceProductRow,
  reasonCode: "canonical_identity_ambiguous" | "material_variant_conflict",
  candidateVariantId: string | null,
  details: Readonly<Record<string, unknown>>
): Promise<number> {
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    INSERT INTO public.catalog_canonicalization_reviews(
      source_product_id,source_id,market_id,snapshot_id,candidate_category_id,candidate_variant_id,
      reason_code,status,details
    ) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,NULL,$5::uuid,$6,'open',$7::jsonb)
    ON CONFLICT (source_product_id)
    DO UPDATE SET candidate_variant_id=EXCLUDED.candidate_variant_id,reason_code=EXCLUDED.reason_code,status='open',details=public.catalog_canonicalization_reviews.details || EXCLUDED.details,resolved_at=NULL,updated_at=now()
    RETURNING (xmax=0) AS inserted
  `,[sourceProduct.id,context.sourceId,context.marketId,sourceProduct.snapshotId,candidateVariantId,reasonCode,JSON.stringify(details)]);
  return result.rows[0]?.inserted === true ? 1 : 0;
}

export function normalizeGlobalIdentifier(value: string | null): { type: string; value: string } | null {
  if (!value) return null;
  const normalized = value.replace(/[^0-9]/g,"");
  if (![8,12,13,14].includes(normalized.length) || !validGtin(normalized)) return null;
  return { type: `gtin${normalized.length}`,value: normalized };
}

function validGtin(value: string): boolean {
  if (!/^\d+$/.test(value) || ![8,12,13,14].includes(value.length)) return false;
  const digits = [...value].map(Number);
  const check = digits.pop();
  if (check === undefined) return false;
  let sum = 0;
  for (let offset=0; offset<digits.length; offset += 1) {
    const digit = digits[digits.length-1-offset];
    sum += digit * (offset % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === check;
}

function normalizedVariants(payload: Readonly<Record<string, unknown>>): MaterializedVariant[] {
  const raw = Array.isArray(payload.variants) ? payload.variants : [];
  const output: MaterializedVariant[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const variant = value as Record<string, unknown>;
    const externalVariantId = optionalText(variant.externalVariantId);
    if (!externalVariantId) continue;
    output.push({ externalVariantId,sku: optionalText(variant.sku),barcode: optionalText(variant.barcode),mpn: optionalText(variant.mpn),buyingCostMinor: nullableMinor(variant.buyingCostMinor),msrpMinor: nullableMinor(variant.msrpMinor),available: variant.available === true,quantity: nullableQuantity(variant.stockQuantity),stockStatus: optionalText(variant.stockStatus),attributes: variant.attributes ?? [] });
  }
  return output;
}

function normalizeMaterialAttributes(value: unknown): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key,item]) => {
      const text = scalarAttributeValue(item);
      const normalizedKey = normalizeAttributeKey(key);
      return normalizedKey && text ? [[normalizedKey,text] as const] : [];
    }));
  }
  if (!Array.isArray(value)) return {};
  const output: Record<string,string> = {};
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string,unknown>;
    const key = normalizeAttributeKey(optionalText(row.name) ?? optionalText(row.slug) ?? optionalText(row.id) ?? "");
    const attributeValue = scalarAttributeValue(row.option) ?? scalarAttributeValue(row.value) ?? scalarAttributeValue(row.options);
    if (key && attributeValue) output[key] = attributeValue;
  }
  return output;
}

function normalizeAttributeKey(value: string): string {
  const key = value.normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  if (key === "colour") return "color";
  return key;
}

function scalarAttributeValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    const values = value.map((item) => scalarAttributeValue(item)).filter((item): item is string => Boolean(item));
    return values.length ? values.join("|") : null;
  }
  return null;
}

function stagedPrice(variant: MaterializedVariant): number {
  const cost = positiveMinor(variant.buyingCostMinor) ? variant.buyingCostMinor : 0;
  const msrp = positiveMinor(variant.msrpMinor) ? variant.msrpMinor : 0;
  return Math.max(cost,msrp);
}

function positiveMinor(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value > 0;
}

function nullableMinor(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function nullableQuantity(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function productModel(payload: Readonly<Record<string, unknown>>): string | null {
  return optionalText(payload.mpn) ?? optionalText(payload.sku);
}

function canonicalInsertUniqueConflict(error: unknown): "slug" | "gtin" | null {
  if (!error || typeof error !== "object") return null;
  const row = error as { code?: unknown; constraint?: unknown; message?: unknown };
  if (row.code !== "23505") return null;
  const constraint = typeof row.constraint === "string" ? row.constraint : "";
  const message = typeof row.message === "string" ? row.message : "";
  if (constraint === "canonical_variants_market_id_slug_key" || message.includes("canonical_variants_market_id_slug_key")) return "slug";
  if (constraint === "canonical_variants_gtin_unique" || message.includes("canonical_variants_gtin_unique")) return "gtin";
  return null;
}

function normalizeBrandName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
}

function nestedName(value: unknown): string | null {
  return value && typeof value === "object" && !Array.isArray(value) ? optionalText((value as Record<string, unknown>).name) : null;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {};
}

function requiredText(value: unknown, label: string): string {
  const text = optionalText(value);
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function optionalText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function batchSize(): number {
  const raw = Number(process.env.NOVA_MATERIALIZATION_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
  return Number.isSafeInteger(raw) && raw > 0 ? Math.min(MAX_BATCH_SIZE,raw) : DEFAULT_BATCH_SIZE;
}

function emptyResult(enabled: boolean, message?: string): NovaMaterializationSliceResult {
  return { enabled,scanned: 0,variants: 0,canonicalCreated: 0,offersCreated: 0,reviewsCreated: 0,message };
}

export const NOVA_MATERIALIZER_SOURCE_CODE = SOURCE_CODE;
