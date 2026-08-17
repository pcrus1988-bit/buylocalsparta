import test from "node:test";
import assert from "node:assert/strict";
import {
  PostgresIdentityRepository,
  PostgresVendorRepository,
  PostgresMediaTrustRepository,
  PostgresTrustRepository,
  type SqlPool,
  type SqlQueryResult,
  type SqlRow
} from "../src/index.ts";

class PersistenceClient {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  released = false;
  #counter = 0;

  async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    if (/SELECT us\.public_id AS session_public_id/i.test(text)) {
      return { rowCount: 1, rows: [{
        session_public_id: "ses-public", expires_at: new Date("2026-08-15T09:00:00Z"), last_seen_at: new Date("2026-08-14T09:00:00Z"),
        user_public_id: "usr-public", email: "buyer@example.test", status: "active", email_verified_at: new Date("2026-08-14T08:00:00Z"),
        is_customer: true, platform_roles: [], vendor_roles: [], vendor_public_id: null
      }] as Row[] };
    }
    if (/SELECT a\.\*, u\.public_id AS owner_public_id/i.test(text)) {
      return { rowCount: 1, rows: [{
        public_id: "vapp-public", owner_public_id: "usr-owner", market_code: "sparta", vendor_public_id: null,
        legal_name: "Demo OE", trading_name: "Demo Shop", tax_number: "123456789", gemi_number: null,
        contact_email: "shop@example.test", phone: "2731000000", address_line1: "1 Demo Street", postcode: "23100",
        primary_category: "lighting-decor", shop_story: "Local specialists", requested_plan_code: "founding_early_bird",
        status: "verification_pending", verification_notes: "KYB pending", created_at: new Date("2026-08-14T09:00:00Z"), updated_at: new Date("2026-08-14T09:05:00Z")
      }] as Row[] };
    }
    if (/SELECT e\.from_status::text/i.test(text)) {
      return { rowCount: 1, rows: [{ from_status: "application_started", to_status: "verification_pending", actor_public_id: "usr-owner", reason: "merchant submitted application", occurred_at: new Date("2026-08-14T09:05:00Z") }] as Row[] };
    }
    if (/SELECT pm\.\*, cv\.public_id AS canonical_public_id/i.test(text)) {
      return { rowCount: 1, rows: [{
        public_id: "media-public", canonical_public_id: "variant-public", vendor_public_id: "vendor-public", reviewer_public_id: "admin-public",
        kind: "image", object_key: "product-media/variant/file.webp", original_filename: "file.webp", content_type: "image/webp", byte_size: 100,
        sha256: "a".repeat(64), alt_text: "Lamp", rights_owner: "Demo Shop", rights_status: "approved", moderation_status: "approved", scan_status: "clean",
        rejection_reason: null, created_at: new Date("2026-08-14T09:00:00Z"), reviewed_at: new Date("2026-08-14T09:10:00Z")
      }] as Row[] };
    }
    if (/SELECT id::text AS id FROM/i.test(text) || /RETURNING id::text AS id/i.test(text)) {
      this.#counter += 1;
      return { rowCount: 1, rows: [{ id: `00000000-0000-4000-8000-${String(this.#counter).padStart(12, "0")}` }] as Row[] };
    }
    if (/RETURNING public_id/i.test(text)) return { rowCount: 1, rows: [{ public_id: "usr-public" }] as Row[] };
    return { rowCount: /^\s*(INSERT|UPDATE|DELETE)/i.test(text) ? 1 : 0, rows: [] as Row[] };
  }

  release() { this.released = true; }
}

function pool(client: PersistenceClient): SqlPool {
  return {
    connect: async () => client,
    query: async <Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []) => client.query<Row>(text, params)
  };
}

const platformScope = { actorUserId: "admin-public", marketId: "sparta", platformAccess: true } as const;

test("Postgres identity repository persists account roles and stores only a CSRF hash", async () => {
  const client = new PersistenceClient();
  const repository = new PostgresIdentityRepository(pool(client));
  await repository.saveAccount({
    scope: platformScope,
    account: {
      id: "usr-public", email: "buyer@example.test", passwordHash: "scrypt$encoded$hash", status: "active", roles: ["customer"],
      emailVerified: true, createdAt: Date.parse("2026-08-14T09:00:00Z")
    }
  });
  await repository.saveSession({
    scope: { actorUserId: "usr-public" },
    session: {
      id: "ses-public", userId: "usr-public", tokenHash: "session-hash", csrfToken: "do-not-store-plaintext",
      createdAt: 1000, lastSeenAt: 1000, expiresAt: 5000
    }
  });
  const sessionInsert = client.calls.find((call) => call.text.includes("INSERT INTO user_sessions"));
  assert.ok(sessionInsert);
  assert.equal(sessionInsert!.params.includes("do-not-store-plaintext"), false);
  assert.equal(typeof sessionInsert!.params[4], "string");
  assert.equal(String(sessionInsert!.params[4]).length, 64);
  assert.equal(client.calls.some((call) => call.text.includes("INSERT INTO customer_profiles")), true);
});

