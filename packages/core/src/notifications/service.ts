import { id } from "../common/ids.ts";
import type { Notification, NotificationCenterGroup, NotificationChannel, NotificationPurpose } from "./types.ts";


export function notificationCenterGroup(eventType: string): NotificationCenterGroup {
  if (/^(order|payment|substitution|settlement)\./.test(eventType)) return "orders";
  if (/^(fulfilment|pickup|shipment|inventory)\./.test(eventType)) return "delivery";
  if (/^(appointment|counteroffer|review|content\.story)\./.test(eventType)) return "advice";
  if (/^(saved_product|saved_search)\./.test(eventType)) return "saved";
  if (/^return\./.test(eventType)) return "returns";
  if (/^(product\.recall|product\.safety|compliance)\./.test(eventType)) return "safety";
  if (/^(vendor\.|privacy\.|security\.|auth\.)/.test(eventType)) return "account";
  return "other";
}

export class NotificationService {
  readonly #notifications = new Map<string, Notification>();
  readonly #dedupe = new Map<string, string>();

  create(input: {
    userId?: string;
    vendorId?: string;
    eventType: string;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
    locale?: "el" | "en";
    channel?: NotificationChannel;
    purpose?: NotificationPurpose;
    templateVersion?: string;
    dedupeKey?: string;
    now: number;
  }): Notification {
    if (!input.userId && !input.vendorId) throw new Error("Notification requires a user or vendor target");
    if (!input.eventType.trim()) throw new Error("Notification event type is required");
    if (!input.title.trim() || !input.body.trim()) throw new Error("Notification title and body are required");

    if (input.dedupeKey) {
      const existingId = this.#dedupe.get(input.dedupeKey);
      const existing = existingId ? this.#notifications.get(existingId) : undefined;
      if (existing) return structuredClone(existing);
    }

    const channel = input.channel ?? "in_app";
    const notification: Notification = {
      id: id("ntf"),
      userId: input.userId,
      vendorId: input.vendorId,
      channel,
      purpose: input.purpose ?? "transactional",
      eventType: input.eventType,
      templateVersion: input.templateVersion ?? "v1",
      locale: input.locale ?? "el",
      title: input.title.trim(),
      body: input.body.trim(),
      payload: structuredClone(input.payload ?? {}),
      status: channel === "in_app" ? "sent" : "queued",
      sentAt: channel === "in_app" ? input.now : undefined,
      dedupeKey: input.dedupeKey,
      deliveryAttempts: 0,
      createdAt: input.now
    };
    this.#notifications.set(notification.id, notification);
    if (notification.dedupeKey) this.#dedupe.set(notification.dedupeKey, notification.id);
    return structuredClone(notification);
  }

