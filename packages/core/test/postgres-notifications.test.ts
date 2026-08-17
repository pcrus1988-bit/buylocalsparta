import test from "node:test";
import assert from "node:assert/strict";
import { PostgresNotificationOperationsRepository, type NotificationDeliveryAttempt, type NotificationPreference, type NotificationTemplate, type SqlPool, type SqlQueryResult, type SqlRow } from "../src/index.ts";

class NotificationClient {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    if (/SELECT id::text AS id FROM users WHERE public_id/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000001" }] as Row[] };
    if (/SELECT id::text AS id FROM vendor_businesses WHERE public_id/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000002" }] as Row[] };
    if (/FROM notifications n/i.test(text)) return { rowCount: 1, rows: [{ public_id: "ntf-1", user_public_id: "user-1", channel: "email", purpose: "transactional", event_type: "order.authorised", template_version: "v1", locale: "el", title: "Order", body: "Body", payload: {}, status: "sending", delivery_attempts: 0, read_at: new Date(90), archived_at: new Date(95), created_at: new Date(100) }] as Row[] };
    if (/RETURNING n\.id/i.test(text) || /RETURNING id/i.test(text) && /UPDATE notifications/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000003" }] as Row[] };
    if (/SELECT id::text AS id FROM notifications WHERE public_id/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000003" }] as Row[] };
    return { rowCount: /^\s*(INSERT|UPDATE)/i.test(text) ? 1 : 0, rows: [] as Row[] };
  }
  release() {}
}

function pool(client: NotificationClient): SqlPool { return { connect: async () => client, query: async <Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []) => client.query<Row>(text, params) }; }

test("Postgres notification delivery claims with SKIP LOCKED and keeps raw destinations out of persistence", async () => {
  const client = new NotificationClient();
  const repo = new PostgresNotificationOperationsRepository(pool(client));
  const claimed = await repo.claimQueued({ now: 100, ownerId: "notify-worker", leaseMs: 30_000, limit: 10 });
  assert.equal(claimed[0]?.id, "ntf-1");
  assert.equal(claimed[0]?.archivedAt, 95);
  assert.equal(client.calls.some((call) => /FOR UPDATE SKIP LOCKED/i.test(call.text)), true);
  const attempt: NotificationDeliveryAttempt = { id: "attempt-1", notificationId: "ntf-1", attempt: 1, channel: "email", provider: "provider", status: "sent", maskedDestination: "cu******@example.com", providerMessageId: "msg-1", startedAt: 100, completedAt: 110 };
  await repo.recordAttempt(attempt);
  const attemptInsert = client.calls.find((call) => /INSERT INTO notification_delivery_attempts/i.test(call.text));
  assert.ok(attemptInsert);
  assert.equal(attemptInsert!.params.includes("customer@example.com"), false);
});

test("Postgres notification templates and target preferences persist under explicit scope", async () => {
  const client = new NotificationClient();
  const repo = new PostgresNotificationOperationsRepository(pool(client));
  const template: NotificationTemplate = { id: "tpl-1", eventType: "order.authorised", channel: "email", locale: "el", purpose: "transactional", revision: 2, titleTemplate: "Order", bodyTemplate: "Body", required: true, active: true, createdBy: "admin-1", createdAt: 100 };
  await repo.saveTemplate({ scope: { actorUserId: "admin-1", platformAccess: true }, template });
  assert.equal(client.calls.some((call) => /INSERT INTO notification_templates/i.test(call.text)), true);
  const preference: NotificationPreference = { id: "pref-1", targetType: "user", targetId: "user-1", channel: "email", eventType: "appointment.booked", enabled: false, updatedAt: 120 };
  await repo.savePreference({ scope: { actorUserId: "user-1", platformAccess: false }, preference });
  assert.equal(client.calls.some((call) => /INSERT INTO notification_preferences/i.test(call.text)), true);
});
