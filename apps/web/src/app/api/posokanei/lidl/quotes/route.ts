import {NextResponse} from "next/server";
import {lidlPublicEnabled,readLidlOffers} from "../../../../../lib/posokanei-lidl-source";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const fail=(message:string,status=400)=>NextResponse.json({status:"invalid",error:message},{status,headers});
type InputLine={id:string;storeKey:string;offerId:string;quantity:number};
export async function POST(request:Request){
  if(!lidlPublicEnabled())return fail("Οι προσφορές Lidl δεν είναι ενεργές.",503);
  try{
    const raw=await request.text();if(raw.length>6000)return fail("Η λίστα είναι πολύ μεγάλη.",413);
    const body:unknown=JSON.parse(raw);
    if(!body||typeof body!=="object"||Array.isArray(body))return fail("Μη έγκυρη λίστα.");
    const input=(body as {items?:unknown}).items;
    if(!Array.isArray(input)||input.length<1||input.length>20)return fail("Επιτρέπονται 1–20 προϊόντα.");
    const items=input as InputLine[];
    if(items.some(x=>!x||typeof x!=="object"||
       !/^line_[a-z0-9]{1,30}$/.test(x.id)||
       !/^GR\d{4}$/.test(x.storeKey)||
       !/^[0-9a-fA-F-]{36}$/.test(x.offerId)||
       !Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>100)||
       new Set(items.map(x=>x.id)).size!==items.length)return fail("Μη έγκυρες αναφορές προσφορών.");
    const stores=[...new Set(items.map(x=>x.storeKey))];
    if(stores.length>5)return fail("Επιτρέπονται έως 5 καταστήματα Lidl.");
    const feeds=new Map(await Promise.all(stores.map(async store=>{
      const result=await readLidlOffers(store);
      return [store,result] as const;
    })));
    const result=items.map(line=>{
      const feed=feeds.get(line.storeKey)!;
      const offer=feed.offers.find(x=>x.id==="lidl_gr:"+line.storeKey+":"+line.offerId);
      const common={lineId:line.id,storeKey:line.storeKey,storeName:feed.store.name,
        quantity:line.quantity,observedAt:feed.observedAt};
      if(!offer||offer.validityStatus!=="current")
        return {...common,status:"not_current" as const,offer:null};
      return {...common,status:"current" as const,offer:{
        id:offer.id,name:offer.name,brand:offer.brand,priceEur:offer.priceEur,
        referencePriceEur:offer.referencePriceEur,validTo:offer.validTo,
        retailerProductIds:offer.retailerProductIds,
        membershipRequirement:offer.membershipRequirement,unitPriceText:offer.unitPriceText
      }};
    });
    const grouped=new Map<string,{storeKey:string;storeName:string;subtotalCents:number;lines:number}>();
    for(const r of result){
      if(r.status!=="current"||!r.offer)continue;
      const record=grouped.get(r.storeKey)||{storeKey:r.storeKey,storeName:r.storeName,subtotalCents:0,lines:0};
      record.subtotalCents+=Math.round(r.offer.priceEur*100)*r.quantity;
      record.lines++;
      grouped.set(r.storeKey,record);
    }
    return NextResponse.json({status:"ready",items:result,
      stores:[...grouped.values()].map(({subtotalCents,...s})=>({...s,subtotalEur:subtotalCents/100})),
      complete:result.every(r=>r.status==="current"),
      disclaimer:"Ενδεικτική αξία τρεχουσών προσφορών ανά κατάστημα. Απαιτείται έλεγχος όρων Lidl Plus, αποθέματος και τελικής τιμής στο κατάστημα."
    },{headers});
  }catch(e){
    console.error("Lidl quote unavailable",e instanceof Error?e.message:"error");
    return fail("Οι προσφορές δεν μπόρεσαν να ελεγχθούν. Δεν υπολογίζονται ως δωρεάν.",503);
  }
}
