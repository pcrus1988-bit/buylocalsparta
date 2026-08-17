import test from "node:test";
import assert from "node:assert/strict";
import { VivaPaymentsClient, parseVivaWebhook, type VivaConfig } from "../src/index.ts";

const config: VivaConfig = { environment:"demo", clientId:"client", clientSecret:"secret", merchantId:"merchant", apiKey:"api-key", sourceCode:"1234", paymentTimeoutSeconds:900, requestTimeoutMs:2000 };

test("Viva client caches OAuth token and creates Smart Checkout order in minor units", async () => {
  const calls: { url:string; init?:RequestInit }[] = [];
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url:String(url), init });
    if (String(url).includes("/connect/token")) return new Response(JSON.stringify({ access_token:"token", expires_in:3600, token_type:"Bearer", scope:"urn:viva:payments:core:api:redirectcheckout" }), { status:200, headers:{"content-type":"application/json"} });
    return new Response(JSON.stringify({ orderCode:7568594363572609 }), { status:200, headers:{"content-type":"application/json"} });
  }) as typeof fetch;
  const client = new VivaPaymentsClient(config, fakeFetch);
  const first = await client.createPaymentOrder({ amountMinor:1234, merchantReference:"BLS-1", customerDescription:"Order BLS-1", customer:{ email:"a@example.com", requestLang:"el-GR", countryCode:"GR" } });
  const second = await client.createPaymentOrder({ amountMinor:1234, merchantReference:"BLS-2", customerDescription:"Order BLS-2" });
  assert.equal(first.orderCode, "7568594363572609");
  assert.equal(first.checkoutUrl, "https://demo.vivapayments.com/web/checkout?ref=7568594363572609");
  assert.equal(calls.filter((call) => call.url.includes("/connect/token")).length, 1);
  assert.equal(calls.filter((call) => call.url.includes("/checkout/v2/orders")).length, 2);
  const body = JSON.parse(String(calls[1].init?.body));
  assert.equal(body.amount, 1234); assert.equal(body.currencyCode, 978); assert.equal(body.paymentTimeout, 900); assert.equal(body.sourceCode, "1234"); assert.equal(body.preauth, false);
  assert.equal(second.orderCode, first.orderCode);
});

test("Viva transaction retrieval preserves 16-digit order code as string", async () => {
  const fakeFetch = (async (url: string | URL | Request) => {
    if (String(url).includes("/connect/token")) return new Response(JSON.stringify({ access_token:"token", expires_in:3600, scope:"urn:viva:payments:core:api:redirectcheckout" }), { status:200 });
    return new Response(JSON.stringify({ amount:12.34, orderCode:"7568594363572609", statusId:"F", currencyCode:978 }), { status:200 });
  }) as typeof fetch;
  const tx = await new VivaPaymentsClient(config, fakeFetch).retrieveTransaction("997ab1e3-e6ce-45c9-970d-4d902f27ce71");
  assert.equal(tx.orderCode, "7568594363572609"); assert.equal(tx.amountMinor, 1234); assert.equal(tx.statusId, "F");
});

test("Viva refund sends amount in minor units with Basic auth", async () => {
  let seen = ""; let auth = "";
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => { seen=String(url); auth=new Headers(init?.headers).get("authorization") ?? ""; return new Response(JSON.stringify({ Success:true, StatusId:"F", TransactionId:"1289e200-6891-4739-afe5-5c13e839545b", Amount:500 }), { status:200 }); }) as typeof fetch;
  const result = await new VivaPaymentsClient(config, fakeFetch).refund({ transactionId:"997ab1e3-e6ce-45c9-970d-4d902f27ce71", amountMinor:500 });
  assert.equal(result.success, true); assert.match(seen, /amount=500/); assert.match(seen, /currencyCode=978/); assert.ok(auth.startsWith("Basic "));
});

test("webhook parser rejects non-object payloads", () => { assert.throws(() => parseVivaWebhook([])); assert.equal(parseVivaWebhook({EventTypeId:1796,EventData:{StatusId:"F"}}).EventTypeId,1796); });

test("Viva retrieve converts decimal EUR amount to integer minor units", async () => {
  const fakeFetch = (async (url: string | URL | Request) => {
    if (String(url).includes("/connect/token")) return new Response(JSON.stringify({ access_token:"token", expires_in:3600, scope:"urn:viva:payments:core:api:redirectcheckout" }), { status:200 });
    return new Response(JSON.stringify({ amount:99.05, orderCode:"7568594363572609", statusId:"F", currencyCode:978 }), { status:200 });
  }) as typeof fetch;
  const tx = await new VivaPaymentsClient(config, fakeFetch).retrieveTransaction("997ab1e3-e6ce-45c9-970d-4d902f27ce71");
  assert.equal(tx.amountMinor, 9905);
});

test("Viva payment-order cancellation uses current PATCH order API", async () => {
  let method = ""; let body = "";
  const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    method = String(init?.method ?? "GET"); body = String(init?.body ?? "");
    return new Response(JSON.stringify({ Success:true }), { status:200 });
  }) as typeof fetch;
  await new VivaPaymentsClient(config, fakeFetch).cancelPaymentOrder("7568594363572609");
  assert.equal(method, "PATCH"); assert.deepEqual(JSON.parse(body), { isCanceled:true });
});

test("Viva parser preserves a 16-digit numeric order code beyond JS safe integer", async () => {
  const fakeFetch = (async (url: string | URL | Request) => {
    if (String(url).includes("/connect/token")) return new Response(JSON.stringify({ access_token:"token", expires_in:3600, scope:"urn:viva:payments:core:api:redirectcheckout" }), { status:200 });
    return new Response('{"amount":10.25,"orderCode":9999999999999999,"statusId":"F","currencyCode":978}', { status:200 });
  }) as typeof fetch;
  const tx = await new VivaPaymentsClient(config, fakeFetch).retrieveTransaction("997ab1e3-e6ce-45c9-970d-4d902f27ce71");
  assert.equal(tx.orderCode, "9999999999999999");
});

test("Viva readiness proves both OAuth Smart Checkout scope and classic webhook credentials without creating an order", async () => {
  const calls:string[]=[];
  const fakeFetch=(async(url:string|URL|Request)=>{calls.push(String(url));if(String(url).includes("/connect/token"))return new Response(JSON.stringify({access_token:"token",expires_in:3600,scope:"urn:viva:payments:core:api:redirectcheckout"}),{status:200});return new Response(JSON.stringify({Key:"verification-key"}),{status:200});}) as typeof fetch;
  const result=await new VivaPaymentsClient(config,fakeFetch).readiness();
  assert.equal(result.ok,true);assert.equal(result.webhookKeyAvailable,true);assert.equal(calls.some(x=>x.includes("/checkout/v2/orders")),false);
});
