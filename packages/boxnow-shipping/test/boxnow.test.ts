import assert from "node:assert/strict";
import test from "node:test";
import { BoxNowApiError, BoxNowClient } from "../src/index.ts";

function json(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
function client(fetchImpl: typeof fetch) { return new BoxNowClient({ environment:"stage", baseUrl:"https://stage.example", clientId:"client", clientSecret:"secret" }, fetchImpl); }

test("BOX NOW caches OAuth token and creates prepaid locker delivery", async () => {
  const calls: Array<{ url:string; init?:RequestInit }> = [];
  const api = client(async (input, init) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/auth-sessions")) return json({ access_token:"token", expires_in:3600 });
    if (url.endsWith("/delivery-requests")) return json({ referenceNumber:"REF-1", parcels:[{ id:"P-1" }] });
    if (url.includes("/parcels?")) return json({ data:[{ id:"P-1", state:"new", deliveryRequest:{ orderNumber:"FUL-1" }, events:[] }] });
    throw new Error(`unexpected ${url}`);
  });
  const result = await api.createDelivery({ orderNumber:"FUL-1", invoiceValueMajor:"12.34", allowReturn:true, origin:{contactName:"Vendor",contactNumber:"+302731000000",contactEmail:"vendor@example.gr",locationId:"WH-1"}, destination:{contactName:"Customer",contactNumber:"+306900000000",contactEmail:"customer@example.gr",locationId:"LOCKER-9"}, items:[{id:"line-1",name:"Product",valueMajor:"12.34"}] });
  assert.deepEqual(result, { referenceNumber:"REF-1", parcelIds:["P-1"] });
  assert.equal((JSON.parse(String(calls[1].init?.body)) as { paymentMode:string; amountToBeCollected:string }).paymentMode, "prepaid");
  assert.equal((JSON.parse(String(calls[1].init?.body)) as { amountToBeCollected:string }).amountToBeCollected, "0.00");
  await api.reconcileDelivery("FUL-1");
  assert.equal(calls.filter((c) => c.url.endsWith("/auth-sessions")).length, 1);
});

test("BOX NOW fetches labels as PDF bytes and cancels parcel", async () => {
  const api = client(async (input) => {
    const url = String(input);
    if (url.endsWith("/auth-sessions")) return json({ access_token:"token", expires_in:3600 });
    if (url.includes("/label.pdf")) return new Response(new Uint8Array([37,80,68,70]), { status:200, headers:{"content-type":"application/pdf"} });
    if (url.endsWith(":cancel")) return json({});
    throw new Error(`unexpected ${url}`);
  });
  assert.deepEqual([...await api.labelPdfForOrder("FUL-1")], [37,80,68,70]);
  await api.cancelParcel("P-1");
});

test("BOX NOW preserves provider error codes for reconciliation decisions", async () => {
  const api = client(async (input) => String(input).endsWith("/auth-sessions") ? json({ access_token:"token" }) : json({ code:"P410", message:"Order number conflict" }, 400));
  await assert.rejects(() => api.createDelivery({ orderNumber:"FUL-1", invoiceValueMajor:"12.34", allowReturn:true, origin:{contactName:"Vendor",contactNumber:"1",contactEmail:"v@e.gr",locationId:"WH"},destination:{contactName:"Customer",contactNumber:"2",contactEmail:"c@e.gr",locationId:"L"},items:[{id:"line",name:"P",valueMajor:"12.34"}] }), (error: unknown) => error instanceof BoxNowApiError && error.code === "P410");
});

test("BOX NOW webhook verifies HMAC against exact raw data JSON and uses data.event", async () => {
  const { createHmac } = await import("node:crypto");
  const rawData = '{ "parcelId":"P-1", "parcelState":"new", "event":"final-destination", "time":"2026-08-17T08:01:02.345Z", "orderNumber":"FUL-1", "eventLocation":{"displayName":"Sparta Locker","postalCode":"23100"} }';
  const signature = createHmac("sha256", "webhook-secret").update(rawData).digest("hex");
  const raw = `{ "specversion":"1.0", "id":"evt-1", "type":"gr.boxnow.parcel.event", "datasignature":"${signature}", "data":${rawData} }`;
  const { verifyBoxNowWebhook } = await import("../src/index.ts");
  const event = verifyBoxNowWebhook(raw, "webhook-secret");
  assert.equal(event.id, "evt-1");
  assert.equal(event.event, "final-destination");
  assert.equal(event.parcelId, "P-1");
  assert.equal(event.orderNumber, "FUL-1");
  assert.equal(event.location?.postalCode, "23100");
});

test("BOX NOW webhook rejects reformatted/tampered data", async () => {
  const { createHmac } = await import("node:crypto");
  const rawData = '{"parcelId":"P-1","event":"delivered","time":"2026-08-17T08:01:02.345Z"}';
  const signature = createHmac("sha256", "webhook-secret").update(rawData).digest("hex");
  const tamperedData = '{ "parcelId":"P-1", "event":"delivered", "time":"2026-08-17T08:01:02.345Z" }';
  const { verifyBoxNowWebhook } = await import("../src/index.ts");
  assert.throws(() => verifyBoxNowWebhook(`{"id":"evt-2","datasignature":"${signature}","data":${tamperedData}}`, "webhook-secret"), /signature verification failed/);
});
