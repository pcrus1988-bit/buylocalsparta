import { buildAdminMailRawMime, type AdminMailAddress } from "../../../../../lib/admin-mail-mime";
import { sesMailConfigFromEnv, sesMailConfigured, sendRawSesEmail } from "../../../../../lib/admin-mail-ses";
import { archiveSentAdminMailBestEffort } from "../../../../../lib/admin-mail-store";
import { requireAdminSession } from "../../../../../lib/admin-session";
import { recordAdminAudit } from "../../../../../lib/admin-runtime";

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENTS = 8;

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "notifications.manage" });
    if (!sesMailConfigured()) throw new Error("SES outbound mail is not configured");

    const form = await request.formData();
    const to = parseRecipients(textField(form, "to"));
    const cc = parseRecipients(textField(form, "cc", false));
    const bcc = parseRecipients(textField(form, "bcc", false));
    if (!to.length) throw new Error("At least one To recipient is required");

    const subject = textField(form, "subject").slice(0, 240);
    if (!subject.trim()) throw new Error("Subject is required");
    const text = textField(form, "text").slice(0, 120000);
    if (!text.trim()) throw new Error("Message body is required");

    const files = form.getAll("attachments").filter((value): value is File => value instanceof File && value.size > 0);
    if (files.length > MAX_ATTACHMENTS) throw new Error("A maximum of 8 attachments is allowed");
    let totalBytes = 0;
    const attachments: Array<{ filename: string; contentType: string; bytes: Uint8Array }> = [];
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("Each attachment must be 8 MB or smaller");
      totalBytes += file.size;
      if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) throw new Error("Total attachments must be 20 MB or smaller");
      attachments.push({
        filename: cleanFilename(file.name),
        contentType: cleanContentType(file.type),
        bytes: new Uint8Array(await file.arrayBuffer())
      });
    }

    const fromAddress = normalizeEmail(requiredEnv("BLS_MAIL_FROM"));
    const fromName = process.env.BLS_MAIL_FROM_NAME?.trim() || "KONTA MOY";
    const replyTo = process.env.BLS_MAIL_REPLY_TO?.trim() ? [{ address: normalizeEmail(process.env.BLS_MAIL_REPLY_TO) }] : undefined;
    const domain = process.env.BLS_MAIL_MESSAGE_ID_DOMAIN?.trim() || fromAddress.split("@")[1] || "kontamou.site";
    const inReplyTo = optionalMessageId(textField(form, "inReplyTo", false));
    const references = parseMessageIds(textField(form, "references", false));

    const mime = buildAdminMailRawMime({
      from: { address: fromAddress, name: fromName },
      to,
      cc,
      bcc,
      replyTo,
      subject,
      text,
      internetMessageIdDomain: domain,
      inReplyTo,
      references: references.length ? references : undefined,
      attachments
    });

    const delivery = await sendRawSesEmail({
      config: sesMailConfigFromEnv(),
      raw: mime.raw,
      from: fromAddress,
      to: to.map((item) => item.address),
      cc: cc.map((item) => item.address),
      bcc: bcc.map((item) => item.address)
    });
    const archived = await archiveSentAdminMailBestEffort({ raw: mime.raw, sentAt: Date.now() });

    await recordAdminAudit(principal, "admin.mail_sent", "admin_mail", delivery.providerMessageId, "Message sent from /admin/mail", {
      to: to.map((item) => item.address),
      cc: cc.map((item) => item.address),
      bccCount: bcc.length,
      subject,
      attachmentCount: attachments.length,
      archived
    });

    return Response.json({
      sent: true,
      providerMessageId: delivery.providerMessageId,
      internetMessageId: mime.internetMessageId,
      archived
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "admin_mail_send_failed" }, { status: 400 });
  }
}

function textField(form: FormData, name: string, required = true): string {
  const value = form.get(name);
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) throw new Error(name + " is required");
  return text;
}

function parseRecipients(value: string): AdminMailAddress[] {
  if (!value.trim()) return [];
  const result: AdminMailAddress[] = [];
  const seen = new Set<string>();
  for (const raw of value.split(/[;,\n]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const angle = part.match(/^(.*)<([^<>]+)>$/);
    const address = normalizeEmail((angle?.[2] || part).trim());
    if (seen.has(address)) continue;
    seen.add(address);
    const name = angle?.[1]?.trim().replace(/^["']|["']$/g, "");
    result.push({ address, ...(name ? { name: name.slice(0, 120) } : {}) });
  }
  if (result.length > 50) throw new Error("Too many email recipients");
  return result;
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || email.length > 254) throw new Error("Invalid email address: " + value);
  return email;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required");
  return value;
}

function optionalMessageId(value: string): string | undefined {
  if (!value.trim()) return undefined;
  return value.trim().replace(/[\r\n]/g, "").slice(0, 998);
}

function parseMessageIds(value: string): string[] {
  return (value.match(/<[^<>\s]+>/g) || []).slice(-20);
}

function cleanFilename(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim().slice(0, 180) || "attachment";
}

function cleanContentType(value: string): string {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(normalized) ? normalized : "application/octet-stream";
}
