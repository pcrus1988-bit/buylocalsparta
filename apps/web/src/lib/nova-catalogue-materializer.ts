import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const SOURCE_CODE = "nova-brandsgateway";
const SUPPLIER_CODE = "nova_brandsgateway";
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
const DEFAULT_TAX_RATE_BPS = 2400;

type SupplierContext = Readonly<{
  supplierId: string;
  sourceId: string;
  vendorId: string;
  vendorPublicId: string;
  locationId: string;
  marketId: string;
}>;

type SourceProductRow = Readonly<{
  id: string;
  snapshotId: string;
  sourceProductKey: string;
  title: string;
  normalizedPayload: Readonly<Record<string, unknown>>;
  sourceTaxonomyNodeId: string | null;
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
  taxonomyNodesCreated: number;
  mappingsCreated: number;
  reviewsCreated: number;
}>;

export type NovaMaterializationSliceResult = Readonly<{
  enabled: boolean;
  scanned: number;
  variants: number;
  canonicalCreated: number;
  offersCreated: number;
  taxonomyNodesCreated: number;
  mappingsCreated: number;
  reviewsCreated: number;
  message?: string;
}>;

/**
 * Materialise staged Nova source evidence into the generic KONTA MOY catalogue.
 *
 * Safety invariants:
 * - Nova remains a supplier/source, never the commercial vendor.
 * - Newly materialised vendor/dropship offers are DRAFT + inactive. This function
 *   never promotes a product to the public storefront.
 * - Supplier SKUs remain source-scoped. Only checksum-valid GTINs are used as
 *   global identifiers.
 * - Supplier content is written only to the source evidence and a creation-only
 *   English translation. Existing curated translations/SEO are never overwritten.
 * - Missing/unsafe taxonomy is routed to the existing canonicalisation review
 *   queue rather than inventing a catch-all category.
 */
export async function runNovaCatalogueMaterializationSlice(): Promise<NovaMaterializationSliceResult> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const contextResult = await pool.query<SqlRow>(`
    SELECT
      ds.id AS supplier_id,
      ds.catalog_source_id AS source_id,
      ds.owner_vendor_id AS vendor_id,
      vb.public_id AS vendor_public_id,
      vl.id AS location_id,
      vl.market_id AS market_id
    FROM public.dropship_suppliers ds
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
  `,[SUPPLIER_CODE]);

  const row = contextResult.rows[0];
  if (!row) {
    return emptyResult(false,"supplier_disabled_or_missing_location");
  }

  const context: SupplierContext = {
    supplierId: requiredText(row.supplier_id,"supplier id"),
    sourceId: requiredText(row.source_id,"catalog source id"),
    vendorId: requiredText(row.vendor_id,"owner vendor id"),
    vendorPublicId: requiredText(row.vendor_public_id,"owner vendor public id"),
    locationId: requiredText(row.location_id,"owner vendor location id"),
    marketId: requiredText(row.market_id,"market id")
  };

  // Hard guard against accidentally materialising Nova as its own public vendor.
  if (context.vendorPublicId !== "vendor_e8cb57b3c67b469d9a9d") {
    throw new Error(`Nova supplier owner mismatch: ${context.vendorPublicId}`);
  }

  const limit = batchSize();
  const candidates = await pool.query<SqlRow>(`
    WITH latest AS (
      SELECT DISTINCT ON (p.source_product_key)
        p.id,p.snapshot_id,p.source_product_key,p.title,p.normalized_payload,
        p.source_taxonomy_node_id,p.created_at
      FROM public.catalog_source_products p
      WHERE p.source_id=$1::uuid
      ORDER BY p.source_product_key,p.created_at DESC,p.id DESC
    )
    SELECT l.*
    FROM latest l
    WHERE jsonb_typeof(l.normalized_payload->'variants')='array'
      AND jsonb_array_length(l.normalized_payload->'variants') > 0
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(l.normalized_payload->'variants') v
        WHERE NULLIF(v->>'externalVariantId','') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.dropship_supplier_offers dso
            WHERE dso.supplier_id=$2::uuid
              AND dso.external_variant_id=v->>'externalVariantId'
          )
      )
      AND (
        NOT EXISTS (
          SELECT 1
          FROM public.catalog_canonicalization_reviews r
          WHERE r.source_product_id=l.id
            AND r.status='open'
        )
        OR EXISTS (
          SELECT 1
          FROM public.catalog_source_category_mappings scm
          WHERE scm.source_taxonomy_node_id=l.source_taxonomy_node_id
            AND scm.mapping_status='approved'
        )
      )
    ORDER BY l.created_at ASC,l.source_product_key ASC
    LIMIT $3
  `,[context.sourceId,context.supplierId,limit]);

  const aggregate = {
    enabled: true,
    scanned: candidates.rowCount ?? candidates.rows.length,
    variants: 0,
    canonicalCreated: 0,
    offersCreated: 0,
    taxonomyNodesCreated: 0,
    mappingsCreated: 0,
    reviewsCreated: 0
  };

  for (const candidate of candidates.rows) {
    const sourceProduct: SourceProductRow = {
      id: requiredText(candidate.id,"source product id"),
      snapshotId: requiredText(candidate.snapshot_id,"source snapshot id"),
      sourceProductKey: requiredText(candidate.source_product_key,"source product key"),
      title: requiredText(candidate.title,"source product title"),
      normalizedPayload: record(candidate.normalized_payload),
      sourceTaxonomyNodeId: optionalText(candidate.source_taxonomy_node_id)
    };
    const outcome = await materializeSourceProduct(context,sourceProduct);
    aggregate.variants += outcome.variants;
    aggregate.canonicalCreated += outcome.canonicalCreated;
    aggregate.offersCreated += outcome.offersCreated;
    aggregate.taxonomyNodesCreated += outcome.taxonomyNodesCreated;
    aggregate.mappingsCreated += outcome.mappingsCreated;
    aggregate.reviewsCreated += outcome.reviewsCreated;
  }

  return aggregate;
}

