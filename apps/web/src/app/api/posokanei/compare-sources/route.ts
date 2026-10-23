import {NextResponse} from "next/server";
import {loadPublishedReference,pricedCatalog} from "../../../lib/posokanei-public-runtime";
import {lidlPublicEnabled,readLidlOffers} from "../../../lib/posokanei-lidl-source";
import {discoverSourceNeutralCandidates} from "../../../../../../../scripts/posokanei/source-neutral-comparisons.mjs";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const bad=(status:number,code:string)=>NextResponse.json({status:code,candidates:[]},{status,headers});
export async function GET(req:Request){
 if(!lidlPublicEnabled())return bad(503,"unavailable");
 try{
   const params=new URL(req.url).searchParams;
   const origin=params.get("origin"),id=params.get("id")||"";
   if(origin!=="posokanei"&&origin!=="lidl_gr")return bad(400,"invalid_origin");
   if(origin==="posokanei"&&!/^[A-Za-z0-9_-]{1,100}$/.test(id))return bad(400,"invalid_product");
   if(origin==="lidl_gr"&&!/^[0-9a-f-]{36}$/i.test(id))return bad(400,"invalid_offer");
   const storeKey=params.get("store")||"GR0851";
   if(!/^GR\d{4}$/.test(storeKey))return bad(400,"invalid_store");
   const [snapshot,lidl]=await Promise.all([loadPublishedReference(),readLidlOffers(storeKey)]);
   if(!snapshot)return bad(503,"snapshot_unavailable");
   const catalog=pricedCatalog(snapshot);
   const gov=snapshot.products.map(p=>{
     const offers=catalog.byProduct.get(p.source_product_id)||[];
     const priced=offers.filter(o=>o.price_eur>0).sort((a,b)=>a.price_eur-b.price_eur)[0];
     return {id:p.source_product_id,origin:"posokanei",name:p.name,brand:p.brand,
       unit:p.unit,quantity:p.unit_quantity,priceEur:priced?.price_eur??null};
   });
   const lidlProducts=lidl.offers.filter(o=>o.validityStatus==="current").map(o=>({
     id:o.id,origin:"lidl_gr",storeKey,name:o.name,brand:o.brand,
     // Retail promotion 'packaging' often means purchase LIMIT, never pack size.
     unit:null,quantity:null,priceEur:o.priceEur
   }));
   const source=origin==="posokanei"?gov.find(p=>p.id===id):
     lidlProducts.find(p=>p.id==="lidl_gr:"+storeKey+":"+id);
   if(!source)return bad(404,"product_not_current");
   const candidates=discoverSourceNeutralCandidates({
     source,candidates:[...gov,...lidlProducts],approvedGroups:snapshot.approvedGroups,limit:10
   });
   return NextResponse.json({status:"ready",origin,source:{id:source.id,name:source.name,brand:source.brand},
     candidates,storeKey:lidl.store.id,snapshotDate:snapshot.snapshot_date,
     disclaimer:"Η ομοιότητα ονομασίας δεν αποδεικνύει ίδιες συσκευασίες ή ισοδυναμία. Πιθανές αντιστοιχίσεις χρειάζονται έλεγχο πριν χρησιμοποιηθούν σε υπολογισμό εξοικονόμησης."},{headers});
 }catch(e){
   console.error("Source-neutral comparison unavailable",e instanceof Error?e.message:"unknown");
   return bad(503,"source_unavailable");
 }
}
