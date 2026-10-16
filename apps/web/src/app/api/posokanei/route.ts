import {NextResponse} from "next/server";
import {loadPublishedReference,normalizedGreek,pricedCatalog,publicCards} from "../../../lib/posokanei-public-runtime";
import {broadCategory,BROAD_CATEGORIES} from "../../../lib/posokanei-discovery";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
export async function GET(request:Request){
  try {
    const snapshot=await loadPublishedReference();
    if(!snapshot)return NextResponse.json({status:"unavailable",products:[],categories:[],groups:[]},{headers});
    const url=new URL(request.url);
    const q=normalizedGreek((url.searchParams.get("q")||"").trim().slice(0,100));
    const category=(url.searchParams.get("category")||"").slice(0,150);
    const excluded=new Set((url.searchParams.get("exclude")||"").slice(0,1500).split(",").filter(x=>/^[a-zA-Z0-9_-]{1,100}$/.test(x)).slice(0,24));
    const groupId=(url.searchParams.get("group")||"").slice(0,100);
    const page=Math.max(1,Math.min(1000,Number.parseInt(url.searchParams.get("page")||"1",10)||1));
    const catalog=pricedCatalog(snapshot);
    const targetGroup=groupId?snapshot.approvedGroups.find(g=>g.id===groupId):null;
    const ids=new Set(targetGroup?.memberIds||[]);
    const eligibleById=new Map([...catalog.byProduct].map(([id,offers])=>[id,offers.filter(o=>!excluded.has(o.retailer_id))]));
    const all=snapshot.products.filter(p=>
      (groupId?ids.has(p.source_product_id):
        (!category||broadCategory(p.category)===category)&&(!q||normalizedGreek([p.name,p.brand||"",p.category||""].join(" ")).includes(q)))&&
      (eligibleById.get(p.source_product_id)?.length||0)>0
    );
    const count=all.length;
    const selected=all.slice((page-1)*24,page*24);
    const eligibleCatalog={...catalog,byProduct:eligibleById};
    const retailers=new Map<string,string>();
    for(const o of snapshot.observations)retailers.set(o.retailer_id,o.retailer_name||o.retailer_id);
    const categories=[...new Set(snapshot.products.map(p=>p.category).filter((s):s is string=>Boolean(s)))].sort((a,b)=>a.localeCompare(b,"el"));
    return NextResponse.json({
      status:"ready",source:snapshot.source,snapshotDate:snapshot.snapshot_date,
      count,page,pageSize:24,hasMore:page*24<count,
      products:publicCards(snapshot,selected.map(p=>p.source_product_id),eligibleCatalog),
      categories,categoryGroups:BROAD_CATEGORIES,groups:snapshot.approvedGroups.map(g=>({id:g.id,label:g.label,basis:g.basis})),
      retailers:[...retailers].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name,"el"))
    },{headers});
  }catch(error){
    console.error("PosoKanei reference unavailable",error instanceof Error?error.message:"unknown");
    return NextResponse.json({status:"unavailable",products:[],categories:[],groups:[]},{status:503,headers});
  }
}
