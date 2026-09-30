import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type AdminProductStateFilter = "all" | "live" | "draft" | "suppressed" | "recalled" | "uncategorized" | "missing_media" | "no_offer";
export type AdminProductsFilters = Readonly<{ q?: string; category?: string; state?: AdminProductStateFilter; channel?: "all" | "normal" | "bazaar"; cursor?: string; limit?: number }>;
export type AdminProductRow = Readonly<{ publicId:string; slug:string; title:string; brandName?:string; categoryCode?:string; categoryName?:string; gtin?:string; mpn?:string; model?:string; channel:string; active:boolean; suppressed:boolean; recalled:boolean; hasMedia:boolean; offerCount:number; minPriceMinor?:number; currency:string; missingAttributes:boolean }>;
export type AdminProductCategoryOption = Readonly<{ categoryCode:string; labelEl:string }>;
export type AdminProductCategoryCard = Readonly<{ categoryCode:string; labelEl:string; parentCategoryCode?:string; taxonomyRole:string; commerceMode:string; active:boolean; assignable:boolean; discoverable:boolean; sortOrder:number; liveProductCount:number }>;
export type AdminProductsWorkspace = Readonly<{ csrfToken:string; metrics:Readonly<{ canonicalProductsApprox:number; productFamiliesApprox:number; vendorOffersApprox:number; storefrontProductsApprox:number; categories:number; uncategorizedLive:number }>; categories:readonly AdminProductCategoryOption[]; products:readonly AdminProductRow[]; hasMore:boolean; nextCursor?:string }>;
export type AdminProductCategoriesWorkspace = Readonly<{ csrfToken:string; categories:readonly AdminProductCategoryCard[]; hasMore:boolean; nextOffset?:number }>;

function text(row:SqlRow, field:string){const value=row[field];return typeof value==="string"?value:String(value??"");}
function optionalText(row:SqlRow, field:string){const value=row[field];return typeof value==="string"&&value.trim()?value:undefined;}
function integer(row:SqlRow, field:string){const value=Number(row[field]??0);return Number.isFinite(value)&&value>=0?Math.round(value):0;}
function booleanValue(row:SqlRow, field:string){return row[field]===true;}
function safeLimit(value:number|undefined,fallback=48,max=72){const parsed=Math.floor(Number(value??fallback));return Number.isFinite(parsed)?Math.max(12,Math.min(max,parsed)):fallback;}

