import { ResendEmailProvider, resendConfigFromEnv } from "@buy-local-sparta/resend-notifications";
import type { Notification } from "@buy-local-sparta/core";

const globals = globalThis as typeof globalThis & {
  __blsDirectResendProvider?: ResendEmailProvider;
};

export type TransactionalEmailInput = Readonly<{
  to: string;
  subject: string;
  text: string;
  eventType: string;
  idempotencyKey: string;
  locale?: "el" | "en";
  payload?: Record<string, unknown>;
}>;

export function transactionalEmailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BLS_EMAIL_DELIVERY_ENABLED === "true" && Boolean(env.RESEND_API_KEY?.trim()) && Boolean(env.RESEND_FROM?.trim());
}

export async function sendTransactionalEmail(input: TransactionalEmailInput): Promise<{ providerMessageId: string }> {
  if (!transactionalEmailConfigured()) throw new Error("Transactional email delivery is not enabled");
  const now = Date.now();
  const notification: Notification = {
    id: `direct:${input.idempotencyKey}`,
    channel: "email",
    purpose: "transactional",
    eventType: input.eventType,
    templateVersion: "web-direct-v1",
    locale: input.locale ?? "el",
    title: input.subject,
    body: input.text,
    payload: input.payload ?? {},
    status: "queued",
    deliveryAttempts: 0,
    createdAt: now
  };
  return directProvider().send({
    notification,
    destination: normalizeEmail(input.to),
    idempotencyKey: input.idempotencyKey
  });
}

export async function sendTransactionalEmailBestEffort(input: TransactionalEmailInput): Promise<{ sent: boolean; providerMessageId?: string }> {
  if (!transactionalEmailConfigured()) return { sent: false };
  try {
    const result = await sendTransactionalEmail(input);
    return { sent: true, providerMessageId: result.providerMessageId };
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "transactional_email.send_failed",
      eventType: input.eventType,
      message: error instanceof Error ? error.message : String(error)
    }));
    return { sent: false };
  }
}

export async function fetchResendReceivedEmail(emailId: string): Promise<Readonly<{
  id: string;
  from: string;
  to: readonly string[];
  cc: readonly string[];
  bcc: readonly string[];
  subject: string;
  text?: string;
  html?: string;
  headers: Record<string, string>;
}>> {
  if (!transactionalEmailConfigured()) throw new Error("Transactional email delivery is not enabled");
  if (!/^[A-Za-z0-9_-]{6,200}$/.test(emailId)) throw new Error("Invalid Resend received email id");
  const config = resendConfigFromEnv();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: { authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(`Resend receive fetch failed (${response.status})`);
    return {
      id: typeof payload.id === "string" ? payload.id : emailId,
      from: typeof payload.from === "string" ? payload.from : "unknown",
      to: stringArray(payload.to),
      cc: stringArray(payload.cc),
      bcc: stringArray(payload.bcc),
      subject: typeof payload.subject === "string" && payload.subject.trim() ? payload.subject.trim() : "(no subject)",
      text: typeof payload.text === "string" ? payload.text : undefined,
      html: typeof payload.html === "string" ? payload.html : undefined,
      headers: stringRecord(payload.headers)
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function forwardReceivedEmailToOperations(input: { webhookEventId: string; emailId: string }): Promise<{ forwarded: boolean; providerMessageId?: string }> {
  const destination = process.env.RESEND_INBOUND_FORWARD_TO?.trim() || process.env.BLS_OPERATIONS_EMAIL?.trim();
  if (!destination) return { forwarded: false };
  const received = await fetchResendReceivedEmail(input.emailId);
  if (received.to.some((address) => sameAddress(address, destination))) {
    throw new Error("Inbound forwarding destination must not be the same Resend receiving address");
  }
  const body = [
    "Inbound email received by Buy Local Sparta",
    "",
    `From: ${received.from}`,
    `To: ${received.to.join(", ") || "—"}`,
    received.cc.length ? `Cc: ${received.cc.join(", ")}` : undefined,
    `Subject: ${received.subject}`,
    `Resend email id: ${received.id}`,
    "",
    "--- Message ---",
    received.text?.trim() || stripHtml(received.html ?? "") || "(No readable text body was returned.)"
  ].filter((line): line is string => typeof line === "string").join("\n");
  const sent = await sendTransactionalEmail({
    to: destination,
    subject: `[Inbound] ${received.subject}`.slice(0, 240),
    text: body.slice(0, 120_000),
    eventType: "email.inbound_forwarded",
    idempotencyKey: `resend-inbound-forward:${input.webhookEventId}`,
    payload: { receivedEmailId: received.id, from: received.from, to: received.to }
  });
  return { forwarded: true, providerMessageId: sent.providerMessageId };
}

function directProvider(): ResendEmailProvider {
  return globals.__blsDirectResendProvider ??= new ResendEmailProvider(resendConfigFromEnv());
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Invalid email destination");
  return email;
}

function stringArray(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function sameAddress(a: string, b: string): boolean {
  const extract = (value: string) => (value.match(/<([^<>]+)>\s*$/)?.[1] ?? value).trim().toLowerCase();
  return extract(a) === extract(b);
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
