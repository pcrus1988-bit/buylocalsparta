"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "../../../lib/admin-session";
import { assertAdminCsrf, assertAdminPermission, recordAdminAudit } from "../../../lib/admin-runtime";
import { productionDatabaseConfigured } from "../../../lib/postgres-runtime";
import {
  archiveAdminMail,
  markAdminMailRead,
  sendAdminMail,
  starAdminMail,
  syncAdminInboundMail
} from "../../../lib/admin-mail-runtime";

const text = (value: FormDataEntryValue | null): string => typeof value === "string" ? value : "";

async function requireMailAdmin(csrfToken: string) {
  const principal = await getAdminSession();
  if (!principal) throw new Error("Admin session required");
  assertAdminPermission(principal, "notifications.manage");
  assertAdminCsrf(principal, csrfToken);
  if (!productionDatabaseConfigured()) throw new Error("Production database is required");
  return principal;
}

function safeMessageId(value: string): string {
  const id = value.trim();
  if (!/^mail_[a-f0-9]{32}$/i.test(id)) throw new Error("Invalid mail message id");
  return id;
}

function redirectWithError(error: unknown, compose = false): never {
  const raw = error instanceof Error ? error.message : "Mail operation failed";
  const safe = raw.replace(/[\r\n]+/g, " ").slice(0, 240);
  const params = new URLSearchParams({ error: safe });
  if (compose) params.set("compose", "1");
  redirect(`/admin/mail?${params.toString()}`);
}

export async function syncMailboxAction(formData: FormData) {
  const principal = await requireMailAdmin(text(formData.get("csrfToken")));
  try {
    const result = await syncAdminInboundMail({ maxNew: 80 });
    try {
      await recordAdminAudit(principal, "admin_mail.inbound_sync", "admin_mailbox", "ses-s3", "Manual Admin mailbox sync", {
        indexed: result.indexed,
        scanned: result.scanned,
        failed: result.failed
      });
    } catch (auditError) {
      console.error(JSON.stringify({
        level: "error",
        event: "admin_mail.sync_audit_failed",
        message: auditError instanceof Error ? auditError.message : String(auditError)
      }));
    }
    revalidatePath("/admin/mail");
  } catch (error) {
    redirectWithError(error);
  }
}

export async function sendMailAction(formData: FormData) {
  const principal = await requireMailAdmin(text(formData.get("csrfToken")));
  const attachments = formData.getAll("attachments").filter((value): value is File => value instanceof File && value.size > 0);
  let result: Awaited<ReturnType<typeof sendAdminMail>>;
  try {
    result = await sendAdminMail(principal, {
      from: text(formData.get("from")),
      to: text(formData.get("to")),
      cc: text(formData.get("cc")),
      bcc: text(formData.get("bcc")),
      subject: text(formData.get("subject")),
      text: text(formData.get("body")),
      inReplyToId: text(formData.get("inReplyToId")) || undefined,
      attachments
    });
  } catch (error) {
    redirectWithError(error, true);
  }

  try {
    await recordAdminAudit(principal, "admin_mail.sent", "admin_mail_message", result.publicId, "Sent from Admin Mail through AWS SES", {
      provider: "ses",
      providerMessageId: result.providerMessageId,
      recipientCount: [text(formData.get("to")), text(formData.get("cc")), text(formData.get("bcc"))]
        .join(",")
        .split(/[;,\n]+/)
        .filter((value) => value.trim()).length,
      attachmentCount: attachments.length,
      reply: Boolean(text(formData.get("inReplyToId")))
    });
  } catch (auditError) {
    // SES already accepted the message. Audit degradation must not invite a duplicate send.
    console.error(JSON.stringify({
      level: "error",
      event: "admin_mail.sent_audit_failed",
      publicId: result.publicId,
      providerMessageId: result.providerMessageId,
      message: auditError instanceof Error ? auditError.message : String(auditError)
    }));
  }
  revalidatePath("/admin/mail");
  redirect(`/admin/mail?folder=sent&message=${encodeURIComponent(result.publicId)}&sent=1`);
}

export async function toggleReadMailAction(formData: FormData) {
  const principal = await requireMailAdmin(text(formData.get("csrfToken")));
  const messageId = safeMessageId(text(formData.get("messageId")));
  const next = text(formData.get("value")) === "true";
  await markAdminMailRead(principal, messageId, next);
  await recordAdminAudit(principal, next ? "admin_mail.read" : "admin_mail.unread", "admin_mail_message", messageId, "Admin mailbox state change");
  revalidatePath("/admin/mail");
}

export async function toggleStarMailAction(formData: FormData) {
  const principal = await requireMailAdmin(text(formData.get("csrfToken")));
  const messageId = safeMessageId(text(formData.get("messageId")));
  const next = text(formData.get("value")) === "true";
  await starAdminMail(principal, messageId, next);
  await recordAdminAudit(principal, next ? "admin_mail.starred" : "admin_mail.unstarred", "admin_mail_message", messageId, "Admin mailbox state change");
  revalidatePath("/admin/mail");
}

export async function toggleArchiveMailAction(formData: FormData) {
  const principal = await requireMailAdmin(text(formData.get("csrfToken")));
  const messageId = safeMessageId(text(formData.get("messageId")));
  const next = text(formData.get("value")) === "true";
  await archiveAdminMail(principal, messageId, next);
  await recordAdminAudit(principal, next ? "admin_mail.archived" : "admin_mail.restored", "admin_mail_message", messageId, "Admin mailbox state change");
  revalidatePath("/admin/mail");
}
