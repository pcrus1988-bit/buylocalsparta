import { createHash, randomUUID } from "node:crypto";
import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import {
  ZendropClient,
  zendropAccessTokenFromEnvironment
} from "../../../../packages/dropship-suppliers/src/zendrop/client.ts";
import type {
  ZendropProduct,
  ZendropVariant
} from "../../../../packages/dropship-suppliers/src/zendrop/types.ts";

const SOURCE_CODE = "zendrop";
const SUPPLIER_CODE = "zendrop";
const DEFAULT_PER_PAGE = 60;
const DEFAULT_MAX_PAGES_PER_SLICE = 8;
const LEASE_SECONDS = 55;
const SLICE_MS = 45_000;

type ZendropSyncState = Readonly<{
  version: 1;
  cycleId: string;
  cycleStartedAt: string;
  nextPage: number;
  perPage: number;
  pagesCompleted: number;
  productsObserved: number;
  totalObserved: number | null;
  lastSuccessfulAt?: string;
  lastSuccessfulPage?: number;
  cycleCompletedAt?: string;
  leaseUntil?: string | null;
  lastError?: string | null;
}>;

export type ZendropCatalogueSyncSliceResult = Readonly<{
  claimed: boolean;
  pages: number;
  products: number;
  nextPage?: number;
  total?: number | null;
  cycleComplete?: boolean;
  message?: string;
}>;

export async function runZendropCatalogueSyncSlice(
  options: Readonly<{ maxPages?: number }> = {}
): Promise<ZendropCatalogueSyncSliceResult> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const claimed = await pool.query<SqlRow>(`
    UPDATE public.catalog_sources cs
       SET metadata=jsonb_set(
             COALESCE(cs.metadata,'{}'::jsonb),
             '{zendropSync}',
             COALESCE(cs.metadata->'zendropSync','{}'::jsonb)
               || jsonb_build_object(
                    'leaseUntil',now()+make_interval(secs => $3::int),
                    'lastAttemptAt',now()
                  ),
             true
           ),
           updated_at=now()
     WHERE cs.code=$1
       AND cs.active=true
       AND EXISTS (
         SELECT 1
           FROM public.dropship_suppliers ds
          WHERE ds.catalog_source_id=cs.id
            AND ds.code=$2
            AND ds.active=true
            AND ds.catalogue_sync_enabled=true
       )
       AND (
         NULLIF(cs.metadata #>> '{zendropSync,leaseUntil}','') IS NULL
         OR (cs.metadata #>> '{zendropSync,leaseUntil}')::timestamptz < now()
       )
    RETURNING cs.id,cs.metadata
  `, [SOURCE_CODE,SUPPLIER_CODE,LEASE_SECONDS]);

  const claimedRow=claimed.rows[0];
  if(!claimedRow) return { claimed:false,pages:0,products:0,message:"disabled_or_busy" };

  const sourceId=requiredText(claimedRow.id,"Zendrop source id");
  let state=parseState(record(claimedRow.metadata).zendropSync,new Date());
  await saveState(sourceId,{...state,leaseUntil:new Date(Date.now()+LEASE_SECONDS*1000).toISOString(),lastError:null});

  const client=new ZendropClient({
    accessToken:zendropAccessTokenFromEnvironment(),
    requestTimeoutMs:20_000
  });
  const deadline=Date.now()+SLICE_MS;
  const maxPages=Math.max(1,Math.min(20,options.maxPages ?? maxPagesPerSlice()));
  let pages=0;
  let products=0;
  let cycleComplete=false;

  try {
    while(Date.now()<deadline && pages<maxPages) {
      const pageNumber=state.nextPage;
      const result=await client.getProducts({ page:pageNumber,limit:state.perPage });
      await persistPage({
        sourceId,
        state,
        pageNumber,
        products:result.products,
        total:result.total
      });

      pages+=1;
      products+=result.products.length;
      const nowIso=new Date().toISOString();
      const total=result.total ?? state.totalObserved;
      const pageComplete=result.products.length===0
        || result.products.length<state.perPage
        || (total!==null && pageNumber*state.perPage>=total);

      state={
        ...state,
        nextPage:pageNumber+1,
        pagesCompleted:state.pagesCompleted+1,
        productsObserved:state.productsObserved+result.products.length,
        totalObserved:total,
        lastSuccessfulAt:nowIso,
        lastSuccessfulPage:pageNumber
      };

      if(pageComplete) {
        cycleComplete=true;
        await persistCycleSummary(sourceId,{...state,cycleCompletedAt:nowIso});
        state=newCycleState(new Date(),state.perPage,total);
      }
      await saveState(sourceId,state);
      if(cycleComplete) break;
    }

    await saveState(sourceId,{...state,leaseUntil:null});
    await recordHealth(true,null);
    return {
      claimed:true,
      pages,
      products,
      nextPage:state.nextPage,
      total:state.totalObserved,
      cycleComplete
    };
  } catch(error) {
    const message=safeError(error);
    await saveState(sourceId,{...state,leaseUntil:null,lastError:message}).catch(()=>undefined);
    await recordHealth(false,message).catch(()=>undefined);
    throw error;
  }
}

