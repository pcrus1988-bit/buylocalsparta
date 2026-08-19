import { requireAdminSession } from "../../../../../../lib/admin-session";
import { adminApproveProductTaxProfile, adminProposeProductTaxProfile } from "../../../../../../lib/admin-product-tax-runtime";

export const runtime="nodejs";
const text=(body:Record<string,unknown>,key:string)=>{const v=body[key];if(typeof v!=="string"||!v.trim())throw new Error(`${key} is required`);return v.trim();};

export async function POST(request:Request){
  try{
    const principal=await requireAdminSession(request,{csrf:true});
    const body=await request.json() as Record<string,unknown>;
    const action=text(body,"action");
    if(action==="propose"){
      const vatCategory=Number(body.vatCategory);if(!Number.isSafeInteger(vatCategory)||vatCategory<1||vatCategory>10)throw new Error("vatCategory must be an AADE code 1-10");
      const rawExemption=body.vatExemptionCategory;const exemption=rawExemption==null||rawExemption===""?undefined:Number(rawExemption);if(exemption!=null&&!Number.isSafeInteger(exemption))throw new Error("vatExemptionCategory must be an integer");
      return Response.json(await adminProposeProductTaxProfile(principal,{variantId:text(body,"variantId"),vatCategory,vatExemptionCategory:exemption,effectiveFrom:text(body,"effectiveFrom"),notes:text(body,"notes")}));
    }
    if(action==="approve")return Response.json(await adminApproveProductTaxProfile(principal,{profileId:text(body,"profileId"),notes:text(body,"notes")}));
    throw new Error("Unsupported product tax profile action");
  }catch(error){return Response.json({error:error instanceof Error?error.message:"product_tax_profile_action_failed"},{status:400});}
}
