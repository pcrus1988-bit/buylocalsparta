import assert from "node:assert/strict";
import test from "node:test";
import {
  AadeMyDataClient,
  deliveryReturnNeedsReconciliation,
  reconcileDeliveryReturnFromStatus,
  type ConfirmDeliveryReturnResult,
  type DeliveryNoteStatusResponse
} from "../src/public.ts";

const successfulWithMark: ConfirmDeliveryReturnResult = {
  ok: true,
  deliveryReturnMark: "900000000000001",
  transmission: { ok: true, items: [{ statusCode: "Success", errors: [] }], rawXml: "<ResponseDoc/>" },
  rawXml: "<ResponseDoc/>"
};

const successfulWithoutMark: ConfirmDeliveryReturnResult = {
  ok: true,
  transmission: { ok: true, items: [{ statusCode: "Success", errors: [] }], rawXml: "<ResponseDoc/>" },
  rawXml: "<ResponseDoc/>"
};

function status(input: Partial<DeliveryNoteStatusResponse>): DeliveryNoteStatusResponse {
  return { lifecycleHistory: [], rawXml: "<DeliveryNoteStatusResponse/>", ...input };
}

test("successful ConfirmDeliveryReturn requires reconciliation only when AADE omitted the return MARK", () => {
  assert.equal(deliveryReturnNeedsReconciliation(successfulWithMark), false);
  assert.equal(deliveryReturnNeedsReconciliation(successfulWithoutMark), true);
  assert.equal(deliveryReturnNeedsReconciliation({ ...successfulWithoutMark, ok: false }), false);
});

test("ConfirmReturn event MARK is recovered from delivery-note lifecycle history", () => {
  const result = reconcileDeliveryReturnFromStatus(status({
    statusCode: 8,
    statusName: "Completed",
    status: "Completed",
    lifecycleHistory: [
      { eventType: "RegisterTransfer", mark: "800000000000001" },
      { eventType: "ConfirmReturn", mark: "900000000000001" }
    ]
  }));
  assert.equal(result.resolved, true);
  assert.equal(result.deliveryReturnMark, "900000000000001");
  assert.match(result.reason, /Recovered delivery return MARK/);
});

test("latest ConfirmReturn event wins and naming variants normalize safely", () => {
  const result = reconcileDeliveryReturnFromStatus(status({
    lifecycleHistory: [
      { eventType: "confirm_return", mark: "900000000000001" },
      { eventType: "Confirm-Return", mark: "900000000000002" }
    ]
  }));
  assert.equal(result.resolved, true);
  assert.equal(result.deliveryReturnMark, "900000000000002");
});

test("completed delivery with no ConfirmReturn MARK is held for manual reconciliation instead of resend", () => {
  const result = reconcileDeliveryReturnFromStatus(status({ statusCode: 8, statusName: "Completed", status: "8" }));
  assert.equal(result.resolved, false);
  assert.equal(result.deliveryReturnMark, undefined);
  assert.match(result.reason, /manual reconciliation.*before any retry/i);
});

test("invalid lifecycle MARK and unresolved active state both remain non-resendable", () => {
  const invalid = reconcileDeliveryReturnFromStatus(status({ lifecycleHistory: [{ eventType: "ConfirmReturn", mark: "bad-mark" }] }));
  assert.equal(invalid.resolved, false);
  assert.match(invalid.reason, /invalid MARK.*do not resend blindly/i);

  const unresolved = reconcileDeliveryReturnFromStatus(status({ statusCode: 7, statusName: "FailedDelivery", status: "FailedDelivery" }));
  assert.equal(unresolved.resolved, false);
  assert.match(unresolved.reason, /refresh status before deciding whether any retry is safe/i);
});

test("client reconciliation is read-only and uses GetDeliveryNoteStatus rather than ConfirmDeliveryReturn", async () => {
  const urls: string[] = [];
  const client = new AadeMyDataClient({
    environment: "production",
    baseUrl: "https://mydatapi.aade.gr/myDATA",
    userId: "erp-user",
    subscriptionKey: "secret",
    requestTimeoutMs: 1_000,
    specVersion: "2.0.2"
  }, async input => {
    urls.push(String(input));
    return new Response(`<DeliveryNoteStatusResponse><invoiceMark>400000000000001</invoiceMark><status>8</status><lifecycleHistory><eventType>ConfirmReturn</eventType><mark>900000000000001</mark></lifecycleHistory></DeliveryNoteStatusResponse>`, { status: 200 });
  });

  const result = await client.reconcileDeliveryReturn("https://mydata.aade.gr/qr/return-1");
  assert.equal(result.resolved, true);
  assert.equal(result.deliveryReturnMark, "900000000000001");
  assert.equal(urls.length, 1);
  assert.match(urls[0] ?? "", /\/GetDeliveryNoteStatus\?qrUrl=/);
  assert.doesNotMatch(urls[0] ?? "", /ConfirmDeliveryReturn/);
});
