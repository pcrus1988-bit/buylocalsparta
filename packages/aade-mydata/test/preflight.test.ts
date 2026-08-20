import test from "node:test";
import assert from "node:assert/strict";
import {
  AADE_INVOICE_TYPES_2_0_2,
  aadeVatRateBps,
  isAadeInvoiceType,
  isAadePaymentMethod,
  isAadeVatCategory
} from "../src/catalog.ts";
import { assertInvoiceXmlPreflight, MyDataPreflightError, preflightInvoiceXml } from "../src/preflight.ts";

const validReceipt = `<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0">
  <invoice>
    <invoiceHeader><series>KMR26</series><aa>1</aa><issueDate>2026-08-20</issueDate><invoiceType>11.1</invoiceType></invoiceHeader>
    <paymentMethods><paymentMethodDetails><type>7</type><amount>1.00</amount></paymentMethodDetails></paymentMethods>
    <invoiceDetails><lineNumber>1</lineNumber><netValue>0.81</netValue><vatCategory>1</vatCategory><vatAmount>0.19</vatAmount></invoiceDetails>
    <invoiceSummary><totalNetValue>0.81</totalNetValue><totalVatAmount>0.19</totalVatAmount><totalGrossValue>1.00</totalGrossValue></invoiceSummary>
  </invoice>
</InvoicesDoc>`;

test("AADE 2.0.2 catalogue contains the current ERP invoice type surface", () => {
  assert.equal(isAadeInvoiceType("11.1"), true);
  assert.equal(isAadeInvoiceType("8.3"), true);
  assert.equal(isAadeInvoiceType("12"), true);
  assert.equal(isAadeInvoiceType("99.9"), false);
  assert.equal(AADE_INVOICE_TYPES_2_0_2.length, 56);
  assert.equal(isAadeVatCategory(10), true);
  assert.equal(aadeVatRateBps(1), 2400);
  assert.equal(aadeVatRateBps(7), 0);
  assert.equal(isAadePaymentMethod(8), true);
  assert.equal(isAadePaymentMethod(9), false);
});

test("valid retail XML passes technical preflight", () => {
  const report = preflightInvoiceXml(validReceipt);
  assert.equal(report.ok, true);
  assert.equal(report.invoiceCount, 1);
  assert.deepEqual(report.issues, []);
  assert.doesNotThrow(() => assertInvoiceXmlPreflight(validReceipt));
});

test("preflight catches invoice type, VAT exemption, summary and payment mismatches", () => {
  const xml = validReceipt
    .replace("<invoiceType>11.1</invoiceType>", "<invoiceType>99.9</invoiceType>")
    .replace("<vatCategory>1</vatCategory><vatAmount>0.19</vatAmount>", "<vatCategory>7</vatCategory><vatAmount>0.19</vatAmount>")
    .replace("<totalNetValue>0.81</totalNetValue>", "<totalNetValue>0.80</totalNetValue>")
    .replace("<amount>1.00</amount>", "<amount>0.99</amount>");
  const report = preflightInvoiceXml(xml);
  assert.equal(report.ok, false);
  const codes = new Set(report.issues.map(issue => issue.code));
  assert.equal(codes.has("INVOICE_TYPE_INVALID"), true);
  assert.equal(codes.has("VAT_EXEMPTION_REQUIRED"), true);
  assert.equal(codes.has("VAT_AMOUNT_NONZERO"), true);
  assert.equal(codes.has("SUMMARY_NET_MISMATCH"), true);
  assert.equal(codes.has("PAYMENT_TOTAL_MISMATCH"), true);
  assert.throws(() => assertInvoiceXmlPreflight(xml), MyDataPreflightError);
});

test("VAT category 7 accepts an exemption category while category 8 requires zero VAT", () => {
  const exempt = validReceipt
    .replace("<vatCategory>1</vatCategory><vatAmount>0.19</vatAmount>", "<vatCategory>7</vatCategory><vatAmount>0.00</vatAmount><vatExemptionCategory>27</vatExemptionCategory>")
    .replace("<totalVatAmount>0.19</totalVatAmount><totalGrossValue>1.00</totalGrossValue>", "<totalVatAmount>0.00</totalVatAmount><totalGrossValue>0.81</totalGrossValue>")
    .replace("<amount>1.00</amount>", "<amount>0.81</amount>");
  assert.equal(preflightInvoiceXml(exempt).ok, true);

  const noVat = exempt
    .replace("<vatCategory>7</vatCategory>", "<vatCategory>8</vatCategory>")
    .replace("<vatExemptionCategory>27</vatExemptionCategory>", "");
  assert.equal(preflightInvoiceXml(noVat).ok, true);
});

test("preflight rejects duplicate line numbers and impossible issue dates", () => {
  const duplicate = validReceipt
    .replace("<issueDate>2026-08-20</issueDate>", "<issueDate>2026-02-30</issueDate>")
    .replace("</invoiceDetails>", "</invoiceDetails><invoiceDetails><lineNumber>1</lineNumber><netValue>0.00</netValue><vatCategory>8</vatCategory><vatAmount>0.00</vatAmount></invoiceDetails>")
    .replace("<totalNetValue>0.81</totalNetValue>", "<totalNetValue>0.81</totalNetValue>");
  const codes = new Set(preflightInvoiceXml(duplicate).issues.map(issue => issue.code));
  assert.equal(codes.has("ISSUE_DATE_INVALID"), true);
  assert.equal(codes.has("LINE_NUMBER_DUPLICATE"), true);
});
