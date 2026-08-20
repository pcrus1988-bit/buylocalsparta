import { MyDataTransportError } from "@buy-local-sparta/aade-mydata";
import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminReconcileCustomerFiscalDocument } from "../../../../../lib/admin-fiscal-reconciliation-runtime";

export const runtime="nodejs";
type Body=Record<string,unknown>;

export async function POST(request:Request){
  try{
    const principal=await requireAdminSession(request,{csrf:true});
    const body=await request.json() as Body;
    const documentId=required(body,"documentId");
    const reason=required(body,"reason");
    return Response.json(await adminReconcileCustomerFiscalDocument(principal,{documentId,reason}));
  }catch(error){
    if(error instanceof MyDataTransportError&&error.httpStatus===429){
      const retryAfterSeconds=retryAfterFromMessage(error.message);
      const wait=retryAfterSeconds?` Δοκιμάστε ξανά σε περίπου ${formatWait(retryAfterSeconds)}.`:" Δοκιμάστε ξανά σε λίγα λεπτά.";
      return Response.json({
        error:`Η AADE έχει προσωρινά περιορίσει τα read-only αιτήματα reconciliation.${wait} Δεν έγινε resend ή αλλαγή στο παραστατικό.`,
        ...(retryAfterSeconds?{retryAfterSeconds}:{})
      },{
        status:429,
        ...(retryAfterSeconds?{headers:{"Retry-After":String(retryAfterSeconds)}}:{})
      });
    }
    return Response.json({error:error instanceof Error?error.message:"mydata_reconciliation_failed"},{status:400});
  }
}
function required(body:Body,key:string):string{
  const value=body[key];
  if(typeof value!=="string"||!value.trim())throw new Error(`${key} is required`);
  return value.trim();
}
function retryAfterFromMessage(message:string):number|undefined{
  const match=message.match(/try\s+again\s+in\s+(\d+)\s+seconds?/i)??message.match(/retry[- ]?after[^\d]*(\d+)/i);
  if(!match?.[1])return undefined;
  const seconds=Number(match[1]);
  return Number.isSafeInteger(seconds)&&seconds>0?seconds:undefined;
}
function formatWait(seconds:number):string{
  if(seconds<60)return `${seconds} δευτερόλεπτα`;
  const minutes=Math.floor(seconds/60);
  const remainder=seconds%60;
  return remainder?`${minutes} λ. ${remainder} δ.`:`${minutes} λεπτά`;
}
