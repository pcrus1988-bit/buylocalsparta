import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const opt = (value: unknown) => clean(value) || undefined;
const integer = (value: unknown, field: string) => { const n=Number(value); if(!Number.isSafeInteger(n)) throw new Error(`Invalid ${field}`); return n; };
const slugify = (value: string) => value.normalize("NFKD").toLocaleLowerCase("el").replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-+|-+$/g,"").slice(0,150) || `product-${randomUUID().slice(0,8)}`;
const normalizeBrand = (value: string) => value.normalize("NFKC").toLocaleLowerCase("el").replace(/\s+/g," ").trim();
function uow(){return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool,{statementTimeoutMs:15_000,lockTimeoutMs:5_000});}
function scope(principal:SessionPrincipal){return platformScope(principal.userId,"sparta");}

export type AdminQuickAddVendor = Readonly<{id:string;name:string;status:string}>;
export type AdminQuickAddCategory = Readonly<{code:string;name:string;path:string}>;
export type AdminQuickAddCanonical = Readonly<{
  id:string;title:string;description?:string;gtin?:string;brand?:string;model?:string;mpn?:string;categoryCode:string;categoryPath:string;active:boolean;
  listed?:Readonly<{offerId:string;vendorSku?:string;priceMinor:number;onHand:number;safetyStock:number;visible:boolean;status:string}>;
}>;

async function adminLists(tx:SqlExecutor){
  const vendors=await tx.query<SqlRow>(`SELECT public_id id,trading_name name,status::text status FROM public.vendor_businesses ORDER BY trading_name`);
  const categories=await tx.query<SqlRow>(`
    WITH RECURSIVE tree AS(
      SELECT c.id,c.parent_id,c.code,ARRAY[COALESCE(el.name,en.name,c.code)]::text[] path_names
      FROM public.categories c LEFT JOIN public.category_translations el ON el.category_id=c.id AND el.locale='el'
      LEFT JOIN public.category_translations en ON en.category_id=c.id AND en.locale='en' WHERE c.parent_id IS NULL
      UNION ALL
      SELECT c.id,c.parent_id,c.code,t.path_names||COALESCE(el.name,en.name,c.code)
      FROM public.categories c JOIN tree t ON c.parent_id=t.id
      LEFT JOIN public.category_translations el ON el.category_id=c.id AND el.locale='el'
      LEFT JOIN public.category_translations en ON en.category_id=c.id AND en.locale='en'
    ) SELECT t.code,t.path_names FROM tree t JOIN public.categories c ON c.id=t.id WHERE c.active=true AND c.assignable=true ORDER BY t.path_names`);
  return {
    vendors:vendors.rows.map(r=>({id:String(r.id),name:String(r.name),status:String(r.status)})),
    categories:categories.rows.map(r=>{const p=Array.isArray(r.path_names)?r.path_names.map(String):[];return{code:String(r.code),name:p.at(-1)??String(r.code),path:p.join(" › ")}})
  };
}

export async function adminQuickAddWorkspace(principal:SessionPrincipal){
  if(!postgresAdminRuntimeEnabled()) throw new Error("Admin Quick Add requires PostgreSQL runtime");
  return uow().withTransaction(scope(principal),async tx=>({...await adminLists(tx),csrfToken:principal.csrfToken}),{readOnly:true});
}

