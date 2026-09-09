import assert from "node:assert/strict";
import test from "node:test";
import {
  MollieApiError,
  MolliePaymentsClient,
  minorToMollieValue,
  mollieConfigFromEnv,
  mollieEnvironment,
  mollieValueToMinor,
  parseMollieWebhookBody
} from "../src/index.ts";

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
    id: "tr_TestPayment123",
    status: "open",
    amount: { currency: "EUR", value: "12.34" },
    amountRefunded: { currency: "EUR", value: "0.00" },
    description: "KONTA MOY order KM-1001",
    method: "creditcard",
    metadata: { orderId: "order_test_123", orderNumber: "KM-1001" },
    _links: { checkout: { href: "https://www.mollie.com/checkout/tr_TestPayment123" } },
    ...overrides
  };
}

test("configuration is fail-closed and detects test/live environments", () => {
  assert.throws(() => mollieConfigFromEnv({}), /MOLLIE_API_KEY is required/);
  assert.throws(() => mollieConfigFromEnv({ MOLLIE_API_KEY: "invalid" }), /invalid format/);
  assert.throws(() => mollieConfigFromEnv({ MOLLIE_API_KEY: "test_abc123", MOLLIE_API_BASE_URL: "http:\/\/api.example.test" }), /must use HTTPS/);

  const testConfig = mollieConfigFromEnv({ MOLLIE_API_KEY: "test_abc123" });
  const liveConfig = mollieConfigFromEnv({ MOLLIE_API_KEY: "live_abc123", MOLLIE_REQUEST_TIMEOUT_MS: "2500" });
  assert.equal(mollieEnvironment(testConfig), "test");
  assert.equal(mollieEnvironment(liveConfig), "live");
  assert.equal(liveConfig.requestTimeoutMs, 2500);
});

test("minor-unit conversions are exact and reject unsafe values", () => {
  assert.equal(minorToMollieValue(1), "0.01");
  assert.equal(minorToMollieValue(1234), "12.34");
  assert.equal(mollieValueToMinor("12.34"), 1234);
  assert.equal(mollieValueToMinor("0.00"), 0);
  assert.throws(() => minorToMollieValue(0), /positive integer/);
  assert.throws(() => minorToMollieValue(1.5), /positive integer/);
  assert.throws(() => mollieValueToMinor("12.3"), /invalid/);
});

test("Mollie webhook parsing accepts only canonical payment ids", () => {
  assert.equal(parseMollieWebhookBody("id=tr_TestPayment123"), "tr_TestPayment123");
  assert.throws(() => parseMollieWebhookBody("id=bad"), /Invalid Mollie payment id/);
  assert.throws(() => parseMollieWebhookBody(`id=tr_${"a".repeat(17_000)}`), /payload is too large/);
});

test("readiness calls Mollie methods endpoint with bearer authentication", async () => {
  let seenUrl = "";
  let seenAuth = "";
  const fetchFn: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenAuth = new Headers(init?.headers).get("authorization") ?? "";
    return json(200, { count: 1, _embedded: { methods: [] } });
  };
  const client = new MolliePaymentsClient(config, fetchFn);
  assert.deepEqual(await client.readiness(), { ok: true, environment: "test" });
  assert.equal(seenUrl, "https://api.mollie.test/v2/methods?sequenceType=oneoff");
  assert.equal(seenAuth, `Bearer ${config.apiKey}`);
});