async function postgresProductsWorkspace(principal:SessionPrincipal,filters:AdminProductsFilters):Promise<AdminProductsWorkspace>{
  const runtime=getProductionPostgresRuntime();
  const uow=new PostgresUnitOfWork(runtime.sqlPool);
  const limit=safeLimit(filters.limit);
  const state=filters.state??"all";
  const channel=filters.channel??"all";
  const q=filters.q?.trim()??"";
  const category=filters.category?.trim()??"";
  const cursor=filters.cursor?.trim()??"";

  return uow.withTransaction(platformScope(principal.userId),async(tx)=>{
    const marketResult=await tx.query<SqlRow>("SELECT id::text AS id FROM markets WHERE code='sparta' LIMIT 1");
    const market=optionalText(marketResult.rows[0]??{},"id");
    if(!market)throw new Error("Sparta market not found");

    const params:unknown[]=[market];
    const where:string[]=["cv.market_id = $1::uuid"];
    const add=(value:unknown)=>{params.push(value);return "$"+params.length;};

    if(category){const p=add(category);where.push("c.code = "+p);}
    if(channel!=="all"){const p=add(channel);where.push("COALESCE(cv.commerce_channel,'normal') = "+p);}
    if(cursor){const p=add(cursor);where.push("cv.public_id < "+p);}
    if(q){
      const p=add(q);
      where.push("("+
        "cv.public_id = "+p+
        " OR cv.gtin = "+p+
        " OR LOWER(COALESCE(cv.mpn,'')) = LOWER("+p+")"+
        " OR to_tsvector('simple', (((((COALESCE(cv.model,'') || ' ') || COALESCE(cv.slug,'')) || ' ') || COALESCE(cv.gtin,'')) || ' ') || COALESCE(cv.mpn,'')) @@ plainto_tsquery('simple',"+p+")"+
        " OR EXISTS (SELECT 1 FROM product_translations search_pt WHERE search_pt.canonical_variant_id=cv.id AND to_tsvector('simple',COALESCE(search_pt.title,'')) @@ plainto_tsquery('simple',"+p+"))"+
      ")");
    }
    if(state==="live")where.push("cv.active=TRUE AND cv.suppressed=FALSE AND cv.recalled=FALSE");
    if(state==="draft")where.push("cv.active=FALSE AND cv.suppressed=FALSE AND cv.recalled=FALSE");
    if(state==="suppressed")where.push("cv.suppressed=TRUE");
    if(state==="recalled")where.push("cv.recalled=TRUE");
    if(state==="uncategorized")where.push("cv.category_id IS NULL");
    if(state==="missing_media")where.push("NOT EXISTS (SELECT 1 FROM product_media pm_filter WHERE pm_filter.canonical_variant_id=cv.id AND pm_filter.scan_status='clean' AND pm_filter.rights_status='approved' AND pm_filter.moderation_status='approved')");
    if(state==="no_offer")where.push("NOT EXISTS (SELECT 1 FROM vendor_offers vo_filter WHERE vo_filter.canonical_variant_id=cv.id AND vo_filter.status='approved' AND COALESCE(vo_filter.merchant_visible,TRUE)=TRUE AND COALESCE(vo_filter.merchant_pause_active,FALSE)=FALSE AND vo_filter.customer_price_minor>0)");

    params.push(limit+1);
    const productSql=
      "SELECT cv.public_id,cv.slug,COALESCE(el.title,en.title,cv.model,cv.slug,cv.public_id) AS title,b.name AS brand_name,c.code AS category_code,COALESCE(ct.name,c.code) AS category_name,cv.gtin,cv.mpn,cv.model,COALESCE(cv.commerce_channel,'normal') AS commerce_channel,cv.active,cv.suppressed,cv.recalled,(cv.variant_attributes IS NULL OR cv.variant_attributes='{}'::jsonb) AS missing_attributes,"+
      "EXISTS(SELECT 1 FROM product_media pm WHERE pm.canonical_variant_id=cv.id AND pm.scan_status='clean' AND pm.rights_status='approved' AND pm.moderation_status='approved') AS has_media,"+
      "COALESCE(offer.offer_count,0)::int AS offer_count,offer.min_price_minor,COALESCE(cv.currency,'EUR')::text AS currency "+
      "FROM canonical_variants cv "+
      "LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el' "+
      "LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en' "+
      "LEFT JOIN categories c ON c.id=cv.category_id "+
      "LEFT JOIN category_translations ct ON ct.category_id=c.id AND ct.locale='el' "+
      "LEFT JOIN brands b ON b.id=cv.brand_id "+
      "LEFT JOIN LATERAL (SELECT COUNT(*)::int AS offer_count,MIN(vo.customer_price_minor) AS min_price_minor FROM vendor_offers vo WHERE vo.canonical_variant_id=cv.id AND vo.status='approved' AND COALESCE(vo.merchant_visible,TRUE)=TRUE AND COALESCE(vo.merchant_pause_active,FALSE)=FALSE AND vo.customer_price_minor>0) offer ON TRUE "+
      "WHERE "+where.join(" AND ")+" ORDER BY cv.public_id DESC LIMIT $"+params.length;

    const [metricsResult,categoryResult,productResult]=await Promise.all([
      tx.query<SqlRow>(
        "SELECT "+
        "COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE schemaname='public' AND relname='canonical_variants'),0)::bigint AS canonical_products_approx,"+
        "COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE schemaname='public' AND relname='product_families'),0)::bigint AS product_families_approx,"+
        "COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE schemaname='public' AND relname='vendor_offers'),0)::bigint AS vendor_offers_approx,"+
        "COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE schemaname='public' AND relname='storefront_catalog_read_model'),0)::bigint AS storefront_products_approx,"+
        "(SELECT COUNT(*)::int FROM categories WHERE market_id=$1::uuid) AS categories,"+
        "(SELECT COUNT(*)::int FROM canonical_variants WHERE market_id=$1::uuid AND category_id IS NULL AND suppressed=FALSE AND recalled=FALSE) AS uncategorized_live",
        [market]
      ),
      tx.query<SqlRow>(
        "SELECT c.code,COALESCE((SELECT ct.name FROM category_translations ct WHERE ct.category_id=c.id AND ct.locale='el' LIMIT 1),c.code) AS label "+
        "FROM categories c WHERE c.market_id=$1::uuid AND c.active=TRUE ORDER BY c.sort_order ASC,label ASC,c.code ASC",
        [market]
      ),
      tx.query<SqlRow>(productSql,params)
    ]);

    const rows=productResult.rows.slice(0,limit);
    const hasMore=productResult.rows.length>limit;
    const last=rows[rows.length-1];
    return {
      csrfToken:principal.csrfToken,
      metrics:{
        canonicalProductsApprox:integer(metricsResult.rows[0]??{},"canonical_products_approx"),
        productFamiliesApprox:integer(metricsResult.rows[0]??{},"product_families_approx"),
        vendorOffersApprox:integer(metricsResult.rows[0]??{},"vendor_offers_approx"),
        storefrontProductsApprox:integer(metricsResult.rows[0]??{},"storefront_products_approx"),
        categories:integer(metricsResult.rows[0]??{},"categories"),
        uncategorizedLive:integer(metricsResult.rows[0]??{},"uncategorized_live")
      },
      categories:categoryResult.rows.map(row=>({categoryCode:text(row,"code"),labelEl:text(row,"label")})),
      products:rows.map(row=>({
        publicId:text(row,"public_id"),slug:text(row,"slug"),title:text(row,"title"),
        brandName:optionalText(row,"brand_name"),categoryCode:optionalText(row,"category_code"),categoryName:optionalText(row,"category_name"),
        gtin:optionalText(row,"gtin"),mpn:optionalText(row,"mpn"),model:optionalText(row,"model"),
        channel:text(row,"commerce_channel")||"normal",active:booleanValue(row,"active"),suppressed:booleanValue(row,"suppressed"),recalled:booleanValue(row,"recalled"),
        hasMedia:booleanValue(row,"has_media"),offerCount:integer(row,"offer_count"),
        minPriceMinor:row.min_price_minor==null?undefined:integer(row,"min_price_minor"),currency:text(row,"currency")||"EUR",
        missingAttributes:booleanValue(row,"missing_attributes")
      })),
      hasMore,nextCursor:hasMore&&last?text(last,"public_id"):undefined
    };
  },{readOnly:true});
}

