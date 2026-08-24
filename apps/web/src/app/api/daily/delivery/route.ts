import { vendorConfirmDriverPickup } from "../../../../lib/delivery-driver-runtime";
import { requireDailySession } from "../../../../lib/daily-session";
export async function POST(request:Request){try{const principal=await requireDailySession(request,true),body=await request.json() as {token?:unknown};return Response.json(await vendorConfirmDriverPickup(principal,typeof body.token==="string"?body.token:""));}catch(error){return Response.json({error:error instanceof Error?error.message:"pickup_confirmation_failed"},{status:400});}}
