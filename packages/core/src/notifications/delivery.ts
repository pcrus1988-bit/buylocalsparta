import { id } from "../common/ids.ts";
import type { Notification, NotificationChannel, NotificationDeliveryAttempt, NotificationDestination } from "./types.ts";

type ExternalChannel = Exclude<NotificationChannel, "in_app">;

export interface NotificationProvider {
  readonly channel: ExternalChannel;
  readonly name: string;
  send(input: { notification: Notification; destination: string; idempotencyKey: string }): Promise<{ providerMessageId: string }>;
}

export interface NotificationRecipientResolver {
  resolve(notification: Notification): NotificationDestination | undefined | Promise<NotificationDestination | undefined>;
}

export interface NotificationDeliveryAttemptSink {
  recordAttempt(attempt: NotificationDeliveryAttempt): void | Promise<void>;
}

export interface NotificationDeliveryStore {
  claimQueued(input: { now: number; ownerId: string; leaseMs: number; limit: number; channels?: readonly ExternalChannel[] }): readonly Notification[] | Promise<readonly Notification[]>;
  completeDelivery(input: { id: string; ownerId: string; providerMessageId: string; now: number }): Notification | Promise<Notification>;
  failDelivery(input: { id: string; ownerId: string; error: string; now: number; terminal: boolean; retryDelayMs: number }): Notification | Promise<Notification>;
  requeue(id: string, now: number): Notification | Promise<Notification>;
}

export class DevNotificationProvider implements NotificationProvider {
  readonly sent: Array<{ notificationId: string; destination: string; providerMessageId: string }> = [];
  readonly #failures = new Map<string, number>();
  readonly channel: ExternalChannel;
  readonly name: string;
  constructor(channel: ExternalChannel, name?: string) { this.channel = channel; this.name = name ?? `dev-${channel}`; }

  failNext(notificationId: string, count = 1): void { this.#failures.set(notificationId, count); }

  async send(input: { notification: Notification; destination: string; idempotencyKey: string }): Promise<{ providerMessageId: string }> {
    const remaining = this.#failures.get(input.notification.id) ?? 0;
    if (remaining > 0) {
      this.#failures.set(input.notification.id, remaining - 1);
      throw new Error(`${this.name} provider unavailable`);
    }
    const existing = this.sent.find((item) => item.notificationId === input.notification.id);
    if (existing) return { providerMessageId: existing.providerMessageId };
    const providerMessageId = `${this.name}-${input.idempotencyKey}`;
    this.sent.push({ notificationId: input.notification.id, destination: input.destination, providerMessageId });
    return { providerMessageId };
  }
}

function maskDestination(channel: ExternalChannel, value: string): string {
  if (channel === "email") {
    const [local, domain] = value.split("@");
    if (!domain) return "***";
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
  }
  if (channel === "sms") return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
  return value.length <= 8 ? "***" : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export class NotificationDeliveryWorker {
  readonly #providers = new Map<ExternalChannel, NotificationProvider>();
  readonly #attempts: NotificationDeliveryAttempt[] = [];
  readonly #service: NotificationDeliveryStore;
  readonly #resolver: NotificationRecipientResolver;
  readonly #workerId: string;
  readonly #maxAttempts: number;
  readonly #baseRetryMs: number;
  readonly #leaseMs: number;
  readonly #attemptSink?: NotificationDeliveryAttemptSink;

  constructor(input: {
    service: NotificationDeliveryStore;
    resolver: NotificationRecipientResolver;
    providers: readonly NotificationProvider[];
    workerId?: string;
    maxAttempts?: number;
    baseRetryMs?: number;
    leaseMs?: number;
    attemptSink?: NotificationDeliveryAttemptSink;
  }) {
    this.#service = input.service;
    this.#resolver = input.resolver;
    this.#workerId = input.workerId ?? `notification-worker-${process.pid}`;
    this.#maxAttempts = input.maxAttempts ?? 5;
    this.#baseRetryMs = input.baseRetryMs ?? 5_000;
    this.#leaseMs = input.leaseMs ?? 30_000;
    this.#attemptSink = input.attemptSink;
    for (const provider of input.providers) this.#providers.set(provider.channel, provider);
  }

  async runOnce(now: number, limit = 20): Promise<{ claimed: number; sent: number; retried: number; failed: number }> {
    const channels = [...this.#providers.keys()];
    if (channels.length === 0) return { claimed: 0, sent: 0, retried: 0, failed: 0 };
    const claimed = await this.#service.claimQueued({ now, ownerId: this.#workerId, leaseMs: this.#leaseMs, limit, channels });
    let sent = 0, retried = 0, failed = 0;
    for (const notification of claimed) {
      const startedAt = now;
      const provider = this.#providers.get(notification.channel as ExternalChannel);
      let destination: NotificationDestination | undefined;
      try {
        destination = await this.#resolver.resolve(notification);
        if (!provider) throw new Error(`No notification provider configured for ${notification.channel}`);
        if (!destination || destination.channel !== notification.channel || !destination.value.trim()) throw new Error("Notification recipient destination is unavailable");
        const result = await provider.send({ notification, destination: destination.value, idempotencyKey: notification.id });
        await this.#service.completeDelivery({ id: notification.id, ownerId: this.#workerId, providerMessageId: result.providerMessageId, now });
        const attempt: NotificationDeliveryAttempt = { id: id("nattempt"), notificationId: notification.id, attempt: notification.deliveryAttempts + 1, channel: notification.channel as ExternalChannel, provider: provider.name, status: "sent", maskedDestination: maskDestination(destination.channel, destination.value), providerMessageId: result.providerMessageId, startedAt, completedAt: now };
        this.#attempts.push(attempt);
        await this.#attemptSink?.recordAttempt(attempt);
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const masked = destination ? maskDestination(destination.channel, destination.value) : "unavailable";
        const attemptNo = notification.deliveryAttempts + 1;
        const terminal = attemptNo >= this.#maxAttempts;
        const retryDelayMs = this.#baseRetryMs * Math.max(1, 2 ** Math.max(0, attemptNo - 1));
        await this.#service.failDelivery({ id: notification.id, ownerId: this.#workerId, error: message, now, terminal, retryDelayMs });
        const attempt: NotificationDeliveryAttempt = { id: id("nattempt"), notificationId: notification.id, attempt: attemptNo, channel: notification.channel as ExternalChannel, provider: provider?.name ?? "unconfigured", status: "failed", maskedDestination: masked, error: message, startedAt, completedAt: now };
        this.#attempts.push(attempt);
        await this.#attemptSink?.recordAttempt(attempt);
        if (terminal) failed += 1; else retried += 1;
      }
    }
    return { claimed: claimed.length, sent, retried, failed };
  }

  retry(notificationId: string, now: number): Notification | Promise<Notification> {
    return this.#service.requeue(notificationId, now);
  }

  attempts(): readonly NotificationDeliveryAttempt[] { return structuredClone(this.#attempts); }
}