async function postgresCategoriesWorkspace(principal:SessionPrincipal,q:string,offset:number,limit:number):Promise<AdminProductCategoriesWorkspace>{
  const runtime=getProductionPostgresRuntime();
  const uow=new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId),async(tx)=>{
    const marketResult=await tx.query<SqlRow>("SELECT id::text AS id FROM markets WHERE code='sparta' LIMIT 1");
    const market=optionalText(marketResult.rows[0]??{},"id");
    if(!market)throw new Error("Sparta market not found");
    const result=await tx.query<SqlRow>(
      "SELECT c.code,COALESCE((SELECT ct.name FROM category_translations ct WHERE ct.category_id=c.id AND ct.locale='el' LIMIT 1),c.code) AS label,p.code AS parent_code,c.taxonomy_role,c.commerce_mode,c.active,c.assignable,c.discoverable,COALESCE(c.sort_order,0)::int AS sort_order,"+
      "(SELECT COUNT(*)::int FROM storefront_catalog_read_model rm WHERE rm.category_code=c.code) AS live_product_count "+
      "FROM categories c LEFT JOIN categories p ON p.id=c.parent_id "+
      "WHERE c.market_id=$1::uuid AND ($2::text='' OR c.code ILIKE '%'||$2||'%' OR EXISTS(SELECT 1 FROM category_translations search_ct WHERE search_ct.category_id=c.id AND search_ct.locale='el' AND search_ct.name ILIKE '%'||$2||'%')) "+
      "ORDER BY c.sort_order ASC,label ASC,c.code ASC LIMIT $3 OFFSET $4",
      [market,q,limit+1,offset]
    );
    const rows=result.rows.slice(0,limit);
    const hasMore=result.rows.length>limit;
    return {
      csrfToken:principal.csrfToken,
      categories:rows.map(row=>({
        categoryCode:text(row,"code"),labelEl:text(row,"label"),parentCategoryCode:optionalText(row,"parent_code"),
        taxonomyRole:text(row,"taxonomy_role")||"category",commerceMode:text(row,"commerce_mode")||"standard",
        active:booleanValue(row,"active"),assignable:booleanValue(row,"assignable"),discoverable:booleanValue(row,"discoverable"),
        sortOrder:integer(row,"sort_order"),liveProductCount:integer(row,"live_product_count")
      })),
      hasMore,nextOffset:hasMore?offset+limit:undefined
    };
  },{readOnly:true});
}

export async function adminProductsWorkspace(principal:SessionPrincipal,filters:AdminProductsFilters={}):Promise<AdminProductsWorkspace>{
  assertAdminPermission(principal,"catalog.read");
  if(!postgresAdminRuntimeEnabled())return {csrfToken:principal.csrfToken,metrics:{canonicalProductsApprox:0,productFamiliesApprox:0,vendorOffersApprox:0,storefrontProductsApprox:0,categories:0,uncategorizedLive:0},categories:[],products:[],hasMore:false};
  return postgresProductsWorkspace(principal,filters);
}
export async function adminProductCategoriesWorkspace(principal:SessionPrincipal,options:Readonly<{q?:string;offset?:number;limit?:number}>={}):Promise<AdminProductCategoriesWorkspace>{
  assertAdminPermission(principal,"catalog.read");
  const q=options.q?.trim()??"";
  const offset=Math.max(0,Math.floor(Number(options.offset??0)));
  const limit=safeLimit(options.limit,60,100);
  if(!postgresAdminRuntimeEnabled())return {csrfToken:principal.csrfToken,categories:[],hasMore:false};
  return postgresCategoriesWorkspace(principal,q,offset,limit);
}
