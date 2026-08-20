import { randomUUID } from "node:crypto";
import type { Notification } from "@buy-local-sparta/core";
import { PostgresEmailTemplateRegistry, PostgresFixedWindowRateLimiter, type EmailTemplateCatalogItem } from "@buy-local-sparta/postgres-runtime";
import { ResendEmailProvider, resendConfigFromEnv, resendDeliveryEnabled } from "@buy-local-sparta/resend-notifications";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const globals = globalThis as typeof globalThis & {
  __blsEmailTemplateRegistry?: PostgresEmailTemplateRegistry;
  __blsEmailLabRateLimiter?: PostgresFixedWindowRateLimiter;
  __blsEmailLabMemoryRateLimit?: Map<string, { count: number; windowStartedAt: number }>;
};

const EMAIL_LAB_TEST_LIMIT = 10;
const EMAIL_LAB_TEST_WINDOW_MS = 10 * 60 * 1000;

export type AutomaticEmailTemplateInput = Readonly<{
  subject: string;
  text: string;
  eventType: string;
  locale?: "el" | "en";
  purpose?: "transactional" | "service" | "marketing";
  payload?: Record<string, unknown>;
}>;

export async function resolveAutomaticEmailTemplate(input: AutomaticEmailTemplateInput): Promise<AutomaticEmailTemplateInput> {
  if (!productionDatabaseConfigured()) return input;
  try {
    const now = Date.now();
    const notification: Notification = {
      id: `template-resolve:${input.eventType}:${now}`,
      channel: "email",
      purpose: input.purpose ?? "transactional",
      eventType: input.eventType,
      templateVersion: "web-generated",
      locale: input.locale ?? "el",
      title: input.subject,
      body: input.text,
      payload: input.payload ?? {},
      status: "queued",
      deliveryAttempts: 0,
      createdAt: now
    };
    const resolved = await templateRegistry().resolveForSend(notification);
    return { ...input, subject: resolved.title, text: resolved.body };
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "email_template.resolve_failed", eventType: input.eventType, message: error instanceof Error ? error.message : String(error) }));
    return input;
  }
}

export async function emailTemplateLabCatalog(): Promise<readonly EmailTemplateCatalogItem[]> {
  if (!productionDatabaseConfigured()) return [];
  return templateRegistry().catalog();
}

export async function saveEmailTemplateRevision(input: {
  eventType: string;
  locale: "el" | "en";
  subject: string;
  body: string;
  actorPublicId: string;
}): Promise<EmailTemplateCatalogItem> {
  if (!productionDatabaseConfigured()) throw new Error("Email template editing requires PostgreSQL");
  return templateRegistry().saveRevision(input);
}

export async function resetEmailTemplateRevision(input: { eventType: string; locale: "el" | "en" }): Promise<void> {
  if (!productionDatabaseConfigured()) throw new Error("Email template editing requires PostgreSQL");
  await templateRegistry().reset(input);
}

export function emailLabDeliveryConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return resendDeliveryEnabled(env) && Boolean(env.RESEND_API_KEY?.trim());
}

export async function consumeEmailLabTestSendLimit(adminUserIdRaw: string, now = Date.now()): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const adminUserId = adminUserIdRaw.trim();
  if (!adminUserId) throw new Error("Admin actor is required");
  if (productionDatabaseConfigured()) {
    const decision = await emailLabRateLimiter().consume({
      route: "admin-email-lab-test",
      key: adminUserId,
      limit: EMAIL_LAB_TEST_LIMIT,
      windowMs: EMAIL_LAB_TEST_WINDOW_MS,
      now
    });
    return { allowed: decision.allowed, retryAfterMs: decision.retryAfterMs };
  }

  const limits = globals.__blsEmailLabMemoryRateLimit ??= new Map();
  const current = limits.get(adminUserId);
  if (!current || now - current.windowStartedAt >= EMAIL_LAB_TEST_WINDOW_MS) {
    limits.set(adminUserId, { count: 1, windowStartedAt: now });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (current.count >= EMAIL_LAB_TEST_LIMIT) {
    return { allowed: false, retryAfterMs: Math.max(1, EMAIL_LAB_TEST_WINDOW_MS - (now - current.windowStartedAt)) };
  }
  current.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

export async function sendEmailLabTest(input: {
  to: string;
  eventType: string;
  locale: "el" | "en";
  purpose: "transactional" | "service" | "marketing";
  subject: string;
  body: string;
}): Promise<{ providerMessageId: string }> {
  if (!emailLabDeliveryConfigured()) throw new Error("Transactional email delivery is not enabled");
  const destination = normalizeEmail(input.to);
  const subject = cleanSubject(input.subject);
  const body = cleanBody(input.body);
  const eventType = cleanEventType(input.eventType);
  const now = Date.now();
  const notification: Notification = {
    id: `email-lab:${randomUUID()}`,
    channel: "email",
    purpose: input.purpose,
    eventType,
    templateVersion: "admin-email-lab-preview",
    locale: input.locale === "en" ? "en" : "el",
    title: subject,
    body,
    payload: {},
    status: "queued",
    deliveryAttempts: 0,
    createdAt: now
  };
  const provider = new ResendEmailProvider(resendConfigFromEnv(process.env));
  return provider.send({
    notification,
    destination,
    idempotencyKey: `admin-email-lab:${eventType}:${randomUUID()}`
  });
}

export function maskEmailForAudit(value: string): string {
  const email = value.trim().toLowerCase();
  const [local, domain] = email.split("@");
  if (!local || !domain) return "invalid";
  return `${local.slice(0, 2)}***@${domain}`;
}

function templateRegistry(): PostgresEmailTemplateRegistry {
  return globals.__blsEmailTemplateRegistry ??= new PostgresEmailTemplateRegistry(getProductionPostgresRuntime().sqlPool);
}

function emailLabRateLimiter(): PostgresFixedWindowRateLimiter {
  return globals.__blsEmailLabRateLimiter ??= new PostgresFixedWindowRateLimiter(getProductionPostgresRuntime().sqlPool);
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Invalid email destination");
  return email;
}
function cleanEventType(value: string): string {
  const result = value.trim();
  if (!/^[a-zA-Z0-9_.:-]{2,160}$/.test(result)) throw new Error("Invalid email event type");
  return result;
}
function cleanSubject(value: string): string {
  const result = value.trim();
  if (!result || result.length > 240 || /[\r\n]/.test(result)) throw new Error("Subject must be 1–240 characters without line breaks");
  return result;
}
function cleanBody(value: string): string {
  const result = value.trim();
  if (!result || result.length > 120_000) throw new Error("Email body must be 1–120000 characters");
  return result;
}
