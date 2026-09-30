import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import {
  ZendropClient,
  zendropAccessTokenFromEnvironment
} from "../../../../packages/dropship-suppliers/src/zendrop/client.ts";
import type {
  ZendropMyProduct,
  ZendropMyProductListItem
} from "../../../../packages/dropship-suppliers/src/zendrop/types.ts";
import {
  getShopifyBridgeProductVariants,
  shopifyBridgeConfigFromEnvironment
} from "./shopify-zendrop-bridge";

const SUPPLIER_CODE="zendrop";
const DEFAULT_PRODUCT_LIMIT=2;
const MAX_PRODUCT_LIMIT=5;
const IMPORT_POLL_MS=1_500;

type ProductTarget=Readonly<{
  supplierId:string;
  externalProductId:string;
}>;

type OfferVariant=Readonly<{
  supplierOfferId:string;
  externalVariantId:string;
  externalSku:string|null;
}>;

export type ZendropShopifyProvisioningResult=Readonly<{
  enabled:boolean;
  productsChecked:number;
  productsAdded:number;
  productsImported:number;
  variantsMapped:number;
  pending:number;
  blocked:number;
  message?:string;
}>;

/**
 * Imports materialized Zendrop products into the hidden Shopify bridge and
 * persists exact variant mappings. No fuzzy/position mapping is allowed:
 * supplier SKU <-> Shopify SKU must be unique on both sides.
 */
export async function runZendropShopifyProvisioningSlice(
  limit=productLimit()
):Promise<ZendropShopifyProvisioningResult>{
  const pool=getProductionPostgresRuntime().sqlPool;
  const supplier=await pool.query<SqlRow>(`
    SELECT ds.id::text supplier_id,
           ds.configuration->>'zendropStoreId' store_id
      FROM public.dropship_suppliers ds
     WHERE ds.code=$1
       AND ds.active=true
       AND ds.catalogue_sync_enabled=true
       AND ds.configuration->>'orderBridge'='shopify'
       AND ds.configuration->>'shopifyBridgeVerified'='true'
     LIMIT 1
  `,[SUPPLIER_CODE]);
  const supplierRow=supplier.rows[0];
  if(!supplierRow) return empty(false,"supplier_disabled_or_bridge_unverified");

  const supplierId=required(supplierRow.supplier_id,"Zendrop supplier id");
  const storeId=positiveInt(supplierRow.store_id,"Zendrop store id");
  const targets=await pool.query<SqlRow>(`
    SELECT dso.external_product_id,
           min(dso.created_at) first_seen
      FROM public.dropship_supplier_offers dso
     WHERE dso.supplier_id=$1::uuid
       AND NOT EXISTS (
         SELECT 1
           FROM public.dropship_shopify_bridge_variants bridge
          WHERE bridge.supplier_id=dso.supplier_id
            AND bridge.external_variant_id=dso.external_variant_id
            AND bridge.sync_status='synced'
       )
     GROUP BY dso.external_product_id
     ORDER BY first_seen,dso.external_product_id
     LIMIT $2
  `,[supplierId,Math.max(1,Math.min(MAX_PRODUCT_LIMIT,limit))]);

  if(!targets.rows.length) return empty(true,"no_unmapped_materialized_products");

  const client=new ZendropClient({
    accessToken:zendropAccessTokenFromEnvironment(),
    requestTimeoutMs:20_000
  });
  const shopDomain=`${shopifyBridgeConfigFromEnvironment().shop}.myshopify.com`;
  const totals={
    enabled:true,
    productsChecked:0,
    productsAdded:0,
    productsImported:0,
    variantsMapped:0,
    pending:0,
    blocked:0
  };

  for(const raw of targets.rows) {
    const target:ProductTarget={
      supplierId,
      externalProductId:required(raw.external_product_id,"Zendrop product id")
    };
    totals.productsChecked+=1;
    try {
      const outcome=await provisionProduct(client,storeId,shopDomain,target);
      totals.productsAdded+=outcome.added?1:0;
      totals.productsImported+=outcome.imported?1:0;
      totals.variantsMapped+=outcome.mapped;
      totals.pending+=outcome.pending?1:0;
      totals.blocked+=outcome.blocked?1:0;
    } catch(error) {
      totals.blocked+=1;
      console.warn(JSON.stringify({
        level:"warn",
        event:"zendrop.shopify_provisioning_failed",
        externalProductId:target.externalProductId,
        message:safeError(error)
      }));
    }
  }
  return totals;
}

