import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { resolveZendropCategoryCode } from "./zendrop-category-mapping";
import { getUsdToEurReferenceRate } from "./zendrop-fx";
import {
  ZendropClient,
  zendropAccessTokenFromEnvironment
} from "../../../../packages/dropship-suppliers/src/zendrop/client.ts";
import {
  calculateZendropCustomerPrice
} from "../../../../packages/dropship-suppliers/src/zendrop/pricing.ts";

const SUPPLIER_CODE="zendrop";
const EXPECTED_OWNER_VENDOR="vendor_e8cb57b3c67b469d9a9d";
const CURSOR_KEY="zendropMaterializationCursor";
const DEFAULT_BATCH_SIZE=20;
const MAX_BATCH_SIZE=60;
const TAX_RATE_BPS=2400;
const AVAILABILITY_TTL_HOURS=12;

type Context=Readonly<{
  supplierId:string;
  sourceId:string;
  vendorId:string;
  vendorPublicId:string;
  locationId:string;
  marketId:string;
  cursor:string|null;
}>;

type SourceProduct=Readonly<{
  id:string;
  snapshotId:string;
  sourceProductKey:string;
  title:string;
  normalizedPayload:Readonly<Record<string,unknown>>;
}>;

type Variant=Readonly<{
  externalVariantId:string;
  sku:string|null;
  costUsdMinor:number|null;
  attributes:Readonly<Record<string,string>>;
}>;

export type ZendropMaterializationSliceResult=Readonly<{
  enabled:boolean;
  scanned:number;
  variants:number;
  familiesCreated:number;
  canonicalsCreated:number;
  offersCreated:number;
  priced:number;
  blocked:number;
  message?:string;
}>;

export async function runZendropCatalogueMaterializationSlice():Promise<ZendropMaterializationSliceResult>{
  const pool=getProductionPostgresRuntime().sqlPool;
  const contextResult=await pool.query<SqlRow>(`
    SELECT ds.id::text supplier_id,
           ds.catalog_source_id::text source_id,
           ds.owner_vendor_id::text vendor_id,
           vb.public_id vendor_public_id,
           ds.owner_location_id::text location_id,
           ds.market_id::text market_id,
           cs.metadata->>$2 cursor
      FROM public.dropship_suppliers ds
      JOIN public.catalog_sources cs ON cs.id=ds.catalog_source_id
      JOIN public.vendor_businesses vb ON vb.id=ds.owner_vendor_id
      JOIN public.vendor_locations vl ON vl.id=ds.owner_location_id
     WHERE ds.code=$1
       AND ds.active=true
       AND ds.catalogue_sync_enabled=true
       AND vl.active=true
     LIMIT 1
  `,[SUPPLIER_CODE,CURSOR_KEY]);
  const row=contextResult.rows[0];
  if(!row) return empty(false,"supplier_disabled_or_missing_location");

  const context:Context={
    supplierId:required(row.supplier_id,"supplier id"),
    sourceId:required(row.source_id,"source id"),
    vendorId:required(row.vendor_id,"vendor id"),
    vendorPublicId:required(row.vendor_public_id,"vendor public id"),
    locationId:required(row.location_id,"location id"),
    marketId:required(row.market_id,"market id"),
    cursor:optional(row.cursor)
  };
  if(context.vendorPublicId!==EXPECTED_OWNER_VENDOR) {
    throw new Error(`Zendrop supplier owner mismatch: ${context.vendorPublicId}`);
  }

  const candidates=await pool.query<SqlRow>(`
    SELECT DISTINCT ON (p.source_product_key)
           p.id::text,p.snapshot_id::text,p.source_product_key,p.title,p.normalized_payload,p.created_at
      FROM public.catalog_source_products p
     WHERE p.source_id=$1::uuid
       AND ($2::text IS NULL OR p.source_product_key>$2)
     ORDER BY p.source_product_key,p.created_at DESC,p.id DESC
     LIMIT $3
  `,[context.sourceId,context.cursor,batchSize()]);
  if(!candidates.rows.length) {
    if(context.cursor) {
      await saveCursor(context.sourceId,null);
      return empty(true,"materialization_cursor_wrapped");
    }
    return empty(true,"materialization_source_empty");
  }

  const fx=await getUsdToEurReferenceRate();
  const client=new ZendropClient({
    accessToken:zendropAccessTokenFromEnvironment(),
    requestTimeoutMs:15_000
  });

  const totals={
    enabled:true,
    scanned:candidates.rows.length,
    variants:0,
    familiesCreated:0,
    canonicalsCreated:0,
    offersCreated:0,
    priced:0,
    blocked:0
  };
  let lastKey:string|null=null;

  for(const raw of candidates.rows) {
    const source:SourceProduct={
      id:required(raw.id,"source product id"),
      snapshotId:required(raw.snapshot_id,"snapshot id"),
      sourceProductKey:required(raw.source_product_key,"source product key"),
      title:required(raw.title,"source title"),
      normalizedPayload:record(raw.normalized_payload)
    };
    lastKey=source.sourceProductKey;
    const result=await materializeProduct(context,source,client,fx);
    totals.variants+=result.variants;
    totals.familiesCreated+=result.familiesCreated;
    totals.canonicalsCreated+=result.canonicalsCreated;
    totals.offersCreated+=result.offersCreated;
    totals.priced+=result.priced;
    totals.blocked+=result.blocked;
    await saveCursor(context.sourceId,lastKey);
  }
  return totals;
}

