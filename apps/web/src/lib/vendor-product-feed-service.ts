import type { PoolClient } from "pg";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { fetchVendorProductFeedXml, normalizeSourceUrl } from "./vendor-feed-fetch";
import {
  analyzeVendorProductXml,
  type VendorFeedAnalysis,
  type VendorFeedMapping,
  type VendorFeedNormalizedItem
} from "./vendor-product-feed-xml";

export type VendorFeedCreateInput=Readonly<{
  name:string;
  sourceKind:"upload"|"url";
  sourceUrl?:string;
  sourceFilename?:string;
  xml?:string;
  mapping?:VendorFeedMapping;
  syncIntervalMinutes?:60|180|360|1440;
}>;

export type VendorFeedSummary=Readonly<{
  id:string;
  name:string;
  sourceKind:"upload"|"url";
  sourceUrl?:string;
  sourceFilename?:string;
  status:"active"|"paused"|"error";
  detectedFormat:string;
  mapping:VendorFeedMapping;
  observedFields:readonly string[];
  syncIntervalMinutes:number;
  missingGraceRuns:number;
  productCount:number;
  readyCount:number;
  warningCount:number;
  errorCount:number;
  excludedCount:number;
  lastSyncStartedAt?:number;
  lastSyncCompletedAt?:number;
  nextSyncAt?:number;
  lastError?:string;
  consecutiveFailures:number;
}>;

type FeedRow=Readonly<{
  id:string;
  public_id:string;
  vendor_id:string;
  vendor_public_id:string;
  market_id:string;
  location_id:string;
  name:string;
  source_kind:"upload"|"url";
  source_url:string|null;
  source_filename:string|null;
  status:"active"|"paused"|"error";
  mapping:unknown;
  sync_interval_minutes:number;
  missing_grace_runs:number;
  created_by:string|null;
}>;

const pool=()=>getProductionPostgresRuntime().nativePool;
const epoch=(value:unknown):number|undefined=>value ? new Date(String(value)).getTime() : undefined;
const text=(value:unknown):string=>typeof value==="string"?value:String(value??"");
const optionalText=(value:unknown):string|undefined=>typeof value==="string"&&value.trim()?value.trim():undefined;
const integer=(value:unknown):number=>Number.isFinite(Number(value))?Math.trunc(Number(value)):0;
const jsonObject=(value:unknown):Record<string,unknown>=>{
  if (!value) return {};
  if (typeof value==="string") {
    try { const parsed=JSON.parse(value); return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as Record<string,unknown>:{}; }
    catch { return {}; }
  }
  return typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
};
const stringArray=(value:unknown):string[]=>{
  if (Array.isArray(value)) return value.map(String);
  if (typeof value==="string") { try { const parsed=JSON.parse(value); return Array.isArray(parsed)?parsed.map(String):[]; } catch { return []; } }
  return [];
};

