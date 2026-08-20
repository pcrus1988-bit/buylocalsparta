import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { reconcileCustomerFiscalDocument } from "./customer-fiscal-reconciliation";
import { deliverAcceptedCustomerTaxDocumentById } from "./customer-tax-delivery";
import { myDataAdminRuntimeConfig } from "./mydata-runtime";

export async function adminReconcileCustomerFiscalDocument(
  principal:SessionPrincipal,
  input:{documentId:string;reason:string}
){
  assertAdminPermission(principal,"finance.write");
  const documentId=input.documentId.trim();
  const reason=input.reason.trim();
  if(!documentId)throw new Error("documentId is required");
  if(reason.length<3)throw new Error("Reconciliation reason is required");
  const result=await reconcileCustomerFiscalDocument(documentId);
  await recordAdminAudit(principal,"mydata.customer_document_reconciled","tax_document",documentId,reason,{
    accepted:result.accepted,
    found:result.found,
    pagesChecked:result.pagesChecked,
    mark:result.mark
  });
  let notificationWarning:string|undefined;
  if(result.accepted){
    const config=await myDataAdminRuntimeConfig();
    if(config.emailAcceptedDocuments){
      try{await deliverAcceptedCustomerTaxDocumentById(documentId);}
      catch(error){notificationWarning=error instanceof Error?error.message:"Customer fiscal email delivery failed";}
    }
  }
  return{...result,readOnlyAadeLookup:true as const,notificationWarning};
}
