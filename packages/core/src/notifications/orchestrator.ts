import type { Notification, NotificationChannel, NotificationPurpose } from "./types.ts";
import { NotificationPreferenceService, NotificationTemplateService } from "./templates.ts";
import { NotificationService } from "./service.ts";

type ExternalChannel = Exclude<NotificationChannel, "in_app">;

export class NotificationOrchestrator {
  readonly service: NotificationService;
  readonly templates: NotificationTemplateService;
  readonly preferences: NotificationPreferenceService;
  constructor(service: NotificationService, templates: NotificationTemplateService, preferences: NotificationPreferenceService) { this.service = service; this.templates = templates; this.preferences = preferences; }

  emit(input: {
    userId?: string;
    vendorId?: string;
    eventType: string;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
    locale?: "el" | "en";
    purpose?: NotificationPurpose;
    dedupeKey?: string;
    now: number;
  }): readonly Notification[] {
    if (!input.userId && !input.vendorId) throw new Error("Notification requires a target");
    const locale = input.locale ?? "el";
    const purpose = input.purpose ?? "transactional";
    const values = { ...(input.payload ?? {}), title: input.title, body: input.body };
    const created: Notification[] = [];
    created.push(this.service.create({ ...input, locale, purpose, channel: "in_app", payload: values, dedupeKey: input.dedupeKey ? `${input.dedupeKey}:in_app` : undefined }));

    const targetType = input.userId ? "user" : "vendor";
    const targetId = input.userId ?? input.vendorId!;
    for (const channel of ["email", "sms", "push"] as const satisfies readonly ExternalChannel[]) {
      const template = this.templates.resolve({ eventType: input.eventType, channel, locale });
      if (!template) continue;
      if (!this.preferences.enabled({ targetType, targetId, channel, eventType: input.eventType, purpose: template.purpose, required: template.required })) continue;
      const rendered = this.templates.render(template, values);
      created.push(this.service.create({
        userId: input.userId, vendorId: input.vendorId, eventType: input.eventType, title: rendered.title, body: rendered.body,
        payload: values, locale, purpose: template.purpose, channel, templateVersion: rendered.version,
        dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${channel}` : undefined, now: input.now
      }));
    }
    return created;
  }
}
