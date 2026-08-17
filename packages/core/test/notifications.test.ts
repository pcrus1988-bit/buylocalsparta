import test from "node:test";
import assert from "node:assert/strict";
import { NotificationService } from "../src/notifications/index.ts";

test("notifications are scoped, deduplicated and readable", () => {
  const service = new NotificationService();
  const a = service.create({ userId: "customer-1", eventType: "order.confirmed", title: "Order confirmed", body: "Your order is confirmed", dedupeKey: "order:1:confirmed", now: 1 });
  const duplicate = service.create({ userId: "customer-1", eventType: "order.confirmed", title: "Duplicate", body: "Should not duplicate", dedupeKey: "order:1:confirmed", now: 2 });
  service.create({ vendorId: "vendor-1", eventType: "fulfilment.created", title: "New order", body: "Action required", now: 3 });

  assert.equal(a.id, duplicate.id);
  assert.equal(service.listForUser("customer-1").length, 1);
  assert.equal(service.listForVendor("vendor-1").length, 1);
  assert.equal(service.unreadForUser("customer-1"), 1);
  service.markRead({ id: a.id, userId: "customer-1", now: 4 });
  assert.equal(service.unreadForUser("customer-1"), 0);
  assert.throws(() => service.markRead({ id: a.id, vendorId: "vendor-1", now: 5 }), /Permission denied/);
});

import { DevNotificationProvider, NotificationDeliveryWorker, NotificationOrchestrator, NotificationPreferenceService, NotificationTemplateService } from "../src/notifications/index.ts";

test("versioned templates render external notifications and preferences suppress only optional delivery", () => {
  const notifications = new NotificationService();
  const templates = new NotificationTemplateService();
  const preferences = new NotificationPreferenceService();
  const orchestrator = new NotificationOrchestrator(notifications, templates, preferences);
  templates.register({ eventType: "appointment.booked", channel: "email", locale: "el", purpose: "service", revision: 1, titleTemplate: "{{title}}", bodyTemplate: "Ραντεβού: {{when}}", required: false, active: true, createdBy: "admin", createdAt: 1 });
  templates.register({ eventType: "order.authorised", channel: "email", locale: "el", purpose: "transactional", revision: 1, titleTemplate: "{{title}}", bodyTemplate: "Παραγγελία {{orderId}}", required: true, active: true, createdBy: "admin", createdAt: 1 });
  preferences.set({ targetType: "user", targetId: "customer-1", channel: "email", eventType: "*", enabled: false, now: 2 });

  const appointment = orchestrator.emit({ userId: "customer-1", eventType: "appointment.booked", title: "Ραντεβού", body: "fallback", payload: { when: "10:00" }, dedupeKey: "appt-1", now: 3 });
  assert.deepEqual(appointment.map((item) => item.channel), ["in_app"]);

  const order = orchestrator.emit({ userId: "customer-1", eventType: "order.authorised", title: "Παραγγελία", body: "fallback", payload: { orderId: "ORD-1" }, dedupeKey: "order-1", now: 4 });
  assert.deepEqual(order.map((item) => item.channel), ["in_app", "email"]);
  assert.equal(order.find((item) => item.channel === "email")?.body, "Παραγγελία ORD-1");
});

test("notification delivery worker retries providers, records masked destination and completes idempotently", async () => {
  const notifications = new NotificationService();
  const queued = notifications.create({ userId: "customer-1", eventType: "order.authorised", title: "Order", body: "Body", channel: "email", now: 100 });
  const email = new DevNotificationProvider("email", "test-email");
  email.failNext(queued.id, 1);
  const worker = new NotificationDeliveryWorker({
    service: notifications,
    providers: [email],
    resolver: { resolve: () => ({ channel: "email", value: "customer@example.com" }) },
    maxAttempts: 3,
    baseRetryMs: 10,
    workerId: "worker-a"
  });

  assert.deepEqual(await worker.runOnce(100), { claimed: 1, sent: 0, retried: 1, failed: 0 });
  assert.equal(notifications.all().find((item) => item.id === queued.id)?.status, "queued");
  assert.equal((await worker.runOnce(105)).claimed, 0);
  assert.deepEqual(await worker.runOnce(110), { claimed: 1, sent: 1, retried: 0, failed: 0 });
  const delivered = notifications.all().find((item) => item.id === queued.id)!;
  assert.equal(delivered.status, "sent");
  assert.equal(delivered.deliveryAttempts, 2);
  assert.equal(email.sent.length, 1);
  assert.equal(worker.attempts()[0]?.maskedDestination.includes("customer@example.com"), false);
  assert.equal(worker.attempts()[1]?.status, "sent");
  assert.equal((await worker.runOnce(120)).claimed, 0);
});

