import test from "node:test";
import assert from "node:assert/strict";
import { MyDataClassificationPreflightError, assertClassificationXmlPreflight, preflightClassificationXml } from "../src/classification-preflight.ts";

const productionLike=`<InvoicesDoc xmlns="https://www.aade.gr/myDATA/invoice/v1.0" xmlns:icls="https://www.aade.gr/myDATA/incomeClassificaton/v1.0">
<invoice><issuer><vatNumber>123456789</vatNumber><country>GR</country><branch>0</branch></issuer>
<invoiceHeader><series>KMR26</series><aa>1</aa><issueDate>2026-08-20</issueDate><invoiceType>11.1</invoiceType><currency>EUR</currency></invoiceHeader>
<paymentMethods><paymentMethodDetails><type>7</type><amount>1.00</amount></paymentMethodDetails></paymentMethods>
<invoiceDetails><lineNumber>1</lineNumber><quantity>1</quantity><measurementUnit>1</measurementUnit><netValue>0.81</netValue><vatCategory>1</vatCategory><vatAmount>0.19</vatAmount><incomeClassification><icls:classificationType>E3_561_003</icls:classificationType><icls:classificationCategory>category1_1</icls:classificationCategory><icls:amount>0.81</icls:amount></incomeClassification></invoiceDetails>
<invoiceSummary><totalNetValue>0.81</totalNetValue><totalVatAmount>0.19</totalVatAmount><totalGrossValue>1.00</totalGrossValue><incomeClassification><icls:classificationType>E3_561_003</icls:classificationType><icls:classificationCategory>category1_1</icls:classificationCategory><icls:amount>0.81</icls:amount></incomeClassification></invoiceSummary>
</invoice></InvoicesDoc>`;

test("production-like retail income classifications pass structural preflight",()=>{
  const report=preflightClassificationXml(productionLike);
  assert.equal(report.ok,true);
  assert.equal(report.classifiedInvoiceCount,1);
  assert.deepEqual(report.issues,[]);
});

test("classification preflight catches mixed line coverage and summary mismatch",()=>{
  const xml=productionLike
    .replace("</invoiceDetails>","</invoiceDetails><invoiceDetails><lineNumber>2</lineNumber><netValue>0.10</netValue><vatCategory>8</vatCategory><vatAmount>0.00</vatAmount></invoiceDetails>")
    .replace("<icls:amount>0.81</icls:amount></incomeClassification></invoiceSummary>","<icls:amount>0.80</icls:amount></incomeClassification></invoiceSummary>");
  const report=preflightClassificationXml(xml);
  const codes=new Set(report.issues.map(item=>item.code));
  assert.equal(report.ok,false);
  assert.equal(codes.has("CLASSIFICATION_COVERAGE_MIXED"),true);
  assert.equal(codes.has("INCOME_CLASSIFICATION_AMOUNT_MISMATCH"),true);
  assert.throws(()=>assertClassificationXmlPreflight(xml),MyDataClassificationPreflightError);
});

test("classification preflight catches invalid categories, duplicate combinations and line amount mismatch",()=>{
  const extra=`<incomeClassification><icls:classificationType>E3_561_003</icls:classificationType><icls:classificationCategory>category9_9</icls:classificationCategory><icls:amount>0.10</icls:amount></incomeClassification>`;
  const xml=productionLike.replace("</invoiceDetails>",`${extra}</invoiceDetails>`);
  const report=preflightClassificationXml(xml);
  const codes=new Set(report.issues.map(item=>item.code));
  assert.equal(codes.has("INCOME_CATEGORY_INVALID"),true);
  assert.equal(codes.has("INCOME_CLASSIFICATION_AMOUNT_MISMATCH"),true);
});

test("VAT expense classifications reject classification category but are excluded from net-value sum",()=>{
  const xml=`<InvoicesDoc><invoice><invoiceHeader><series>X</series><aa>1</aa><issueDate>2026-08-20</issueDate><invoiceType>14.1</invoiceType></invoiceHeader>
  <invoiceDetails><lineNumber>1</lineNumber><netValue>10.00</netValue><vatCategory>1</vatCategory><vatAmount>2.40</vatAmount>
    <expensesClassification><classificationType>E3_102_004</classificationType><classificationCategory>category2_1</classificationCategory><amount>10.00</amount></expensesClassification>
    <expensesClassification><classificationType>VAT_364</classificationType><classificationCategory>category2_1</classificationCategory><amount>2.40</amount></expensesClassification>
  </invoiceDetails>
  <invoiceSummary><totalNetValue>10.00</totalNetValue><totalVatAmount>2.40</totalVatAmount><totalGrossValue>12.40</totalGrossValue>
    <expensesClassification><classificationType>E3_102_004</classificationType><classificationCategory>category2_1</classificationCategory><amount>10.00</amount></expensesClassification>
    <expensesClassification><classificationType>VAT_364</classificationType><amount>2.40</amount></expensesClassification>
  </invoiceSummary></invoice></InvoicesDoc>`;
  const report=preflightClassificationXml(xml);
  assert.equal(report.ok,false);
  assert.equal(report.issues.some(item=>item.code==="VAT_CLASSIFICATION_CATEGORY_FORBIDDEN"),true);
  assert.equal(report.issues.some(item=>item.code==="EXPENSE_CLASSIFICATION_AMOUNT_MISMATCH"),false);
});

test("documents without classifications remain compatible with low-level diagnostic fixtures",()=>{
  const xml=`<InvoicesDoc><invoice><invoiceHeader><series>X</series><aa>1</aa><issueDate>2026-08-20</issueDate><invoiceType>11.1</invoiceType></invoiceHeader><invoiceDetails><lineNumber>1</lineNumber><netValue>1.00</netValue><vatCategory>8</vatCategory><vatAmount>0.00</vatAmount></invoiceDetails><invoiceSummary><totalNetValue>1.00</totalNetValue><totalVatAmount>0.00</totalVatAmount><totalGrossValue>1.00</totalGrossValue></invoiceSummary></invoice></InvoicesDoc>`;
  const report=preflightClassificationXml(xml);
  assert.equal(report.ok,true);
  assert.equal(report.classifiedInvoiceCount,0);
});