test("Postgres identity repository reconstructs a persisted customer session without exposing secrets", async () => {
  const client = new PersistenceClient();
  const repository = new PostgresIdentityRepository(pool(client));
  const identity = await repository.findSession({ tokenHash: "session-hash", now: Date.parse("2026-08-14T09:00:00Z") });
  assert.equal(identity?.sessionId, "ses-public");
  assert.equal(identity?.userId, "usr-public");
  assert.deepEqual(identity?.roles, ["customer"]);
  assert.equal("csrfToken" in (identity ?? {}), false);
  assert.equal(client.calls[0].params[0], "session-hash");
  assert.equal(client.calls[0].params.includes("csrf-token"), false);
});

test("Postgres identity repository verifies CSRF independently from session lookup", async () => {
  const client = new PersistenceClient();
  const original = client.query.bind(client);
  client.query = async function<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    if (/SELECT 1 AS ok FROM user_sessions/i.test(text)) {
      this.calls.push({ text, params });
      return { rowCount: 1, rows: [{ ok: 1 }] as Row[] };
    }
    return original<Row>(text, params);
  };
  const repository = new PostgresIdentityRepository(pool(client));
  const valid = await repository.verifyCsrf({ sessionId: "ses-public", csrfToken: "csrf-token", now: 1000 });
  assert.equal(valid, true);
  const call = client.calls.find((entry) => entry.text.includes("SELECT 1 AS ok FROM user_sessions"));
  assert.ok(call);
  assert.notEqual(call!.params[1], "csrf-token");
  assert.equal(String(call!.params[1]).length, 64);
});

test("Postgres vendor repository persists onboarding history and can provision an active supplier atomically", async () => {
  const client = new PersistenceClient();
  const repository = new PostgresVendorRepository(pool(client));
  const application = {
    id: "vapp-public", ownerUserId: "usr-owner", marketId: "sparta", vendorId: "vendor-vapp-public",
    legalName: "Demo OE", tradingName: "Demo Shop", taxNumber: "123456789", contactEmail: "shop@example.test", phone: "2731000000",
    address: "1 Demo Street", postcode: "23100", primaryCategory: "lighting-decor", shopStory: "Local specialists",
    requestedPlanCode: "founding_early_bird", state: "active" as const, createdAt: 1000, updatedAt: 2000,
    history: [{ from: "test_ready" as const, to: "active" as const, actorId: "admin-public", reason: "test order passed", at: 2000 }]
  };
  await repository.saveApplication({ scope: platformScope, application });
  const provisioned = await repository.provisionActiveVendor({ scope: platformScope, application, now: 3000 });
  assert.equal(provisioned.vendorId, "vendor-vapp-public");
  assert.equal(provisioned.locationId, "location-vendor-vapp-public-primary");
  assert.equal(client.calls.some((call) => call.text.includes("INSERT INTO vendor_applications")), true);
  assert.equal(client.calls.some((call) => call.text.includes("INSERT INTO vendor_application_events")), true);
  assert.equal(client.calls.some((call) => call.text.includes("INSERT INTO vendor_businesses")), true);
  assert.equal(client.calls.some((call) => call.text.includes("'vendor_owner'")), true);
});

test("Postgres vendor repository maps persisted application history back to public IDs", async () => {
  const client = new PersistenceClient();
  const repository = new PostgresVendorRepository(pool(client));
  const application = await repository.application("vapp-public");
  assert.equal(application?.ownerUserId, "usr-owner");
  assert.equal(application?.marketId, "sparta");
  assert.equal(application?.history[0]?.to, "verification_pending");
  assert.equal(application?.history[0]?.actorId, "usr-owner");
});