  listForUser(userId: string): readonly Notification[] {
    return structuredClone([...this.#notifications.values()].filter((item) => item.userId === userId).sort((a, b) => b.createdAt - a.createdAt));
  }

  centerForUser(userId: string, options: { group?: NotificationCenterGroup; unreadOnly?: boolean; includeArchived?: boolean } = {}): ReadonlyArray<Notification & { group: NotificationCenterGroup }> {
    return structuredClone([...this.#notifications.values()]
      .filter((item) => item.userId === userId && item.channel === "in_app")
      .filter((item) => options.includeArchived || !item.archivedAt)
      .filter((item) => !options.unreadOnly || !item.readAt)
      .map((item) => ({ ...item, group: notificationCenterGroup(item.eventType) }))
      .filter((item) => !options.group || item.group === options.group)
      .sort((a, b) => b.createdAt - a.createdAt));
  }

  listForVendor(vendorId: string): readonly Notification[] {
    return structuredClone([...this.#notifications.values()].filter((item) => item.vendorId === vendorId).sort((a, b) => b.createdAt - a.createdAt));
  }

  unreadForUser(userId: string): number {
    return [...this.#notifications.values()].filter((item) => item.userId === userId && item.channel === "in_app" && !item.readAt).length;
  }

  unreadForVendor(vendorId: string): number {
    return [...this.#notifications.values()].filter((item) => item.vendorId === vendorId && item.channel === "in_app" && !item.readAt).length;
  }

  markRead(input: { id: string; userId?: string; vendorId?: string; now: number }): Notification {
    const notification = this.#required(input.id);
    const allowed = (input.userId && notification.userId === input.userId) || (input.vendorId && notification.vendorId === input.vendorId);
    if (!allowed) throw new Error("Permission denied for notification");
    if (notification.channel !== "in_app") throw new Error("Only in-app notifications have read state");
    notification.readAt = input.now;
    return structuredClone(notification);
  }

  markAllRead(input: { userId: string; now: number; group?: NotificationCenterGroup }): number {
    let updated = 0;
    for (const item of this.#notifications.values()) {
      if (item.userId !== input.userId || item.channel !== "in_app" || item.readAt || item.archivedAt) continue;
      if (input.group && notificationCenterGroup(item.eventType) !== input.group) continue;
      item.readAt = input.now;
      updated += 1;
    }
    return updated;
  }

  archive(input: { id: string; userId: string; now: number }): Notification {
    const item = this.#required(input.id);
    if (item.userId !== input.userId) throw new Error("Permission denied for notification");
    if (item.channel !== "in_app") throw new Error("Only in-app notifications can be archived");
    item.archivedAt = input.now;
    item.readAt ??= input.now;
    return structuredClone(item);
  }

  claimQueued(input: { now: number; ownerId: string; leaseMs: number; limit: number; channels?: readonly Exclude<NotificationChannel, "in_app">[] }): readonly Notification[] {
    if (!input.ownerId.trim()) throw new Error("Notification delivery owner is required");
    const candidates = [...this.#notifications.values()]
      .filter((item) => item.channel !== "in_app" && (!input.channels || input.channels.includes(item.channel as Exclude<NotificationChannel, "in_app">)) && item.status === "queued" && (item.nextAttemptAt ?? 0) <= input.now && (item.deliveryLeaseUntil ?? 0) <= input.now)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, input.limit);
    for (const item of candidates) {
      item.status = "sending";
      item.deliveryLeaseOwner = input.ownerId;
      item.deliveryLeaseUntil = input.now + input.leaseMs;
    }
    return structuredClone(candidates);
  }

  completeDelivery(input: { id: string; ownerId: string; providerMessageId: string; now: number }): Notification {
    const item = this.#required(input.id);
    this.#assertLease(item, input.ownerId, input.now);
    item.status = "sent";
    item.deliveryAttempts += 1;
    item.providerMessageId = input.providerMessageId;
    item.sentAt = input.now;
    item.failedAt = undefined;
    item.lastDeliveryError = undefined;
    item.nextAttemptAt = undefined;
    item.deliveryLeaseOwner = undefined;
    item.deliveryLeaseUntil = undefined;
    return structuredClone(item);
  }

  failDelivery(input: { id: string; ownerId: string; error: string; now: number; terminal: boolean; retryDelayMs: number }): Notification {
    const item = this.#required(input.id);
    this.#assertLease(item, input.ownerId, input.now);
    item.deliveryAttempts += 1;
    item.lastDeliveryError = input.error;
    item.failedAt = input.now;
    item.status = input.terminal ? "failed" : "queued";
    item.nextAttemptAt = input.terminal ? undefined : input.now + input.retryDelayMs;
    item.deliveryLeaseOwner = undefined;
    item.deliveryLeaseUntil = undefined;
    return structuredClone(item);
  }

  requeue(idValue: string, now: number): Notification {
    const item = this.#required(idValue);
    if (item.channel === "in_app") throw new Error("In-app notifications are not provider-delivered");
    if (item.status !== "failed") throw new Error("Only failed notifications can be retried manually");
    item.status = "queued";
    item.nextAttemptAt = now;
    item.failedAt = undefined;
    item.lastDeliveryError = undefined;
    item.deliveryLeaseOwner = undefined;
    item.deliveryLeaseUntil = undefined;
    return structuredClone(item);
  }

  all(): readonly Notification[] {
    return structuredClone([...this.#notifications.values()].sort((a, b) => b.createdAt - a.createdAt));
  }

  #assertLease(item: Notification, ownerId: string, now: number): void {
    if (item.status !== "sending" || item.deliveryLeaseOwner !== ownerId || (item.deliveryLeaseUntil ?? 0) < now) {
      throw new Error("Notification delivery lease is not owned by this worker");
    }
  }

  #required(notificationId: string): Notification {
    const notification = this.#notifications.get(notificationId);
    if (!notification) throw new Error("Notification not found");
    return notification;
  }
}
