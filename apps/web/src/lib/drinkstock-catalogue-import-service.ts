import {getProductionPostgresRuntime,productionDatabaseConfigured} from "./postgres-runtime";
import {drinkPriceBand,VENUE_MAX_PRODUCTS} from "./drinkstock-market-pricing";
import {catalogueTemplateByKey,validateCatalogueSelections,type CatalogueSelection} from "./drinkstock-starter-catalogue";
export class CatalogueImportError extends Error{
 readonly code:string;readonly status:number;
 constructor(code:string,status:number){super(code);this.code=code;this.status=status;}
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type CatalogueImportCommand=Readonly<{requestKey:string;items:readonly CatalogueSelection[]}>;
export function validateCatalogueImportCommand(input:unknown):CatalogueImportCommand{
 if(!input||typeof input!=="object"||Array.isArray(input))
  throw new CatalogueImportError("INVALID_IMPORT",400);
 const v=input as Record<string,unknown>;
 if(Object.keys(v).sort().join(",")!=="items,requestKey"||
   typeof v.requestKey!=="string"||!UUID.test(v.requestKey)||!/^.{1,}$/s.test(v.requestKey))
  throw new CatalogueImportError("INVALID_IMPORT",400);
 let items:CatalogueSelection[];
 try{items=validateCatalogueSelections(v.items);}
 catch{throw new CatalogueImportError("INVALID_IMPORT_ITEMS",400);}
 return {requestKey:v.requestKey,items};
}
export type CatalogueImportResult=Readonly<{
 selected:number;imported:number;skipped:number;replayed:boolean;
 /** Imported VAT classes are suggestions pending owner/merchant tax review. */
 vatReviewed:false;commercialCheckoutEnabled:false;
}>;
type Db={query<T extends Record<string,unknown>>(sql:string,values?:readonly unknown[]):Promise<{rows:readonly T[];rowCount:number}>};
async function readImport(db:Db,p:string,v:string,key:string){
 const r=await db.query<{selected_count:number;imported_count:number;skipped_count:number;selections:unknown}>(`
 SELECT selected_count,imported_count,skipped_count,selections
 FROM public.drinkstock_catalogue_imports WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND request_key=$3::uuid
 `,[p,v,key]);
 return r.rows[0];
}
/** Serialized transaction, one venue lock; never invent stock or availability. */
export async function importDrinkStockStarterCatalogue(userId:string,partnerId:string,venueId:string,command:CatalogueImportCommand):Promise<CatalogueImportResult>{
 if(!userId||!UUID.test(partnerId)||!UUID.test(venueId))
  throw new CatalogueImportError("NOT_FOUND",404);
 if(!productionDatabaseConfigured())throw new CatalogueImportError("UNAVAILABLE",503);
 const client=await getProductionPostgresRuntime().sqlPool.connect();
 let committed=false;
 try{
  await client.query("BEGIN");
  await client.query("SET LOCAL statement_timeout='10s'");
  const scope=await client.query<{role:string;floor_percent:number;ceiling_percent:number;rehearsal_enabled:boolean;session_open:boolean}>(`
   SELECT m.role,COALESCE(s.floor_percent,70)::int AS floor_percent,
    COALESCE(s.ceiling_percent,145)::int AS ceiling_percent,
    COALESCE(s.rehearsal_enabled,false) AS rehearsal_enabled,
    EXISTS(SELECT 1 FROM public.drinkstock_sessions ds WHERE ds.partner_id=v.partner_id
      AND ds.venue_id=v.id AND ds.state IN ('scheduled','running','paused','crashing')) AS session_open
   FROM public.hospitality_venues v
   JOIN public.hospitality_partners p ON p.id=v.partner_id AND p.status='active'
   JOIN public.hospitality_partner_apps a ON a.partner_id=p.id AND a.app_key='drinkStock' AND a.enabled
   JOIN public.hospitality_partner_memberships m ON m.partner_id=p.id AND m.user_id=$1 AND m.status='active'
   LEFT JOIN public.drinkstock_venue_settings s ON s.venue_id=v.id AND s.partner_id=v.partner_id
   WHERE v.partner_id=$2::uuid AND v.id=$3::uuid AND v.status='active'
   FOR UPDATE OF v
  `,[userId,partnerId,venueId]);
  const venue=scope.rows[0];
  if(!venue)throw new CatalogueImportError("NOT_FOUND",404);
  if(!["owner","manager"].includes(venue.role))throw new CatalogueImportError("ROLE_FORBIDDEN",403);
  const prior=await readImport(client,partnerId,venueId,command.requestKey);
  if(prior){
   if(JSON.stringify(prior.selections)!==JSON.stringify(command.items))
    throw new CatalogueImportError("IMPORT_KEY_CONFLICT",409);
   await client.query("COMMIT");committed=true;
   return {selected:Number(prior.selected_count),imported:Number(prior.imported_count),
    skipped:Number(prior.skipped_count),replayed:true,vatReviewed:false,commercialCheckoutEnabled:false};
  }
  if(venue.rehearsal_enabled||venue.session_open)
   throw new CatalogueImportError("SESSION_LOCKED",409);
  const bounds={floorPercent:Number(venue.floor_percent),ceilingPercent:Number(venue.ceiling_percent)};
  const count=await client.query<{n:number}>(`
   SELECT count(*)::int AS n FROM public.drinkstock_products
   WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND active
  `,[partnerId,venueId]);
  let occupied=Number(count.rows[0]?.n??0);
  if(occupied>VENUE_MAX_PRODUCTS)throw new CatalogueImportError("PRODUCT_LIMIT",409);
  let imported=0,skipped=0;
  for(const item of command.items){
   const template=catalogueTemplateByKey(item.key);
   if(!template)throw new CatalogueImportError("INVALID_IMPORT_ITEMS",400);
   const existing=await client.query<{id:string}>(`
     SELECT id::text AS id FROM public.drinkstock_products
     WHERE venue_id=$1::uuid AND lower(name)=lower($2) LIMIT 1
   `,[venueId,template.name]);
   if(existing.rows.length){skipped++;continue;}
   if(occupied>=VENUE_MAX_PRODUCTS)throw new CatalogueImportError("PRODUCT_LIMIT",409);
   const band=drinkPriceBand(item.baseCents,bounds);
   const result=await client.query<{id:string}>(`
    INSERT INTO public.drinkstock_products(
     venue_id,partner_id,name,category,base_cents,price_cents,
     min_cents,max_cents,vat_class,vat_reviewed,catalogue_key)
    VALUES($1::uuid,$2::uuid,$3,$4,$5,$5,$6,$7,$8,false,$9)
    ON CONFLICT DO NOTHING RETURNING id::text AS id
   `,[venueId,partnerId,template.name,template.category,item.baseCents,
    band.minCents,band.maxCents,template.vatClass,template.key]);
   if(result.rows.length){imported++;occupied++;}
   else skipped++;
  }
  await client.query(`
   INSERT INTO public.drinkstock_catalogue_imports(
    venue_id,partner_id,actor_user_id,request_key,selected_count,
    imported_count,skipped_count,selections)
   VALUES($1::uuid,$2::uuid,$3,$4::uuid,$5,$6,$7,$8::jsonb)
  `,[venueId,partnerId,userId,command.requestKey,command.items.length,
   imported,skipped,JSON.stringify(command.items)]);
  await client.query("COMMIT");committed=true;
  return {selected:command.items.length,imported,skipped,replayed:false,
    vatReviewed:false,commercialCheckoutEnabled:false};
 }catch(e){if(!committed)try{await client.query("ROLLBACK");}catch{}throw e;}
 finally{client.release();}
}