async function persistPage(input: Readonly<{
  sourceId:string;
  state:ZendropSyncState;
  pageNumber:number;
  products:readonly ZendropProduct[];
  total:number|null;
}>): Promise<void> {
  if(!input.products.length) return;
  const payloadText=JSON.stringify(input.products);
  const snapshotId=await persistSnapshot({
    sourceId:input.sourceId,
    hash:createHash("sha256").update(payloadText).digest("hex"),
    filename:`zendrop-catalogue-${input.state.cycleId}-page-${input.pageNumber}.json`,
    rowCount:input.products.length,
    metadata:{
      provider:"zendrop_mcp",
      cycleId:input.state.cycleId,
      page:input.pageNumber,
      limit:input.state.perPage,
      total:input.total,
      sourceLanguage:"en",
      publicationLanguagePolicy:"source_language_fallback_allowed"
    }
  });
  await insertEvidence(snapshotId,input.sourceId,input.products);
}

async function persistSnapshot(input: Readonly<{
  sourceId:string;
  hash:string;
  filename:string;
  rowCount:number;
  metadata:Readonly<Record<string,unknown>>;
}>): Promise<string> {
  const pool=getProductionPostgresRuntime().sqlPool;
  const inserted=await pool.query<SqlRow>(`
    INSERT INTO public.catalog_source_snapshots(
      source_id,source_filename,source_hash,source_version,observed_at,row_count,metadata
    ) VALUES($1::uuid,$2,$3,'zendrop-mcp-v1:catalogue',now(),$4,$5::jsonb)
    ON CONFLICT (source_id,source_hash) DO NOTHING
    RETURNING id
  `,[input.sourceId,input.filename,input.hash,input.rowCount,JSON.stringify(input.metadata)]);
  if(inserted.rows[0]?.id) return String(inserted.rows[0].id);
  const existing=await pool.query<SqlRow>(
    "SELECT id FROM public.catalog_source_snapshots WHERE source_id=$1::uuid AND source_hash=$2 LIMIT 1",
    [input.sourceId,input.hash]
  );
  return requiredText(existing.rows[0]?.id,"Zendrop snapshot id");
}

