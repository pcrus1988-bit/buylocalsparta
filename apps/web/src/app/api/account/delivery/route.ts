import { deliveryCustomerWorkspace } from "../../../../lib/delivery-driver-runtime";
import { requireAccountSession } from "../../../../lib/account-session";
export async function GET(request:Request){try{const principal=await requireAccountSession(request);return Response.json(await deliveryCustomerWorkspace(principal),{headers:{"Cache-Control":"no-store"}});}catch(error){return Response.json({error:error instanceof Error?error.message:"account_auth_required"},{status:401});}}
