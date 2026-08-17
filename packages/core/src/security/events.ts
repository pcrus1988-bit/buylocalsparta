import { id } from "../common/ids.ts";

export type SecurityEventType =
  | "rate_limit.exceeded"
  | "auth.login_failed"
  | "csrf.rejected"
  | "access.denied"
  | "request.rejected";

export type SecuritySeverity = "low" | "medium" | "high" | "critical";

export type SecurityEvent = Readonly<{
  id: string;
  type: SecurityEventType;
  severity: SecuritySeverity;
  requestId?: string;
  route?: string;
  method?: string;
  subjectHash?: string;
  actorUserId?: string;
  details?: Readonly<Record<string, string | number | boolean | null>>;
  occurredAt: number;
}>;

export class SecurityEventService {
  readonly #events: SecurityEvent[] = [];

  record(input: Omit<SecurityEvent, "id"> & { id?: string }): SecurityEvent {
    const event: SecurityEvent = {
      ...input,
      id: input.id ?? id("sec"),
      route: input.route?.slice(0, 300),
      method: input.method?.slice(0, 16),
      subjectHash: input.subjectHash?.slice(0, 128),
      details: input.details ? sanitizeDetails(input.details) : undefined
    };
    this.#events.push(event);
    return structuredClone(event);
  }

  recent(input: { since?: number; type?: SecurityEventType; severity?: SecuritySeverity; limit?: number } = {}): readonly SecurityEvent[] {
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 1_000);
    return this.#events
      .filter((event) => (input.since === undefined || event.occurredAt >= input.since) && (!input.type || event.type === input.type) && (!input.severity || event.severity === input.severity))
      .slice(-limit)
      .reverse()
      .map((event) => structuredClone(event));
  }

  summary(since: number): Readonly<{ total: number; byType: Readonly<Record<string, number>>; bySeverity: Readonly<Record<string, number>> }> {
    const events = this.#events.filter((event) => event.occurredAt >= since);
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    for (const event of events) {
      byType[event.type] = (byType[event.type] ?? 0) + 1;
      bySeverity[event.severity] = (bySeverity[event.severity] ?? 0) + 1;
    }
    return { total: events.length, byType, bySeverity };
  }

  purge(before: number): number {
    const keep = this.#events.filter((event) => event.occurredAt >= before);
    const removed = this.#events.length - keep.length;
    this.#events.splice(0, this.#events.length, ...keep);
    return removed;
  }
}

function sanitizeDetails(details: Readonly<Record<string, string | number | boolean | null>>): Readonly<Record<string, string | number | boolean | null>> {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(details)) {
    // Security-event metadata must never become a convenient sink for passwords,
    // tokens, raw email addresses, cookies or arbitrary request bodies.
    if (/password|token|cookie|authorization|email|phone|body/i.test(key)) continue;
    safe[key.slice(0, 80)] = typeof value === "string" ? redactSensitiveText(value).slice(0, 500) : value;
  }
  return safe;
}


function redactSensitiveText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(?:\+?30[\s.-]?)?(?:2\d{9}|69\d{8})/g, "[redacted-phone]");
}