async function materializeProduct(
  context:Context,
  source:SourceProduct,
  client:ZendropClient,
  usdToEurRate:number
){
  const pool=getProductionPostgresRuntime().sqlPool;
  const payload=source.normalizedPayload;
  const categoryCode=resolveZendropCategoryCode(source.title,payload.categories);
  const category=await pool.query<SqlRow>(`
    SELECT id::text
      FROM public.categories
     WHERE market_id=$1::uuid
       AND code=$2
       AND active=true
       AND assignable=true
       AND taxonomy_role='product_class'
     LIMIT 1
  `,[context.marketId,categoryCode]);
  const categoryId=required(category.rows[0]?.id,`category ${categoryCode}`);

  let familyId:string;
  let familyCreated=0;
  const family=await pool.query<SqlRow>(`
    SELECT id::text
      FROM public.product_families
     WHERE source_supplier_id=$1::uuid
       AND source_external_product_id=$2
     ORDER BY created_at
     LIMIT 1
  `,[context.supplierId,source.sourceProductKey]);
  if(family.rows[0]?.id) {
    familyId=String(family.rows[0].id);
    await pool.query(`
      UPDATE public.product_families
         SET category_id=$2::uuid,updated_at=now()
       WHERE id=$1::uuid
         AND category_id IS DISTINCT FROM $2::uuid
    `,[familyId,categoryId]);
  } else {
    const created=await pool.query<SqlRow>(`
      INSERT INTO public.product_families(
        market_id,category_id,model,active,source_supplier_id,source_external_product_id
      ) VALUES($1::uuid,$2::uuid,$3,false,$4::uuid,$5)
      RETURNING id::text
    `,[context.marketId,categoryId,source.title.slice(0,180),context.supplierId,source.sourceProductKey]);
    familyId=required(created.rows[0]?.id,"created Zendrop family");
    familyCreated=1;
  }

  let shippingUsdMinor:number;
  try {
    const quote=await client.getShippingEstimate(source.sourceProductKey,"GR");
    shippingUsdMinor=shippingMinor(quote.shipping_options);
  } catch(error) {
    console.warn(JSON.stringify({
      level:"warn",
      event:"zendrop.materialization_shipping_quote_failed",
      externalProductId:source.sourceProductKey,
      message:safeError(error)
    }));
    return {variants:normalizedVariants(payload).length,familiesCreated:familyCreated,canonicalsCreated:0,offersCreated:0,priced:0,blocked:1};
  }

  const variants=normalizedVariants(payload);
  let canonicalsCreated=0;
  let offersCreated=0;
  let priced=0;
  let blocked=0;

  for(const variant of variants) {
    if(!variant.costUsdMinor || variant.costUsdMinor<=0) {
      blocked+=1;
      continue;
    }
    const recommendation=calculateZendropCustomerPrice({
      productCostUsdMinor:variant.costUsdMinor,
      shippingUsdMinor,
      usdToEurRate
    });
    if(
      recommendation.customerPriceMinor===null
      || recommendation.productCostEurMinor===null
      || recommendation.shippingEurMinor===null
      || recommendation.landedCostEurMinor===null
    ) {
      blocked+=1;
      continue;
    }

    let canonicalId:string|null=null;
    const existing=await pool.query<SqlRow>(`
      SELECT id::text
        FROM public.canonical_variants
       WHERE family_id=$1::uuid
         AND variant_attributes->>'source'='zendrop_mcp_v1'
         AND variant_attributes->>'externalVariantId'=$2
       ORDER BY created_at
       LIMIT 1
    `,[familyId,variant.externalVariantId]);
    if(existing.rows[0]?.id) canonicalId=String(existing.rows[0].id);

    if(!canonicalId) {
      const slug=canonicalSlug(source.title,source.sourceProductKey,variant.externalVariantId);
      const created=await pool.query<SqlRow>(`
        INSERT INTO public.canonical_variants(
          market_id,family_id,category_id,slug,condition,commerce_channel,
          variant_attributes,platform_price_minor,currency,tax_rate_bps,
          active,suppressed,recalled
        ) VALUES(
          $1::uuid,$2::uuid,$3::uuid,$4,'new','normal',
          $5::jsonb,$6,'EUR',$7,false,false,false
        )
        RETURNING id::text
      `,[
        context.marketId,familyId,categoryId,slug,
        JSON.stringify({
          ...variant.attributes,
          source:"zendrop_mcp_v1",
          externalProductId:source.sourceProductKey,
          externalVariantId:variant.externalVariantId,
          externalSku:variant.sku
        }),
        recommendation.customerPriceMinor,
        TAX_RATE_BPS
      ]);
      canonicalId=required(created.rows[0]?.id,"created Zendrop canonical");
      canonicalsCreated+=1;
    } else {
      await pool.query(`
        UPDATE public.canonical_variants
           SET family_id=$2::uuid,
               category_id=$3::uuid,
               platform_price_minor=$4,
               tax_rate_bps=$5,
               updated_at=now()
         WHERE id=$1::uuid
      `,[canonicalId,familyId,categoryId,recommendation.customerPriceMinor,TAX_RATE_BPS]);
    }

    await upsertEnglishSourceCopy(canonicalId,source);
    await upsertMedia(context,canonicalId,source);
    await pool.query(`
      INSERT INTO public.catalog_source_product_links(
        source_product_id,canonical_variant_id,link_status,match_method,confidence,reasons,reviewed_at
      ) VALUES($1::uuid,$2::uuid,'approved','enrichment',1,$3::jsonb,now())
      ON CONFLICT (source_product_id,canonical_variant_id)
      DO UPDATE SET link_status='approved',confidence=1,reasons=EXCLUDED.reasons,updated_at=now()
    `,[source.id,canonicalId,JSON.stringify([{
      source:"zendrop_mcp_v1",
      externalProductId:source.sourceProductKey,
      externalVariantId:variant.externalVariantId,
      localizationRequiredForPublication:false,
      rule:"supplier_source_identity"
    }])]);

    const vendorSku=`zendrop:${variant.externalVariantId}`;
    const sourcePayload={
      dropship:true,
      supplierCode:SUPPLIER_CODE,
      externalProductId:source.sourceProductKey,
      externalVariantId:variant.externalVariantId,
      externalSku:variant.sku,
      publicationState:"STAGED",
      pricingPending:false,
      pricingManagedBy:"zendrop_gr_v2",
      pricingRule:recommendation.rule,
      productCostEurMinor:recommendation.productCostEurMinor,
      shippingEurMinor:recommendation.shippingEurMinor,
      landedCostEurMinor:recommendation.landedCostEurMinor,
      customerPriceMinor:recommendation.customerPriceMinor,
      sourceLanguage:"en",
      localizationRequiredForPublication:false,
      sourceLanguageFallbackAllowed:true
    };

    const offer=await pool.query<SqlRow>(`
      INSERT INTO public.vendor_offers(
        market_id,vendor_id,location_id,canonical_variant_id,vendor_sku,status,
        supplier_unit_price_minor,currency,supplier_tax_rate_bps,fulfilment_modes,
        advice_capabilities,source_payload,customer_price_minor,merchant_visible,
        merchant_pause_active,show_msrp
      ) VALUES(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'draft',
        $6,'EUR',$7,ARRAY['shipping'::fulfilment_mode],
        '{}'::jsonb,$8::jsonb,$9,false,false,false
      )
      ON CONFLICT (vendor_id,location_id,canonical_variant_id,vendor_sku)
      DO UPDATE SET
        supplier_unit_price_minor=EXCLUDED.supplier_unit_price_minor,
        customer_price_minor=EXCLUDED.customer_price_minor,
        customer_price_updated_at=now(),
        source_payload=COALESCE(public.vendor_offers.source_payload,'{}'::jsonb)||EXCLUDED.source_payload,
        updated_at=now()
      RETURNING id::text,(xmax=0) inserted
    `,[
      context.marketId,context.vendorId,context.locationId,canonicalId,vendorSku,
      recommendation.landedCostEurMinor,TAX_RATE_BPS,JSON.stringify(sourcePayload),
      recommendation.customerPriceMinor
    ]);
    const offerId=required(offer.rows[0]?.id,"Zendrop vendor offer");
    if(offer.rows[0]?.inserted===true) offersCreated+=1;

    await pool.query(`
      INSERT INTO public.vendor_offer_pricing_private(
        offer_id,vendor_id,buying_price_minor,pricing_mode,markup_type,markup_value
      ) VALUES($1::uuid,$2::uuid,$3,'manual','percent',25)
      ON CONFLICT (offer_id)
      DO UPDATE SET buying_price_minor=EXCLUDED.buying_price_minor,
                    markup_type='percent',markup_value=25,updated_at=now()
    `,[offerId,context.vendorId,recommendation.landedCostEurMinor]);

    await pool.query(`
      INSERT INTO public.dropship_supplier_offers(
        supplier_id,vendor_offer_id,source_product_id,external_product_id,external_variant_id,
        external_sku,supplier_cost_minor,supplier_currency,cached_available,cached_quantity,
        availability_checked_at,availability_expires_at,availability_payload,last_catalogue_sync_at,active
      ) VALUES(
        $1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,'EUR',false,0,
        now(),now()+make_interval(hours => $8::int),$9::jsonb,now(),false
      )
      ON CONFLICT (supplier_id,external_variant_id)
      DO UPDATE SET
        vendor_offer_id=EXCLUDED.vendor_offer_id,
        source_product_id=EXCLUDED.source_product_id,
        external_product_id=EXCLUDED.external_product_id,
        external_sku=COALESCE(EXCLUDED.external_sku,public.dropship_supplier_offers.external_sku),
        supplier_cost_minor=EXCLUDED.supplier_cost_minor,
        supplier_currency='EUR',
        last_catalogue_sync_at=now(),
        availability_payload=COALESCE(public.dropship_supplier_offers.availability_payload,'{}'::jsonb)
          || EXCLUDED.availability_payload,
        updated_at=now()
    `,[
      context.supplierId,offerId,source.id,source.sourceProductKey,variant.externalVariantId,
      variant.sku,recommendation.landedCostEurMinor,AVAILABILITY_TTL_HOURS,
      JSON.stringify({
        source:"zendrop_catalogue_materializer",
        inventoryAuthority:"shopify_bridge_inventory_quantity",
        bridgeStatus:"pending",
        catalogueInStock:payload.catalogueInStock===true,
        shippingUsdMinor,
        productCostUsdMinor:variant.costUsdMinor,
        usdToEurRate,
        pricingRule:recommendation.rule
      })
    ]);
    priced+=1;
  }

  return {variants:variants.length,familiesCreated:familyCreated,canonicalsCreated,offersCreated,priced,blocked};
}

