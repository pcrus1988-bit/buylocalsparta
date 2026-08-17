import { id } from "../common/ids.ts";

export type AuditEvent = Readonly<{
  id: string;
  actorId: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
  createdAt: number;
}>;

export class AuditLog {
  readonly #events: AuditEvent[] = [];

  record(input: Omit<AuditEvent, "id">): AuditEvent {
    if (!input.actorId.trim()) throw new Error("Audit actor is required");
    if (!input.action.trim()) throw new Error("Audit action is required");
    if (!input.entityType.trim() || !input.entityId.trim()) throw new Error("Audit entity is required");
    const event: AuditEvent = Object.freeze({
      ...structuredClone(input),
      id: id("audit")
    });
    this.#events.push(event);
    return event;
  }

  events(filter: { actorId?: string; entityType?: string; entityId?: string; action?: string } = {}): readonly AuditEvent[] {
    return this.#events
      .filter((event) => !filter.actorId || event.actorId === filter.actorId)
      .filter((event) => !filter.entityType || event.entityType === filter.entityType)
      .filter((event) => !filter.entityId || event.entityId === filter.entityId)
      .filter((event) => !filter.action || event.action === filter.action)
      .map((event) => structuredClone(event));
  }
}
