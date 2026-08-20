import assert from "node:assert/strict";
import test from "node:test";
import { AadeMyDataClient, groupQrDetailsQuery, parseGroupQrDetailsResponse } from "../src/public.ts";

const cfg = {
  environment: "production" as const,
  baseUrl: "https://mydatapi.aade.gr/myDATA",
  userId: "erp-user",
  subscriptionKey: "secret",
  requestTimeoutMs: 1_000,
  specVersion: "2.0.2"
};

const responseXml = `<RequestGroupQRDetailsResponse><groupId>group-123</groupId><qrUrls><qrUrl>https://mydata.aade.gr/qr/1</qrUrl><qrUrl>https://mydata.aade.gr/qr/2</qrUrl></qrUrls><qrUrlsCount>2</qrUrlsCount><groupQrCreatorVatNumber>123456789</groupQrCreatorVatNumber><createdAt>2026-08-20T12:00:00</createdAt><expiresAt>2026-08-21T12:00:00</expiresAt><statusCode>Success</statusCode></RequestGroupQRDetailsResponse>`;

test("RequestGroupQRDetails resolves a group into validated delivery QR URLs", async () => {
  let requestUrl = "";
  const client = new AadeMyDataClient(cfg, async input => {
    requestUrl = String(input);
    return new Response(responseXml, { status: 200 });
  });
  const result = await client.requestGroupQrDetails("group-123");
  assert.equal(requestUrl, "https://mydatapi.aade.gr/myDATA/RequestGroupQRDetails?groupId=group-123");
  assert.equal(result.groupId, "group-123");
  assert.equal(result.qrUrlsCount, 2);
  assert.deepEqual(result.qrUrls, ["https://mydata.aade.gr/qr/1", "https://mydata.aade.gr/qr/2"]);
  assert.equal(result.groupQrCreatorVatNumber, "123456789");
  assert.equal(result.statusCode, "Success");
});

test("group QR query safely encodes IDs and rejects empty values", () => {
  assert.equal(groupQrDetailsQuery(" group / 1 "), "groupId=group+%2F+1");
  assert.throws(() => groupQrDetailsQuery("   "), /required/);
});

test("group QR parser rejects count drift and unsafe child URLs", () => {
  assert.throws(
    () => parseGroupQrDetailsResponse(responseXml.replace("<qrUrlsCount>2</qrUrlsCount>", "<qrUrlsCount>3</qrUrlsCount>")),
    /count mismatch/
  );
  assert.throws(
    () => parseGroupQrDetailsResponse(responseXml.replace("https://mydata.aade.gr/qr/2", "http://example.test/qr/2")),
    /must use HTTPS/
  );
});