async function upsertEnglishSourceCopy(canonicalId:string,source:SourceProduct):Promise<void>{
  const description=sanitizeDescription(optional(source.normalizedPayload.description));
  await getProductionPostgresRuntime().sqlPool.query(`
    INSERT INTO public.product_translations(
      canonical_variant_id,locale,title,description,specifications,seo_title,seo_description
    ) VALUES($1::uuid,'en',$2,$3,$4::jsonb,NULL,NULL)
    ON CONFLICT (canonical_variant_id,locale)
    DO UPDATE SET
      title=CASE
        WHEN NULLIF(btrim(public.product_translations.title),'') IS NULL THEN EXCLUDED.title
        ELSE public.product_translations.title
      END,
      description=CASE
        WHEN NULLIF(btrim(public.product_translations.description),'') IS NULL THEN EXCLUDED.description
        ELSE public.product_translations.description
      END
  `,[
    canonicalId,source.title,description,
    JSON.stringify({source:"zendrop_mcp_v1",sourceLanguage:"en",supplierContent:true})
  ]);
}

async function upsertMedia(context:Context,canonicalId:string,source:SourceProduct):Promise<void>{
  const images=Array.isArray(source.normalizedPayload.images)?source.normalizedPayload.images:[];
  let order=0;
  for(const value of images.slice(0,20)) {
    if(!value||typeof value!=="object"||Array.isArray(value)) continue;
    const url=optional((value as Record<string,unknown>).url);
    if(!url) continue;
    await getProductionPostgresRuntime().sqlPool.query(`
      INSERT INTO public.product_media(
        canonical_variant_id,vendor_id,kind,object_key,alt_text,rights_owner,
        rights_status,moderation_status,sort_order,original_filename,content_type,
        scan_status,reviewed_at,source_id,source_url
      )
      SELECT
        $1::uuid,$2::uuid,'image',NULL,$3,'KONTA MOY supplier catalogue',
        'approved','approved',$4,$5,$6,'clean',now(),$7::uuid,$8
      WHERE NOT EXISTS (
        SELECT 1
          FROM public.product_media pm
         WHERE pm.canonical_variant_id=$1::uuid
           AND pm.source_url=$8
      )
    `,[
      canonicalId,context.vendorId,source.title,order,
      `zendrop:${source.sourceProductKey}:${order}`,
      contentType(url),context.sourceId,url
    ]);
    order+=1;
  }
}