async function materializeSourceProduct(
  context: SupplierContext,
  sourceProduct: SourceProductRow
): Promise<ProductMaterializationResult> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const payload = sourceProduct.normalizedPayload;
  const variants = normalizedVariants(payload);
  if (!variants.length) return zeroProductResult();

  const taxonomy = await ensureTaxonomy(context,sourceProduct,payload);
  let categoryId = taxonomy.categoryId;
  const brandId = await resolveOrCreateBrand(payload);
  let familyId: string | null = null;
  let canonicalCreated = 0;
  let offersCreated = 0;
  let reviewsCreated = 0;

  for (const variant of variants) {
    const alreadyMaterialized = await pool.query<SqlRow>(`
      SELECT id
      FROM public.dropship_supplier_offers
      WHERE supplier_id=$1::uuid
        AND external_variant_id=$2
      LIMIT 1
    `,[context.supplierId,variant.externalVariantId]);
    if (alreadyMaterialized.rows[0]) continue;

    const globalIdentifier = normalizeGlobalIdentifier(variant.barcode);
    let canonicalVariantId: string | null = null;
    let matchMethod: "exact_gtin" | "enrichment" = "enrichment";

    if (globalIdentifier) {
      const match = await pool.query<SqlRow>(`
        SELECT pi.canonical_variant_id,cv.family_id,cv.category_id
        FROM public.product_identifiers pi
        JOIN public.canonical_variants cv ON cv.id=pi.canonical_variant_id
        WHERE pi.active=true
          AND pi.identifier_type=$1
          AND pi.normalized_value=$2
        LIMIT 2
      `,[globalIdentifier.type,globalIdentifier.value]);
      if (match.rows.length > 1) {
        reviewsCreated += await upsertReview(context,sourceProduct,"canonical_identity_ambiguous",{
          externalVariantId: variant.externalVariantId,
          identifierType: globalIdentifier.type,
          identifierValue: globalIdentifier.value
        });
        continue;
      }
      if (match.rows[0]) {
        canonicalVariantId = requiredText(match.rows[0].canonical_variant_id,"canonical variant id");
        familyId ??= requiredText(match.rows[0].family_id,"canonical family id");
        categoryId ??= requiredText(match.rows[0].category_id,"canonical category id");
        matchMethod = "exact_gtin";
      }
    }

    if (!canonicalVariantId) {
      if (!categoryId) {
        reviewsCreated += await upsertReview(context,sourceProduct,"taxonomy_missing",{
          externalVariantId: variant.externalVariantId,
          categoryPath: taxonomy.pathLabels,
          sourceTaxonomyNodeId: taxonomy.nodeId
        });
        continue;
      }

      if (!familyId) {
        const createdFamily = await pool.query<SqlRow>(`
          INSERT INTO public.product_families(market_id,brand_id,category_id,model,active)
          VALUES($1::uuid,$2::uuid,$3::uuid,$4,true)
          RETURNING id
        `,[context.marketId,brandId,categoryId,productModel(payload)]);
        familyId = requiredText(createdFamily.rows[0]?.id,"created family id");
      }

      const createdVariant = await pool.query<SqlRow>(`
        INSERT INTO public.canonical_variants(
          market_id,family_id,brand_id,category_id,slug,gtin,mpn,model,condition,
          variant_attributes,platform_price_minor,currency,tax_rate_bps,active,suppressed,recalled
        ) VALUES(
          $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8,'new',
          $9::jsonb,NULL,'EUR',$10,true,false,false
        )
        RETURNING id
      `,[
        context.marketId,
        familyId,
        brandId,
        categoryId,
        canonicalSlug(sourceProduct.title,variant.externalVariantId),
        globalIdentifier?.value ?? null,
        brandId ? variant.mpn : null,
        productModel(payload),
        JSON.stringify({
          source: "nova_shopwoo_v1",
          externalProductId: sourceProduct.sourceProductKey,
          externalVariantId: variant.externalVariantId,
          attributes: variant.attributes ?? []
        }),
        DEFAULT_TAX_RATE_BPS
      ]);
      canonicalVariantId = requiredText(createdVariant.rows[0]?.id,"created canonical variant id");
      canonicalCreated += 1;

      await pool.query(`
        INSERT INTO public.product_translations(
          canonical_variant_id,locale,title,description,specifications,seo_title,seo_description
        ) VALUES($1::uuid,'en',$2,$3,$4::jsonb,NULL,NULL)
        ON CONFLICT (canonical_variant_id,locale) DO NOTHING
      `,[
        canonicalVariantId,
        sourceProduct.title,
        optionalText(payload.description),
        JSON.stringify({ source: "nova_shopwoo_v1", supplierContent: true })
      ]);

      if (globalIdentifier) {
        await pool.query(`
          INSERT INTO public.product_identifiers(
            canonical_variant_id,identifier_type,issuer_brand_id,normalized_value,display_value,
            active,is_primary,verification_status,source,source_reference,confidence,identifier_scope
          ) VALUES(
            $1::uuid,$2,NULL,$3,$4,true,true,'format_valid','import',$5,1,'trade_item'
          )
          ON CONFLICT (identifier_type,normalized_value)
            WHERE active=true AND identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn10','isbn13')
          DO NOTHING
        `,[
          canonicalVariantId,
          globalIdentifier.type,
          globalIdentifier.value,
          globalIdentifier.value,
          `nova:${sourceProduct.sourceProductKey}:${variant.externalVariantId}`
        ]);
      }
    }

    await pool.query(`
      INSERT INTO public.catalog_source_product_links(
        source_product_id,canonical_variant_id,link_status,match_method,confidence,reasons,reviewed_at
      ) VALUES($1::uuid,$2::uuid,'approved',$3,1,$4::jsonb,now())
      ON CONFLICT (source_product_id,canonical_variant_id)
      DO UPDATE SET
        link_status='approved',
        match_method=EXCLUDED.match_method,
        confidence=EXCLUDED.confidence,
        reasons=EXCLUDED.reasons,
        updated_at=now()
    `,[
      sourceProduct.id,
      canonicalVariantId,
      matchMethod,
      JSON.stringify([
        {
          source: "nova_shopwoo_v1",
          externalProductId: sourceProduct.sourceProductKey,
          externalVariantId: variant.externalVariantId,
          globalIdentifier: globalIdentifier?.value ?? null,
          rule: matchMethod === "exact_gtin" ? "global_identifier" : "automatic_new_canonical"
        }
      ])
    ]);

    const stagedCustomerPrice = stagedPrice(variant);
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
      DO UPDATE SET
        source_gtin=COALESCE(EXCLUDED.source_gtin,public.vendor_offers.source_gtin),
        supplier_unit_price_minor=EXCLUDED.supplier_unit_price_minor,
        source_payload=public.vendor_offers.source_payload || EXCLUDED.source_payload,
        msrp_minor=EXCLUDED.msrp_minor,
        updated_at=now()
      RETURNING id
    `,[
      context.marketId,
      context.vendorId,
      context.locationId,
      canonicalVariantId,
      vendorSku,
      globalIdentifier?.value ?? variant.barcode,
      variant.buyingCostMinor ?? 0,
      DEFAULT_TAX_RATE_BPS,
      JSON.stringify({
        dropship: true,
        supplierCode: SUPPLIER_CODE,
        externalProductId: sourceProduct.sourceProductKey,
        externalVariantId: variant.externalVariantId,
        externalSku: variant.sku,
        publicationState: "STAGED",
        pricingPending: true,
        supplierContentSource: "catalog_source_products"
      }),
      stagedCustomerPrice,
      positiveMinor(variant.msrpMinor) ? variant.msrpMinor : null
    ]);
    const vendorOfferId = requiredText(vendorOffer.rows[0]?.id,"vendor offer id");

    await pool.query(`
      INSERT INTO public.vendor_offer_pricing_private(
        offer_id,vendor_id,buying_price_minor,pricing_mode,markup_type,markup_value,
        discount_type,discount_value
      ) VALUES($1::uuid,$2::uuid,$3,'manual',NULL,NULL,NULL,NULL)
      ON CONFLICT (offer_id)
      DO UPDATE SET
        buying_price_minor=EXCLUDED.buying_price_minor,
        updated_at=now()
    `,[vendorOfferId,context.vendorId,variant.buyingCostMinor]);

    const insertedOffer = await pool.query<SqlRow>(`
      INSERT INTO public.dropship_supplier_offers(
        supplier_id,vendor_offer_id,source_product_id,external_product_id,external_variant_id,
        external_sku,ean,mpn,supplier_cost_minor,supplier_currency,cached_available,cached_quantity,
        availability_checked_at,availability_expires_at,availability_payload,last_catalogue_sync_at,active
      ) VALUES(
        $1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,'EUR',$10,$11,
        now(),now()+interval '10 minutes',$12::jsonb,now(),false
      )
      ON CONFLICT (supplier_id,external_variant_id)
      DO UPDATE SET
        source_product_id=EXCLUDED.source_product_id,
        external_product_id=EXCLUDED.external_product_id,
        external_sku=COALESCE(EXCLUDED.external_sku,public.dropship_supplier_offers.external_sku),
        ean=COALESCE(EXCLUDED.ean,public.dropship_supplier_offers.ean),
        mpn=COALESCE(EXCLUDED.mpn,public.dropship_supplier_offers.mpn),
        supplier_cost_minor=EXCLUDED.supplier_cost_minor,
        cached_available=EXCLUDED.cached_available,
        cached_quantity=EXCLUDED.cached_quantity,
        availability_checked_at=EXCLUDED.availability_checked_at,
        availability_expires_at=EXCLUDED.availability_expires_at,
        availability_payload=public.dropship_supplier_offers.availability_payload || EXCLUDED.availability_payload,
        last_catalogue_sync_at=now(),
        updated_at=now()
      RETURNING (xmax=0) AS inserted
    `,[
      context.supplierId,
      vendorOfferId,
      sourceProduct.id,
      sourceProduct.sourceProductKey,
      variant.externalVariantId,
      variant.sku,
      variant.barcode,
      variant.mpn,
      variant.buyingCostMinor,
      variant.available,
      variant.quantity,
      JSON.stringify({
        source: "nova_catalogue_materializer",
        stockStatus: variant.stockStatus,
        backordersAllowed: false,
        staged: true
      })
    ]);
    if (insertedOffer.rows[0]?.inserted === true) offersCreated += 1;
  }

  return {
    variants: variants.length,
    canonicalCreated,
    offersCreated,
    taxonomyNodesCreated: taxonomy.nodesCreated,
    mappingsCreated: taxonomy.mappingCreated,
    reviewsCreated
  };
}

async function ensureTaxonomy(
  context: SupplierContext,
  sourceProduct: SourceProductRow,
  payload: Readonly<Record<string, unknown>>
): Promise<{
  nodeId: string | null;
  categoryId: string | null;
  pathLabels: readonly string[];
  nodesCreated: number;
  mappingCreated: number;
}> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const details = categoryDetails(payload.categoryDetails);
  if (!details.length) {
    return { nodeId: sourceProduct.sourceTaxonomyNodeId,categoryId: null,pathLabels: [],nodesCreated: 0,mappingCreated: 0 };
  }

  let parentId: string | null = null;
  let nodeId: string | null = null;
  let nodesCreated = 0;
  const pathLabels: string[] = [];
  const pathKeys: string[] = [];
  for (let index=0; index<details.length; index += 1) {
    const item = details[index];
    pathLabels.push(item.name);
    pathKeys.push(item.id);
    const inserted = await pool.query<SqlRow>(`
      INSERT INTO public.catalog_source_taxonomy_nodes(
        source_id,parent_id,source_key,source_label,depth,path_labels,path_keys,active,metadata
      ) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6::text[],$7::text[],true,$8::jsonb)
      ON CONFLICT (source_id,source_key)
      DO UPDATE SET
        parent_id=EXCLUDED.parent_id,
        source_label=EXCLUDED.source_label,
        depth=EXCLUDED.depth,
        path_labels=EXCLUDED.path_labels,
        path_keys=EXCLUDED.path_keys,
        active=true,
        metadata=public.catalog_source_taxonomy_nodes.metadata || EXCLUDED.metadata,
        updated_at=now()
      RETURNING id,(xmax=0) AS inserted
    `,[
      context.sourceId,parentId,item.id,item.name,index,pathLabels,pathKeys,
      JSON.stringify({ provider: "nova_shopwoo_v1", source: "product_category_details" })
    ]);
    nodeId = requiredText(inserted.rows[0]?.id,"source taxonomy node id");
    if (inserted.rows[0]?.inserted === true) nodesCreated += 1;
    parentId = nodeId;
  }

  await pool.query(`
    UPDATE public.catalog_source_products
    SET source_taxonomy_node_id=$2::uuid,
        classification_status=CASE WHEN classification_status='raw' THEN 'classified' ELSE classification_status END
    WHERE id=$1::uuid
  `,[sourceProduct.id,nodeId]);

  const approved = await pool.query<SqlRow>(`
    SELECT category_id
    FROM public.catalog_source_category_mappings
    WHERE source_taxonomy_node_id=$1::uuid
      AND mapping_status='approved'
    LIMIT 1
  `,[nodeId]);
  if (approved.rows[0]) {
    return {
      nodeId,
      categoryId: requiredText(approved.rows[0].category_id,"mapped category id"),
      pathLabels,
      nodesCreated,
      mappingCreated: 0
    };
  }

  const genderName = nestedName(payload.gender);
  const ruleCode = classifyNovaCategoryCode(pathLabels,genderName);
  const exactCategoryId = ruleCode
    ? await categoryIdByCode(context.marketId,ruleCode)
    : await exactCategoryIdByLabel(context.marketId,details[details.length-1].name);
  if (!exactCategoryId) {
    return { nodeId,categoryId: null,pathLabels,nodesCreated,mappingCreated: 0 };
  }

  const mapping = await pool.query<SqlRow>(`
    INSERT INTO public.catalog_source_category_mappings(
      source_taxonomy_node_id,category_id,mapping_status,mapping_method,confidence,reason,metadata,reviewed_at
    ) VALUES($1::uuid,$2::uuid,'approved','rule',$3,$4,$5::jsonb,now())
    ON CONFLICT (source_taxonomy_node_id) WHERE mapping_status='approved'
    DO UPDATE SET
      category_id=EXCLUDED.category_id,
      mapping_method=EXCLUDED.mapping_method,
      confidence=EXCLUDED.confidence,
      reason=EXCLUDED.reason,
      metadata=public.catalog_source_category_mappings.metadata || EXCLUDED.metadata,
      updated_at=now()
    RETURNING (xmax=0) AS inserted
  `,[
    nodeId,
    exactCategoryId,
    ruleCode ? 0.98 : 1,
    ruleCode ? `nova broad taxonomy rule: ${ruleCode}` : "exact canonical category label",
    JSON.stringify({ provider: "nova_shopwoo_v1", pathLabels,gender: genderName,ruleVersion: 1 })
  ]);

  return {
    nodeId,
    categoryId: exactCategoryId,
    pathLabels,
    nodesCreated,
    mappingCreated: mapping.rows[0]?.inserted === true ? 1 : 0
  };
}

async function categoryIdByCode(marketId: string, code: string): Promise<string | null> {
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT id
    FROM public.categories
    WHERE code=$1
      AND active=true
      AND (market_id=$2::uuid OR market_id IS NULL)
    ORDER BY (market_id=$2::uuid) DESC
    LIMIT 1
  `,[code,marketId]);
  return optionalText(result.rows[0]?.id);
}

