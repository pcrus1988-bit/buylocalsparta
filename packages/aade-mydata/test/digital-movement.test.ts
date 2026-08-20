import assert from "node:assert/strict";
import test from "node:test";
import {
  AadeMyDataClient,
  assessConfirmDeliveryReturnState,
  buildConfirmDeliveryReturnXml,
  deliveryNoteStatusQuery,
  normalizeDeliveryNoteStatus,
  parseConfirmDeliveryReturnResponse,
  parseDeliveryNoteStatusResponse
} from "../src/public.ts";

const cfg = {
  environment: "production" as const,
  baseUrl: "https://mydatapi.aade.gr/myDATA",
  userId: "erp-user",
  subscriptionKey: "secret",
  requestTimeoutMs: 1_000,
  specVersion: "2.0.2"
};

test("ConfirmDeliveryReturn posts the AADE 2.0.2 request shape and parses deliveryReturnMark", async () => {
  let requestUrl = "";
  let requestBody = "";
  const client = new AadeMyDataClient(cfg, async (input, init) => {
    requestUrl = String(input);
    requestBody = String(init?.body ?? "");
    return new Response(`<ResponseDoc><response><index>1</index><statusCode>Success</statusCode><deliveryReturnMark>900000000000001</deliveryReturnMark></response></ResponseDoc>`, { status: 200 });
  });

  const result = await client.confirmDeliveryReturn({ qrUrl: "https://mydata.aade.gr/qr?id=abc&source=group" });
  assert.equal(requestUrl, "https://mydatapi.aade.gr/myDATA/ConfirmDeliveryReturn");
  assert.match(requestBody, /^<\?xml version="1\.0" encoding="UTF-8"\?><ConfirmDeliveryReturnRequest>/);
  assert.match(requestBody, /<qrUrl>https:\/\/mydata\.aade\.gr\/qr\?id=abc&amp;source=group<\/qrUrl>/);
  assert.equal(result.ok, true);
  assert.equal(result.deliveryReturnMark, "900000000000001");
  assert.equal(result.transmission.items[0]?.statusCode, "Success");
});

test("ConfirmDeliveryReturn rejects unsafe or malformed QR URLs before network", async () => {
  let called = false;
  const client = new AadeMyDataClient(cfg, async () => {
    called = true;
    return new Response(`<ResponseDoc/>`, { status: 200 });
  });
  await assert.rejects(client.confirmDeliveryReturn({ qrUrl: "http://example.test/qr" }), /must use HTTPS/);
  await assert.rejects(client.confirmDeliveryReturn({ qrUrl: "https://user:pass@example.test/qr" }), /embedded credentials/);
  await assert.rejects(client.confirmDeliveryReturn({ qrUrl: "not-a-url" }), /absolute URL/);
  assert.equal(called, false);
});

test("ConfirmDeliveryReturn is unavailable below myDATA spec 2.0.2", async () => {
  let called = false;
  const client = new AadeMyDataClient({ ...cfg, specVersion: "2.0.1" }, async () => {
    called = true;
    return new Response(`<ResponseDoc/>`, { status: 200 });
  });
  await assert.rejects(client.confirmDeliveryReturn({ qrUrl: "https://example.test/qr" }), /2\.0\.2 or newer/);
  assert.equal(called, false);
});

test("delivery return codec rejects malformed marks and preserves validation responses", () => {
  assert.throws(
    () => parseConfirmDeliveryReturnResponse(`<ResponseDoc><response><statusCode>Success</statusCode><deliveryReturnMark>not-numeric</deliveryReturnMark></response></ResponseDoc>`),
    /invalid deliveryReturnMark/
  );
  const validation = parseConfirmDeliveryReturnResponse(`<ResponseDoc><response><statusCode>ValidationError</statusCode><errors><error><code>825</code><message>Invalid delivery state</message></error></errors></response></ResponseDoc>`);
  assert.equal(validation.ok, false);
  assert.equal(validation.deliveryReturnMark, undefined);
  assert.equal(validation.transmission.items[0]?.errors[0]?.code, "825");
});

test("ConfirmDeliveryReturn XML builder uses the exact documented root", () => {
  assert.equal(
    buildConfirmDeliveryReturnXml({ qrUrl: "https://example.test/qr/1" }),
    `<?xml version="1.0" encoding="UTF-8"?><ConfirmDeliveryReturnRequest><qrUrl>https://example.test/qr/1</qrUrl></ConfirmDeliveryReturnRequest>`
  );
});