async function saveCursor(sourceId:string,cursor:string|null):Promise<void>{
  const pool=getProductionPostgresRuntime().sqlPool;
  if(cursor===null) {
    await pool.query(`
      UPDATE public.catalog_sources SET metadata=COALESCE(metadata,'{}'::jsonb)-$2,updated_at=now()
       WHERE id=$1::uuid
    `,[sourceId,CURSOR_KEY]);
    return;
  }
  await pool.query(`
    UPDATE public.catalog_sources
       SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),ARRAY[$2]::text[],to_jsonb($3::text),true),
           updated_at=now()
     WHERE id=$1::uuid
  `,[sourceId,CURSOR_KEY,cursor]);
}

function normalizedVariants(payload:Readonly<Record<string,unknown>>):Variant[]{
  const raw=Array.isArray(payload.variants)?payload.variants:[];
  return raw.flatMap(value=>{
    if(!value||typeof value!=="object"||Array.isArray(value)) return [];
    const row=value as Record<string,unknown>;
    const externalVariantId=optional(row.externalVariantId);
    if(!externalVariantId) return [];
    const price=Number(optional(row.buyingCostUsd) ?? optional(row.price));
    const costUsdMinor=Number.isFinite(price)&&price>0?Math.round(price*100):null;
    const attributes=record(row.attributes);
    return [{
      externalVariantId,
      sku:optional(row.sku),
      costUsdMinor,
      attributes:Object.fromEntries(
        Object.entries(attributes)
          .filter(([,v])=>typeof v==="string"&&v.trim())
          .map(([k,v])=>[k,String(v)])
      )
    }];
  });
}

