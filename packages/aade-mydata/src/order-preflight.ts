import { childElements, parseXmlDocument, type XmlElement } from "./xml.ts";

export type MyDataOrderIssue=Readonly<{code:string;path:string;message:string}>;
export type MyDataOrderReport=Readonly<{ok:boolean;issues:readonly MyDataOrderIssue[]}>;

export class MyDataOrderPreflightError extends Error{
  readonly report:MyDataOrderReport;
  constructor(report:MyDataOrderReport){super(`AADE myDATA XML order preflight failed: ${report.issues.map(i=>`${i.path} ${i.message}`).join(" | ")}`);this.name="MyDataOrderPreflightError";this.report=report;}
}

const INVOICE_ORDER=[
  "uid","mark","cancelledByMark","authenticationCode","transmissionFailure","issuer","counterpart","invoiceHeader","paymentMethods","invoiceDetails","taxesTotals","invoiceSummary","qrCodeUrl","downloadingInvoiceUrl","packingsDeclarations","invoiceDeliveryStatus","deliveryLifecycle"
] as const;
const HEADER_ORDER=[
  "series","aa","issueDate","invoiceType","vatPaymentSuspension","currency","exchangeRate","correlatedInvoices","selfPricing","dispatchDate","dispatchTime","vehicleNumber","movePurpose","fuelInvoice","specialInvoiceCategory","invoiceVariationType","otherCorrelatedEntities","otherDeliveryNoteHeader","isDeliveryNote","otherMovePurposeTitle","thirdPartyCollection","multipleConnectedMarks","tableAA","totalCancelDeliveryOrders","reverseDeliveryNote","reverseDeliveryNotePurpose","toWeigh"
] as const;
const DETAIL_ORDER=[
  "lineNumber","recType","TaricNo","itemCode","itemDescr","fuelCode","quantity","measurementUnit","invoiceDetailType","netValue","vatCategory","vatAmount","vatExemptionCategory","dienergia","discountOption","withheldAmount","withheldPercentCategory","stampDutyAmount","stampDutyPercentCategory","feesAmount","feesPercentCategory","otherTaxesPercentCategory","otherTaxesAmount","deductionsAmount","lineComments","incomeClassification","expensesClassification","quantity15","otherMeasurementUnitQuantity","otherMeasurementUnitTitle","notVAT195","movePurposeLine","otherMovePurposeLineTitle"
] as const;
const SUMMARY_ORDER=[
  "totalNetValue","totalVatAmount","totalWithheldAmount","totalFeesAmount","totalStampDutyAmount","totalOtherTaxesAmount","totalDeductionsAmount","totalGrossValue","incomeClassification","expensesClassification"
] as const;

export function preflightInvoiceElementOrder(xml:string):MyDataOrderReport{
  const issues:MyDataOrderIssue[]=[];
  let root:XmlElement;
  try{root=parseXmlDocument(xml);}catch(error){return{ok:false,issues:[issue("XML_MALFORMED","$",error instanceof Error?error.message:String(error))]};}
  const invoices=root.localName==="invoice"?[root]:childElements(root,"invoice");
  invoices.forEach((invoice,index)=>{
    const base=`$.invoice[${index}]`;
    validateKnownOrder(invoice,INVOICE_ORDER,base,issues);
    const header=childElements(invoice,"invoiceHeader")[0];if(header)validateKnownOrder(header,HEADER_ORDER,`${base}.invoiceHeader`,issues);
    childElements(invoice,"invoiceDetails").forEach((detail,line)=>validateKnownOrder(detail,DETAIL_ORDER,`${base}.invoiceDetails[${line}]`,issues));
    const summary=childElements(invoice,"invoiceSummary")[0];if(summary)validateKnownOrder(summary,SUMMARY_ORDER,`${base}.invoiceSummary`,issues);
  });
  return{ok:issues.length===0,issues};
}

export function assertInvoiceElementOrder(xml:string):MyDataOrderReport{const report=preflightInvoiceElementOrder(xml);if(!report.ok)throw new MyDataOrderPreflightError(report);return report;}

function validateKnownOrder(element:XmlElement,expected:readonly string[],path:string,issues:MyDataOrderIssue[]):void{
  const rank=new Map(expected.map((name,index)=>[name,index]));let last=-1;let lastName="";
  for(const child of element.children){
    const current=rank.get(child.localName);if(current===undefined)continue;
    if(current<last){issues.push(issue("ELEMENT_ORDER_INVALID",`${path}.${child.localName}`,`${child.localName} appears after ${lastName}, contrary to the myDATA schema order`));continue;}
    last=current;lastName=child.localName;
  }
}
function issue(code:string,path:string,message:string):MyDataOrderIssue{return{code,path,message};}
