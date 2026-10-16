import {NextResponse} from "next/server";
import {
  loadPublishedReference,pricedCatalog,type PublishedReferenceSnapshot
} from "../../../../lib/posokanei-public-runtime";
import {
  createBrandIndex,findBrandAlternatives,type BrandIndex
} from "../../../../../../../scripts/posokanei/brand-alternatives.mjs";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
// Reuse the immutable match index for the lifetime of a published snapshot.
const indexes=new WeakMap<PublishedReferenceSnapshot,BrandIndex>();
export async function GET(req:Request){
  try{
    const params=new URL(req.url).searchParams;
    const id=params.get("productId")||"";
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))
      return NextResponse.json({status:"invalid",alternatives:[]},{status:400,headers});
    const packages=Number(params.get("packages")||"1");
    if(!Number.isSafeInteger(packages)||packages<1||packages>100)
      return NextResponse.json({status:"invalid",alternatives:[],reason:"invalid_packages"},{status:400,headers});
    const excluded=(params.get("exclude")||"").slice(0,1500).split(",")
      .filter(x=>/^[a-zA-Z0-9_-]{1,100}$/.test(x)).slice(0,24);
    const snap=await loadPublishedReference();
    if(!snap)return NextResponse.json({status:"unavailable",alternatives:[]},{status:503,headers});
    let index=indexes.get(snap);
    if(!index){index=createBrandIndex(snap.products);indexes.set(snap,index);}
    const matches=findBrandAlternatives({
      sourceId:id,packages,products:snap.products,
      offersByProduct:pricedCatalog(snap).byProduct,brandIndex:index,
      excludedRetailerIds:excluded
    });
    if(matches.reason==="not_found")
      return NextResponse.json({status:"not_found",alternatives:[]},{status:404,headers});
    return NextResponse.json({status:"ready",snapshotDate:snap.snapshot_date,...matches},{headers});
  }catch(error){
    console.error("PosoKanei alternatives unavailable",error instanceof Error?error.message:"unknown");
    return NextResponse.json({status:"unavailable",alternatives:[]},{status:503,headers});
  }
}