function shippingMinor(options:unknown):number{
  if(!Array.isArray(options)) throw new Error("Zendrop Greece shipping quote has no options");
  const parsed=options.flatMap(value=>{
    if(!value||typeof value!=="object"||Array.isArray(value)) return [];
    const row=value as Record<string,unknown>;
    const price=Number(row.price);
    if(!Number.isFinite(price)||price<0) return [];
    return [{type:optional(row.type),minor:Math.round(price*100)}];
  });
  if(!parsed.length) throw new Error("Zendrop Greece shipping quote has no valid price");
  const regular=parsed.find(x=>x.type?.toLowerCase()==="regular");
  return (regular??parsed.sort((a,b)=>a.minor-b.minor)[0]!).minor;
}

function canonicalSlug(title:string,productId:string,variantId:string):string{
  const base=title.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,100) || "product";
  return `zendrop-${base}-${productId}-${variantId}`.slice(0,180);
}
function sanitizeDescription(value:string|null):string|null{
  if(!value) return null;
  const text=value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<br\s*\/?\s*>/gi,"\n")
    .replace(/<\/p\s*>/gi,"\n")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/[ \t]+/g," ")
    .replace(/\n\s*\n+/g,"\n")
    .trim();
  return text?text.slice(0,6000):null;
}
function contentType(url:string):string|null{
  const clean=url.split("?")[0]?.toLowerCase()??"";
  if(clean.endsWith(".webp")) return "image/webp";
  if(clean.endsWith(".png")) return "image/png";
  if(clean.endsWith(".jpg")||clean.endsWith(".jpeg")) return "image/jpeg";
  return null;
}
function batchSize():number{
  const n=Number(process.env.ZENDROP_MATERIALIZATION_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
  return Number.isSafeInteger(n)&&n>0?Math.min(MAX_BATCH_SIZE,n):DEFAULT_BATCH_SIZE;
}
function record(value:unknown):Record<string,any>{
  return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,any>:{};
}
function optional(value:unknown):string|null{
  if(typeof value==="string"&&value.trim()) return value.trim();
  if(typeof value==="number"&&Number.isFinite(value)) return String(value);
  return null;
}
function required(value:unknown,label:string):string{
  const result=optional(value);if(!result) throw new Error(`${label} is required`);return result;
}
function safeError(error:unknown):string{
  return (error instanceof Error?`${error.name}:${error.message}`:String(error)).slice(0,500);
}
function empty(enabled:boolean,message?:string):ZendropMaterializationSliceResult{
  return {enabled,scanned:0,variants:0,familiesCreated:0,canonicalsCreated:0,offersCreated:0,priced:0,blocked:0,message};
}