test("Postgres media/trust repository persists review state and only maps fully public media", async () => {
  const client = new PersistenceClient();
  const repository = new PostgresMediaTrustRepository(pool(client));
  await repository.saveMedia({
    scope: { vendorId: "vendor-public" },
    asset: {
      id: "media-public", canonicalVariantId: "variant-public", vendorId: "vendor-public", kind: "image", objectKey: "product-media/variant/file.webp",
      originalFilename: "file.webp", contentType: "image/webp", byteSize: 100, sha256: "a".repeat(64), altText: "Lamp", rightsOwner: "Demo Shop",
      rightsStatus: "approved", moderationStatus: "approved", scanStatus: "clean", createdAt: 1000, reviewedAt: 2000, reviewedBy: "admin-public"
    }
  });
  const assets = await repository.publicMedia("variant-public");
  assert.equal(assets.length, 1);
  assert.equal(assets[0]?.vendorId, "vendor-public");
  assert.equal(assets[0]?.reviewedBy, "admin-public");
  assert.equal(client.calls.some((call) => call.text.includes("scan_status='clean'") && call.text.includes("rights_status='approved'")), true);
});

test("Postgres trust repository persists return timeline, notification content and append-only audit", async () => {
  const client = new PersistenceClient();
  const repository = new PostgresTrustRepository(pool(client));
  await repository.saveReturn({
    scope: platformScope,
    item: {
      id: "ret-public", orderId: "ord-public", orderLineId: "line-public", customerId: "usr-public", vendorId: "vendor-public",
      canonicalVariantId: "variant-public", quantity: 1, reason: "withdrawal", source: "customer", notes: "unused", requestedRemedy: "refund",
      eligibility: { state: "eligible", basis: "withdrawal_window", reason: "inside configured window", expiresAt: 5000 },
      status: "refunded", requestedAt: 1000, approvedAt: 1100, receivedAt: 1200, inspectedAt: 1300, refundedAt: 1400, closedAt: 1400,
      disposition: "sellable", approvedRemedy: "refund",
      authorization: { rmaCode: "RMA-RET", destinationType: "vendor", destinationVendorId: "vendor-public", instructions: "Return to store", returnCostPayer: "platform", returnByAt: 4000, issuedAt: 1100, issuedBy: "admin-public" },
      evidence: [{ id: "evidence-public", kind: "photo", reference: "private://photo", submittedBy: "usr-public", createdAt: 1050 }],
      custody: [{ id: "custody-public", from: "customer", to: "vendor", actorId: "usr-public", occurredAt: 1200 }],
      audit: [{ at: 1000, actorId: "usr-public", action: "return_requested" }, { at: 1400, actorId: "admin-public", action: "refund_completed" }]
    }
  });
  await repository.saveNotification({
    scope: platformScope,
    notification: {
      id: "ntf-public", userId: "usr-public", channel: "in_app", eventType: "refund.completed", templateVersion: "v1", locale: "el",
      title: "Η επιστροφή ολοκληρώθηκε", body: "Η επιστροφή χρημάτων καταχωρήθηκε.", payload: { orderId: "ord-public" }, status: "sent", sentAt: 1400, createdAt: 1400
    }
  });
  await repository.saveAudit({
    scope: platformScope,
    event: { id: "audit-public", actorId: "admin-public", actorRole: "customer_support", action: "refund.approved", entityType: "return", entityId: "ret-public", createdAt: 1400 }
  });
  assert.equal(client.calls.some((call) => call.text.includes("INSERT INTO return_events")), true);
  assert.equal(client.calls.some((call) => call.text.includes("INSERT INTO return_evidence")), true);
  assert.equal(client.calls.some((call) => call.text.includes("INSERT INTO return_custody_events")), true);
  assert.equal(client.calls.some((call) => call.text.includes("INSERT INTO notifications") && call.text.includes("title, body")), true);
  assert.equal(client.calls.some((call) => call.text.includes("INSERT INTO audit_events") && call.text.includes("actor_public_id")), true);
});


test("Postgres trust repository persists affected-customer recall linkage with public IDs", async () => {
  const client = new PersistenceClient();
  const repository = new PostgresTrustRepository(pool(client));
  await repository.saveRecallAffectedCase({
    scope: platformScope,
    item: {
      id: "recallcase-public", noticeId: "notice-public", canonicalVariantId: "variant-public", orderId: "ord-public", orderLineId: "line-public",
      customerId: "usr-public", vendorId: "vendor-public", affectedQuantity: 1, status: "remedy_requested", selectedRemedy: "refund",
      returnId: "ret-public", identifiedAt: 1000, notifiedAt: 1100, acknowledgedAt: 1200
    }
  });
  const insert = client.calls.find((call) => call.text.includes("INSERT INTO recall_affected_orders"));
  assert.ok(insert);
  assert.equal(insert!.params.includes("recallcase-public"), true);
  assert.equal(insert!.params.includes("refund"), true);
});
