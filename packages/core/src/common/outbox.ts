import { id } from "./ids.ts";

export type OutboxEvent<T = unknown> = {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: T;
  idempotencyKey: string;
  status: "pending" | "processing" | "processed" | "failed" | "dead_lettered";
  attempts: number;
  availableAt: number;
  lockedUntil?: number;
  lockOwner?: string;
  lastError?: string;
  createdAt: number;
  processedAt?: number;
};

export interface OutboxStore {
  claim(now: number, limit?: number, leaseMs?: number, eventTypes?: readonly string[], ownerId?: string): readonly OutboxEvent[] | Promise<readonly OutboxEvent[]>;
  complete(eventId: string, now: number, ownerId?: string): OutboxEvent | Promise<OutboxEvent>;
  fail(eventId: string, error: string, now: number, retryDelayMs?: number, ownerId?: string): OutboxEvent | Promise<OutboxEvent>;
  deadLetter(eventId: string, error: string, now: number, ownerId?: string): OutboxEvent | Promise<OutboxEvent>;
}

export class TransactionalOutbox implements OutboxStore {
  readonly #events = new Map<string, OutboxEvent>();
  readonly #keyIndex = new Map<string, string>();

  enqueue<T>(input: {
    type: string;
    aggregateType: string;
    aggregateId: string;
    payload: T;
    idempotencyKey: string;
    now: number;
    availableAt?: number;
  }): OutboxEvent<T> {
    const previous = this.#keyIndex.get(input.idempotencyKey);
    if (previous) return structuredClone(this.#events.get(previous)!) as OutboxEvent<T>;
    const event: OutboxEvent<T> = {
      id: id("evt"),
      type: input.type,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: structuredClone(input.payload),
      idempotencyKey: input.idempotencyKey,
      status: "pending",
      attempts: 0,
      availableAt: input.availableAt ?? input.now,
      createdAt: input.now
    };
    this.#events.set(event.id, event);
    this.#keyIndex.set(event.idempotencyKey, event.id);
    return structuredClone(event);
  }

  claim(now: number, limit = 20, leaseMs = 30_000, eventTypes?: readonly string[], ownerId = "in-memory-worker"): readonly OutboxEvent[] {
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error("Outbox claim limit must be positive");
    if (!ownerId.trim()) throw new Error("Outbox lease owner is required");
    const allowedTypes = eventTypes?.length ? new Set(eventTypes) : undefined;
    const candidates = [...this.#events.values()]
      .filter((event) => !allowedTypes || allowedTypes.has(event.type))
      .filter((event) => event.availableAt <= now && (event.status === "pending" || event.status === "failed" || (event.status === "processing" && (event.lockedUntil ?? 0) <= now)))
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, limit);
    for (const event of candidates) {
      event.status = "processing";
      event.attempts += 1;
      event.lockedUntil = now + leaseMs;
      event.lockOwner = ownerId;
      event.lastError = undefined;
    }
    return structuredClone(candidates);
  }

  complete(eventId: string, now: number, ownerId?: string): OutboxEvent {
    const event = this.#required(eventId);
    if (event.status === "processed") return structuredClone(event);
    this.#assertOwner(event, ownerId);
    if (event.status !== "processing") throw new Error("Only processing outbox events can be completed");
    event.status = "processed";
    event.processedAt = now;
    event.lockedUntil = undefined;
    event.lockOwner = undefined;
    return structuredClone(event);
  }

  fail(eventId: string, error: string, now: number, retryDelayMs = 5_000, ownerId?: string): OutboxEvent {
    const event = this.#required(eventId);
    this.#assertOwner(event, ownerId);
    if (event.status !== "processing") throw new Error("Only processing outbox events can fail");
    event.status = "failed";
    event.lastError = error.slice(0, 2_000);
    event.availableAt = now + Math.max(0, retryDelayMs);
    event.lockedUntil = undefined;
    event.lockOwner = undefined;
    return structuredClone(event);
  }

  deadLetter(eventId: string, error: string, now: number, ownerId?: string): OutboxEvent {
    const event = this.#required(eventId);
    this.#assertOwner(event, ownerId);
    if (event.status !== "processing") throw new Error("Only processing outbox events can be dead-lettered");
    event.status = "dead_lettered";
    event.lastError = error.slice(0, 2_000);
    event.processedAt = now;
    event.lockedUntil = undefined;
    event.lockOwner = undefined;
    return structuredClone(event);
  }

  replay(eventId: string, now: number): OutboxEvent {
    const event = this.#required(eventId);
    if (event.status !== "dead_lettered" && event.status !== "failed") throw new Error("Only failed or dead-lettered events can be replayed");
    event.status = "pending";
    event.availableAt = now;
    event.processedAt = undefined;
    event.lockedUntil = undefined;
    event.lockOwner = undefined;
    event.lastError = undefined;
    return structuredClone(event);
  }

  events(): readonly OutboxEvent[] {
    return structuredClone([...this.#events.values()]);
  }

  #required(idValue: string): OutboxEvent {
    const event = this.#events.get(idValue);
    if (!event) throw new Error("Outbox event not found");
    return event;
  }

  #assertOwner(event: OutboxEvent, ownerId?: string): void {
    if (ownerId && event.lockOwner && event.lockOwner !== ownerId) throw new Error("Outbox event lease belongs to another worker");
  }
}
