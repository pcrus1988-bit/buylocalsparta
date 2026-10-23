import {NextResponse} from "next/server";
import {lidlPublicEnabled,readLidlOffers,readLidlStores} from "../../../../lib/posokanei-lidl-source";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers});
export async function GET(request:Request){
  if(!lidlPublicEnabled())return json({status:"unpublished",source:"lidl_plus_public_offers",
    reason:"commercial_source_review_pending",products:[],stores:[]});
  try{
    const url=new URL(request.url),mode=url.searchParams.get("mode")||"offers";
    if(!["offers","stores"].includes(mode))return json({status:"invalid_request"},400);
    if(mode==="stores"){
      const result=await readLidlStores();
      return json({status:"ready",stores:result.stores,source:"lidl_plus_public_offers",observedAt:result.observedAt});
    }
    const requested=url.searchParams.get("store")||"GR0851";
    if(!/^GR\d{4}$/.test(requested))return json({status:"invalid_store",products:[]},400);
    const page=Math.max(1,Math.min(200,Number.parseInt(url.searchParams.get("page")||"1",10)||1));
    const q=(url.searchParams.get("q")||"").trim().slice(0,100).normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el");
    const period=url.searchParams.get("period")==="upcoming"?"upcoming":"current";
    const {offers,store,observedAt}=await readLidlOffers(requested);
    const matches=offers.filter(p=>p.validityStatus===period&&
      (!q||[p.name,p.brand||"",p.packaging||"",p.category||""].join(" ").normalize("NFD")
        .replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el").includes(q)));
    const pageSize=24;
    return json({status:"ready",source:"lidl_plus_public_offers",store,observedAt,
      count:matches.length,page,pageSize,hasMore:page*pageSize<matches.length,
      products:matches.slice((page-1)*pageSize,page*pageSize),matched:false,basketEligible:false,unmatched:true,
      disclaimer:"Ενδεικτικές προσφορές Lidl ανά κατάστημα. Ελέγξτε διαθεσιμότητα και όρους Lidl Plus στο κατάστημα."});
  }catch(e){
    console.error("Lidl catalog unavailable",e instanceof Error?e.message:"source error");
    return json({status:"source_unavailable",products:[],stores:[]},503);
  }
}
