import { requireAdminSession } from "../../../../../lib/admin-session";
import {
  adminApproveAccountingPolicy,
  adminCreateAccountingPolicyRevision,
  adminDecideDocumentMapping,
  adminDecidePaymentMapping,
  adminDecidePolicyCheck,
  adminSetFiscalisationRoute,
  adminUpdateAccountingPolicy,
  adminUpdateDocumentMapping,
  adminUpdateFiscalSeries,
  adminUpdatePaymentMapping,
  adminUpdateVatCategory
} from "../../../../../lib/admin-tax-policy-runtime";

export const runtime="nodejs";
type Body=Record<string,unknown>;
const required=(body:Body,key:string)=>{const value=body[key];if(typeof value!=="string"||!value.trim())throw new Error(`${key} is required`);return value.trim();};
const optional=(body:Body,key:string)=>typeof body[key]==="string"?(body[key] as string).trim()||undefined:undefined;
const bool=(body:Body,key:string)=>{const value=body[key];if(typeof value!=="boolean")throw new Error(`${key} must be boolean`);return value;};
const integer=(body:Body,key:string)=>{const value=Number(body[key]);if(!Number.isSafeInteger(value))throw new Error(`${key} must be an integer`);return value;};
const mappingStatus=(body:Body)=>{const status=required(body,"status");if(!["approved","future","exception","proposed"].includes(status))throw new Error("Unsupported mapping status");return status as "approved"|"future"|"exception"|"proposed";};

export async function POST(request:Request){
  try{
    const principal=await requireAdminSession(request,{csrf:true});
    const body=await request.json() as Body;
    const action=required(body,"action");
    const policyId=typeof body.policyId==="string"?body.policyId.trim():"";
    if(action==="set_route"){
      if(!policyId)throw new Error("policyId is required");const route=required(body,"route");if(!["unselected","viva_fiscal_provider","aade_direct_erp"].includes(route))throw new Error("Unsupported fiscalisation route");
      return Response.json(await adminSetFiscalisationRoute(principal,{policyId,route:route as "unselected"|"viva_fiscal_provider"|"aade_direct_erp",reason:required(body,"reason")}));
    }
    if(action==="update_policy"){
      if(!policyId)throw new Error("policyId is required");return Response.json(await adminUpdateAccountingPolicy(principal,{policyId,sellerOfRecord:bool(body,"sellerOfRecord"),sellerLegalName:required(body,"sellerLegalName"),sellerTaxNumber:required(body,"sellerTaxNumber"),compatibilityTarget:required(body,"compatibilityTarget"),productionPublishedSchema:optional(body,"productionPublishedSchema"),effectiveFrom:optional(body,"effectiveFrom"),reason:required(body,"reason")}));
    }
    if(action==="create_revision"){
      if(!policyId)throw new Error("policyId is required");return Response.json(await adminCreateAccountingPolicyRevision(principal,{policyId,version:required(body,"version"),reason:required(body,"reason")}));
    }
    if(action==="decide_check"){
      if(!policyId)throw new Error("policyId is required");const status=required(body,"status");if(!["approved","rejected","not_applicable"].includes(status))throw new Error("Unsupported check decision");
      return Response.json(await adminDecidePolicyCheck(principal,{policyId,checkCode:required(body,"checkCode"),status:status as "approved"|"rejected"|"not_applicable",evidence:required(body,"evidence")}));
    }
    if(action==="document_mapping"){
      if(!policyId)throw new Error("policyId is required");return Response.json(await adminDecideDocumentMapping(principal,{policyId,eventCode:required(body,"eventCode"),status:mappingStatus(body),reason:required(body,"reason")}));
    }
    if(action==="update_document_mapping"){
      if(!policyId)throw new Error("policyId is required");return Response.json(await adminUpdateDocumentMapping(principal,{policyId,eventCode:required(body,"eventCode"),customerKind:required(body,"customerKind"),itemKind:required(body,"itemKind"),geography:required(body,"geography"),direction:required(body,"direction"),invoiceType:required(body,"invoiceType"),incomeCategory:optional(body,"incomeCategory"),e3Code:optional(body,"e3Code"),seriesCode:required(body,"seriesCode"),status:mappingStatus(body),negativeOriginalClassification:bool(body,"negativeOriginalClassification"),correlationRequired:bool(body,"correlationRequired"),notes:optional(body,"notes"),reason:required(body,"reason")}));
    }
    if(action==="payment_mapping"){
      if(!policyId)throw new Error("policyId is required");return Response.json(await adminDecidePaymentMapping(principal,{policyId,processor:required(body,"processor"),processorMethod:required(body,"processorMethod"),status:mappingStatus(body),reason:required(body,"reason")}));
    }
    if(action==="update_payment_mapping"){
      if(!policyId)throw new Error("policyId is required");return Response.json(await adminUpdatePaymentMapping(principal,{policyId,processor:required(body,"processor"),processorMethod:required(body,"processorMethod"),mydataPaymentType:integer(body,"mydataPaymentType"),requiresTransactionId:bool(body,"requiresTransactionId"),erpRequiresEcrToken:bool(body,"erpRequiresEcrToken"),providerSignatureRoute:bool(body,"providerSignatureRoute"),status:mappingStatus(body),notes:optional(body,"notes"),reason:required(body,"reason")}));
    }
    if(action==="update_series")return Response.json(await adminUpdateFiscalSeries(principal,{series:required(body,"series"),invoiceType:required(body,"invoiceType"),purpose:required(body,"purpose"),fiscalYear:integer(body,"fiscalYear"),nextAa:integer(body,"nextAa"),locked:bool(body,"locked"),reason:required(body,"reason")}));
    if(action==="update_vat_category")return Response.json(await adminUpdateVatCategory(principal,{code:integer(body,"code"),rateBps:integer(body,"rateBps"),label:required(body,"label"),specialCategory:bool(body,"specialCategory"),reason:required(body,"reason")}));
    if(action==="approve_policy"){
      if(!policyId)throw new Error("policyId is required");return Response.json(await adminApproveAccountingPolicy(principal,{policyId,accountantName:required(body,"accountantName"),reason:required(body,"reason")}));
    }
    throw new Error("Unsupported accounting policy action");
  }catch(error){return Response.json({error:error instanceof Error?error.message:"accounting_policy_action_failed"},{status:400});}
}
