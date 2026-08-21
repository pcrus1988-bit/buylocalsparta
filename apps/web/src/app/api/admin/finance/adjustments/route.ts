import { requireAdminSession } from "../../../../../lib/admin-session";
import {
  adminApproveFinanceAdjustment,
  adminFinanceAdjustmentWorkspace,
  adminRejectFinanceAdjustment
} from "../../../../../lib/admin-finance-adjustments";

export async function POST(request: Request) {
  try {
    const principal=await requireAdminSession(request,{csrf:true,permission:"finance.write"});
    const body=await request.json() as Record<string,unknown>;
    const kind=String(body.kind??"");
    if(kind==="approve") {
      await adminApproveFinanceAdjustment(principal,{
        adjustmentId:String(body.adjustmentId??""),
        creditDocumentId:typeof body.creditDocumentId==="string"&&body.creditDocumentId.trim()?body.creditDocumentId:undefined,
        reason:String(body.reason??"")
      });
    } else if(kind==="reject") {
      await adminRejectFinanceAdjustment(principal,{adjustmentId:String(body.adjustmentId??""),reason:String(body.reason??"")});
    } else throw new Error("Unsupported finance adjustment action");
    return Response.json(await adminFinanceAdjustmentWorkspace(principal));
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:"finance_adjustment_action_failed"},{status:400});
  }
}