export async function adminQuickAddLookup(principal:SessionPrincipal,input:{vendorId?:string;gtin?:string;q?:string}){
  if(!postgresAdminRuntimeEnabled()) throw new Error("Admin Quick Add requires PostgreSQL runtime");
  const vendorId=clean(input.vendorId), gtin=clean(input.gtin).replace(/\D/g,""), q=clean(input.q);
  return uow().withTransaction(scope(principal),async tx=>{
    const rows=await tx.query<SqlRow>(`
      WITH RECURSIVE tree AS(
        SELECT c.id,c.parent_id,c.code,ARRAY[COALESCE(el.name,en.name,c.code)]::text[] path_names FROM public.categories c
        LEFT JOIN public.category_translations el ON el.category_id=c.id AND el.locale='el'
        LEFT JOIN public.category_translations en ON en.category_id=c.id AND en.locale='en' WHERE c.parent_id IS NULL
        UNION ALL SELECT c.id,c.parent_id,c.code,t.path_names||COALESCE(el.name,en.name,c.code) FROM public.categories c JOIN tree t ON c.parent_id=t.id
        LEFT JOIN public.category_translations el ON el.category_id=c.id AND el.locale='el'
        LEFT JOIN public.category_translations en ON en.category_id=c.id AND en.locale='en'
      )
      SELECT cv.id::text canonical_uuid,cv.public_id id,COALESCE(el.title,en.title,cv.model,cv.mpn,cv.slug) title,
        COALESCE(NULLIF(el.description,''),NULLIF(en.description,'')) description,cv.gtin,b.name brand,cv.model,cv.mpn,t.code category_code,t.path_names,cv.active,
        vo.public_id offer_id,vo.vendor_sku,vo.customer_price_minor,vo.merchant_visible,vo.status::text offer_status,
        COALESCE(ib.on_hand,0)::integer on_hand,COALESCE(ib.safety_stock,0)::integer safety_stock
      FROM public.canonical_variants cv JOIN tree t ON t.id=cv.category_id
      LEFT JOIN public.product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN public.product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      LEFT JOIN public.brands b ON b.id=cv.brand_id
      LEFT JOIN public.vendor_businesses vb ON vb.public_id=$3
      LEFT JOIN public.vendor_locations vl ON vl.vendor_id=vb.id AND vl.active=true
      LEFT JOIN public.vendor_offers vo ON vo.vendor_id=vb.id AND vo.canonical_variant_id=cv.id AND vo.location_id=vl.id
      LEFT JOIN public.inventory_balances ib ON ib.offer_id=vo.id
      WHERE cv.suppressed=false AND cv.recalled=false AND (
        ($1<>'' AND regexp_replace(COALESCE(cv.gtin,''),'\\D','','g')=$1)
        OR ($1='' AND $2<>'' AND (COALESCE(el.title,en.title,cv.model,cv.mpn,cv.slug) ILIKE '%'||$2||'%' OR COALESCE(cv.model,'') ILIKE '%'||$2||'%' OR COALESCE(cv.mpn,'') ILIKE '%'||$2||'%'))
      ) ORDER BY CASE WHEN $1<>'' AND regexp_replace(COALESCE(cv.gtin,''),'\\D','','g')=$1 THEN 0 ELSE 1 END,title LIMIT 8
    `,[gtin,q,vendorId]);
    const matches:AdminQuickAddCanonical[]=rows.rows.map(r=>{const path=Array.isArray(r.path_names)?r.path_names.map(String):[];return{
      id:String(r.id),title:String(r.title),description:opt(r.description),gtin:opt(r.gtin),brand:opt(r.brand),model:opt(r.model),mpn:opt(r.mpn),categoryCode:String(r.category_code),categoryPath:path.join(" › "),active:Boolean(r.active),
      listed:r.offer_id?{offerId:String(r.offer_id),vendorSku:opt(r.vendor_sku),priceMinor:Number(r.customer_price_minor??0),onHand:Number(r.on_hand??0),safetyStock:Number(r.safety_stock??0),visible:Boolean(r.merchant_visible),status:String(r.offer_status)}:undefined
    }});
    return{matches,csrfToken:principal.csrfToken};
  },{readOnly:true});
}

type SaveInput=Readonly<{vendorId:string;canonicalVariantId?:string;title:string;description?:string;gtin?:string;brand?:string;model?:string;mpn?:string;categoryCode:string;vendorSku?:string;customerPriceMinor:number;onHand:number;safetyStock?:number;visible?:boolean}>;

