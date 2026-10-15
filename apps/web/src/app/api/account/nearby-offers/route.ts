import { requireAccountSession } from "../../../../lib/account-session";
import { getNearbyPreference, scanNearbyOffers, setNearbyPreference } from "../../../../lib/nearby-offers";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await requireAccountSession();
    return Response.json({...await getNearbyPreference(user),csrfToken:user.csrfToken}, {headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    const message=error instanceof Error?error.message:"PREFERENCE_READ_FAILED";
    return Response.json({error:message},{status:message==="AUTH_REQUIRED"?401:400});
  }
}
export async function PATCH(request: Request) {
  try {
    const user=await requireAccountSession(request,true);
    const body=await request.json() as {enabled?:unknown;phoneNotifications?:unknown};
    if(typeof body.enabled!=="boolean"||typeof body.phoneNotifications!=="boolean") throw new Error("INVALID_PREFERENCE");
    return Response.json(await setNearbyPreference(user,body.enabled,body.phoneNotifications),{headers:{"Cache-Control":"no-store"}});
  } catch(error){
    const message=error instanceof Error?error.message:"PREFERENCE_UPDATE_FAILED";
    return Response.json({error:message},{status:message==="AUTH_REQUIRED"?401:400});
  }
}
export async function POST(request: Request) {
  try {
    const user=await requireAccountSession(request,true);
    const body=await request.json() as {latitude?:unknown;longitude?:unknown;accuracy?:unknown};
    const offers=await scanNearbyOffers(user,{
      latitude:Number(body.latitude),longitude:Number(body.longitude),accuracy:Number(body.accuracy)
    });
    return Response.json({offers},{headers:{"Cache-Control":"no-store"}});
  } catch(error){
    const message=error instanceof Error?error.message:"NEARBY_LOOKUP_FAILED";
    return Response.json({error:message},{status:message==="AUTH_REQUIRED"?401:message==="LOCATION_NOT_ACCURATE"?422:400});
  }
}
