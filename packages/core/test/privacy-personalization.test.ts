import test from "node:test";
import assert from "node:assert/strict";
import { CustomerPersonalizationService, PrivacyRequestService, defaultCustomerRetentionSnapshot, InMemoryAuthService } from "../src/index.ts";

const DAY = 24 * 60 * 60 * 1000;

test("saved products/shops are idempotent and recently viewed obeys opt-out and retention", () => {
  const service = new CustomerPersonalizationService({ recentTtlMs: 2 * DAY, recentLimit: 2 });
  service.saveProduct("u1", "p1", 100);
  service.saveProduct("u1", "p1", 200);
  service.saveVendor("u1", "v1", 100);
  assert.equal(service.savedProducts("u1").length, 1);
  assert.equal(service.savedVendors("u1").length, 1);
  service.recordView("u1", "p1", 1_000);
  service.recordView("u1", "p2", 2_000);
  service.recordView("u1", "p3", 3_000);
  assert.deepEqual(service.recentlyViewed("u1", 3_100).map((x) => x.canonicalVariantId), ["p3", "p2"]);
  service.updatePreferences({ userId: "u1", recentlyViewedEnabled: false, now: 4_000 });
  assert.equal(service.recentlyViewed("u1", 4_001).length, 0);
  assert.equal(service.recordView("u1", "p4", 5_000), undefined);
  service.saveProduct("u1", "p9", 5_100);
  const erased = service.eraseNonEssential("u1", 6_000);
  assert.equal(erased.savedProducts, 2);
  assert.equal(service.savedProducts("u1").length, 0);
  assert.equal(service.preferences("u1", 6_001).recommendationsEnabled, false);
  assert.equal(service.preferences("u1", 6_001).recentlyViewedEnabled, false);
});

test("privacy requests are user scoped, deduplicated while active, and retain explicit outcome", () => {
  const service = new PrivacyRequestService({ responseTargetMs: DAY });
  const request = service.submit({ userId: "u1", type: "deletion", now: 1_000, details: { reason: "customer request" } });
  const duplicate = service.submit({ userId: "u1", type: "deletion", now: 2_000 });
  assert.equal(duplicate.id, request.id);
  assert.equal(service.forUser("u2").length, 0);
  service.start({ requestId: request.id, actorId: "support", now: 3_000 });
  const completed = service.complete({ requestId: request.id, actorId: "support", now: 4_000, retention: defaultCustomerRetentionSnapshot(4_000), outcome: { personalizationErased: true } });
  assert.equal(completed.status, "partially_completed");
  assert.equal(completed.completedBy, "support");
  assert.equal(completed.retention.some((item) => item.retained), true);
});

test("customer data export contains personalization but can keep statutory retention categories explicit", () => {
  const personalization = new CustomerPersonalizationService();
  personalization.saveProduct("u1", "p1", 100);
  personalization.saveVendor("u1", "v1", 110);
  personalization.recordView("u1", "p1", 120);
  const privacy = new PrivacyRequestService();
  const result = privacy.buildExport({
    now: 200,
    subject: { userId: "u1", accountStatus: "active", email: "customer@example.test" },
    personalization: {
      preferences: personalization.preferences("u1", 200),
      savedProducts: personalization.savedProducts("u1"),
      savedVendors: personalization.savedVendors("u1"),
      recentlyViewed: personalization.recentlyViewed("u1", 200)
    },
    data: { orders: [{ id: "o1" }] },
    retention: defaultCustomerRetentionSnapshot(200)
  });
  assert.equal(result.exportVersion, "1.0");
  assert.equal(result.personalization.savedProducts[0].canonicalVariantId, "p1");
  assert.deepEqual(result.data.orders, [{ id: "o1" }]);
});

test("account closure pseudonymises customer identity and revokes active sessions", () => {
  const auth = new InMemoryAuthService({ secret: "01234567890123456789012345678901" });
  const account = auth.register({ email: "person@example.test", password: "VeryStrong!123", roles: ["customer"], emailVerified: true, now: 100 });
  const login = auth.authenticate({ email: "person@example.test", password: "VeryStrong!123", now: 200 });
  assert.ok(auth.session(login.token, 201));
  const closed = auth.closeCustomerAccount({ userId: account.id, now: 300 });
  assert.equal(closed.status, "closed");
  assert.match(closed.email, /^closed\+[0-9a-f]{24}@privacy\.invalid$/);
  assert.equal(auth.session(login.token, 301), undefined);
  assert.throws(() => auth.authenticate({ email: "person@example.test", password: "VeryStrong!123", now: 302 }), /Invalid email/);
});

test("business/staff accounts cannot use consumer self-service closure", () => {
  const auth = new InMemoryAuthService({ secret: "01234567890123456789012345678901" });
  const account = auth.register({ email: "vendor@example.test", password: "VeryStrong!123", roles: ["customer", "vendor_owner"], vendorId: "vendor-a", emailVerified: true, now: 100 });
  assert.throws(() => auth.closeCustomerAccount({ userId: account.id, now: 200 }), /administrative offboarding/);
});