function requiredVendorId(principal:SessionPrincipal):string {
  if (!principal.vendorId || !principal.roles.some((role)=>role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

export async function analyzeVendorFeedInput(input:Readonly<{sourceKind:"upload"|"url";sourceUrl?:string;xml?:string;mapping?:VendorFeedMapping}>) {
  const source=input.sourceKind==="url"
    ? await fetchVendorProductFeedXml(normalizeSourceUrl(input.sourceUrl??""))
    : {xml:input.xml??"",finalUrl:"",contentType:"application/xml"};
  const analysis=analyzeVendorProductXml(source.xml,input.mapping??{});
  return {
    ...analysis,
    items:analysis.items.slice(0,100),
    sourceUrl:source.finalUrl||undefined,
    truncatedPreview:analysis.items.length>100
  };
}

export async function vendorProductFeedWorkspace(principal:SessionPrincipal) {
  const vendorId=requiredVendorId(principal);
  const [feeds,runs,issues]=await Promise.all([
    pool().query(`
      SELECT f.public_id,f.name,f.source_kind,f.source_url,f.source_filename,f.status,f.detected_format,
             f.mapping,f.observed_fields,f.sync_interval_minutes,f.missing_grace_runs,
             f.last_product_count,f.last_ready_count,f.last_warning_count,f.last_error_count,f.last_excluded_count,
             f.last_sync_started_at,f.last_sync_completed_at,f.next_sync_at,f.last_error,f.consecutive_failures
      FROM public.vendor_product_feeds f
      JOIN public.vendor_businesses vb ON vb.id=f.vendor_id
      WHERE vb.public_id=$1
      ORDER BY f.created_at DESC
    `,[vendorId]),
    pool().query(`
      SELECT r.public_id,f.public_id AS feed_public_id,f.name AS feed_name,r.trigger_type,r.status,
             r.product_count,r.ready_count,r.warning_count,r.error_count,r.excluded_count,
             r.new_count,r.updated_count,r.missing_count,r.linked_offer_count,r.submission_count,
             r.error_message,r.started_at,r.completed_at
      FROM public.vendor_product_feed_runs r
      JOIN public.vendor_product_feeds f ON f.id=r.feed_id
      JOIN public.vendor_businesses vb ON vb.id=r.vendor_id
      WHERE vb.public_id=$1
      ORDER BY r.started_at DESC
      LIMIT 30
    `,[vendorId]),
    pool().query(`
      SELECT f.public_id AS feed_public_id,i.external_product_id,i.title,i.state,i.validation_messages,
             i.vendor_sku,i.gtin,i.category_path,i.updated_at
      FROM public.vendor_product_feed_items i
      JOIN public.vendor_product_feeds f ON f.id=i.feed_id
      JOIN public.vendor_businesses vb ON vb.id=i.vendor_id
      WHERE vb.public_id=$1 AND i.state IN ('warning','error','missing')
      ORDER BY CASE i.state WHEN 'error' THEN 0 WHEN 'missing' THEN 1 ELSE 2 END,i.updated_at DESC
      LIMIT 80
    `,[vendorId])
  ]);
  return {
    csrfToken:principal.csrfToken,
    feeds:feeds.rows.map(feedSummary),
    runs:runs.rows.map((row)=>({
      id:text(row.public_id),feedId:text(row.feed_public_id),feedName:text(row.feed_name),triggerType:text(row.trigger_type),status:text(row.status),
      productCount:integer(row.product_count),readyCount:integer(row.ready_count),warningCount:integer(row.warning_count),errorCount:integer(row.error_count),excludedCount:integer(row.excluded_count),
      newCount:integer(row.new_count),updatedCount:integer(row.updated_count),missingCount:integer(row.missing_count),
      linkedOfferCount:integer(row.linked_offer_count),submissionCount:integer(row.submission_count),
      error:optionalText(row.error_message),startedAt:epoch(row.started_at)??Date.now(),completedAt:epoch(row.completed_at)
    })),
    issues:issues.rows.map((row)=>({
      feedId:text(row.feed_public_id),externalProductId:text(row.external_product_id),title:text(row.title),state:text(row.state),
      messages:Array.isArray(row.validation_messages)?row.validation_messages:[],vendorSku:optionalText(row.vendor_sku),gtin:optionalText(row.gtin),
      categoryPath:optionalText(row.category_path),updatedAt:epoch(row.updated_at)??Date.now()
    }))
  };
}

export async function createVendorProductFeed(principal:SessionPrincipal,input:VendorFeedCreateInput) {
  const vendorPublicId=requiredVendorId(principal);
  const name=input.name.trim();
  if (!name) throw new Error("Feed name is required");
  const interval=normalizeInterval(input.syncIntervalMinutes);
  const sourceUrl=input.sourceKind==="url" ? normalizeSourceUrl(input.sourceUrl??"") : undefined;
  const source=input.sourceKind==="url"
    ? await fetchVendorProductFeedXml(sourceUrl!)
    : {xml:input.xml??"",finalUrl:"",contentType:"application/xml"};
  const analysis=analyzeVendorProductXml(source.xml,input.mapping??{});
  assertRequiredMapping(analysis.mapping);

  const client=await pool().connect();
  let feedPublicId="";
  try {
    await client.query("BEGIN");
    const refs=await client.query(`
      SELECT vb.id::text AS vendor_id,vb.market_id::text AS market_id,
             (SELECT vl.id::text FROM public.vendor_locations vl WHERE vl.vendor_id=vb.id AND vl.active ORDER BY vl.created_at LIMIT 1) AS location_id,
             (SELECT u.id::text FROM public.users u WHERE u.public_id=$2 OR u.id::text=$2 LIMIT 1) AS user_id
      FROM public.vendor_businesses vb WHERE vb.public_id=$1 OR vb.id::text=$1 LIMIT 1
      FOR UPDATE
    `,[vendorPublicId,principal.userId]);
    const ref=refs.rows[0];
    if (!ref?.vendor_id) throw new Error("Vendor not found");
    if (!ref.location_id) throw new Error("Vendor location is not configured");
    const inserted=await client.query(`
      INSERT INTO public.vendor_product_feeds(
        vendor_id,market_id,location_id,name,source_kind,source_url,source_filename,status,
        detected_format,record_tag,mapping,observed_fields,sync_interval_minutes,last_source_hash,
        last_product_count,last_ready_count,last_warning_count,last_error_count,last_excluded_count,
        last_sync_started_at,created_by,created_at,updated_at
      ) VALUES(
        $1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,'active',$8,$9,$10::jsonb,$11::jsonb,$12,$13,
        $14,$15,$16,$17,$18,now(),$19::uuid,now(),now()
      ) RETURNING public_id
    `,[
      ref.vendor_id,ref.market_id,ref.location_id,name,input.sourceKind,sourceUrl??null,input.sourceFilename?.trim()||null,
      analysis.detectedFormat,analysis.recordTag,JSON.stringify(analysis.mapping),JSON.stringify(analysis.fields),interval,analysis.sourceHash,
      analysis.productCount,analysis.readyCount,analysis.warningCount,analysis.errorCount,analysis.excludedCount,ref.user_id??null
    ]);
    feedPublicId=text(inserted.rows[0]?.public_id);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }

  await persistFeedAnalysis(feedPublicId,analysis,input.sourceKind==="upload"?"upload":"manual",vendorPublicId);
  return vendorProductFeedWorkspace(principal);
}

export async function syncVendorProductFeed(principal:SessionPrincipal,feedPublicId:string,xml?:string) {
  const vendorPublicId=requiredVendorId(principal);
  await syncVendorProductFeedById(feedPublicId,{vendorPublicId,triggerType:"manual",xml});
  return vendorProductFeedWorkspace(principal);
}

export async function updateVendorProductFeed(principal:SessionPrincipal,feedPublicId:string,input:Readonly<{status?:"active"|"paused";syncIntervalMinutes?:number;mapping?:VendorFeedMapping}>) {
  const vendorPublicId=requiredVendorId(principal);
  const fields:string[]=[];
  const values:unknown[]=[feedPublicId,vendorPublicId];
  if (input.status) { fields.push(`status=$${values.length+1}`); values.push(input.status); fields.push(`last_error=NULL`); }
  if (input.syncIntervalMinutes!==undefined) { fields.push(`sync_interval_minutes=$${values.length+1}`); values.push(normalizeInterval(input.syncIntervalMinutes)); }
  if (input.mapping) { fields.push(`mapping=$${values.length+1}::jsonb`); values.push(JSON.stringify(input.mapping)); }
  if (!fields.length) return vendorProductFeedWorkspace(principal);
  fields.push("next_sync_at=CASE WHEN source_kind='url' AND status='active' THEN LEAST(COALESCE(next_sync_at,now()),now()) ELSE next_sync_at END","updated_at=now()");
  const result=await pool().query(`
    UPDATE public.vendor_product_feeds f SET ${fields.join(",")}
    WHERE f.public_id=$1 AND f.vendor_id=(SELECT id FROM public.vendor_businesses WHERE public_id=$2 OR id::text=$2 LIMIT 1)
    RETURNING f.public_id
  `,values);
  if (!result.rowCount) throw new Error("Feed not found");
  return vendorProductFeedWorkspace(principal);
}

export async function syncVendorProductFeedById(
  feedPublicId:string,
  options:Readonly<{vendorPublicId?:string;triggerType:"manual"|"scheduled";xml?:string}>
) {
  const found=await pool().query<FeedRow>(`
    SELECT f.id::text,f.public_id,f.vendor_id::text,f.market_id::text,f.location_id::text,f.name,f.source_kind,f.source_url,f.source_filename,
           f.status,f.mapping,f.sync_interval_minutes,f.missing_grace_runs,f.created_by::text,
           vb.public_id AS vendor_public_id
    FROM public.vendor_product_feeds f JOIN public.vendor_businesses vb ON vb.id=f.vendor_id
    WHERE f.public_id=$1
      AND ($2::text IS NULL OR vb.public_id=$2 OR vb.id::text=$2)
    LIMIT 1
  `,[feedPublicId,options.vendorPublicId??null]);
  const feed=found.rows[0];
  if (!feed) throw new Error("Feed not found");
  if (feed.status==="paused") throw new Error("Feed synchronization is paused");

  try {
    const xml=options.xml ?? (feed.source_kind==="url" && feed.source_url ? (await fetchVendorProductFeedXml(feed.source_url)).xml : undefined);
    if (!xml) throw new Error("Upload feeds require a new XML file for manual synchronization");
    const analysis=analyzeVendorProductXml(xml,jsonObject(feed.mapping) as VendorFeedMapping);
    assertRequiredMapping(analysis.mapping);
    return await persistFeedAnalysis(feed.public_id,analysis,options.triggerType,options.vendorPublicId);
  } catch (error) {
    const message=error instanceof Error?error.message:"feed_sync_failed";
    await markFeedFailure(feed.public_id,message,options.triggerType);
    throw error;
  }
}

export async function syncDueVendorProductFeeds(limit=3) {
  const claimed=await pool().query(`
    WITH due AS (
      SELECT id FROM public.vendor_product_feeds
      WHERE source_kind='url' AND status='active' AND COALESCE(next_sync_at,now())<=now()
      ORDER BY COALESCE(next_sync_at,created_at),id
      FOR UPDATE SKIP LOCKED
      LIMIT $1
    )
    UPDATE public.vendor_product_feeds f
       SET next_sync_at=now()+interval '10 minutes',last_sync_started_at=now(),updated_at=now()
      FROM due WHERE f.id=due.id
    RETURNING f.public_id
  `,[Math.max(1,Math.min(10,Math.trunc(limit)))]);
  const results=[];
  for (const row of claimed.rows) {
    const id=text(row.public_id);
    try { results.push({id,ok:true,result:await syncVendorProductFeedById(id,{triggerType:"scheduled"})}); }
    catch (error) { results.push({id,ok:false,error:error instanceof Error?error.message:"feed_sync_failed"}); }
  }
  return {claimed:claimed.rowCount,results};
}

export async function adminVendorProductFeedWorkspace() {
  const result=await pool().query(`
    SELECT f.public_id,f.name,f.source_kind,f.source_url,f.status,f.detected_format,f.sync_interval_minutes,
           f.last_product_count,f.last_ready_count,f.last_warning_count,f.last_error_count,f.last_excluded_count,
           f.last_sync_completed_at,f.next_sync_at,f.last_error,f.consecutive_failures,
           vb.public_id AS vendor_public_id,vb.business_name AS vendor_name
    FROM public.vendor_product_feeds f
    JOIN public.vendor_businesses vb ON vb.id=f.vendor_id
    ORDER BY CASE f.status WHEN 'error' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,f.updated_at DESC
    LIMIT 500
  `);
  return result.rows.map((row)=>({
    ...feedSummary(row),
    vendorId:text(row.vendor_public_id),
    vendorName:text(row.vendor_name)
  }));
}

async function persistFeedAnalysis(
  feedPublicId:string,
  analysis:VendorFeedAnalysis,
  triggerType:"upload"|"manual"|"scheduled",
  expectedVendorPublicId?:string
) {
  const client=await pool().connect();
  const seenAt=new Date();
  try {
    await client.query("BEGIN");
    const selected=await client.query<FeedRow>(`
      SELECT f.id::text,f.public_id,f.vendor_id::text,f.market_id::text,f.location_id::text,f.name,f.source_kind,f.source_url,f.source_filename,
             f.status,f.mapping,f.sync_interval_minutes,f.missing_grace_runs,f.created_by::text,vb.public_id AS vendor_public_id
      FROM public.vendor_product_feeds f JOIN public.vendor_businesses vb ON vb.id=f.vendor_id
      WHERE f.public_id=$1 AND ($2::text IS NULL OR vb.public_id=$2 OR vb.id::text=$2)
      FOR UPDATE
    `,[feedPublicId,expectedVendorPublicId??null]);
    const feed=selected.rows[0];
    if (!feed) throw new Error("Feed not found");
    if (feed.status==="paused" && triggerType!=="upload") throw new Error("Feed synchronization is paused");

    const run=await client.query(`
      INSERT INTO public.vendor_product_feed_runs(feed_id,vendor_id,market_id,trigger_type,status,source_hash,started_at)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4,'running',$5,$6) RETURNING id::text,public_id
    `,[feed.id,feed.vendor_id,feed.market_id,triggerType,analysis.sourceHash,seenAt]);

    const eligible=analysis.items.filter((item)=>item.externalProductId&&item.title&&item.state!=="excluded");
    const upsert=await upsertItems(client,feed,eligible,seenAt);
    const missing=await client.query(`
      UPDATE public.vendor_product_feed_items
         SET missing_successful_runs=missing_successful_runs+1,state='missing',updated_at=now()
       WHERE feed_id=$1::uuid AND last_seen_at<$2
       RETURNING id
    `,[feed.id,seenAt]);

    await linkExistingCommerce(client,feed);
    const submissions=await createFeedSubmissions(client,feed);
    await linkExistingCommerce(client,feed);
    const commerce=await applyLinkedCommerce(client,feed);
    const reconciled=await reconcileMissingOffers(client,feed);

    const nextSync=feed.source_kind==="url" ? new Date(Date.now()+feed.sync_interval_minutes*60_000) : null;
    await client.query(`
      UPDATE public.vendor_product_feeds SET
        status='active',detected_format=$2,record_tag=$3,mapping=$4::jsonb,observed_fields=$5::jsonb,
        last_source_hash=$6,last_product_count=$7,last_ready_count=$8,last_warning_count=$9,last_error_count=$10,last_excluded_count=$11,
        last_sync_started_at=COALESCE(last_sync_started_at,$12),last_sync_completed_at=now(),next_sync_at=$13,
        last_error=NULL,consecutive_failures=0,updated_at=now()
      WHERE id=$1::uuid
    `,[feed.id,analysis.detectedFormat,analysis.recordTag,JSON.stringify(analysis.mapping),JSON.stringify(analysis.fields),analysis.sourceHash,
      analysis.productCount,analysis.readyCount,analysis.warningCount,analysis.errorCount,analysis.excludedCount,seenAt,nextSync]);

    await client.query(`
      UPDATE public.vendor_product_feed_runs SET
        status='succeeded',product_count=$2,ready_count=$3,warning_count=$4,error_count=$5,excluded_count=$6,
        new_count=$7,updated_count=$8,missing_count=$9,linked_offer_count=$10,submission_count=$11,completed_at=now()
      WHERE id=$1::uuid
    `,[text(run.rows[0]?.id),analysis.productCount,analysis.readyCount,analysis.warningCount,analysis.errorCount,analysis.excludedCount,
      upsert.inserted,upsert.updated,missing.rowCount,commerce.linkedOffers,submissions+reconciled.submissions,commerce.stockUpdates]);

    await client.query("COMMIT");
    return {
      feedId:feed.public_id,
      productCount:analysis.productCount,
      readyCount:analysis.readyCount,
      warningCount:analysis.warningCount,
      errorCount:analysis.errorCount,
      excludedCount:analysis.excludedCount,
      newCount:upsert.inserted,
      updatedCount:upsert.updated,
      missingCount:missing.rowCount,
      linkedOfferCount:commerce.linkedOffers,
      submissionCount:submissions+reconciled.submissions,
      stockUpdates:commerce.stockUpdates,
      missingOffersHidden:reconciled.hidden,
      missingOffersRestored:reconciled.restored
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function upsertItems(client:PoolClient,feed:FeedRow,items:readonly VendorFeedNormalizedItem[],seenAt:Date) {
  if (!items.length) return {inserted:0,updated:0};
  const payload=JSON.stringify(items);
  const result=await client.query(`
    WITH incoming AS (
      SELECT value AS j FROM jsonb_array_elements($4::jsonb)
    ), changed AS (
      INSERT INTO public.vendor_product_feed_items(
        feed_id,vendor_id,market_id,external_product_id,vendor_sku,title,description,price_minor,currency,
        stock_quantity,availability,brand,category_path,image_url,additional_image_urls,gtin,mpn,product_url,size,color,
        source_hash,state,validation_messages,first_seen_at,last_seen_at,last_changed_at,updated_at
      )
      SELECT
        $1::uuid,$2::uuid,$3::uuid,j->>'externalProductId',NULLIF(j->>'vendorSku',''),j->>'title',NULLIF(j->>'description',''),
        CASE WHEN j ? 'priceMinor' THEN (j->>'priceMinor')::bigint ELSE NULL END,
        COALESCE(NULLIF(j->>'currency',''),'EUR'),
        CASE WHEN j ? 'stockQuantity' THEN (j->>'stockQuantity')::integer ELSE NULL END,
        NULLIF(j->>'availability',''),NULLIF(j->>'brand',''),NULLIF(j->>'categoryPath',''),NULLIF(j->>'imageUrl',''),
        COALESCE(j->'additionalImageUrls','[]'::jsonb),NULLIF(j->>'gtin',''),NULLIF(j->>'mpn',''),NULLIF(j->>'productUrl',''),
        NULLIF(j->>'size',''),NULLIF(j->>'color',''),j->>'sourceHash',j->>'state',COALESCE(j->'issues','[]'::jsonb),
        $5,$5,$5,now()
      FROM incoming
      ON CONFLICT(feed_id,external_product_id) DO UPDATE SET
        vendor_sku=EXCLUDED.vendor_sku,title=EXCLUDED.title,description=EXCLUDED.description,price_minor=EXCLUDED.price_minor,currency=EXCLUDED.currency,
        stock_quantity=EXCLUDED.stock_quantity,availability=EXCLUDED.availability,brand=EXCLUDED.brand,category_path=EXCLUDED.category_path,
        image_url=EXCLUDED.image_url,additional_image_urls=EXCLUDED.additional_image_urls,gtin=EXCLUDED.gtin,mpn=EXCLUDED.mpn,product_url=EXCLUDED.product_url,
        size=EXCLUDED.size,color=EXCLUDED.color,state=EXCLUDED.state,validation_messages=EXCLUDED.validation_messages,
        last_seen_at=EXCLUDED.last_seen_at,last_changed_at=CASE WHEN vendor_product_feed_items.source_hash<>EXCLUDED.source_hash THEN EXCLUDED.last_seen_at ELSE vendor_product_feed_items.last_changed_at END,
        source_hash=EXCLUDED.source_hash,missing_successful_runs=0,updated_at=now()
      RETURNING (xmax=0) AS inserted
    )
    SELECT count(*) FILTER (WHERE inserted)::int AS inserted,count(*) FILTER (WHERE NOT inserted)::int AS updated FROM changed
  `,[feed.id,feed.vendor_id,feed.market_id,payload,seenAt]);
  return {inserted:integer(result.rows[0]?.inserted),updated:integer(result.rows[0]?.updated)};
}

async function linkExistingCommerce(client:PoolClient,feed:FeedRow) {
  await client.query(`
    WITH candidates AS (
      SELECT i.id AS item_id,vo.id AS offer_id,vo.canonical_variant_id,
             row_number() OVER(PARTITION BY i.id ORDER BY
               CASE WHEN i.vendor_sku IS NOT NULL AND vo.vendor_sku=i.vendor_sku THEN 0 ELSE 1 END,
               vo.updated_at DESC,vo.id) AS rn
      FROM public.vendor_product_feed_items i
      JOIN public.vendor_offers vo ON vo.vendor_id=i.vendor_id
       AND (
         (i.vendor_sku IS NOT NULL AND vo.vendor_sku=i.vendor_sku)
         OR (i.gtin IS NOT NULL AND regexp_replace(COALESCE(vo.source_gtin,''),'\\D','','g')=i.gtin)
       )
      WHERE i.feed_id=$1::uuid AND i.state NOT IN ('error','excluded')
    )
    UPDATE public.vendor_product_feed_items i
       SET vendor_offer_id=c.offer_id,canonical_variant_id=c.canonical_variant_id,updated_at=now()
      FROM candidates c WHERE i.id=c.item_id AND c.rn=1
  `,[feed.id]);

  await client.query(`
    UPDATE public.vendor_product_feed_items i
       SET submission_id=s.id,canonical_variant_id=COALESCE(i.canonical_variant_id,s.canonical_variant_id),updated_at=now()
      FROM public.vendor_product_submissions s
     WHERE i.feed_id=$1::uuid AND i.submission_id IS NULL AND i.vendor_offer_id IS NULL
       AND i.vendor_sku IS NOT NULL AND s.vendor_id=i.vendor_id AND s.location_id=$2::uuid
       AND s.vendor_sku=i.vendor_sku AND s.status<>'archived'
  `,[feed.id,feed.location_id]);

  await client.query(`
    WITH candidates AS (
      SELECT item_id,max(canonical_id::text)::uuid AS canonical_id
      FROM (
        SELECT i.id AS item_id,cv.id AS canonical_id
          FROM public.vendor_product_feed_items i
          JOIN public.canonical_variants cv ON cv.market_id=i.market_id AND cv.gtin=i.gtin
         WHERE i.feed_id=$1::uuid AND i.canonical_variant_id IS NULL AND i.gtin IS NOT NULL
           AND i.state NOT IN ('error','excluded','missing') AND cv.suppressed=false AND cv.recalled=false
        UNION
        SELECT i.id AS item_id,pi.canonical_variant_id
          FROM public.vendor_product_feed_items i
          JOIN public.product_identifiers pi ON pi.normalized_value=i.gtin AND pi.active=true AND pi.identifier_scope='trade_item'
          JOIN public.canonical_variants cv ON cv.id=pi.canonical_variant_id AND cv.market_id=i.market_id
         WHERE i.feed_id=$1::uuid AND i.canonical_variant_id IS NULL AND i.gtin IS NOT NULL
           AND i.state NOT IN ('error','excluded','missing') AND cv.suppressed=false AND cv.recalled=false
      ) x GROUP BY item_id HAVING count(DISTINCT canonical_id)=1
    )
    UPDATE public.vendor_product_feed_items i SET canonical_variant_id=c.canonical_id,updated_at=now()
    FROM candidates c WHERE i.id=c.item_id
  `,[feed.id]);

  await client.query(`
    WITH candidates AS (
      SELECT i.id AS item_id,max(cv.id::text)::uuid AS canonical_id
      FROM public.vendor_product_feed_items i
      JOIN public.brands b ON i.brand IS NOT NULL AND lower(b.name)=lower(i.brand)
      JOIN public.canonical_variants cv ON cv.market_id=i.market_id AND cv.brand_id=b.id
       AND i.mpn IS NOT NULL AND lower(COALESCE(cv.mpn,cv.model,''))=lower(i.mpn)
      WHERE i.feed_id=$1::uuid AND i.canonical_variant_id IS NULL
        AND i.state NOT IN ('error','excluded','missing') AND cv.suppressed=false AND cv.recalled=false
      GROUP BY i.id HAVING count(DISTINCT cv.id)=1
    )
    UPDATE public.vendor_product_feed_items i SET canonical_variant_id=c.canonical_id,updated_at=now()
    FROM candidates c WHERE i.id=c.item_id
  `,[feed.id]);
}

async function createFeedSubmissions(client:PoolClient,feed:FeedRow):Promise<number> {
  const linked=await client.query(`
    WITH inserted AS (
      INSERT INTO public.vendor_product_submissions(
        id,public_id,market_id,vendor_id,location_id,vendor_sku,category_id,source_identity,
        supplier_unit_price_minor,currency,stock_on_hand,safety_stock,fulfilment_modes,advice_available,
        source,source_payload,status,canonical_variant_id,created_by,created_at,updated_at
      )
      SELECT gen_random_uuid(),'vps_'||gen_random_uuid()::text,i.market_id,i.vendor_id,$2::uuid,i.vendor_sku,cv.category_id,
             jsonb_strip_nulls(jsonb_build_object('title',i.title,'brand',i.brand,'mpn',i.mpn,'gtin',i.gtin)),
             COALESCE(i.price_minor,0),i.currency,COALESCE(i.stock_quantity,0),0,ARRAY['pickup']::fulfilment_mode[],true,
             'xml_feed',jsonb_build_object('feedPublicId',$3,'externalProductId',i.external_product_id,'feedManaged',true),
             'linked',i.canonical_variant_id,$4::uuid,now(),now()
      FROM public.vendor_product_feed_items i
      JOIN public.canonical_variants cv ON cv.id=i.canonical_variant_id
      WHERE i.feed_id=$1::uuid AND i.vendor_offer_id IS NULL AND i.submission_id IS NULL
        AND i.canonical_variant_id IS NOT NULL AND i.vendor_sku IS NOT NULL
        AND i.state NOT IN ('error','excluded','missing')
        AND NOT EXISTS (
          SELECT 1 FROM public.vendor_product_submissions s
          WHERE s.vendor_id=i.vendor_id AND s.location_id=$2::uuid AND s.vendor_sku=i.vendor_sku AND s.status<>'archived'
        )
      RETURNING id,vendor_sku
    )
    SELECT count(*)::int AS count FROM inserted
  `,[feed.id,feed.location_id,feed.public_id,feed.created_by]);
  const linkedCount=integer(linked.rows[0]?.count);

  const drafted=await client.query(`
    WITH candidates AS (
      SELECT i.id AS item_id,c.id AS category_id,
             row_number() OVER(PARTITION BY i.id ORDER BY CASE WHEN c.market_id=i.market_id THEN 0 ELSE 1 END,c.id) AS rn
      FROM public.vendor_product_feed_items i
      JOIN public.categories c ON c.active=true AND c.assignable=true AND (c.market_id IS NULL OR c.market_id=i.market_id)
      LEFT JOIN public.category_translations el ON el.category_id=c.id AND el.locale='el'
      LEFT JOIN public.category_translations en ON en.category_id=c.id AND en.locale='en'
      WHERE i.feed_id=$1::uuid AND i.canonical_variant_id IS NULL AND i.vendor_offer_id IS NULL AND i.submission_id IS NULL
        AND i.category_path IS NOT NULL AND i.vendor_sku IS NOT NULL AND i.state NOT IN ('error','excluded','missing')
        AND (
          lower(c.code)=lower(regexp_replace(i.category_path,'^.*[>/→]\\s*','','g'))
          OR lower(COALESCE(el.name,''))=lower(regexp_replace(i.category_path,'^.*[>/→]\\s*','','g'))
          OR lower(COALESCE(en.name,''))=lower(regexp_replace(i.category_path,'^.*[>/→]\\s*','','g'))
        )
    ), inserted AS (
      INSERT INTO public.vendor_product_submissions(
        id,public_id,market_id,vendor_id,location_id,vendor_sku,category_id,source_identity,
        supplier_unit_price_minor,currency,stock_on_hand,safety_stock,fulfilment_modes,advice_available,
        source,source_payload,status,created_by,created_at,updated_at
      )
      SELECT gen_random_uuid(),'vps_'||gen_random_uuid()::text,i.market_id,i.vendor_id,$2::uuid,i.vendor_sku,c.category_id,
             jsonb_strip_nulls(jsonb_build_object('title',i.title,'brand',i.brand,'mpn',i.mpn,'gtin',i.gtin)),
             COALESCE(i.price_minor,0),i.currency,COALESCE(i.stock_quantity,0),0,ARRAY['pickup']::fulfilment_mode[],true,
             'xml_feed',jsonb_build_object('feedPublicId',$3,'externalProductId',i.external_product_id,'feedManaged',true),
             'submitted',$4::uuid,now(),now()
      FROM public.vendor_product_feed_items i JOIN candidates c ON c.item_id=i.id AND c.rn=1
      WHERE NOT EXISTS (
        SELECT 1 FROM public.vendor_product_submissions s
        WHERE s.vendor_id=i.vendor_id AND s.location_id=$2::uuid AND s.vendor_sku=i.vendor_sku AND s.status<>'archived'
      )
      RETURNING id,vendor_sku,canonical_variant_id,created_by
    )
    SELECT count(*)::int AS count FROM inserted
  `,[feed.id,feed.location_id,feed.public_id,feed.created_by]);
  const draftedCount=integer(drafted.rows[0]?.count);

  await client.query(`
    UPDATE public.vendor_product_feed_items i
       SET submission_id=s.id,canonical_variant_id=COALESCE(i.canonical_variant_id,s.canonical_variant_id),updated_at=now()
      FROM public.vendor_product_submissions s
     WHERE i.feed_id=$1::uuid AND i.submission_id IS NULL AND i.vendor_offer_id IS NULL
       AND i.vendor_sku IS NOT NULL AND s.vendor_id=i.vendor_id AND s.location_id=$2::uuid
       AND s.vendor_sku=i.vendor_sku AND s.status<>'archived'
  `,[feed.id,feed.location_id]);

  return linkedCount+draftedCount;
}

async function applyLinkedCommerce(client:PoolClient,feed:FeedRow) {
  const linked=await client.query(`
    SELECT count(*)::int AS count FROM public.vendor_product_feed_items
    WHERE feed_id=$1::uuid AND vendor_offer_id IS NOT NULL AND state NOT IN ('error','excluded','missing')
  `,[feed.id]);

  await client.query(`
    UPDATE public.vendor_offers vo
       SET customer_price_minor=i.price_minor,currency=i.currency,
           source_payload=COALESCE(vo.source_payload,'{}'::jsonb)||jsonb_build_object('pricingManagedBy','vendor_xml_feed','feedPublicId',$2),
           updated_at=now()
      FROM public.vendor_product_feed_items i
     WHERE i.feed_id=$1::uuid AND i.vendor_offer_id=vo.id AND i.price_minor IS NOT NULL AND i.currency='EUR'
       AND i.state NOT IN ('error','excluded','missing') AND vo.vendor_id=i.vendor_id
  `,[feed.id,feed.public_id]);

  const inventory=await client.query(`
    WITH changed AS (
      UPDATE public.inventory_balances ib
         SET on_hand=GREATEST(i.stock_quantity,ib.active_reservations),
             source='vendor_xml_feed',source_confidence='merchant_feed',
             stock_confirmed_at=now(),freshness_status='fresh',updated_at=now()
        FROM public.vendor_product_feed_items i
       WHERE i.feed_id=$1::uuid AND i.vendor_offer_id=ib.offer_id AND i.stock_quantity IS NOT NULL
         AND i.state NOT IN ('error','excluded','missing')
       RETURNING ib.offer_id
    )
    SELECT count(*)::int AS count FROM changed
  `,[feed.id]);

  await client.query(`
    UPDATE public.vendor_product_feed_items i
       SET last_stock_sync_at=now(),updated_at=now()
      WHERE i.feed_id=$1::uuid AND i.vendor_offer_id IS NOT NULL AND i.stock_quantity IS NOT NULL
        AND i.state NOT IN ('error','excluded','missing')
  `,[feed.id]);

  return {linkedOffers:integer(linked.rows[0]?.count),stockUpdates:integer(inventory.rows[0]?.count)};
}

async function reconcileMissingOffers(client:PoolClient,feed:FeedRow) {
  const hidden=await client.query(`
    WITH changed AS (
      UPDATE public.vendor_offers vo SET merchant_visible=false,merchant_pause_active=true,
             source_payload=COALESCE(vo.source_payload,'{}'::jsonb)||jsonb_build_object('feedMissingPause',true,'feedPublicId',$2),
             updated_at=now()
      FROM public.vendor_product_feed_items i
      WHERE i.feed_id=$1::uuid AND i.vendor_offer_id=vo.id AND i.state='missing'
        AND i.missing_successful_runs>=$3 AND i.hidden_by_feed=false AND vo.status='approved'
      RETURNING i.id
    )
    UPDATE public.vendor_product_feed_items i SET hidden_by_feed=true,updated_at=now()
    FROM changed c WHERE i.id=c.id RETURNING i.id
  `,[feed.id,feed.public_id,feed.missing_grace_runs]);

  await client.query(`
    UPDATE public.inventory_balances ib SET
      on_hand=ib.active_reservations,source='vendor_xml_feed',source_confidence='merchant_feed',
      stock_confirmed_at=now(),freshness_status='fresh',updated_at=now()
    FROM public.vendor_product_feed_items i
    WHERE i.feed_id=$1::uuid AND i.vendor_offer_id=ib.offer_id AND i.state='missing'
      AND i.missing_successful_runs>=$2
  `,[feed.id,feed.missing_grace_runs]);

  const restored=await client.query(`
    WITH changed AS (
      UPDATE public.vendor_offers vo SET merchant_visible=true,merchant_pause_active=false,
             source_payload=(COALESCE(vo.source_payload,'{}'::jsonb)-'feedMissingPause')||jsonb_build_object('feedRestoredAt',now()),
             updated_at=now()
      FROM public.vendor_product_feed_items i
      WHERE i.feed_id=$1::uuid AND i.vendor_offer_id=vo.id AND i.state<>'missing'
        AND i.hidden_by_feed=true AND vo.status='approved'
        AND COALESCE(vo.source_payload->>'feedMissingPause','false')='true'
      RETURNING i.id
    )
    UPDATE public.vendor_product_feed_items i SET hidden_by_feed=false,updated_at=now()
    FROM changed c WHERE i.id=c.id RETURNING i.id
  `,[feed.id]);

  return {hidden:hidden.rowCount,restored:restored.rowCount,submissions:0};
}

async function markFeedFailure(feedPublicId:string,message:string,triggerType:"manual"|"scheduled") {
  const client=await pool().connect();
  try {
    await client.query("BEGIN");
    const feed=await client.query(`
      UPDATE public.vendor_product_feeds SET
        status=CASE WHEN consecutive_failures+1>=3 THEN 'error' ELSE status END,
        consecutive_failures=consecutive_failures+1,last_error=$2,last_sync_completed_at=now(),
        next_sync_at=CASE WHEN source_kind='url' THEN now()+make_interval(mins=>LEAST(1440,GREATEST(15,sync_interval_minutes))) ELSE NULL END,
        updated_at=now()
      WHERE public_id=$1
      RETURNING id::text,vendor_id::text,market_id::text
    `,[feedPublicId,message.slice(0,1500)]);
    if (feed.rowCount) {
      const row=feed.rows[0];
      await client.query(`
        INSERT INTO public.vendor_product_feed_runs(feed_id,vendor_id,market_id,trigger_type,status,error_message,started_at,completed_at)
        VALUES($1::uuid,$2::uuid,$3::uuid,$4,'failed',$5,now(),now())
      `,[row.id,row.vendor_id,row.market_id,triggerType,message.slice(0,1500)]);
    }
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(()=>undefined);
  } finally { client.release(); }
}

function normalizeInterval(value:unknown):60|180|360|1440 {
  const number=Number(value??360);
  return ([60,180,360,1440] as const).includes(number as 60|180|360|1440) ? number as 60|180|360|1440 : 360;
}

function assertRequiredMapping(mapping:VendorFeedMapping) {
  if (!mapping.id || !mapping.title) throw new Error("Map both the product ID and title fields before importing");
}

function feedSummary(row:Record<string,unknown>):VendorFeedSummary {
  return {
    id:text(row.public_id),name:text(row.name),sourceKind:text(row.source_kind)==="url"?"url":"upload",
    sourceUrl:optionalText(row.source_url),sourceFilename:optionalText(row.source_filename),
    status:["active","paused","error"].includes(text(row.status))?text(row.status) as "active"|"paused"|"error":"error",
    detectedFormat:text(row.detected_format)||"custom",mapping:jsonObject(row.mapping) as VendorFeedMapping,observedFields:stringArray(row.observed_fields),
    syncIntervalMinutes:integer(row.sync_interval_minutes)||360,missingGraceRuns:integer(row.missing_grace_runs)||2,
    productCount:integer(row.last_product_count),readyCount:integer(row.last_ready_count),warningCount:integer(row.last_warning_count),
    errorCount:integer(row.last_error_count),excludedCount:integer(row.last_excluded_count),
    lastSyncStartedAt:epoch(row.last_sync_started_at),lastSyncCompletedAt:epoch(row.last_sync_completed_at),nextSyncAt:epoch(row.next_sync_at),
    lastError:optionalText(row.last_error),consecutiveFailures:integer(row.consecutive_failures)
  };
}
