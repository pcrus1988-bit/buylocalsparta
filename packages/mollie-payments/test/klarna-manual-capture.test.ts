import assert from "node:assert/strict";
import test from "node:test";
import { MolliePaymentsClient } from "../src/index.ts";

const config = {
  apiKey: "test_abcdefghijklmnopqrstuvwxyz012345",
  apiBaseUrl: "https://api.mollie.test/v2",
  requestTimeoutMs: 1_000
} as const;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function paymentPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "tr_KlarnaPayment123",
    status: "authorized",
    amount: { currency: "EUR", value: "50.00" },
    amountRefunded: { currency: "EUR", value: "0.00" },
    description: "KONTA MOY order KM-2001",
    method: "klarna",
    metadata: { orderId: "order_klarna_123", orderNumber: "KM-2001" },
    _links: { checkout: { href: "https://www.mollie.com/checkout/tr_KlarnaPayment123" } },
    ...overrides
  };
}

test("explicit Klarna checkout sends manual capture, lines and shopper address", async () => {
  let body: Record<string, unknown> | undefined;
  const client = new MolliePaymentsClient(config, async (input, init) => {
    assert.equal(String(input), "https://api.mollie.test/v2/payments");
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return json(201, paymentPayload({ status: "open" }));
  });

  const created = await client.createPayment({
    amountMinor: 5_000,
    orderId: "order_klarna_123",
    orderNumber: "KM-2001",
    description: "KONTA MOY order KM-2001",
    redirectUrl: "https://kontamou.site/account/orders?payment=mollie",
    webhookUrl: "https://kontamou.site/api/payments/mollie/webhook",
    method: "klarna",
    captureMode: "manual",
    billingAddress: {
      givenName: "Maria",
      familyName: "Papadopoulou",
      streetAndNumber: "Leonidou 10",
      postalCode: "23100",
      city: "Sparti",
      country: "GR",
      email: "maria@example.test",
      phone: "+306900000000"
    },
    lines: [{
      type: "physical",
      description: "Local product",
      quantity: 1,
      unitPriceMinor: 5_000,
      totalAmountMinor: 5_000,
      vatRate: "24.00",
      vatAmountMinor: 968,
      sku: "SKU-1"
    }]
  });

  assert.equal(created.paymentId, "tr_KlarnaPayment123");
  assert.equal(body?.method, "klarna");
  assert.equal(body?.captureMode, "manual");
  assert.deepEqual(body?.billingAddress, {
    givenName: "Maria",
    familyName: "Papadopoulou",
    streetAndNumber: "Leonidou 10",
    postalCode: "23100",
    city: "Sparti",
    country: "GR",
    email: "maria@example.test",
    phone: "+306900000000"
  });
  assert.deepEqual(body?.lines, [{
    type: "physical",
    description: "Local product",
    quantity: 1,
    unitPrice: { currency: "EUR", value: "50.00" },
    totalAmount: { currency: "EUR", value: "50.00" },
    vatRate: "24.00",
    vatAmount: { currency: "EUR", value: "9.68" },
    sku: "SKU-1"
  }]);
});

test("Klarna creation fails closed without required lines or billing address", async () => {
  const client = new MolliePaymentsClient(config, async () => {
    throw new Error("provider call must not happen");
  });

  await assert.rejects(() => client.createPayment({
    amountMinor: 5_000,
    orderId: "order_klarna_123",
    orderNumber: "KM-2001",
    description: "KONTA MOY order KM-2001",
    redirectUrl: "https://kontamou.site/account/orders?payment=mollie",
    webhookUrl: "https://kontamou.site/api/payments/mollie/webhook",
    method: "klarna",
    captureMode: "manual"
  }), /require order lines/);
});

test("authorized Klarna payment is parsed as a first-class provider state", async () => {
  const client = new MolliePaymentsClient(config, async () => json(200, paymentPayload()));
  const payment = await client.retrievePayment("tr_KlarnaPayment123");
  assert.equal(payment.status, "authorized");
  assert.equal(payment.method, "klarna");
  assert.equal(payment.orderId, "order_klarna_123");
  assert.equal(payment.amountMinor, 5_000);
});

test("manual capture is posted to the payment capture endpoint and validated", async () => {
  let body: Record<string, unknown> | undefined;
  const client = new MolliePaymentsClient(config, async (input, init) => {
    assert.equal(String(input), "https://api.mollie.test/v2/payments/tr_KlarnaPayment123/captures");
    assert.equal(init?.method, "POST");
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return json(201, {
      id: "cpt_KlarnaCapture123",
      paymentId: "tr_KlarnaPayment123",
      status: "pending",
      amount: { currency: "EUR", value: "50.00" }
    });
  });

  const capture = await client.createCapture({
    paymentId: "tr_KlarnaPayment123",
    amountMinor: 5_000,
    description: "KONTA MOY fulfilment KM-2001",
    metadata: { orderId: "order_klarna_123" }
  });

  assert.equal(capture.captureId, "cpt_KlarnaCapture123");
  assert.equal(capture.paymentId, "tr_KlarnaPayment123");
  assert.equal(capture.amountMinor, 5_000);
  assert.deepEqual(body?.amount, { currency: "EUR", value: "50.00" });
  assert.deepEqual(body?.metadata, { orderId: "order_klarna_123" });
});

test("authorization release uses the dedicated endpoint", async () => {
  let seenUrl = "";
  let seenMethod = "";
  const client = new MolliePaymentsClient(config, async (input, init) => {
    seenUrl = String(input);
    seenMethod = init?.method ?? "";
    return new Response(null, { status: 204 });
  });

  await client.releaseAuthorization("tr_KlarnaPayment123");
  assert.equal(seenUrl, "https://api.mollie.test/v2/payments/tr_KlarnaPayment123/release-authorization");
  assert.equal(seenMethod, "POST");
});
