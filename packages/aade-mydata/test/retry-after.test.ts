import test from "node:test";
import assert from "node:assert/strict";
import {
  AadeMyDataClient,
  HardenedAadeMyDataClient,
  MyDataTransportError,
  retryAfterDelayMs,
  type MyDataConfig,
  type MyDataFetch
} from "../src/public.ts";

const config: MyDataConfig = {
  environment: "test",
  baseUrl: "https://example.invalid/myDATA",
  userId: "test-user",
  subscriptionKey: "test-key",
  requestTimeoutMs: 1_000,
  specVersion: "2.0.2"
};

const invoiceXml = `<?xml version="1.0" encoding="UTF-8"?><InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0"><invoice><issuer><vatNumber>123456789</vatNumber><country>GR</country><branch>0</branch></issuer><counterpart><vatNumber>987654321</vatNumber><country>GR</country><branch>0</branch></counterpart><invoiceHeader><series>A</series><aa>1</aa><issueDate>2026-08-23</issueDate><invoiceType>1.1</invoiceType><currency>EUR</currency></invoiceHeader><paymentMethods><paymentMethodDetails><type>3</type><amount>1.24</amount></paymentMethodDetails></paymentMethods><invoiceDetails><lineNumber>1</lineNumber><netValue>1.00</netValue><vatCategory>1</vatCategory><vatAmount>0.24</vatAmount><incomeClassification><classificationType>E3_561_001</classificationType><classificationCategory>category1_1</classificationCategory><amount>1.00</amount></incomeClassification></invoiceDetails><invoiceSummary><totalNetValue>1.00</totalNetValue><totalVatAmount>0.24</totalVatAmount><totalWithheldAmount>0</totalWithheldAmount><totalFeesAmount>0</totalFeesAmount><totalStampDutyAmount>0</totalStampDutyAmount><totalOtherTaxesAmount>0</totalOtherTaxesAmount><totalDeductionsAmount>0</totalDeductionsAmount><totalGrossValue>1.24</totalGrossValue><incomeClassification><classificationType>E3_561_001</classificationType><classificationCategory>category1_1</classificationCategory><amount>1.00</amount></incomeClassification></invoiceSummary></invoice></InvoicesDoc>`;

test("retryAfterDelayMs parses delta seconds and bounds excessive delays", () => {
  assert.equal(retryAfterDelayMs("12", 0), 12_000);
  assert.equal(retryAfterDelayMs(" 0 ", 0), 0);
  assert.equal(retryAfterDelayMs("999999", 0), 86_400_000);
  assert.equal(retryAfterDelayMs("not-a-delay", 0), undefined);
});

test("retryAfterDelayMs parses HTTP dates", () => {
  const now = Date.parse("Sun, 23 Aug 2026 18:00:00 GMT");
  assert.equal(retryAfterDelayMs("Sun, 23 Aug 2026 18:00:07 GMT", now), 7_000);
  assert.equal(retryAfterDelayMs("Sun, 23 Aug 2026 17:59:59 GMT", now), 0);
});

test("base myDATA client exposes Retry-After on 429 without replaying the request", async () => {
  let calls = 0;
  const fetchFn: MyDataFetch = async () => {
    calls += 1;
    return new Response("rate limited", { status: 429, headers: { "retry-after": "17" } });
  };
  const client = new AadeMyDataClient(config, fetchFn);

  await assert.rejects(
    client.requestDocs({ mark: "0" }),
    (error: unknown) => error instanceof MyDataTransportError
      && error.httpStatus === 429
      && error.retryable
      && error.retryAfterMs === 17_000
  );
  assert.equal(calls, 1);
});

test("hardened reporting endpoints expose Retry-After on 503", async () => {
  const fetchFn: MyDataFetch = async () => new Response("temporarily unavailable", {
    status: 503,
    headers: { "retry-after": "Sun, 23 Aug 2026 23:59:59 GMT" }
  });
  const client = new HardenedAadeMyDataClient(config, fetchFn);

  await assert.rejects(
    client.requestVatInfo({ dateFrom: "01/08/2026", dateTo: "23/08/2026" }),
    (error: unknown) => error instanceof MyDataTransportError
      && error.httpStatus === 503
      && error.retryable
      && typeof error.retryAfterMs === "number"
  );
});
