import { randomUUID } from "node:crypto";
import { adminMailThreadKey, parseAdminMailMime, type AdminMailAddress } from "./admin-mail-mime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export async function indexDeliveredSesMail(input: {
  raw: Uint8Array;
  providerMessageId: string;
  sentAt?: number;
}): Promise<void> {
  if (!productionDatabaseConfigured()) return;
  const providerMessageId = input.providerMessageId.trim();
  if (!providerMessageId) throw new Error("SES provider message id is required for Sent indexing");

  const parsed = parseAdminMailMime(input.raw);
  const bodyText = parsed.text?.trim() || "(No readable text body.)";
  const publicId = `mail_${randomUUID().replace(/-/g, "")}`;
  const threadKey = adminMailThreadKey({
    subject: parsed.subject,
    internetMessageId: parsed.internetMessageId,
    inReplyTo: parsed.inReplyTo,
    references: parsed.references
  });
  const attachments = parsed.attachments.map((attachment, index) => ({
    index,
    filename: attachment.filename,
    contentType: attachment.contentType,
    byteSize: attachment.byteSize,
    inline: attachment.disposition === "inline"
  }));
  const sentAt = new Date(input.sentAt ?? Date.now());

  await getProductionPostgresRuntime().sqlPool.query(`
    INSERT INTO admin_mail_messages (
      public_id,direction,provider,transport_key,ses_message_id,rfc_message_id,in_reply_to,reference_ids,thread_key,
      from_address,to_addresses,cc_addresses,bcc_addresses,reply_to,subject,preview,body_text,
      has_attachments,attachment_count,attachments,status,sent_at
    ) VALUES (
      $1,'outgoing','ses',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,'sent',$19
    )
    ON CONFLICT (transport_key) DO NOTHING
  `, [
    publicId,
    `ses:${providerMessageId}`,
    providerMessageId,
    parsed.internetMessageId || null,
    parsed.inReplyTo || null,
    parsed.references,
    threadKey,
    displayMailAddress(parsed.from),
    parsed.to.map(displayMailAddress),
    parsed.cc.map(displayMailAddress),
    parsed.bcc.map(displayMailAddress),
    parsed.replyTo[0]?.address || null,
    parsed.subject,
    preview(bodyText),
    bodyText.slice(0, 1_000_000),
    attachments.length > 0,
    attachments.length,
    JSON.stringify(attachments),
    sentAt
  ]);
}

function displayMailAddress(value: AdminMailAddress): string {
  return value.name?.trim() ? `${value.name.trim()} <${value.address}>` : value.address;
}

function preview(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 280);
}
