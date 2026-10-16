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
// Cache by the *verified snapshot identity*, not JS object identity: the
// alternative HTTPS-publication loader parses a new object per request.
// Bounded to the most recent two snapshots so long-running instances stay small.
const cachedIndexes=new Map<string,BrandIndex>();
const cachedCatalogues=new Map<string,ReturnType<typeof pricedCatalog>>();
function snapshotKey(snapshot:PublishedReferenceSnapshot){
  return snapshot.snapshot_sha256+":"+snapshot.snapshot_date+":"+JSON.stringify(snapshot.approvedGroups);
}
function remember<T>(cache:Map<string,T>,key:string,value:T):T{
  if(cache.size>=2)cache.delete(cache.keys().next().value!);
  cache.set(key,value);
  return value;
}
function indexFor(snapshot:PublishedReferenceSnapshot){
  const key=snapshotKey(snapshot);
  return cachedIndexes.get(key)??remember(cachedIndexes,key,createBrandIndex(snapshot.products));
}
function catalogFor(snapshot:PublishedReferenceSnapshot){
  const key=snapshotKey(snapshot);
  return cachedCatalogues.get(key)??remember(cachedCatalogues,key,pricedCatalog(snapshot));
}
export async function GET(req:Request){
  try{
    const params=new URL(req.url).searchParams;
    const id=params.get("productId")||"";
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))
      return NextResponse.json({status:"invalid",alternatives:[]},{status:400,headers});
    const allBrands=params.get("show")==="all";
    const packages=Number(params.get("packages")||"1");
    if(!Number.isSafeInteger(packages)||packages<1||packages>100)
      return NextResponse.json({status:"invalid",alternatives:[],reason:"invalid_packages"},{status:400,headers});
    const excluded=(params.get("exclude")||"").slice(0,1500).split(",")
      .filter(x=>/^[a-zA-Z0-9_-]{1,100}$/.test(x)).slice(0,24);
    const snap=await loadPublishedReference();
    if(!snap)return NextResponse.json({status:"unavailable",alternatives:[]},{status:503,headers});
    const index=indexFor(snap);
    const matches=findBrandAlternatives({
      sourceId:id,packages,products:snap.products,
      offersByProduct:catalogFor(snap).byProduct,brandIndex:index,
      approvedGroups:snap.approvedGroups,
      excludedRetailerIds:excluded,
      includeNonCheaper:allBrands,maxResults:allBrands?10:5
    });
    if(matches.reason==="not_found")
      return NextResponse.json({status:"not_found",alternatives:[]},{status:404,headers});
    return NextResponse.json({status:"ready",snapshotDate:snap.snapshot_date,...matches},{headers});
  }catch(error){
    console.error("PosoKanei alternatives unavailable",error instanceof Error?error.message:"unknown");
    return NextResponse.json({status:"unavailable",alternatives:[]},{status:503,headers});
  }
}


/** One consistent snapshot and whitelist for the entire shopping list (max 20). */
export async function POST(request:Request){
  try{
    if(Number(request.headers.get("content-length")||0)>7000)
      return NextResponse.json({error:"Η λίστα είναι πολύ μεγάλη."},{status:413,headers});
    const body=await request.text();
    if(body.length>7000)
      return NextResponse.json({error:"Η λίστα είναι πολύ μεγάλη."},{status:413,headers});
    const data:unknown=JSON.parse(body);
    if(!data||typeof data!=="object"||Array.isArray(data))
      return NextResponse.json({error:"Μη έγκυρη λίστα."},{status:400,headers});
    const input=data as {lines?:unknown;excludedRetailerIds?:unknown;includeNonCheaper?:unknown};
    const validId=(v:unknown)=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
    if(!Array.isArray(input.lines)||input.lines.length<1||input.lines.length>20||
       input.lines.some(x=>{
         if(!x||typeof x!=="object"||Array.isArray(x))return true;
         const line=x as Record<string,unknown>;
         return !validId(line.id)||!validId(line.sourceProductId)||
           !Number.isSafeInteger(line.packageCount)||typeof line.packageCount!=="number"||
           line.packageCount<1||line.packageCount>100;
       })||!Array.isArray(input.excludedRetailerIds)||
       input.excludedRetailerIds.length>24||
       input.excludedRetailerIds.some(x=>!validId(x))||
       (input.includeNonCheaper!==undefined&&typeof input.includeNonCheaper!=="boolean"))
       return NextResponse.json({error:"Μη έγκυρα στοιχεία σύγκρισης."},{status:400,headers});
    const requested=input.lines as Array<{id:string;sourceProductId:string;packageCount:number}>;
    if(new Set(requested.map(x=>x.id)).size!==requested.length)
      return NextResponse.json({error:"Διπλά προϊόντα."},{status:400,headers});
    const snapshot=await loadPublishedReference();
    if(!snapshot)return NextResponse.json({status:"unavailable",lines:[]},{status:503,headers});
    const index=indexFor(snapshot);
    const catalogue=catalogFor(snapshot);
    const results=requested.map(line=>({
      lineId:line.id,sourceProductId:line.sourceProductId,
      ...findBrandAlternatives({
        sourceId:line.sourceProductId,packages:line.packageCount,
        products:snapshot.products,offersByProduct:catalogue.byProduct,
        brandIndex:index,approvedGroups:snapshot.approvedGroups,
        excludedRetailerIds:input.excludedRetailerIds as string[],
         includeNonCheaper:input.includeNonCheaper===true
      })
    }));
    return NextResponse.json({
      status:"ready",snapshotDate:snapshot.snapshot_date,lines:results
    },{headers});
  }catch(error){
    if(error instanceof SyntaxError)
      return NextResponse.json({error:"Μη έγκυρο αίτημα."},{status:400,headers});
    console.error("PosoKanei basket alternatives unavailable",error instanceof Error?error.message:"unknown");
    return NextResponse.json({status:"unavailable",lines:[]},{status:503,headers});
  }
}