async function provisionProduct(
  client:ZendropClient,
  storeId:number,
  shopDomain:string,
  target:ProductTarget
):Promise<Readonly<{
  added:boolean;
  imported:boolean;
  mapped:number;
  pending:boolean;
  blocked:boolean;
}>>{
  const productId=positiveInt(target.externalProductId,"Zendrop product id");
  let item=await findStoreProduct(client,storeId,productId);
  let added=false;
  let imported=false;

  if(!item) {
    await client.addMyProduct(productId,storeId);
    added=true;
    item=await findStoreProduct(client,storeId,productId);
    if(!item) return {added,imported,mapped:0,pending:true,blocked:false};
  }

  const importListId=positiveOptional(item.import_list_id);
  if(!importListId) {
    throw new Error(`Zendrop product ${productId} has no import_list_id`);
  }

  let detail=await client.getMyProduct(importListId);
  const importStatus=(detail.import_status ?? item.import_status ?? "").trim().toLowerCase();

  if(importStatus==="imported" || (!detail.store_product_id && importStatus!=="in_store")) {
    const operation=await client.importMyProduct(importListId);
    imported=true;
    const status=(operation.status??"").toLowerCase();
    if(status==="pending"||status==="processing") {
      await sleep(IMPORT_POLL_MS);
      const operationId=positiveOptional(operation.operation_id);
      if(operationId) {
        const refreshed=await client.getMyProductImportOperation(operationId);
        if((refreshed.status??"").toLowerCase()==="failed") {
          throw new Error(`Zendrop import failed: ${refreshed.failed_reason??"unknown"}`);
        }
      }
    } else if(status==="failed") {
      throw new Error(`Zendrop import failed: ${operation.failed_reason??"unknown"}`);
    }
    detail=await client.getMyProduct(importListId);
  }

  if((detail.import_status??"").toLowerCase()!=="in_store" || !detail.store_product_id) {
    return {added,imported,mapped:0,pending:true,blocked:false};
  }
  if(detail.store_sync_status && detail.store_sync_status!=="synced") {
    return {added,imported,mapped:0,pending:true,blocked:false};
  }

  const mappings=await resolveSkuMappings(target,detail);
  if(!mappings.length) return {added,imported,mapped:0,pending:false,blocked:true};

  const shopifyProductId=String(detail.store_product_id).replace("gid://shopify/Product/","");
  const pool=getProductionPostgresRuntime().sqlPool;
  let mapped=0;
  for(const mapping of mappings) {
    await pool.query(`
      INSERT INTO public.dropship_shopify_bridge_variants(
        supplier_id,supplier_offer_id,external_product_id,external_variant_id,external_sku,
        shop_domain,shopify_product_id,shopify_variant_id,zendrop_import_list_id,
        sync_status,last_error,metadata,synced_at,updated_at
      ) VALUES(
        $1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,
        'synced',NULL,$10::jsonb,now(),now()
      )
      ON CONFLICT (supplier_id,external_variant_id)
      DO UPDATE SET
        supplier_offer_id=EXCLUDED.supplier_offer_id,
        external_product_id=EXCLUDED.external_product_id,
        external_sku=EXCLUDED.external_sku,
        shop_domain=EXCLUDED.shop_domain,
        shopify_product_id=EXCLUDED.shopify_product_id,
        shopify_variant_id=EXCLUDED.shopify_variant_id,
        zendrop_import_list_id=EXCLUDED.zendrop_import_list_id,
        sync_status='synced',
        last_error=NULL,
        metadata=COALESCE(public.dropship_shopify_bridge_variants.metadata,'{}'::jsonb)||EXCLUDED.metadata,
        synced_at=now(),
        updated_at=now()
    `,[
      target.supplierId,mapping.supplierOfferId,target.externalProductId,
      mapping.externalVariantId,mapping.externalSku,shopDomain,
      shopifyProductId,mapping.shopifyVariantId,importListId,
      JSON.stringify({
        source:"zendrop_shopify_provisioner",
        mappingMethod:"unique_sku",
        zendropLinked:detail.zendrop_linked===true,
        storeSyncStatus:detail.store_sync_status??null
      })
    ]);
    mapped+=1;
  }
  return {added,imported,mapped,pending:false,blocked:false};
}

