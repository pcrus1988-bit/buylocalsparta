import {getProductionPostgresRuntime,productionDatabaseConfigured} from "./postgres-runtime";
import {managerSessionView,SessionError} from "./drinkstock-session-service";
import {
 EMPTY_POS_DRAFT,validatePosDraft,validateDraftProductMembership,PosDraftError,
 type PosDraft,type SavedPosDraft
} from "./drinkstock-pos-draft";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type DraftRow={
 provider_id:string;other_name:string;setup_path:PosDraft["path"];
 menu:PosDraft["menu"];mappings:PosDraft["mappings"];revision:number;updated_at:Date;
};
export async function authorizedPosWorkspace(userId:string,partnerId:string,venueId:string){
 if(!UUID.test(partnerId)||!UUID.test(venueId)||!productionDatabaseConfigured())
  throw new PosDraftError("NOT_FOUND",404);
 let view;
 try{view=await managerSessionView(userId,partnerId,venueId);}
 catch(e){
  if(e instanceof SessionError)throw new PosDraftError(e.code,e.status);
  throw e;
 }
 if(!["owner","manager"].includes(view.venue.role??""))
  throw new PosDraftError("MANAGER_ONLY",403);
 return view;
}
function fromRow(row:DraftRow|undefined):SavedPosDraft{
 if(!row)return {...EMPTY_POS_DRAFT,revision:0,updatedAt:null};
 return {providerId:row.provider_id,otherName:row.other_name,path:row.setup_path,
  menu:row.menu,mappings:row.mappings,revision:Number(row.revision),
  updatedAt:new Date(row.updated_at).toISOString()};
}
export async function readPosDraft(userId:string,p:string,v:string):Promise<SavedPosDraft>{
 await authorizedPosWorkspace(userId,p,v);
 const r=await getProductionPostgresRuntime().sqlPool.query<DraftRow>(
  `SELECT provider_id,other_name,setup_path,menu,mappings,revision,updated_at
  FROM public.drinkstock_pos_setup_drafts WHERE partner_id=$1::uuid AND venue_id=$2::uuid`,[p,v]);
 return fromRow(r.rows[0]);
}
export async function savePosDraft(userId:string,p:string,v:string,input:unknown,expectedRevision:unknown):Promise<SavedPosDraft>{
 if(!Number.isInteger(expectedRevision)||Number(expectedRevision)<0)
  throw new PosDraftError("BAD_REVISION",400);
 const draft=validatePosDraft(input);
 const view=await authorizedPosWorkspace(userId,p,v);
 validateDraftProductMembership(draft,view.products);
 const db=await getProductionPostgresRuntime().sqlPool.connect();
 try{
  await db.query("BEGIN");await db.query("SET LOCAL statement_timeout='7s'");
  // Serialize even the very first save. Independently lock each venue's draft.
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 731))",[v]);
  const previous=await db.query<{revision:number}>(
   `SELECT revision FROM public.drinkstock_pos_setup_drafts
   WHERE partner_id=$1::uuid AND venue_id=$2::uuid FOR UPDATE`,[p,v]);
  const revision=Number(previous.rows[0]?.revision??0);
  if(revision!==expectedRevision)throw new PosDraftError("STALE_DRAFT",409);
  // Product mapping must still belong to the venue at actual commit time.
  const verified=await db.query<{id:string}>(`SELECT id::text FROM public.drinkstock_products
   WHERE venue_id=$1::uuid AND partner_id=$2::uuid AND active`,[v,p]);
  validateDraftProductMembership(draft,verified.rows.map(x=>({id:x.id,name:""})));
  const saved=await db.query<DraftRow>(`
   INSERT INTO public.drinkstock_pos_setup_drafts
   (partner_id,venue_id,provider_id,other_name,setup_path,menu,mappings,revision,updated_by,updated_at)
   VALUES($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb,$7::jsonb,$8::int,$9,now())
   ON CONFLICT (partner_id,venue_id) DO UPDATE SET
   provider_id=EXCLUDED.provider_id,other_name=EXCLUDED.other_name,
   setup_path=EXCLUDED.setup_path,menu=EXCLUDED.menu,mappings=EXCLUDED.mappings,
   revision=EXCLUDED.revision,updated_by=EXCLUDED.updated_by,updated_at=now()
   RETURNING provider_id,other_name,setup_path,menu,mappings,revision,updated_at
  `,[p,v,draft.providerId,draft.otherName,draft.path,JSON.stringify(draft.menu),
      JSON.stringify(draft.mappings),revision+1,userId]);
  await db.query("COMMIT");return fromRow(saved.rows[0]);
 }catch(e){
  try{await db.query("ROLLBACK");}catch{}
  throw e;
 }finally{db.release();}
}
