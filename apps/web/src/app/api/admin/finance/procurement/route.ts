import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminApprovePayable, adminFinanceWorkspace } from "../../../../../lib/admin-runtime";
import { ensureCommissionInvoiceDraftForProcurement } from "../../../../../lib/admin-vendor-finance-automation";

export async function POST(request:Request){
  try{
    const principal=await requireAdminSession(request,{csrf:true,permission:"finance.write"});
    const body=await request.json() as {procurementId?:unknown};
    const procurementId=typeof body.procurementId==="string"?body.procurementId:"";
    await adminApprovePayable(principal,procurementId);
    let warning:string|undefined;
    try{
      await ensureCommissionInvoiceDraftForProcurement(principal,procurementId);
    }catch(error){
      warning=`Το procurement έγινε payable, αλλά το commission billing draft χρειάζεται έλεγχο: ${error instanceof Error?error.message:"unknown billing error"}`;
    }
    return Response.json({...await adminFinanceWorkspace(principal),warning});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"procurement_action_failed"},{status:400});
  }
}