async function resolveSkuMappings(
  target:ProductTarget,
  detail:ZendropMyProduct
):Promise<readonly Readonly<{
  supplierOfferId:string;
  externalVariantId:string;
  externalSku:string;
  shopifyVariantId:string;
}>[]>{
  const pool=getProductionPostgresRuntime().sqlPool;
  const offers=await pool.query<SqlRow>(`
    SELECT id::text supplier_offer_id,external_variant_id,external_sku
      FROM public.dropship_supplier_offers
     WHERE supplier_id=$1::uuid
       AND external_product_id=$2
     ORDER BY external_variant_id
  `,[target.supplierId,target.externalProductId]);
  const source:OfferVariant[]=offers.rows.map(row=>({
    supplierOfferId:required(row.supplier_offer_id,"supplier offer id"),
    externalVariantId:required(row.external_variant_id,"external variant id"),
    externalSku:optional(row.external_sku)
  }));

  if(!detail.store_product_id) return [];
  const shopify=await getShopifyBridgeProductVariants(detail.store_product_id);
  const shopBySku=uniqueBySku(shopify.map(row=>({
    sku:row.sku,
    shopifyVariantId:row.numericId
  })));
  const sourceBySku=uniqueBySku(source.map(row=>({
    sku:row.externalSku,
    supplierOfferId:row.supplierOfferId,
    externalVariantId:row.externalVariantId
  })));

  const out:Array<{
    supplierOfferId:string;
    externalVariantId:string;
    externalSku:string;
    shopifyVariantId:string;
  }>=[];
  for(const [sku,sourceRow] of sourceBySku) {
    const shop=shopBySku.get(sku);
    if(!shop) continue;
    out.push({
      supplierOfferId:required(sourceRow.supplierOfferId,"supplier offer id"),
      externalVariantId:required(sourceRow.externalVariantId,"external variant id"),
      externalSku:sku,
      shopifyVariantId:required(shop.shopifyVariantId,"Shopify variant id")
    });
  }
  return out;
}

function uniqueBySku<T extends {sku:string|null}>(rows:readonly T[]):Map<string,T>{
  const counts=new Map<string,number>();
  for(const row of rows) {
    const sku=row.sku?.trim();
    if(sku) counts.set(sku,(counts.get(sku)??0)+1);
  }
  const result=new Map<string,T>();
  for(const row of rows) {
    const sku=row.sku?.trim();
    if(sku && counts.get(sku)===1) result.set(sku,row);
  }
  return result;
}

async function findStoreProduct(
  client:ZendropClient,
  storeId:number,
  productId:number
):Promise<ZendropMyProductListItem|null>{
  for(const status of ["in_store","imported"] as const) {
    for(let page=1;page<=3;page+=1) {
      const result=await client.getMyProducts({storeId,status,page,limit:60});
      const found=result.items?.find(item=>Number(item.product_id)===productId);
      if(found) return found;
      if((result.items?.length??0)<60) break;
    }
  }
  return null;
}

function productLimit():number{
  const n=Number(process.env.ZENDROP_SHOPIFY_PROVISION_LIMIT ?? DEFAULT_PRODUCT_LIMIT);
  return Number.isSafeInteger(n)&&n>0?Math.min(MAX_PRODUCT_LIMIT,n):DEFAULT_PRODUCT_LIMIT;
}
function positiveInt(value:unknown,label:string):number{
  const n=Number(value);if(!Number.isSafeInteger(n)||n<=0) throw new Error(`${label} must be positive`);return n;
}
function positiveOptional(value:unknown):number|null{
  const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null;
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
function empty(enabled:boolean,message?:string):ZendropShopifyProvisioningResult{
  return {enabled,productsChecked:0,productsAdded:0,productsImported:0,variantsMapped:0,pending:0,blocked:0,message};
}
function sleep(ms:number):Promise<void>{return new Promise(resolve=>setTimeout(resolve,ms));}
