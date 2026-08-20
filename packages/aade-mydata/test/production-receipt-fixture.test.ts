import assert from "node:assert/strict";
import test from "node:test";
import { AadeMyDataClient } from "../src/public.ts";

const cfg = {
  environment: "production" as const,
  baseUrl: "https://mydatapi.aade.gr/myDATA",
  userId: "erp-user",
  subscriptionKey: "secret",
  requestTimeoutMs: 1_000,
  specVersion: "2.0.2"
};

const productionStyleReceipt = `<?xml version="1.0" encoding="UTF-8"?><InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0" xmlns:icls="https://www.aade.gr/myDATA/incomeClassificaton/v1.0"><invoice><issuer><vatNumber>123456789</vatNumber><country>GR</country><branch>0</branch></issuer><invoiceHeader><series>KMR26</series><aa>1</aa><issueDate>2026-08-20</issueDate><invoiceType>11.1</invoiceType><currency>EUR</currency></invoiceHeader><paymentMethods><paymentMethodDetails><type>7</type><amount>1.00</amount><transactionId>viva-transaction-1</transactionId></paymentMethodDetails></paymentMethods><invoiceDetails><lineNumber>1</lineNumber><quantity>1</quantity><measurementUnit>1</measurementUnit><netValue>0.81</netValue><vatCategory>1</vatCategory><vatAmount>0.19</vatAmount><incomeClassification><icls:classificationType>E3_561_003</icls:classificationType><icls:classificationCategory>category1_1</icls:classificationCategory><icls:amount>0.81</icls:amount></incomeClassification></invoiceDetails><invoiceSummary><totalNetValue>0.81</totalNetValue><totalVatAmount>0.19</totalVatAmount><totalWithheldAmount>0.00</totalWithheldAmount><totalFeesAmount>0.00</totalFeesAmount><totalStampDutyAmount>0.00</totalStampDutyAmount><totalOtherTaxesAmount>0.00</totalOtherTaxesAmount><totalDeductionsAmount>0.00</totalDeductionsAmount><totalGrossValue>1.00</totalGrossValue><incomeClassification><icls:classificationType>E3_561_003</icls:classificationType><icls:classificationCategory>category1_1</icls:classificationCategory><icls:amount>0.81</icls:amount></incomeClassification></invoiceSummary></invoice></InvoicesDoc>`;

test("production-style B2C goods receipt passes every hardened send preflight", async () => {
  let called = 0;
  let body = "";
  const client = new AadeMyDataClient(cfg, async (_input, init) => {
    called += 1;
    body = String(init?.body ?? "");
    return new Response(`<ResponseDoc><response><index>1</index><statusCode>Success</statusCode><invoiceMark>400000000000001</invoiceMark><invoiceUid>fixture-uid</invoiceUid></response></ResponseDoc>`, { status: 200 });
  });

  const result = await client.sendInvoices(productionStyleReceipt);
  assert.equal(called, 1);
  assert.equal(body, productionStyleReceipt);
  assert.equal(result.ok, true);
  assert.equal(result.items[0]?.invoiceMark, "400000000000001");
});

test("schema-order regression is rejected before the AADE request", async () => {
  let called = false;
  const client = new AadeMyDataClient(cfg, async () => {
    called = true;
    return new Response(`<ResponseDoc/>`, { status: 200 });
  });
  const wrongOrder = productionStyleReceipt
    .replace(/<invoiceHeader>[\s\S]*?<\/invoiceHeader><paymentMethods>[\s\S]*?<\/paymentMethods>/, match => {
      const header = match.match(/<invoiceHeader>[\s\S]*?<\/invoiceHeader>/)?.[0] ?? "";
      const payments = match.match(/<paymentMethods>[\s\S]*?<\/paymentMethods>/)?.[0] ?? "";
      return payments + header;
    });
  await assert.rejects(client.sendInvoices(wrongOrder), /schema order|ELEMENT_ORDER_INVALID|appears after/i);
  assert.equal(called, false);
});

test("classification drift is rejected before the AADE request", async () => {
  let called = false;
  const client = new AadeMyDataClient(cfg, async () => {
    called = true;
    return new Response(`<ResponseDoc/>`, { status: 200 });
  });
  const badClassification = productionStyleReceipt.replaceAll("category1_1", "category9_9");
  await assert.rejects(client.sendInvoices(badClassification), /classification preflight|unsupported income classification category/i);
  assert.equal(called, false);
});
