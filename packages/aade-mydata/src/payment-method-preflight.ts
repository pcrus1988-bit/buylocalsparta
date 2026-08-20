import { isAadePaymentMethod } from "./catalog.ts";
import { childElements, childText, parseXmlDocument } from "./xml.ts";

export type PaymentMethodsPreflightIssue = Readonly<{ code:string; path:string; message:string }>;
export type PaymentMethodsPreflightReport = Readonly<{ ok:boolean; documentCount:number; issues:readonly PaymentMethodsPreflightIssue[] }>;

export class PaymentMethodsPreflightError extends Error {
  readonly report:PaymentMethodsPreflightReport;
  constructor(report:PaymentMethodsPreflightReport){
    super(`AADE SendPaymentsMethod preflight failed: ${report.issues.map(item=>`${item.path} ${item.message}`).join(" | ")}`);
    this.name="PaymentMethodsPreflightError";this.report=report;
  }
}

export function preflightPaymentMethodsXml(xml:string):PaymentMethodsPreflightReport{
  const issues:PaymentMethodsPreflightIssue[]=[];
  let root;
  try{root=parseXmlDocument(xml);}catch(error){return{ok:false,documentCount:0,issues:[issue("XML_MALFORMED","$",error instanceof Error?error.message:String(error))]};}
  if(root.localName!=="PaymentMethodsDoc")issues.push(issue("ROOT_INVALID","$",`Expected PaymentMethodsDoc root, received ${root.localName}`));
  const documents=childElements(root,"paymentMethods");
  if(!documents.length)issues.push(issue("PAYMENT_DOCUMENT_MISSING","$.paymentMethods","At least one paymentMethods item is required"));
  documents.forEach((document,index)=>{
    const path=`$.paymentMethods[${index}]`;
    const mark=childText(document,"invoiceMark")?.trim();
    if(!mark||!/^\d{1,40}$/.test(mark))issues.push(issue("INVOICE_MARK_INVALID",`${path}.invoiceMark`,"A numeric invoice MARK is required"));
    const details=childElements(document,"paymentMethodDetails");
    if(!details.length)issues.push(issue("PAYMENT_DETAIL_MISSING",`${path}.paymentMethodDetails`,"At least one payment method detail is required"));
    let hasPos=false;
    details.forEach((detail,detailIndex)=>{
      const detailPath=`${path}.paymentMethodDetails[${detailIndex}]`;
      const rawType=childText(detail,"type")?.trim();
      const type=rawType&&/^\d+$/.test(rawType)?Number(rawType):NaN;
      if(!Number.isInteger(type)||!isAadePaymentMethod(type))issues.push(issue("PAYMENT_TYPE_INVALID",`${detailPath}.type`,`Unsupported AADE payment method: ${rawType??"missing"}`));
      if(type===7)hasPos=true;
      const amount=childText(detail,"amount")?.trim();
      if(!amount||!/^\d+(?:\.\d{1,2})?$/.test(amount))issues.push(issue("PAYMENT_AMOUNT_INVALID",`${detailPath}.amount`,"Payment amount must be non-negative with at most 2 decimals"));
    });
    if(details.length&&!hasPos)issues.push(issue("POS_PAYMENT_REQUIRED",`${path}.paymentMethodDetails`,"SendPaymentsMethod requires at least one POS/e-POS (type 7) payment detail per invoice"));
  });
  return{ok:issues.length===0,documentCount:documents.length,issues};
}

export function assertPaymentMethodsXmlPreflight(xml:string):PaymentMethodsPreflightReport{
  const report=preflightPaymentMethodsXml(xml);if(!report.ok)throw new PaymentMethodsPreflightError(report);return report;
}

function issue(code:string,path:string,message:string):PaymentMethodsPreflightIssue{return{code,path,message};}
