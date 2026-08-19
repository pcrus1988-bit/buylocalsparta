import { PostgresAccountingPolicyService, type FiscalisationRoute, type MappingProductionStatus, type PolicyDecisionStatus } from "@buy-local-sparta/postgres-runtime/accounting-policy";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission, postgresAdminRuntimeEnabled, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { capturePaidOrderForFiscalIssuance } from "./customer-fiscal-runtime";
import { myDataAdminRuntimeConfig, updateMyDataAdminRuntimeConfig, updateMyDataVaultCredentials, type MyDataAdminRuntimeConfig } from "./mydata-runtime";

const globalKey="__kontamouAccountingPolicyService" as const;
const globals=globalThis as typeof globalThis & { [globalKey]?:PostgresAccountingPolicyService };

function service():PostgresAccountingPolicyService{
  if(!postgresAdminRuntimeEnabled())throw new Error("Accounting policy requires PostgreSQL runtime");
  return globals[globalKey]??(globals[globalKey]=new PostgresAccountingPolicyService(getProductionPostgresRuntime().sqlPool,process.env));
}

export async function adminAccountingPolicyWorkspace(principal:SessionPrincipal){assertAdminPermission(principal,"finance.read");if(!postgresAdminRuntimeEnabled())return undefined;return service().workspace(principal);}
export async function adminMyDataRuntimeConfig(principal:SessionPrincipal){assertAdminPermission(principal,"finance.read");return myDataAdminRuntimeConfig();}

export async function adminSetFiscalisationRoute(principal:SessionPrincipal,input:{policyId:string;route:FiscalisationRoute;reason:string}){
  assertAdminPermission(principal,"finance.write");const result=await service().setFiscalisationRoute(principal,input);await recordAdminAudit(principal,"accounting_policy.fiscalisation_route","accounting_tax_policy",input.policyId,input.reason,{route:input.route});return result;
}

export async function adminUpdateAccountingPolicy(principal:SessionPrincipal,input:{policyId:string;sellerOfRecord:boolean;sellerLegalName:string;sellerTaxNumber:string;compatibilityTarget:string;productionPublishedSchema?:string;effectiveFrom?:string;reason:string}){
  assertAdminPermission(principal,"finance.write");const result=await service().updatePolicy(principal,input);await recordAdminAudit(principal,"accounting_policy.updated","accounting_tax_policy",input.policyId,input.reason,{sellerOfRecord:input.sellerOfRecord,sellerLegalName:input.sellerLegalName,sellerTaxNumber:input.sellerTaxNumber,compatibilityTarget:input.compatibilityTarget,productionPublishedSchema:input.productionPublishedSchema,effectiveFrom:input.effectiveFrom});return result;
}

export async function adminCreateAccountingPolicyRevision(principal:SessionPrincipal,input:{policyId:string;version:string;reason:string}){
  assertAdminPermission(principal,"finance.write");const result=await service().createRevision(principal,input);await recordAdminAudit(principal,"accounting_policy.revision_created","accounting_tax_policy",result.policyId,input.reason,{sourcePolicyId:input.policyId,version:result.version});return result;
}

export async function adminDecidePolicyCheck(principal:SessionPrincipal,input:{policyId:string;checkCode:string;status:PolicyDecisionStatus;evidence:string}){
  assertAdminPermission(principal,"finance.write");const result=await service().decideCheck(principal,input);await recordAdminAudit(principal,"accounting_policy.check_decision","accounting_tax_policy",input.policyId,input.evidence,{checkCode:input.checkCode,status:input.status});return result;
}

export async function adminDecideDocumentMapping(principal:SessionPrincipal,input:{policyId:string;eventCode:string;status:MappingProductionStatus;reason:string}){
  assertAdminPermission(principal,"finance.write");const result=await service().decideDocumentMapping(principal,input);await recordAdminAudit(principal,"accounting_policy.document_mapping_decision","accounting_tax_policy",input.policyId,input.reason,{eventCode:input.eventCode,status:input.status});return result;
}

export async function adminUpdateDocumentMapping(principal:SessionPrincipal,input:{policyId:string;eventCode:string;customerKind:string;itemKind:string;geography:string;direction:string;invoiceType:string;incomeCategory?:string;e3Code?:string;seriesCode:string;status:MappingProductionStatus;negativeOriginalClassification:boolean;correlationRequired:boolean;notes?:string;reason:string}){
  assertAdminPermission(principal,"finance.write");const result=await service().updateDocumentMapping(principal,input);await recordAdminAudit(principal,"accounting_policy.document_mapping_updated","accounting_tax_policy",input.policyId,input.reason,{eventCode:input.eventCode,invoiceType:input.invoiceType,seriesCode:input.seriesCode,status:input.status});return result;
}

export async function adminDecidePaymentMapping(principal:SessionPrincipal,input:{policyId:string;processor:string;processorMethod:string;status:MappingProductionStatus;reason:string}){
  assertAdminPermission(principal,"finance.write");const result=await service().decidePaymentMapping(principal,input);await recordAdminAudit(principal,"accounting_policy.payment_mapping_decision","accounting_tax_policy",input.policyId,input.reason,{processor:input.processor,processorMethod:input.processorMethod,status:input.status});return result;
}

