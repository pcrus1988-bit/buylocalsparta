import { PostgresAccountingPolicyService, type FiscalisationRoute, type MappingProductionStatus, type PolicyDecisionStatus } from "@buy-local-sparta/postgres-runtime/accounting-policy";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission, postgresAdminRuntimeEnabled, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const globalKey="__kontamouAccountingPolicyService" as const;
const globals=globalThis as typeof globalThis & { [globalKey]?:PostgresAccountingPolicyService };

function service():PostgresAccountingPolicyService{
  if(!postgresAdminRuntimeEnabled())throw new Error("Accounting policy requires PostgreSQL runtime");
  return globals[globalKey]??(globals[globalKey]=new PostgresAccountingPolicyService(getProductionPostgresRuntime().sqlPool,process.env));
}

export async function adminAccountingPolicyWorkspace(principal:SessionPrincipal){
  assertAdminPermission(principal,"finance.read");
  if(!postgresAdminRuntimeEnabled())return undefined;
  return service().workspace(principal);
}

export async function adminSetFiscalisationRoute(principal:SessionPrincipal,input:{policyId:string;route:Exclude<FiscalisationRoute,"unselected">;reason:string}){
  assertAdminPermission(principal,"finance.write");
  const result=await service().setFiscalisationRoute(principal,input);
  await recordAdminAudit(principal,"accounting_policy.fiscalisation_route","accounting_tax_policy",input.policyId,input.reason,{route:input.route});
  return result;
}

export async function adminDecidePolicyCheck(principal:SessionPrincipal,input:{policyId:string;checkCode:string;status:PolicyDecisionStatus;evidence:string}){
  assertAdminPermission(principal,"finance.write");
  const result=await service().decideCheck(principal,input);
  await recordAdminAudit(principal,"accounting_policy.check_decision","accounting_tax_policy",input.policyId,input.evidence,{checkCode:input.checkCode,status:input.status});
  return result;
}

export async function adminDecideDocumentMapping(principal:SessionPrincipal,input:{policyId:string;eventCode:string;status:MappingProductionStatus;reason:string}){
  assertAdminPermission(principal,"finance.write");
  const result=await service().decideDocumentMapping(principal,input);
  await recordAdminAudit(principal,"accounting_policy.document_mapping_decision","accounting_tax_policy",input.policyId,input.reason,{eventCode:input.eventCode,status:input.status});
  return result;
}

export async function adminDecidePaymentMapping(principal:SessionPrincipal,input:{policyId:string;processor:string;processorMethod:string;status:MappingProductionStatus;reason:string}){
  assertAdminPermission(principal,"finance.write");
  const result=await service().decidePaymentMapping(principal,input);
  await recordAdminAudit(principal,"accounting_policy.payment_mapping_decision","accounting_tax_policy",input.policyId,input.reason,{processor:input.processor,processorMethod:input.processorMethod,status:input.status});
  return result;
}

export async function adminApproveAccountingPolicy(principal:SessionPrincipal,input:{policyId:string;accountantName:string;reason:string}){
  assertAdminPermission(principal,"finance.write");
  if(input.accountantName.trim().length<3)throw new Error("Accountant name is required");
  const result=await service().approvePolicy(principal,input);
  await recordAdminAudit(principal,"accounting_policy.approved","accounting_tax_policy",input.policyId,input.reason,{version:result.version,policyHash:result.policyHash,accountantName:input.accountantName});
  return result;
}