async function insertEvidence(
  snapshotId:string,
  sourceId:string,
  products:readonly ZendropProduct[]
): Promise<void> {
  const rows=products.flatMap(product=>{
    const id=scalar(product.id ?? product.product_id ?? product.productId);
    const title=scalar(product.name ?? product.title);
    if(!id || !title) return [];
    const variants=normalizedVariants(product.variants,id,product.price);
    const images=normalizedImages(product.images,product.image);
    const categories=Array.isArray(product.categories)
      ? product.categories.map(category=>({ id:scalar(category.id),name:scalar(category.name) })).filter(x=>x.id||x.name)
      : [];
    const availability=record(product.availability);
    return [{
      source_product_key:id,
      supplier_code:SUPPLIER_CODE,
      title,
      source_image_url:images[0]?.url ?? null,
      source_identity:{
        supplierCode:SUPPLIER_CODE,
        externalProductId:id,
        provider:"zendrop_mcp"
      },
      raw_payload:product,
      normalized_payload:{
        sourceLanguage:"en",
        description:scalar(product.description),
        images,
        categories,
        variants,
        supplierCostUsd:scalar(product.price),
        catalogueInStock:availability.in_stock===true,
        availabilityLabel:scalar(availability.inventory_level),
        currency:"USD"
      },
      quality_payload:{
        stagedOnly:true,
        publicationEligible:false,
        requiresTaxonomyMapping:true,
        requiresGreekLocalization:false,
        localizationRequiredForPublication:false,
        sourceLanguageFallbackAllowed:true,
        requiresStructuredPricing:true,
        requiresOrderForwardingSetup:false,
        authoritativeInventory:false
      },
      price_state:"unpriced",
      classification_status:"raw"
    }];
  });
  if(!rows.length) return;

  await getProductionPostgresRuntime().sqlPool.query(`
    INSERT INTO public.catalog_source_products(
      snapshot_id,source_id,source_product_key,supplier_code,title,source_image_url,
      source_identity,raw_payload,normalized_payload,quality_payload,price_state,classification_status
    )
    SELECT
      $1::uuid,$2::uuid,x.source_product_key,x.supplier_code,x.title,NULLIF(x.source_image_url,''),
      x.source_identity,x.raw_payload,x.normalized_payload,x.quality_payload,x.price_state,x.classification_status
      FROM jsonb_to_recordset($3::jsonb) AS x(
        source_product_key text,supplier_code text,title text,source_image_url text,
        source_identity jsonb,raw_payload jsonb,normalized_payload jsonb,quality_payload jsonb,
        price_state text,classification_status text
      )
    ON CONFLICT (snapshot_id,source_product_key) DO NOTHING
  `,[snapshotId,sourceId,JSON.stringify(rows)]);
}

function normalizedVariants(
  values:ZendropVariant[]|undefined,
  productId:string,
  fallbackPrice:unknown
): readonly Record<string,unknown>[] {
  const raw=Array.isArray(values)&&values.length ? values : [{ variant_id:productId,price:fallbackPrice }];
  return raw.flatMap((variant,index)=>{
    const externalVariantId=scalar(variant.variant_id ?? variant.id ?? variant.sku) ?? `${productId}-variant-${index+1}`;
    const price=scalar(variant.price ?? fallbackPrice);
    return [{
      externalVariantId,
      sku:scalar(variant.sku),
      price,
      buyingCostUsd:price,
      size:scalar(variant.size),
      color:scalar(variant.color),
      weight:variant.weight ?? null,
      dimensions:record(variant.dimensions),
      catalogueInStock:variant.inventory_level==="In stock" || variant.available===1,
      stockStatus:scalar(variant.inventory_level),
      attributes:{
        ...(scalar(variant.size)?{size:scalar(variant.size)}:{}),
        ...(scalar(variant.color)?{color:scalar(variant.color)}:{})
      }
    }];
  });
}

function normalizedImages(images:ZendropProduct["images"],fallback:unknown): readonly {id:string|null;url:string}[] {
  const values=Array.isArray(images)?images:[];
  const output:{id:string|null;url:string}[]=[];
  for(const value of values) {
    if(typeof value==="string" && value.trim()) output.push({id:null,url:value.trim()});
    else if(value && typeof value==="object" && !Array.isArray(value)) {
      const url=scalar(value.url);
      if(url) output.push({id:scalar(value.id),url});
    }
  }
  const fallbackUrl=scalar(fallback);
  if(fallbackUrl && !output.some(x=>x.url===fallbackUrl)) output.unshift({id:null,url:fallbackUrl});
  return output;
}

