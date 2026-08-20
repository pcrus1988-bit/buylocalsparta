import test from "node:test";
import assert from "node:assert/strict";
import { MyDataOrderPreflightError, assertInvoiceElementOrder, preflightInvoiceElementOrder } from "../src/order-preflight.ts";

const ordered=`<InvoicesDoc><invoice><issuer><vatNumber>123456789</vatNumber><country>GR</country><branch>0</branch></issuer><invoiceHeader><series>KMR26</series><aa>1</aa><issueDate>2026-08-20</issueDate><invoiceType>11.1</invoiceType><currency>EUR</currency></invoiceHeader><paymentMethods><paymentMethodDetails><type>7</type><amount>1.00</amount></paymentMethodDetails></paymentMethods><invoiceDetails><lineNumber>1</lineNumber><quantity>1</quantity><measurementUnit>1</measurementUnit><netValue>0.81</netValue><vatCategory>1</vatCategory><vatAmount>0.19</vatAmount><incomeClassification><classificationType>E3_561_003</classificationType><classificationCategory>category1_1</classificationCategory><amount>0.81</amount></incomeClassification></invoiceDetails><invoiceSummary><totalNetValue>0.81</totalNetValue><totalVatAmount>0.19</totalVatAmount><totalGrossValue>1.00</totalGrossValue><incomeClassification><classificationType>E3_561_003</classificationType><classificationCategory>category1_1</classificationCategory><amount>0.81</amount></incomeClassification></invoiceSummary></invoice></InvoicesDoc>`;

test("production-style invoice order passes schema-order preflight",()=>{
  assert.deepEqual(preflightInvoiceElementOrder(ordered),{ok:true,issues:[]});
  assert.doesNotThrow(()=>assertInvoiceElementOrder(ordered));
});

test("paymentMethods before invoiceHeader is blocked",()=>{
  const bad=ordered.replace(/<invoiceHeader>[\s\S]*?<\/invoiceHeader><paymentMethods>[\s\S]*?<\/paymentMethods>/,match=>{
    const header=match.match(/<invoiceHeader>[\s\S]*?<\/invoiceHeader>/)?.[0]??"";
    const payment=match.match(/<paymentMethods>[\s\S]*?<\/paymentMethods>/)?.[0]??"";
    return payment+header;
  });
  const report=preflightInvoiceElementOrder(bad);
  assert.equal(report.ok,false);
  assert.equal(report.issues.some(i=>i.code==="ELEMENT_ORDER_INVALID"&&i.path.endsWith("invoiceHeader")),true);
  assert.throws(()=>assertInvoiceElementOrder(bad),MyDataOrderPreflightError);
});

test("header, detail and summary field regressions are detected",()=>{
  const bad=ordered
    .replace("<series>KMR26</series><aa>1</aa>","<aa>1</aa><series>KMR26</series>")
    .replace("<netValue>0.81</netValue><vatCategory>1</vatCategory>","<vatCategory>1</vatCategory><netValue>0.81</netValue>")
    .replace("<totalNetValue>0.81</totalNetValue><totalVatAmount>0.19</totalVatAmount>","<totalVatAmount>0.19</totalVatAmount><totalNetValue>0.81</totalNetValue>");
  const report=preflightInvoiceElementOrder(bad);
  assert.equal(report.ok,false);
  assert.ok(report.issues.length>=3);
});

test("unknown future elements do not cause false order failures",()=>{
  const future=ordered.replace("<invoiceSummary>","<futureAadeElement>value</futureAadeElement><invoiceSummary>");
  assert.equal(preflightInvoiceElementOrder(future).ok,true);
});
