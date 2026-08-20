import test from "node:test";
import assert from "node:assert/strict";
import {
  AadeMyDataClient,
  classifyMyDataResponse,
  isRetryableMyDataResponse,
  MyDataTransportError,
  parseTransmissionResponse
} from "../src/index.ts";

const cfg = {
  environment: "production" as const,
  baseUrl: "https://mydatapi.aade.gr/myDATA",
  userId: "erp-user",
  subscriptionKey: "super-secret-key",
  requestTimeoutMs: 1_000,
  specVersion: "2.0.2"
};

test("transmission parser handles prefixed multi-response AADE documents", () => {
  const result = parseTransmissionResponse(`<r-doc:ResponseDoc xmlns:r-doc="urn:aade">
    <r-doc:response><r-doc:index>1</r-doc:index><r-doc:statusCode>Success</r-doc:statusCode><r-doc:invoiceMark>111</r-doc:invoiceMark></r-doc:response>
    <r-doc:response><r-doc:index>2</r-doc:index><r-doc:statusCode>ValidationError</r-doc:statusCode><r-doc:errors><r-doc:error><r-doc:code>101</r-doc:code><r-doc:message>Invalid VAT &amp; classification</r-doc:message></r-doc:error></r-doc:errors></r-doc:response>
  </r-doc:ResponseDoc>`);
  assert.equal(result.ok, false);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.invoiceMark, "111");
  assert.equal(result.items[1]?.errors[0]?.message, "Invalid VAT & classification");
  assert.equal(classifyMyDataResponse(result.items[1]!), "validation_error");
  assert.equal(isRetryableMyDataResponse(result.items[1]!), false);
});

test("AADE technical business errors are retryable but validation/XML errors are not", () => {
  const technical = { statusCode: "TechnicalError", errors: [{ code: "500", message: "Temporary service failure" }] };
  const xml = { statusCode: "XMLSyntaxError", errors: [{ code: "201", message: "Invalid XML" }] };
  assert.equal(classifyMyDataResponse(technical), "technical_error");
  assert.equal(isRetryableMyDataResponse(technical), true);
  assert.equal(classifyMyDataResponse(xml), "xml_error");
  assert.equal(isRetryableMyDataResponse(xml), false);
});

test("RequestMyIncome and RequestMyExpenses use AADE book-query parameters", async () => {
  const urls: string[] = [];
  const client = new AadeMyDataClient(cfg, async input => {
    urls.push(String(input));
    return new Response(`<RequestedBookInfo/>`, { status: 200 });
  });
  const query = { dateFrom: "01/08/2026", dateTo: "20/08/2026", entityVatNumber: "123456789", invType: "11.1" };
  await client.requestMyIncome(query);
  await client.requestMyExpenses(query);
  assert.match(urls[0] ?? "", /RequestMyIncome\?dateFrom=01%2F08%2F2026&dateTo=20%2F08%2F2026/);
  assert.match(urls[0] ?? "", /entityVatNumber=123456789/);
  assert.match(urls[1] ?? "", /RequestMyExpenses\?/);
});

test("AADE date validation rejects impossible dates and inverted ranges", async () => {
  const client = new AadeMyDataClient(cfg, async () => new Response(`<RequestedBookInfo/>`, { status: 200 }));
  await assert.rejects(client.requestMyIncome({ dateFrom: "31/02/2026", dateTo: "01/03/2026" }), /real calendar date/);
  await assert.rejects(client.requestMyIncome({ dateFrom: "20/08/2026", dateTo: "19/08/2026" }), /dateFrom must not be after dateTo/);
});

test("outbound myDATA calls fail before network on malformed XML", async () => {
  let called = false;
  const client = new AadeMyDataClient(cfg, async () => {
    called = true;
    return new Response(`<ResponseDoc/>`, { status: 200 });
  });
  await assert.rejects(client.sendInvoices(`<InvoicesDoc><invoice></InvoicesDoc>`), /well-formed XML/);
  assert.equal(called, false);
});

test("transport errors redact credentials and expose retryability", async () => {
  const client = new AadeMyDataClient(cfg, async () => new Response(`failure super-secret-key for erp-user`, { status: 503 }));
  await assert.rejects(
    client.requestTransmittedDocs({ mark: "0" }),
    error => {
      assert.ok(error instanceof MyDataTransportError);
      assert.equal(error.kind, "http");
      assert.equal(error.retryable, true);
      assert.equal(error.httpStatus, 503);
      assert.doesNotMatch(error.message, /super-secret-key|erp-user/);
      assert.match(error.message, /\[REDACTED\]/);
      return true;
    }
  );
});
