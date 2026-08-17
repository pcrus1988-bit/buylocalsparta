import assert from "node:assert/strict";
import test from "node:test";
import { AdviceService, FairVendorExposureEngine, money, VendorOnboardingWorkflow } from "../src/index.ts";
import type { EligibleOffer } from "../src/index.ts";

const now = Date.UTC(2026, 7, 14, 8, 0, 0);

function offer(vendorId: string): EligibleOffer {
  return {
    offerId: `offer-${vendorId}`,
    vendorId,
    locationId: `loc-${vendorId}`,
    approved: true,
    vendorActive: true,
    locationActive: true,
    productAllowed: true,
    availableToSell: 10,
    stockFresh: true,
    canServe: true,
    costWithinCeiling: true,
    capacityOpen: true,
    fulfilmentFit: 0,
    stockConfirmedAt: now,
    capacityWeight: 1
  };
}

test("Ask Local routes privately to one eligible vendor and reroutes only after SLA expiry", () => {
  const fairness = new FairVendorExposureEngine({ warmStartCredit: 0 });
  const advice = new AdviceService(fairness);
  const offers = [offer("vendor-a"), offer("vendor-b"), offer("vendor-c")];

  const request = advice.requestCounteroffer({
    marketId: "sparta",
    customerId: "customer-1",
    visitorKey: "visitor-1",
    canonicalVariantId: "airpods",
    sourceUrl: "https://example.test/product/airpods",
    quantity: 1,
    postcode: "23100",
    need: "price",
    offers,
    now,
    responseSlaMs: 60_000
  });

  assert.equal(request.status, "waiting_vendor");
  assert.ok(offers.some((item) => item.vendorId === request.assignedVendorId));
  assert.throws(() => advice.rerouteExpiredCounteroffer(request.id, offers, now + 59_999), /has not expired/);

  const rerouted = advice.rerouteExpiredCounteroffer(request.id, offers, now + 60_001);
  assert.notEqual(rerouted.assignedVendorId, request.assignedVendorId);
});

test("only assigned vendor can make private offer and accepted offer preserves private price", () => {
  const fairness = new FairVendorExposureEngine({ warmStartCredit: 0 });
  const advice = new AdviceService(fairness);
  const request = advice.requestCounteroffer({
    marketId: "sparta",
    customerId: "customer-1",
    visitorKey: "visitor-2",
    canonicalVariantId: "lamp",
    sourceUrl: "https://example.test/lamp",
    quantity: 1,
    postcode: "23100",
    need: "delivery",
    offers: [offer("vendor-a"), offer("vendor-b")],
    now
  });

  assert.throws(
    () => advice.makePrivateOffer({ requestId: request.id, vendorId: "wrong-vendor", price: money(10900), fulfilmentPromise: "Tomorrow", expiresAt: now + 3_600_000, now }),
    /assigned vendor/
  );

  const privateOffer = advice.makePrivateOffer({
    requestId: request.id,
    vendorId: request.assignedVendorId,
    price: money(10900),
    inclusions: ["Local delivery"],
    fulfilmentPromise: "Tomorrow",
    expiresAt: now + 3_600_000,
    now
  });
  const accepted = advice.acceptPrivateOffer(privateOffer.id, now + 1_000);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.price.minor, 10900);
  assert.equal(advice.counteroffer(request.id)?.status, "accepted");
});

test("appointment service rejects adviser double booking", () => {
  const advice = new AdviceService(new FairVendorExposureEngine());
  advice.bookAppointment({
    marketId: "sparta",
    customerId: "customer-1",
    adviserId: "adviser-1",
    vendorId: "vendor-a",
    channel: "google_meet",
    startsAt: now,
    endsAt: now + 30 * 60_000,
    now
  });
  assert.throws(
    () => advice.bookAppointment({
      marketId: "sparta",
      customerId: "customer-2",
      adviserId: "adviser-1",
      vendorId: "vendor-a",
      channel: "phone",
      startsAt: now + 15 * 60_000,
      endsAt: now + 45 * 60_000,
      now
    }),
    /conflicts/
  );
});

test("native chat binds the conversation to one fair vendor", () => {
  const fairness = new FairVendorExposureEngine({ warmStartCredit: 0 });
  const advice = new AdviceService(fairness);
  const conversation = advice.startConversation({
    marketId: "sparta",
    customerId: "customer-1",
    visitorKey: "visitor-chat",
    canonicalVariantId: "drill",
    postcode: "23100",
    offers: [offer("vendor-a"), offer("vendor-b")],
    now
  });
  const message = advice.sendMessage({ conversationId: conversation.id, senderType: "customer", senderId: "customer-1", body: "Will this work for concrete?", now: now + 1 });
  assert.equal(message.body, "Will this work for concrete?");
  assert.equal(advice.conversation(conversation.id)?.state, "waiting_for_vendor");
});

test("vendor onboarding enforces the approved state sequence", () => {
  const workflow = new VendorOnboardingWorkflow();
  assert.throws(() => workflow.transition("active", "admin-1", "skip", now), /Invalid vendor onboarding transition/);
  workflow.transition("application_started", "vendor-1", "application opened", now);
  workflow.transition("verification_pending", "vendor-1", "submitted", now + 1);
  workflow.transition("catalog_onboarding", "ops-1", "business verified", now + 2);
  workflow.transition("test_ready", "ops-1", "catalog ready", now + 3);
  workflow.transition("active", "admin-1", "end-to-end test passed", now + 4);
  assert.equal(workflow.state(), "active");
  assert.equal(workflow.history().length, 5);
});
