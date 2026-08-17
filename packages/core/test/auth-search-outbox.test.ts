import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryAuthService, LocalSearchEngine, TransactionalOutbox, normalizeSearchText } from "../src/index.ts";

test("authentication uses opaque signed sessions, expiry and CSRF validation", () => {
  const auth = new InMemoryAuthService({ secret: "development-secret-that-is-at-least-32-chars", sessionTtlMs: 1_000 });
  const account = auth.register({
    email: "Owner@Demo.Local",
    password: "StrongPass!123",
    roles: ["vendor_owner"],
    vendorId: "vendor-a",
    emailVerified: true,
    now: 100
  });
  assert.equal(account.email, "owner@demo.local");
  assert.throws(() => auth.authenticate({ email: "owner@demo.local", password: "wrong-password", now: 200 }));
  const login = auth.authenticate({ email: "owner@demo.local", password: "StrongPass!123", now: 200 });
  assert.ok(login.token.includes("."));
  const principal = auth.session(login.token, 300);
  assert.equal(principal?.vendorId, "vendor-a");
  assert.equal(principal?.roles.includes("vendor_owner"), true);
  assert.doesNotThrow(() => auth.assertCsrf(principal!, principal!.csrfToken));
  assert.throws(() => auth.assertCsrf(principal!, "wrong"));
  assert.equal(auth.session(login.token, 1_201), undefined);
});

test("Greek, English and Greeklish normalize into a shared search space", () => {
  assert.equal(normalizeSearchText("Παπούτσια"), "papoutsia");
  const search = new LocalSearchEngine();
  search.upsert({
    id: "shoe-1",
    type: "product",
    marketId: "sparta",
    title: "Ανδρικά Παπούτσια Τρεξίματος",
    titleEl: "Ανδρικά Παπούτσια Τρεξίματος",
    titleEn: "Men's Running Shoes",
    brand: "DemoRun",
    categoryCodes: ["footwear"],
    available: true,
    pickupToday: true,
    adviceAvailable: true,
    priceMinor: 8_900,
    synonyms: ["αθλητικά", "running trainers"]
  });
  assert.equal(search.search({ marketId: "sparta", q: "papoutsia" })[0]?.document.id, "shoe-1");
  assert.equal(search.search({ marketId: "sparta", q: "running shoes" })[0]?.document.id, "shoe-1");
  assert.equal(search.search({ marketId: "sparta", q: "papoitsia" })[0]?.document.id, "shoe-1");
  assert.equal(search.search({ marketId: "sparta", q: "papoutsia", availability: "pickup_today", adviceOnly: true })[0]?.document.id, "shoe-1");
});

test("non-empty search queries do not become false-positive results from availability boosts", () => {
  const search = new LocalSearchEngine();
  search.upsert({ id: "lamp-1", type: "product", marketId: "sparta", title: "Desk Lamp", available: true, pickupToday: true, adviceAvailable: true });
  assert.equal(search.search({ marketId: "sparta", q: "BTL-01" }).length, 0);
  assert.equal(search.search({ marketId: "sparta", q: "" }).length, 1);
});

test("outbox deduplicates enqueue and supports retry leases", () => {
  const outbox = new TransactionalOutbox();
  const first = outbox.enqueue({ type: "order.confirmed", aggregateType: "order", aggregateId: "o1", payload: { total: 100 }, idempotencyKey: "o1-confirmed", now: 100 });
  const duplicate = outbox.enqueue({ type: "order.confirmed", aggregateType: "order", aggregateId: "o1", payload: { total: 999 }, idempotencyKey: "o1-confirmed", now: 101 });
  assert.equal(first.id, duplicate.id);
  assert.equal(outbox.claim(100).length, 1);
  outbox.fail(first.id, "provider down", 110, 50);
  assert.equal(outbox.claim(120).length, 0);
  const retried = outbox.claim(160);
  assert.equal(retried[0]?.attempts, 2);
  outbox.complete(first.id, 170);
  assert.equal(outbox.claim(180).length, 0);
});

test("new accounts require email verification before authentication", () => {
  const auth = new InMemoryAuthService({ secret: "verification-secret-that-is-at-least-32-chars" });
  const account = auth.register({
    email: "new@example.test",
    password: "StrongPass!123",
    roles: ["customer"],
    status: "pending_verification",
    emailVerified: false,
    now: 100
  });
  assert.throws(() => auth.authenticate({ email: account.email, password: "StrongPass!123", now: 101 }), /pending_verification/);
  const token = auth.createEmailVerification(account.id, 102, 1_000);
  const verified = auth.verifyEmail(token, 103);
  assert.equal(verified.emailVerified, true);
  assert.equal(verified.status, "active");
  assert.doesNotThrow(() => auth.authenticate({ email: account.email, password: "StrongPass!123", now: 104 }));
  assert.throws(() => auth.verifyEmail(token, 105), /invalid/);
});

test("search supports category-aware attribute filters without duplicating canonical products", () => {
  const search = new LocalSearchEngine();
  search.upsert({ id: "p1", type: "product", marketId: "sparta", title: "USB-C Headphones", categoryCodes: ["audio"], attributes: { connector: "USB-C", colour: "white" }, available: true });
  search.upsert({ id: "p2", type: "product", marketId: "sparta", title: "Lightning Headphones", categoryCodes: ["audio"], attributes: { connector: "Lightning", colour: "white" }, available: true });
  const hits = search.search({ marketId: "sparta", q: "headphones", categoryCode: "audio", attributeFilters: { connector: "USB-C" } });
  assert.deepEqual(hits.map((hit) => hit.document.id), ["p1"]);
});
