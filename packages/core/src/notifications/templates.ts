import { id } from "../common/ids.ts";
import type { NotificationChannel, NotificationPreference, NotificationPurpose, NotificationTemplate } from "./types.ts";

type ExternalChannel = Exclude<NotificationChannel, "in_app">;

function render(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = values[key];
    return value === undefined || value === null ? "" : String(value);
  }).trim();
}

export class NotificationTemplateService {
  readonly #templates = new Map<string, NotificationTemplate>();

  register(input: Omit<NotificationTemplate, "id"> & { id?: string }): NotificationTemplate {
    if (!input.eventType.trim()) throw new Error("Notification template event type is required");
    if (!input.titleTemplate.trim() || !input.bodyTemplate.trim()) throw new Error("Notification template content is required");
    if (!Number.isSafeInteger(input.revision) || input.revision <= 0) throw new Error("Notification template revision must be a positive integer");
    if (input.required && input.purpose !== "transactional") throw new Error("Only transactional notification templates can be required");
    const duplicate = [...this.#templates.values()].some((item) => item.eventType === input.eventType && item.channel === input.channel && item.locale === input.locale && item.revision === input.revision);
    if (duplicate) throw new Error("Notification template revision already exists");
    const item: NotificationTemplate = { ...input, id: input.id ?? id("ntpl"), eventType: input.eventType.trim(), titleTemplate: input.titleTemplate.trim(), bodyTemplate: input.bodyTemplate.trim() };
    this.#templates.set(item.id, item);
    return structuredClone(item);
  }

  resolve(input: { eventType: string; channel: ExternalChannel; locale: "el" | "en" }): NotificationTemplate | undefined {
    const candidates = [...this.#templates.values()].filter((item) => item.active && item.eventType === input.eventType && item.channel === input.channel && item.locale === input.locale);
    candidates.sort((a, b) => b.revision - a.revision || b.createdAt - a.createdAt);
    return candidates[0] ? structuredClone(candidates[0]) : undefined;
  }

  render(template: NotificationTemplate, values: Record<string, unknown>): { title: string; body: string; version: string } {
    return { title: render(template.titleTemplate, values), body: render(template.bodyTemplate, values), version: `v${template.revision}` };
  }

  all(): readonly NotificationTemplate[] {
    return structuredClone([...this.#templates.values()].sort((a, b) => a.eventType.localeCompare(b.eventType) || a.channel.localeCompare(b.channel) || b.revision - a.revision));
  }
}

export class NotificationPreferenceService {
  readonly #preferences = new Map<string, NotificationPreference>();

  set(input: {
    targetType: "user" | "vendor";
    targetId: string;
    channel: ExternalChannel;
    eventType?: string;
    enabled: boolean;
    now: number;
  }): NotificationPreference {
    if (!input.targetId.trim()) throw new Error("Notification preference target is required");
    const eventType = input.eventType?.trim() || "*";
    const key = `${input.targetType}:${input.targetId}:${input.channel}:${eventType}`;
    const existing = this.#preferences.get(key);
    const item: NotificationPreference = {
      id: existing?.id ?? id("npref"), targetType: input.targetType, targetId: input.targetId,
      channel: input.channel, eventType, enabled: input.enabled, updatedAt: input.now
    };
    this.#preferences.set(key, item);
    return structuredClone(item);
  }

  enabled(input: {
    targetType: "user" | "vendor";
    targetId: string;
    channel: ExternalChannel;
    eventType: string;
    purpose: NotificationPurpose;
    required: boolean;
  }): boolean {
    if (input.required) return true;
    const exact = this.#preferences.get(`${input.targetType}:${input.targetId}:${input.channel}:${input.eventType}`);
    if (exact) return exact.enabled;
    const wildcard = this.#preferences.get(`${input.targetType}:${input.targetId}:${input.channel}:*`);
    if (wildcard) return wildcard.enabled;
    if (input.purpose === "marketing") return false;
    return input.channel === "email";
  }

  list(targetType: "user" | "vendor", targetId: string): readonly NotificationPreference[] {
    return structuredClone([...this.#preferences.values()].filter((item) => item.targetType === targetType && item.targetId === targetId).sort((a, b) => a.channel.localeCompare(b.channel) || a.eventType.localeCompare(b.eventType)));
  }
}