test("GetDeliveryNoteStatus supports mark or the 2.0.2 qrUrl alternative", async () => {
  const urls: string[] = [];
  const response = `<DeliveryNoteStatusResponse><invoiceMark>400000000000001</invoiceMark><status>DELIVERED_BY_CARRIER</status><dispatchTimestamp>2026-08-20T12:00:00</dispatchTimestamp><lifecycleHistory><eventType>ConfirmOutcome</eventType><eventTimestamp>2026-08-20T13:00:00</eventTimestamp><actorVat>123456789</actorVat><mark>800000000000001</mark><outcomeDetails><outcome>PARTIAL</outcome><deliveredWithoutRecipient>false</deliveredWithoutRecipient></outcomeDetails></lifecycleHistory></DeliveryNoteStatusResponse>`;
  const client = new AadeMyDataClient(cfg, async input => {
    urls.push(String(input));
    return new Response(response, { status: 200 });
  });

  const byMark = await client.getDeliveryNoteStatus({ mark: "400000000000001", issuerVatNumber: "123456789" });
  const byQr = await client.getDeliveryNoteStatus({ qrUrl: "https://mydata.aade.gr/qr?id=delivery-1" });
  assert.match(urls[0] ?? "", /GetDeliveryNoteStatus\?mark=400000000000001&issuerVatNumber=123456789$/);
  assert.match(urls[1] ?? "", /GetDeliveryNoteStatus\?qrUrl=https%3A%2F%2Fmydata\.aade\.gr%2Fqr%3Fid%3Ddelivery-1$/);
  assert.equal(byMark.status, "DELIVERED_BY_CARRIER");
  assert.equal(byMark.statusCode, 5);
  assert.equal(byMark.statusName, "DeliveredByCarrier");
  assert.equal(byQr.invoiceMark, "400000000000001");
  assert.equal(byQr.lifecycleHistory[0]?.outcome, "PARTIAL");
  assert.equal(byQr.lifecycleHistory[0]?.deliveredWithoutRecipient, false);
});

test("delivery status query enforces AADE parameter exclusivity and qrUrl version gate", async () => {
  assert.equal(deliveryNoteStatusQuery({ mark: "123" }), "mark=123");
  assert.throws(() => deliveryNoteStatusQuery({ mark: "abc" }), /MARK must be numeric/);
  assert.throws(() => deliveryNoteStatusQuery({ mark: "123", issuerVatNumber: "123" }), /9 digits/);
  const parsed = parseDeliveryNoteStatusResponse(`<DeliveryNoteStatusResponse><invoiceMark>123</invoiceMark><status>4</status></DeliveryNoteStatusResponse>`);
  assert.equal(parsed.statusCode, 4);
  assert.equal(parsed.statusName, "Rejected");

  let called = false;
  const oldClient = new AadeMyDataClient({ ...cfg, specVersion: "2.0.1" }, async () => {
    called = true;
    return new Response(`<DeliveryNoteStatusResponse/>`, { status: 200 });
  });
  await assert.rejects(oldClient.getDeliveryNoteStatus({ qrUrl: "https://example.test/qr" }), /2\.0\.2 or newer/);
  assert.equal(called, false);
  await oldClient.getDeliveryNoteStatus({ mark: "123" });
  assert.equal(called, true);
});

test("AADE delivery return state assessment distinguishes safe states from context-dependent InTransit", () => {
  assert.deepEqual(normalizeDeliveryNoteStatus("InTransit (Return)"), { code: 9, name: "InTransitReturn" });
  assert.equal(assessConfirmDeliveryReturnState({ status: "4", statusCode: 4, statusName: "Rejected", lifecycleHistory: [], rawXml: "" }).state, "state_eligible");
  assert.equal(assessConfirmDeliveryReturnState({ status: "9", statusCode: 9, statusName: "InTransitReturn", lifecycleHistory: [], rawXml: "" }).state, "state_eligible");

  const partial = parseDeliveryNoteStatusResponse(`<DeliveryNoteStatusResponse><status>5</status><lifecycleHistory><eventType>ConfirmOutcome</eventType><outcomeDetails><outcome>PARTIAL</outcome></outcomeDetails></lifecycleHistory></DeliveryNoteStatusResponse>`);
  assert.equal(assessConfirmDeliveryReturnState(partial).state, "state_eligible");
  const full = parseDeliveryNoteStatusResponse(`<DeliveryNoteStatusResponse><status>5</status><lifecycleHistory><eventType>ConfirmOutcome</eventType><outcomeDetails><outcome>FULL</outcome></outcomeDetails></lifecycleHistory></DeliveryNoteStatusResponse>`);
  assert.equal(assessConfirmDeliveryReturnState(full).state, "not_state_eligible");

  const inTransit = parseDeliveryNoteStatusResponse(`<DeliveryNoteStatusResponse><status>3</status></DeliveryNoteStatusResponse>`);
  assert.equal(assessConfirmDeliveryReturnState(inTransit).state, "requires_invoice_context");
  assert.equal(assessConfirmDeliveryReturnState(inTransit, { invoiceType: "9.2" }).state, "state_eligible");
  assert.equal(assessConfirmDeliveryReturnState(inTransit, { invoiceType: "9.3", reverseDeliveryNote: true }).state, "state_eligible");
  assert.equal(assessConfirmDeliveryReturnState(inTransit, { invoiceType: "9.3", reverseDeliveryNote: false }).state, "not_state_eligible");
  assert.equal(assessConfirmDeliveryReturnState(inTransit, { invoiceType: "1.1" }).issuerMustMatch, true);
});