async function saveState(sourceId:string,state:ZendropSyncState):Promise<void>{
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.catalog_sources
       SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{zendropSync}',$2::jsonb,true),
           updated_at=now()
     WHERE id=$1::uuid
  `,[sourceId,JSON.stringify(state)]);
}

async function persistCycleSummary(sourceId:string,state:ZendropSyncState):Promise<void>{
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.catalog_sources
       SET metadata=jsonb_set(
             COALESCE(metadata,'{}'::jsonb),
             '{zendropLastCompletedCycle}',
             $2::jsonb,
             true
           ),
           updated_at=now()
     WHERE id=$1::uuid
  `,[sourceId,JSON.stringify({
    cycleId:state.cycleId,
    startedAt:state.cycleStartedAt,
    completedAt:state.cycleCompletedAt ?? new Date().toISOString(),
    pages:state.pagesCompleted,
    productsObserved:state.productsObserved,
    totalObserved:state.totalObserved
  })]);
}

async function recordHealth(ok:boolean,error:string|null):Promise<void>{
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.dropship_suppliers
       SET last_healthcheck_at=now(),
           last_healthcheck_ok=$2,
           configuration=CASE
             WHEN $3::text IS NULL THEN configuration-'lastHealthError'
             ELSE jsonb_set(COALESCE(configuration,'{}'::jsonb),'{lastHealthError}',to_jsonb($3::text),true)
           END,
           updated_at=now()
     WHERE code=$1
  `,[SUPPLIER_CODE,ok,error]);
}

function parseState(value:unknown,now:Date):ZendropSyncState{
  const input=record(value);
  const cycleId=scalar(input.cycleId);
  const started=validIso(input.cycleStartedAt);
  if(!cycleId||!started) return newCycleState(now,DEFAULT_PER_PAGE,nullableInt(input.totalObserved));
  return {
    version:1,
    cycleId,
    cycleStartedAt:started,
    nextPage:positiveInt(input.nextPage,1),
    perPage:Math.min(60,positiveInt(input.perPage,DEFAULT_PER_PAGE)),
    pagesCompleted:nonNegativeInt(input.pagesCompleted,0),
    productsObserved:nonNegativeInt(input.productsObserved,0),
    totalObserved:nullableInt(input.totalObserved),
    lastSuccessfulAt:validIso(input.lastSuccessfulAt) ?? undefined,
    lastSuccessfulPage:nullableInt(input.lastSuccessfulPage) ?? undefined,
    cycleCompletedAt:validIso(input.cycleCompletedAt) ?? undefined,
    leaseUntil:validIso(input.leaseUntil),
    lastError:typeof input.lastError==="string"?input.lastError.slice(0,500):null
  };
}

function newCycleState(now:Date,perPage:number,total:number|null):ZendropSyncState{
  return {
    version:1,
    cycleId:randomUUID(),
    cycleStartedAt:now.toISOString(),
    nextPage:1,
    perPage:Math.min(60,Math.max(1,perPage)),
    pagesCompleted:0,
    productsObserved:0,
    totalObserved:total,
    leaseUntil:null,
    lastError:null
  };
}

function maxPagesPerSlice():number{
  const raw=Number(process.env.ZENDROP_SYNC_MAX_PAGES_PER_SLICE ?? DEFAULT_MAX_PAGES_PER_SLICE);
  return Number.isSafeInteger(raw)&&raw>0?Math.min(20,raw):DEFAULT_MAX_PAGES_PER_SLICE;
}
function record(value:unknown):Record<string,any>{
  return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,any>:{};
}
function scalar(value:unknown):string|null{
  if(typeof value==="string"&&value.trim()) return value.trim();
  if(typeof value==="number"&&Number.isFinite(value)) return String(value);
  return null;
}
function requiredText(value:unknown,label:string):string{
  const result=scalar(value);if(!result) throw new Error(`${label} is required`);return result;
}
function nullableInt(value:unknown):number|null{
  const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;
}
function positiveInt(value:unknown,fallback:number):number{
  const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:fallback;
}
function nonNegativeInt(value:unknown,fallback:number):number{
  return nullableInt(value)??fallback;
}
function validIso(value:unknown):string|null{
  if(typeof value!=="string"||!value.trim()) return null;
  const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():null;
}
function safeError(error:unknown):string{
  return (error instanceof Error?`${error.name}:${error.message}`:String(error)).slice(0,500);
}
