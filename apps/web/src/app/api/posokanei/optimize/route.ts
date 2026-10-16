import {NextResponse} from "next/server";
import {optimizeReferenceBasket,type BasketLine} from "../../../../../../../scripts/posokanei/basket-optimizer.mjs";
import {loadPublishedReference} from "../../../../lib/posokanei-public-runtime";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const fail=(code:number,message:string)=>NextResponse.json({error:message},{status:code,headers});
export async function POST(request:Request){
  try{
    if(Number(request.headers.get("content-length")||0)>15000)return fail(413,"Η λίστα είναι πολύ μεγάλη.");
    const raw=await request.text();
    if(raw.length>15000)return fail(413,"Η λίστα είναι πολύ μεγάλη.");
    const input:unknown=JSON.parse(raw);
    if(!input||typeof input!=="object"||Array.isArray(input))return fail(400,"Μη έγκυρη λίστα.");
    const {lines,storeLimit,retailerIds}=input as {lines?:unknown;storeLimit?:unknown;retailerIds?:unknown};
    if(!Array.isArray(lines)||lines.length<1||lines.length>20||
      !Number.isSafeInteger(storeLimit)||typeof storeLimit!=="number"||storeLimit<1||storeLimit>5||!Array.isArray(retailerIds)||retailerIds.length<1||retailerIds.length>24||retailerIds.some(id=>typeof id!=="string"||!/^[a-zA-Z0-9_-]{1,100}$/.test(id)))
      return fail(400,"Επιτρέπονται 1–20 προϊόντα και έως 5 αλυσίδες με τουλάχιστον μία επιλεγμένη.");
    const snapshot=await loadPublishedReference();
    if(!snapshot)return fail(503,"Οι τιμές αναφοράς δεν είναι ακόμη διαθέσιμες.");
    const result=optimizeReferenceBasket({
      lines:lines as BasketLine[],products:snapshot.products,observations:snapshot.observations,
      approvedGroups:snapshot.approvedGroups,snapshotDate:snapshot.snapshot_date,country:"GR",storeLimit,retailerIds
    });
    return NextResponse.json({status:"ready",result},{headers});
  }catch(e){
    return fail(400,e instanceof SyntaxError?"Μη έγκυρο αίτημα.":e instanceof Error?e.message:"Αποτυχία υπολογισμού.");
  }
}
