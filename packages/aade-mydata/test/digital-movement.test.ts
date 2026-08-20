import assert from "node:assert/strict";
import test from "node:test";
import { AadeMyDataClient, buildConfirmDeliveryReturnXml, parseConfirmDeliveryReturnResponse } from "../src/public.ts";

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