test("createPayment sends exact EUR amount, approved card method, order identity, redirect and webhook metadata", async () => {
  let body: Record<string, unknown> | undefined;
  const fetchFn: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://api.mollie.test/v2/payments");
    assert.equal(init?.method, "POST");
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return json(201, paymentPayload());
  };
  const client = new MolliePaymentsClient(config, fetchFn);
  const created = await client.createPayment({
    amountMinor: 1234,
    orderId: "order_test_123",
    orderNumber: "KM-1001",
    description: "KONTA MOY order KM-1001",
    redirectUrl: "https://kontamou.site/account/orders/order_test_123?payment=mollie",
    webhookUrl: "https://kontamou.site/api/payments/mollie/webhook",
    cancelUrl: "https://kontamou.site/account/orders/order_test_123?payment=cancelled",
    locale: "el_GR",
    metadata: { attempt: "attempt-1" }
  });
  assert.equal(created.paymentId, "tr_TestPayment123");
  assert.equal(created.checkoutUrl, "https://www.mollie.com/checkout/tr_TestPayment123");
  assert.deepEqual(body?.amount, { currency: "EUR", value: "12.34" });
  assert.equal(body?.method, "creditcard");
  assert.equal(body?.webhookUrl, "https://kontamou.site/api/payments/mollie/webhook");
  assert.deepEqual(body?.metadata, { attempt: "attempt-1", orderId: "order_test_123", orderNumber: "KM-1001" });
});

test("retrievePayment parses paid and refunded provider state with order identity", async () => {
  const fetchFn: typeof fetch = async () => json(200, paymentPayload({
    status: "paid",
    amountRefunded: { currency: "EUR", value: "2.34" }
  }));
  const payment = await new MolliePaymentsClient(config, fetchFn).retrievePayment("tr_TestPayment123");
  assert.equal(payment.status, "paid");
  assert.equal(payment.amountMinor, 1234);
  assert.equal(payment.amountRefundedMinor, 234);
  assert.equal(payment.orderId, "order_test_123");
  assert.equal(payment.orderNumber, "KM-1001");
  assert.equal(payment.method, "creditcard");
});

test("refund posts the requested amount and rejects mismatched provider payment identity", async () => {
  let body: Record<string, unknown> | undefined;
  const fetchFn: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://api.mollie.test/v2/payments/tr_TestPayment123/refunds");
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return json(201, {
      id: "re_TestRefund123",
      paymentId: "tr_TestPayment123",
      status: "refunded",
      amount: { currency: "EUR", value: "2.34" }
    });
  };
  const client = new MolliePaymentsClient(config, fetchFn);
  const refund = await client.refund({ paymentId: "tr_TestPayment123", amountMinor: 234, description: "Return refund" });
  assert.equal(refund.refundId, "re_TestRefund123");
  assert.equal(refund.amountMinor, 234);
  assert.deepEqual(body?.amount, { currency: "EUR", value: "2.34" });

  const mismatchClient = new MolliePaymentsClient(config, async () => json(200, {
    id: "re_TestRefund123",
    paymentId: "tr_DifferentPayment",
    status: "refunded",
    amount: { currency: "EUR", value: "2.34" }
  }));
  await assert.rejects(() => mismatchClient.retrieveRefund("tr_TestPayment123", "re_TestRefund123"), /did not match/);
});

test("cancelPayment uses DELETE and returns canonical canceled state", async () => {
  let method = "";
  const fetchFn: typeof fetch = async (_input, init) => {
    method = init?.method ?? "";
    return json(200, paymentPayload({ status: "canceled" }));
  };
  const payment = await new MolliePaymentsClient(config, fetchFn).cancelPayment("tr_TestPayment123");
  assert.equal(method, "DELETE");
  assert.equal(payment.status, "canceled");
});

test("provider errors preserve HTTP status without leaking request credentials", async () => {
  const client = new MolliePaymentsClient(config, async () => json(422, {
    title: "Unprocessable Entity",
    detail: "The amount is invalid",
    field: "amount.value"
  }));
  await assert.rejects(
    () => client.retrievePayment("tr_TestPayment123"),
    (error: unknown) => {
      assert.ok(error instanceof MollieApiError);
      assert.equal(error.status, 422);
      assert.equal(error.field, "amount.value");
      assert.match(error.message, /Unprocessable Entity/);
      assert.doesNotMatch(error.message, /test_abcdefghijklmnopqrstuvwxyz012345/);
      return true;
    }
  );
});

test("unsupported provider payment status fails closed", async () => {
  const client = new MolliePaymentsClient(config, async () => json(200, paymentPayload({ status: "chargeback" })));
  await assert.rejects(() => client.retrievePayment("tr_TestPayment123"), /status is unsupported/);
});
