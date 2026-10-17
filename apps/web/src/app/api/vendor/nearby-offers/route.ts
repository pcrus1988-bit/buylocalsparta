import { requireVendorCapability } from "../../../../lib/vendor-session";
import { createNearbyCampaign, setNearbyCampaignStatus, vendorNearbyDashboard } from "../../../../lib/nearby-offers";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const {principal}=await requireVendorCapability("promotions.manage");
    return Response.json(await vendorNearbyDashboard(principal),{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    const message=error instanceof Error?error.message:"VENDOR_READ_FAILED";
    return Response.json({error:message},{status:403});
  }
}
export async function POST(request: Request) {
  try {
    const {principal}=await requireVendorCapability("promotions.manage",request,true);
    const body=await request.json() as Record<string,unknown>;
    return Response.json(await createNearbyCampaign(principal,body),{status:201});
  } catch(error) {
    const message=error instanceof Error?error.message:"OFFER_CREATE_FAILED";
    return Response.json({error:message},{status:400});
  }
}
export async function PATCH(request: Request) {
  try {
    const {principal}=await requireVendorCapability("promotions.manage",request,true);
    const body=await request.json() as {id?:unknown;status?:unknown};
    if(typeof body.id!=="string"||typeof body.status!=="string") throw new Error("INVALID_OFFER");
    return Response.json(await setNearbyCampaignStatus(principal,body.id,body.status));
  } catch(error) {
    const message=error instanceof Error?error.message:"OFFER_UPDATE_FAILED";
    return Response.json({error:message},{status:400});
  }
}