async function upsertOffer(tx:SqlExecutor,principal:SessionPrincipal,input:SaveInput,canonicalUuid:string,canonicalPublicId:string,marketUuid:string){
  const vendor=await tx.query<SqlRow>(`SELECT vb.id::text id,(SELECT id::text FROM public.vendor_locations WHERE vendor_id=vb.id AND active ORDER BY created_at LIMIT 1) location_id FROM public.vendor_businesses vb WHERE vb.public_id=$1 OR vb.id::text=$1 LIMIT 1`,[input.vendorId]);
  if(!vendor.rowCount||!vendor.rows[0].location_id) throw new Error("Selected vendor has no active location");
  const vendorUuid=String(vendor.rows[0].id),locationUuid=String(vendor.rows[0].location_id);
  const existing=await tx.query<SqlRow>(`SELECT vo.id::text id,vo.public_id,COALESCE(ib.active_reservations,0)::integer reservations FROM public.vendor_offers vo LEFT JOIN public.inventory_balances ib ON ib.offer_id=vo.id WHERE vo.vendor_id=$1::uuid AND vo.location_id=$2::uuid AND vo.canonical_variant_id=$3::uuid ORDER BY vo.created_at LIMIT 1 FOR UPDATE OF vo`,[vendorUuid,locationUuid,canonicalUuid]);
  const price=integer(input.customerPriceMinor,"price"),onHand=integer(input.onHand,"stock"),safety=integer(input.safetyStock??0,"safety stock");
  if(price<0||onHand<0||safety<0||safety>onHand) throw new Error("Invalid price or stock");
  let offerUuid:string,offerPublicId:string;
  if(existing.rowCount){
    if(onHand<Number(existing.rows[0].reservations??0)) throw new Error("Stock is below active reservations");
    offerUuid=String(existing.rows[0].id);offerPublicId=String(existing.rows[0].public_id);
    await tx.query(`UPDATE public.vendor_offers SET vendor_sku=$2,source_gtin=$3,supplier_unit_price_minor=$4,customer_price_minor=$4,status='approved',approved_at=COALESCE(approved_at,now()),merchant_visible=$5,merchant_pause_active=false,merchant_visibility_updated_by=$6::uuid,updated_at=now() WHERE id=$1::uuid`,[offerUuid,opt(input.vendorSku)??null,opt(input.gtin)??null,price,input.visible!==false,principal.userId]);
  }else{
    offerUuid=randomUUID();offerPublicId=`vo_${randomUUID()}`;
    await tx.query(`INSERT INTO public.vendor_offers(id,public_id,market_id,vendor_id,location_id,canonical_variant_id,vendor_sku,source_gtin,status,supplier_unit_price_minor,customer_price_minor,currency,supplier_tax_rate_bps,fulfilment_modes,advice_capabilities,source_payload,approved_at,merchant_visible,merchant_visibility_updated_by,created_at,updated_at) VALUES($1,$2,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7,$8,'approved',$9,$9,'EUR',2400,ARRAY['pickup']::fulfilment_mode[],jsonb_build_object('available',true),jsonb_build_object('source','admin_quickadd','canonicalPublicId',$10),now(),$11,$12::uuid,now(),now())`,[offerUuid,offerPublicId,marketUuid,vendorUuid,locationUuid,canonicalUuid,opt(input.vendorSku)??null,opt(input.gtin)??null,price,canonicalPublicId,input.visible!==false,principal.userId]);
  }
  const previous=await tx.query<SqlRow>(`SELECT on_hand FROM public.inventory_balances WHERE offer_id=$1::uuid FOR UPDATE`,[offerUuid]);const before=previous.rowCount?Number(previous.rows[0].on_hand??0):0;
  await tx.query(`INSERT INTO public.inventory_balances(offer_id,on_hand,active_reservations,safety_stock,blocked,source,source_confidence,updated_at) VALUES($1::uuid,$2,0,$3,0,'manual','merchant_confirmed',now()) ON CONFLICT(offer_id) DO UPDATE SET on_hand=EXCLUDED.on_hand,safety_stock=EXCLUDED.safety_stock,source='manual',source_confidence='merchant_confirmed',updated_at=now()`,[offerUuid,onHand,safety]);
  if(before!==onHand) await tx.query(`INSERT INTO public.inventory_movements(id,offer_id,movement_type,quantity_delta,source,actor_id,metadata,created_at) VALUES($1,$2::uuid,'manual_adjustment',$3,'admin_quickadd',$4::uuid,jsonb_build_object('previousOnHand',$5,'newOnHand',$6),now())`,[randomUUID(),offerUuid,onHand-before,principal.userId,before,onHand]);
  return{offerId:offerPublicId};
}

