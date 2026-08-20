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

export async function adminDeliverAcceptedCustomerTaxDocument(
  principal:SessionPrincipal,
  input:{documentId:string;reason:string}
){
  assertAdminPermission(principal,"finance.write");
  const documentId=input.documentId.trim();
  const reason=input.reason.trim();
  if(!documentId)throw new Error("documentId is required");
  if(reason.length<3)throw new Error("Customer delivery reason is required");

  const result=await deliverAcceptedCustomerTaxDocumentById(documentId);
  if(!result.sent)throw new Error(customerDeliveryFailure(result.reason));

  await recordAdminAudit(principal,"mydata.customer_document_manually_delivered","tax_document",documentId,reason,{
    sent:true,
    channel:"email"
  });
  return{sent:true as const,manual:true as const};
}

function customerDeliveryFailure(reason?:string):string{
  if(reason==="email_not_configured")return "Customer tax-document email delivery is not configured.";
  if(reason==="customer_email_missing")return "The customer has no email address available for tax-document delivery.";
  if(reason==="not_eligible_or_already_claimed")return "This document is not eligible for manual delivery, or delivery has already started or completed.";
  return "Customer tax-document email delivery could not be started.";
}