export async function adminUpdatePaymentMapping(principal:SessionPrincipal,input:{policyId:string;processor:string;processorMethod:string;mydataPaymentType:number;requiresTransactionId:boolean;erpRequiresEcrToken:boolean;providerSignatureRoute:boolean;status:MappingProductionStatus;notes?:string;reason:string}){
  assertAdminPermission(principal,"finance.write");const result=await service().updatePaymentMapping(principal,input);await recordAdminAudit(principal,"accounting_policy.payment_mapping_updated","accounting_tax_policy",input.policyId,input.reason,{processor:input.processor,processorMethod:input.processorMethod,mydataPaymentType:input.mydataPaymentType,status:input.status});return result;
}

export async function adminUpdateFiscalSeries(principal:SessionPrincipal,input:{series:string;invoiceType:string;purpose:string;fiscalYear:number;nextAa:number;locked:boolean;reason:string}){
  assertAdminPermission(principal,"finance.write");const result=await service().updateFiscalSeries(principal,input);await recordAdminAudit(principal,"accounting_policy.fiscal_series_updated","mydata_fiscal_series",input.series,input.reason,{invoiceType:input.invoiceType,purpose:input.purpose,fiscalYear:input.fiscalYear,nextAa:input.nextAa,locked:input.locked});return result;
}

export async function adminUpdateVatCategory(principal:SessionPrincipal,input:{code:number;rateBps:number;label:string;specialCategory:boolean;reason:string}){
  assertAdminPermission(principal,"finance.write");const result=await service().updateVatCategory(principal,input);await recordAdminAudit(principal,"accounting_policy.vat_category_updated","mydata_vat_category",String(input.code),input.reason,{rateBps:input.rateBps,label:input.label,specialCategory:input.specialCategory});return result;
}

export async function adminUpdateMyDataRuntimeConfig(principal:SessionPrincipal,input:Omit<MyDataAdminRuntimeConfig,"baseUrl"|"updatedAt">&{confirmation?:string;reason:string}){
  assertAdminPermission(principal,"finance.write");
  if(input.vivaFiscalEnabled)throw new Error("Viva Fiscal provider integration is not implemented in this build; the provider capability cannot be marked ready from Admin");
  const current=await myDataAdminRuntimeConfig();if(input.issuanceEnabled&&!current.issuanceEnabled&&input.confirmation!=="ENABLE LIVE FISCAL")throw new Error("Enabling live fiscal issuance requires confirmation: ENABLE LIVE FISCAL");
  const result=await updateMyDataAdminRuntimeConfig({environment:input.environment,specVersion:input.specVersion,requestTimeoutMs:input.requestTimeoutMs,issuanceEnabled:input.issuanceEnabled,ecrTokenEnabled:input.ecrTokenEnabled,vivaFiscalEnabled:false,mappingVersionPin:input.mappingVersionPin,capturePaidOrders:input.capturePaidOrders,emailAcceptedDocuments:input.emailAcceptedDocuments});
  await recordAdminAudit(principal,"mydata.runtime_config_updated","system_setting","mydata.admin_runtime_config",input.reason,{environment:result.environment,specVersion:result.specVersion,requestTimeoutMs:result.requestTimeoutMs,issuanceEnabled:result.issuanceEnabled,ecrTokenEnabled:result.ecrTokenEnabled,vivaFiscalEnabled:false,mappingVersionPin:result.mappingVersionPin,capturePaidOrders:result.capturePaidOrders,emailAcceptedDocuments:result.emailAcceptedDocuments});return result;
}

export async function adminUpdateMyDataCredentials(principal:SessionPrincipal,input:{userId?:string;subscriptionKey?:string;reason:string}){
  assertAdminPermission(principal,"finance.write");const result=await updateMyDataVaultCredentials({userId:input.userId,subscriptionKey:input.subscriptionKey});await recordAdminAudit(principal,"mydata.credentials_rotated","supabase_vault","aade_mydata",input.reason,{userIdUpdated:result.userIdUpdated,subscriptionKeyUpdated:result.subscriptionKeyUpdated});return result;
}

export async function adminCaptureFiscalOrder(principal:SessionPrincipal,input:{orderId:string;reason:string}){
  assertAdminPermission(principal,"finance.write");const result=await capturePaidOrderForFiscalIssuance(input.orderId.trim());if(!result.captured)throw new Error("Order is not a confirmed fully captured order eligible for fiscal capture");await recordAdminAudit(principal,"mydata.customer_sale_captured","customer_order",input.orderId,input.reason,{documentId:result.documentId});return result;
}

export async function adminApproveAccountingPolicy(principal:SessionPrincipal,input:{policyId:string;accountantName:string;reason:string}){
  assertAdminPermission(principal,"finance.write");if(input.accountantName.trim().length<3)throw new Error("Accountant name is required");const result=await service().approvePolicy(principal,input);await recordAdminAudit(principal,"accounting_policy.approved","accounting_tax_policy",input.policyId,input.reason,{version:result.version,policyHash:result.policyHash,accountantName:input.accountantName});return result;
}