test("marketing notifications are opt-in by default", () => {
  const notifications = new NotificationService();
  const templates = new NotificationTemplateService();
  const preferences = new NotificationPreferenceService();
  const orchestrator = new NotificationOrchestrator(notifications, templates, preferences);
  templates.register({ eventType: "marketing.weekly", channel: "email", locale: "el", purpose: "marketing", revision: 1, titleTemplate: "{{title}}", bodyTemplate: "{{body}}", required: false, active: true, createdBy: "admin", createdAt: 1 });
  assert.deepEqual(orchestrator.emit({ userId: "customer-1", eventType: "marketing.weekly", title: "Νέα", body: "Προσφορές", now: 2 }).map((item) => item.channel), ["in_app"]);
  preferences.set({ targetType: "user", targetId: "customer-1", channel: "email", eventType: "marketing.weekly", enabled: true, now: 3 });
  assert.deepEqual(orchestrator.emit({ userId: "customer-1", eventType: "marketing.weekly", title: "Νέα 2", body: "Προσφορές 2", dedupeKey: "marketing-2", now: 4 }).map((item) => item.channel), ["in_app", "email"]);
});


test("only transactional templates can be required", () => {
  const templates = new NotificationTemplateService();
  assert.throws(() => templates.register({ eventType: "marketing.offer", channel: "email", locale: "el", purpose: "marketing", revision: 1, titleTemplate: "Offer", bodyTemplate: "Body", required: true, active: true, createdBy: "admin", createdAt: 1 }), /Only transactional notification templates can be required/);
  assert.throws(() => templates.register({ eventType: "appointment.booked", channel: "email", locale: "el", purpose: "service", revision: 1, titleTemplate: "Appointment", bodyTemplate: "Body", required: true, active: true, createdBy: "admin", createdAt: 1 }), /Only transactional notification templates can be required/);
});

test("notification centre groups, bulk read and archive are customer-scoped", () => {
  const notifications = new NotificationService();
  const saved = notifications.create({ userId: "u1", eventType: "saved_search.new_match", title: "Match", body: "A product appeared", now: 100 });
  notifications.create({ userId: "u1", eventType: "order.authorised", title: "Order", body: "Order created", now: 110 });
  notifications.create({ userId: "u2", eventType: "saved_product.price_drop", title: "Price", body: "Dropped", now: 120 });
  assert.equal(notifications.centerForUser("u1", { group: "saved" }).length, 1);
  assert.equal(notifications.centerForUser("u1", { group: "saved" })[0].id, saved.id);
  assert.equal(notifications.markAllRead({ userId: "u1", group: "saved", now: 200 }), 1);
  assert.equal(notifications.unreadForUser("u1"), 1);
  notifications.archive({ id: saved.id, userId: "u1", now: 210 });
  assert.equal(notifications.centerForUser("u1", { group: "saved" }).length, 0);
  assert.equal(notifications.centerForUser("u1", { group: "saved", includeArchived: true }).length, 1);
  assert.throws(() => notifications.archive({ id: saved.id, userId: "u2", now: 220 }), /Permission denied/);
});

test("delivery worker only claims configured channels and isolates recipient-resolution failures", async () => {
  const notifications = new NotificationService();
  const bad = notifications.create({ userId: "customer-bad", eventType: "order.authorised", title: "Bad", body: "Body", channel: "email", now: 100 });
  const good = notifications.create({ userId: "customer-good", eventType: "order.authorised", title: "Good", body: "Body", channel: "email", now: 101 });
  const sms = notifications.create({ userId: "customer-good", eventType: "order.authorised", title: "SMS", body: "Body", channel: "sms", now: 102 });
  const email = new DevNotificationProvider("email", "email-only");
  const worker = new NotificationDeliveryWorker({
    service: notifications,
    providers: [email],
    resolver: { resolve: (notification) => {
      if (notification.id === bad.id) throw new Error("recipient directory unavailable");
      return { channel: notification.channel as "email", value: "customer@example.com" };
    } },
    maxAttempts: 1,
    workerId: "worker-email-only"
  });
  assert.deepEqual(await worker.runOnce(200), { claimed: 2, sent: 1, retried: 0, failed: 1 });
  assert.equal(notifications.all().find((item) => item.id === good.id)?.status, "sent");
  assert.equal(notifications.all().find((item) => item.id === sms.id)?.status, "queued");
  assert.equal(notifications.all().find((item) => item.id === sms.id)?.deliveryAttempts, 0);
});
