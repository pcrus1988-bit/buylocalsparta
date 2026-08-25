import { customerDeliveryWorkspace } from "../../../../lib/customer-delivery-view";
import { requireAccountSession } from "../../../../lib/account-session";
export async function GET(request:Request){try{const principal=await requireAccountSession(request);return Response.json(await customerDeliveryWorkspace(principal),{headers:{"Cache-Control":"private, no-store","Pragma":"no-cache"}});}catch(error){return Response.json({error:error instanceof Error?error.message:"account_auth_required"},{status:401,headers:{"Cache-Control":"private, no-store"}});}}
