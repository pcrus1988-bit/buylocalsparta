import { requireAdminSession } from "../../../../../lib/admin-session";
import {
  adminCreatePayoutDestination,
  adminDisablePayoutDestination,
  adminPayoutDestinationsWorkspace,
  adminVerifyPayoutDestination
} from "../../../../../lib/admin-payout-destinations";

export async function POST(request: Request) {
  try {
    const principal=await requireAdminSession(request,{csrf:true,permission:"finance.write"});
    const body=await request.json() as Record<string,unknown>;
    const kind=String(body.kind??"");
    if (kind==="create") {
      await adminCreatePayoutDestination(principal,{
        vendorId:String(body.vendorId??""),provider:String(body.provider??"bank_transfer"),providerReference:String(body.providerReference??""),
        displayLabel:String(body.displayLabel??""),maskedAccount:String(body.maskedAccount??""),accountHolder:String(body.accountHolder??""),
        bic:typeof body.bic==="string"?body.bic:undefined,reason:String(body.reason??"")
      });
    } else if (kind==="verify") {
      await adminVerifyPayoutDestination(principal,{destinationId:String(body.destinationId??""),reason:String(body.reason??"")});
    } else if (kind==="disable") {
      await adminDisablePayoutDestination(principal,{destinationId:String(body.destinationId??""),reason:String(body.reason??"")});
    } else throw new Error("Unsupported payout destination action");
    return Response.json(await adminPayoutDestinationsWorkspace(principal));
  } catch (error) {
    return Response.json({error:error instanceof Error?error.message:"payout_destination_action_failed"},{status:400});
  }
}
