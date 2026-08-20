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
    return Response.json({error:error instanceof Error?error.message:"mydata_reconciliation_failed"},{status:400});
  }
}
function required(body:Body,key:string):string{
  const value=body[key];
  if(typeof value!=="string"||!value.trim())throw new Error(`${key} is required`);
  return value.trim();
}