async function exactCategoryIdByLabel(marketId: string, label: string): Promise<string | null> {
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    WITH candidates AS (
      SELECT c.id
      FROM public.categories c
      JOIN public.category_translations t ON t.category_id=c.id
      WHERE c.active=true
        AND (c.market_id=$1::uuid OR c.market_id IS NULL)
        AND lower(btrim(t.name))=lower(btrim($2))
      UNION
      SELECT c.id
      FROM public.categories c
      JOIN public.category_aliases a ON a.category_id=c.id
      WHERE c.active=true
        AND (c.market_id=$1::uuid OR c.market_id IS NULL)
        AND lower(btrim(a.alias))=lower(btrim($2))
    )
    SELECT id FROM candidates LIMIT 2
  `,[marketId,label]);
  return result.rows.length === 1 ? requiredText(result.rows[0].id,"exact category id") : null;
}

async function resolveOrCreateBrand(payload: Readonly<Record<string, unknown>>): Promise<string | null> {
  const brandName = nestedName(payload.brand);
  if (!brandName) return null;
  const normalizedName = normalizeBrandName(brandName);
  if (!normalizedName) return null;
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    INSERT INTO public.brands(name,normalized_name,status)
    VALUES($1,$2,'active')
    ON CONFLICT (normalized_name)
    DO UPDATE SET updated_at=now()
    RETURNING id
  `,[brandName,normalizedName]);
  return optionalText(result.rows[0]?.id);
}