export async function adminQuickAddSave(principal:SessionPrincipal,input:SaveInput){
  if(!postgresAdminRuntimeEnabled()) throw new Error("Admin Quick Add requires PostgreSQL runtime");
  if(!clean(input.vendorId)||!clean(input.title)||!clean(input.categoryCode)) throw new Error("Vendor, title and category are required");
  return uow().withTransaction(scope(principal),async tx=>{
    const vendorMarket=await tx.query<SqlRow>(`SELECT market_id::text market_uuid FROM public.vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1`,[input.vendorId]);
    if(!vendorMarket.rowCount) throw new Error("Unknown vendor");const marketUuid=String(vendorMarket.rows[0].market_uuid);
    let canonicalUuid:string,canonicalPublicId:string;
    if(clean(input.canonicalVariantId)){
      const found=await tx.query<SqlRow>(`SELECT id::text id,public_id FROM public.canonical_variants WHERE public_id=$1 AND market_id=$2::uuid AND suppressed=false AND recalled=false FOR UPDATE`,[clean(input.canonicalVariantId),marketUuid]);
      if(!found.rowCount) throw new Error("Canonical product no longer exists");canonicalUuid=String(found.rows[0].id);canonicalPublicId=String(found.rows[0].public_id);
      await tx.query(`INSERT INTO public.product_translations(canonical_variant_id,locale,title,description,specifications) VALUES($1::uuid,'el',$2,$3,'{}'::jsonb) ON CONFLICT(canonical_variant_id,locale) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description`,[canonicalUuid,clean(input.title),opt(input.description)??null]);
      await tx.query(`UPDATE public.canonical_variants SET model=$2,mpn=$3,updated_at=now() WHERE id=$1::uuid`,[canonicalUuid,opt(input.model)??null,opt(input.mpn)??null]);
    }else{
      const digits=clean(input.gtin).replace(/\D/g,"");
      if(digits){const valid=await tx.query<SqlRow>(`SELECT bls_private.catalog_gtin_is_valid($1) ok`,[digits]);if(!valid.rows[0]?.ok) throw new Error("GTIN checksum is invalid");const duplicate=await tx.query<SqlRow>(`SELECT id::text id,public_id FROM public.canonical_variants WHERE market_id=$1::uuid AND gtin=$2 LIMIT 1 FOR UPDATE`,[marketUuid,digits]);if(duplicate.rowCount){canonicalUuid=String(duplicate.rows[0].id);canonicalPublicId=String(duplicate.rows[0].public_id);const offer=await upsertOffer(tx,principal,{...input,canonicalVariantId:canonicalPublicId},canonicalUuid,canonicalPublicId,marketUuid);return{ok:true,createdCanonical:false,reusedExactGtin:true,canonicalVariantId:canonicalPublicId,...offer};}}
      const category=await tx.query<SqlRow>(`SELECT id::text id FROM public.categories WHERE code=$1 AND active=true AND assignable=true AND (market_id IS NULL OR market_id=$2::uuid) ORDER BY CASE WHEN market_id=$2::uuid THEN 0 ELSE 1 END LIMIT 1`,[clean(input.categoryCode),marketUuid]);if(!category.rowCount) throw new Error("Unknown/disabled category");
      let brandUuid:string|undefined;const brand=clean(input.brand);if(brand){const b=await tx.query<SqlRow>(`INSERT INTO public.brands(name,normalized_name) VALUES($1,$2) ON CONFLICT(normalized_name) DO UPDATE SET name=EXCLUDED.name RETURNING id::text id`,[brand,normalizeBrand(brand)]);brandUuid=String(b.rows[0].id);}
      const family=await tx.query<SqlRow>(`INSERT INTO public.product_families(market_id,brand_id,category_id,model,active,created_at,updated_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4,true,now(),now()) RETURNING id::text id`,[marketUuid,brandUuid??null,String(category.rows[0].id),opt(input.model)??null]);
      canonicalUuid=randomUUID();canonicalPublicId=`cv_${randomUUID()}`;const base=slugify(clean(input.title));const slug=`${base}-${randomUUID().slice(0,8)}`;
      await tx.query(`INSERT INTO public.canonical_variants(id,public_id,market_id,family_id,brand_id,category_id,slug,gtin,mpn,model,condition,variant_attributes,platform_price_minor,currency,tax_rate_bps,active,suppressed,recalled,created_at,updated_at) VALUES($1,$2,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7,$8,$9,$10,'new','{}'::jsonb,$11,'EUR',2400,true,false,false,now(),now())`,[canonicalUuid,canonicalPublicId,marketUuid,String(family.rows[0].id),brandUuid??null,String(category.rows[0].id),slug,digits||null,opt(input.mpn)??null,opt(input.model)??null,integer(input.customerPriceMinor,"price")]);
      await tx.query(`INSERT INTO public.product_translations(canonical_variant_id,locale,title,description,specifications) VALUES($1::uuid,'el',$2,$3,'{}'::jsonb)`,[canonicalUuid,clean(input.title),opt(input.description)??null]);
      await tx.query(`INSERT INTO public.catalog_workflow_events(id,public_id,actor_id,action,to_status,canonical_variant_id,reason,metadata,created_at) VALUES($1,$2,$3::uuid,'admin_quickadd_create',NULL,$4::uuid,'Admin created canonical product through Quick Add',jsonb_build_object('source','admin_quickadd','gtin',$5),now())`,[randomUUID(),`cwe_${randomUUID()}`,principal.userId,canonicalUuid,digits||null]);
    }
    const offer=await upsertOffer(tx,principal,input,canonicalUuid,canonicalPublicId,marketUuid);
    return{ok:true,createdCanonical:!clean(input.canonicalVariantId),canonicalVariantId:canonicalPublicId,...offer};
  },{isolation:"serializable"});
}