async function upsertReview(
  context: SupplierContext,
  sourceProduct: SourceProductRow,
  reasonCode: "taxonomy_missing" | "canonical_identity_ambiguous",
  details: Readonly<Record<string, unknown>>
): Promise<number> {
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    INSERT INTO public.catalog_canonicalization_reviews(
      source_product_id,source_id,market_id,snapshot_id,candidate_category_id,candidate_variant_id,
      reason_code,status,details
    ) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,NULL,NULL,$5,'open',$6::jsonb)
    ON CONFLICT (source_product_id)
    DO UPDATE SET
      reason_code=EXCLUDED.reason_code,
      status='open',
      details=public.catalog_canonicalization_reviews.details || EXCLUDED.details,
      resolved_at=NULL,
      updated_at=now()
    RETURNING (xmax=0) AS inserted
  `,[sourceProduct.id,context.sourceId,context.marketId,sourceProduct.snapshotId,reasonCode,JSON.stringify(details)]);
  return result.rows[0]?.inserted === true ? 1 : 0;
}

export function classifyNovaCategoryCode(pathLabels: readonly string[], genderName: string | null): string | null {
  const path = pathLabels.join(" ").toLowerCase();
  const gender = (genderName ?? "").toLowerCase();
  const child = /\b(kid|kids|child|children|baby|babies|boy|boys|girl|girls|junior)\b/.test(`${path} ${gender}`);
  if (child && /cloth|apparel|dress|shirt|trouser|pant|jean|coat|jacket|sweater|cardigan|top|t-shirt|tshirt/.test(path)) {
    return "children-baby-clothing";
  }
  if (/sunglass|eyewear|optical|glasses/.test(path)) return "optical-retail";
  if (/shoe|sneaker|boot|sandal|loafer|slipper|footwear/.test(path)) return "footwear";
  if (/watch|jewel|jewelry|jewellery/.test(path)) return "jewellery-watches";
  if (/underwear|lingerie|hosiery|sock|stocking/.test(path)) return "underwear-hosiery";
  if (/sport|activewear|athletic/.test(path)) return "sportswear-sporting-goods";
  if (/bag|handbag|backpack|wallet|purse|belt|leather|accessor|scarf|glove|hat|cap/.test(path)) {
    return "bags-accessories-leather";
  }
  if (/cosmetic|perfume|fragrance|beauty|makeup|skin care|skincare/.test(path)) return "cosmetics-perfumery";
  if (/cloth|apparel|dress|shirt|trouser|pant|jean|coat|jacket|sweater|cardigan|blazer|top|t-shirt|tshirt/.test(path)) {
    return child ? "children-baby-clothing" : "adult-clothing";
  }
  return null;
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
    output.push({
      externalVariantId,
      sku: optionalText(variant.sku),
      barcode: optionalText(variant.barcode),
      mpn: optionalText(variant.mpn),
      buyingCostMinor: nullableMinor(variant.buyingCostMinor),
      msrpMinor: nullableMinor(variant.msrpMinor),
      available: variant.available === true,
      quantity: nullableQuantity(variant.stockQuantity),
      stockStatus: optionalText(variant.stockStatus),
      attributes: variant.attributes ?? []
    });
  }
  return output;
}

function categoryDetails(value: unknown): { id: string; name: string }[] {
  if (!Array.isArray(value)) return [];
  const result: { id: string; name: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const id = optionalText(row.id);
    const name = optionalText(row.name);
    if (id && name) result.push({ id,name });
  }
  return result;
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
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function nullableQuantity(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function productModel(payload: Readonly<Record<string, unknown>>): string | null {
  return optionalText(payload.mpn) ?? optionalText(payload.sku);
}

function canonicalSlug(title: string, externalVariantId: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .slice(0,80) || "nova-product";
  return `${base}-${externalVariantId.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,32)}`;
}

function normalizeBrandName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
}

function nestedName(value: unknown): string | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? optionalText((value as Record<string, unknown>).name)
    : null;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
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

function zeroProductResult(): ProductMaterializationResult {
  return { variants: 0,canonicalCreated: 0,offersCreated: 0,taxonomyNodesCreated: 0,mappingsCreated: 0,reviewsCreated: 0 };
}

function emptyResult(enabled: boolean, message?: string): NovaMaterializationSliceResult {
  return { enabled,scanned: 0,variants: 0,canonicalCreated: 0,offersCreated: 0,taxonomyNodesCreated: 0,mappingsCreated: 0,reviewsCreated: 0,message };
}

export const NOVA_MATERIALIZER_SOURCE_CODE = SOURCE_CODE;
