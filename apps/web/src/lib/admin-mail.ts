import { createHash, randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { S3ObjectStorage } from "@buy-local-sparta/object-storage";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, recordAdminAudit, recordAdminPersonalDataAccess } from "./admin-runtime";
import { adminMailThreadKey, buildAdminMailRawMime, parseAdminMailMime, type AdminMailAddress } from "./admin-mail-mime";
import { sendRawSesEmail, sesMailConfigFromEnv, sesMailConfigured } from "./admin-mail-ses";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type AdminMailFolder = "inbox" | "sent" | "starred" | "archive" | "all";
export type AdminMailDeliveryStatus = "received" | "draft" | "queued" | "sending" | "sent" | "delivered" | "bounced" | "complained" | "failed";
export type AdminMailListItem = Readonly<{
  id: string;
  direction: "inbound" | "outbound";
  from: AdminMailAddress;
  to: readonly AdminMailAddress[];
  subject: string;
  preview: string;
  isRead: boolean;
  isStarred: boolean;
  archived: boolean;
  hasAttachments: boolean;
  attachmentCount: number;
  deliveryStatus: AdminMailDeliveryStatus;
  occurredAt: number;
}>;
export type AdminMailAttachment = Readonly<{
  partIndex: number;
  filename: string;
  contentType: string;
  byteSize: number;
  contentId?: string;
}>;
export type AdminMailMessage = AdminMailListItem & Readonly<{
  cc: readonly AdminMailAddress[];
  bcc: readonly AdminMailAddress[];
  replyTo: readonly AdminMailAddress[];
  bodyText?: string;
  bodyHtml?: string;
  internetMessageId?: string;
  inReplyTo?: string;
  references: readonly string[];
  providerMessageId?: string;
  attachments: readonly AdminMailAttachment[];
}>;
export type AdminMailReadiness = Readonly<{
  database: boolean;
  inbound: boolean;
  outbound: boolean;
  bucket?: string;
  inboundPrefix?: string;
  from?: string;
}>;
export type AdminMailWorkspace = Readonly<{
  readiness: AdminMailReadiness;
  counts: Readonly<{ inbox: number; unread: number; sent: number; starred: number; archive: number }>;
  messages: readonly AdminMailListItem[];
  sync?: Readonly<{
    lastStartedAt?: number;
    lastCompletedAt?: number;
    lastSuccessAt?: number;
    lastError?: string;
    scannedObjects: number;
    importedMessages: number;
  }>;
}>;

type MailConfig = Readonly<{
  enabled: boolean;
  bucket?: string;
  region?: string;
  endpoint?: string;
  forcePathStyle: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  inboundPrefix: string;
  outboundPrefix: string;
  composePrefix: string;
  fromAddress?: string;
  fromName?: string;
  replyTo?: string;
  messageIdDomain: string;
  maxRawBytes: number;
  maxAttachmentBytes: number;
  maxComposeBytes: number;
}>;

const globals = globalThis as typeof globalThis & { __blsAdminMailStorage?: S3ObjectStorage };

function uow() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 20_000, lockTimeoutMs: 5_000 });
}

export function adminMailReadiness(env: NodeJS.ProcessEnv = process.env): AdminMailReadiness {
  const config = mailConfigFromEnv(env, false);
  const database = productionDatabaseConfigured(env);
  const storage = Boolean(config.bucket && config.region && config.accessKeyId && config.secretAccessKey);
  return {
    database,
    inbound: database && config.enabled && storage,
    outbound: database && config.enabled && storage && sesMailConfigured(env) && Boolean(config.fromAddress),
    bucket: config.bucket,
    inboundPrefix: config.inboundPrefix,
    from: config.fromAddress
  };
}

export async function adminMailWorkspace(
  principal: SessionPrincipal,
  input: { folder?: AdminMailFolder; query?: string; limit?: number; offset?: number } = {}
): Promise<AdminMailWorkspace> {
  assertAdminPermission(principal, "notifications.manage");
  const readiness = adminMailReadiness();
  if (!readiness.database) return { readiness, counts: { inbox: 0, unread: 0, sent: 0, starred: 0, archive: 0 }, messages: [] };

  const folder = normalizeFolder(input.folder);
  const query = input.query?.trim().slice(0, 200) || "";
  const limit = Math.max(20, Math.min(100, Math.trunc(input.limit ?? 60)));
  const offset = Math.max(0, Math.min(10_000, Math.trunc(input.offset ?? 0)));
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const countResult = await tx.query<SqlRow>(`
      SELECT
        count(*) FILTER (WHERE direction='inbound' AND archived_at IS NULL AND deleted_at IS NULL) AS inbox,
        count(*) FILTER (WHERE direction='inbound' AND is_read=false AND archived_at IS NULL AND deleted_at IS NULL) AS unread,
        count(*) FILTER (WHERE direction='outbound' AND deleted_at IS NULL) AS sent,
        count(*) FILTER (WHERE is_starred=true AND deleted_at IS NULL) AS starred,
        count(*) FILTER (WHERE archived_at IS NOT NULL AND deleted_at IS NULL) AS archive
      FROM admin_mail_messages
    `);
    const params: unknown[] = [];
    const where: string[] = ["deleted_at IS NULL"];
    if (folder === "inbox") where.push("direction='inbound'", "archived_at IS NULL");
    else if (folder === "sent") where.push("direction='outbound'", "archived_at IS NULL");
    else if (folder === "starred") where.push("is_starred=true");
    else if (folder === "archive") where.push("archived_at IS NOT NULL");
    if (query) {
      params.push(`%${query}%`);
      where.push(`(subject ILIKE $${params.length} OR from_address ILIKE $${params.length} OR body_preview ILIKE $${params.length} OR to_addresses::text ILIKE $${params.length})`);
    }
    params.push(limit, offset);
    const list = await tx.query<SqlRow>(`
      SELECT public_id,direction,from_address,from_name,to_addresses,subject,body_preview,is_read,is_starred,
             archived_at,has_attachments,attachment_count,delivery_status,received_at,sent_at,created_at
      FROM admin_mail_messages
      WHERE ${where.join(" AND ")}
      ORDER BY COALESCE(received_at,sent_at,created_at) DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    const sync = await tx.query<SqlRow>(`
      SELECT last_sync_started_at,last_sync_completed_at,last_success_at,last_error,scanned_objects,imported_messages
      FROM admin_mail_sync_state WHERE source='ses_s3_inbound'
    `);
    const counts = countResult.rows[0] ?? {};
    return {
      readiness,
      counts: {
        inbox: integer(counts.inbox),
        unread: integer(counts.unread),
        sent: integer(counts.sent),
        starred: integer(counts.starred),
        archive: integer(counts.archive)
      },
      messages: list.rows.map(mapListItem),
      sync: sync.rowCount ? mapSync(sync.rows[0]) : undefined
    };
  }, { readOnly: true });
}

export async function adminMailThread(principal: SessionPrincipal, messageId: string): Promise<{ selectedId: string; messages: readonly AdminMailMessage[] }> {
  assertAdminPermission(principal, "notifications.manage");
  requireDatabase();
  const publicId = cleanPublicId(messageId);
  const result = await uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const selected = await tx.query<SqlRow>(`SELECT thread_key FROM admin_mail_messages WHERE public_id=$1 AND deleted_at IS NULL LIMIT 1`, [publicId]);
    if (!selected.rowCount) throw new Error("Email message not found");
    const threadKey = text(selected.rows[0].thread_key);
    const messages = await tx.query<SqlRow>(`
      SELECT id::text AS message_uuid,public_id,direction,provider_message_id,internet_message_id,in_reply_to,references_header,
             from_address,from_name,to_addresses,cc_addresses,bcc_addresses,reply_to_addresses,subject,body_text,body_html,
             body_preview,is_read,is_starred,archived_at,has_attachments,attachment_count,delivery_status,received_at,sent_at,created_at
      FROM admin_mail_messages
      WHERE thread_key=$1 AND deleted_at IS NULL
      ORDER BY COALESCE(received_at,sent_at,created_at),created_at
    `, [threadKey]);
    const uuids = messages.rows.map((row) => text(row.message_uuid));
    const attachments = uuids.length ? await tx.query<SqlRow>(`
      SELECT message_id::text AS message_uuid,part_index,filename,content_type,byte_size,content_id
      FROM admin_mail_attachments WHERE message_id = ANY($1::uuid[]) ORDER BY message_id,part_index
    `, [uuids]) : { rows: [] as readonly SqlRow[], rowCount: 0 };
    const byMessage = new Map<string, AdminMailAttachment[]>();
    for (const row of attachments.rows) {
      const key = text(row.message_uuid);
      const collection = byMessage.get(key) ?? [];
      collection.push(mapAttachment(row));
      byMessage.set(key, collection);
    }
    return messages.rows.map((row) => mapMessage(row, byMessage.get(text(row.message_uuid)) ?? []));
  }, { readOnly: true });

  await recordAdminPersonalDataAccess(principal, {
    route: `/api/admin/mail/${publicId}`,
    resourceType: "admin_mail_message",
    resourceId: publicId,
    purpose: "customer_support",
    dataClasses: ["email_address", "message_content", "attachment_metadata"],
    recordCount: result.length,
    accessScope: result.length > 1 ? "bulk" : "individual"
  }).catch(() => undefined);
  return { selectedId: publicId, messages: result };
}

export async function updateAdminMailMessage(
  principal: SessionPrincipal,
  messageId: string,
  action: "mark_read" | "mark_unread" | "star" | "unstar" | "archive" | "restore" | "delete"
): Promise<{ ok: true }> {
  assertAdminPermission(principal, "notifications.manage");
  requireDatabase();
  const publicId = cleanPublicId(messageId);
  const setters: Record<typeof action, string> = {
    mark_read: "is_read=true",
    mark_unread: "is_read=false",
    star: "is_starred=true",
    unstar: "is_starred=false",
    archive: "archived_at=COALESCE(archived_at,now())",
    restore: "archived_at=NULL",
    delete: "deleted_at=COALESCE(deleted_at,now())"
  };
  await uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query(`UPDATE admin_mail_messages SET ${setters[action]},updated_at=now() WHERE public_id=$1 AND deleted_at IS NULL`, [publicId]);
    if (!result.rowCount) throw new Error("Email message not found");
  }, { isolation: "serializable" });
  await recordAdminAudit(principal, `admin_mail.${action}`, "admin_mail_message", publicId, "Admin mailbox action", { action }).catch(() => undefined);
  return { ok: true };
}

export async function syncAdminInboundMail(principal: SessionPrincipal, input: { maxObjects?: number } = {}) {
  assertAdminPermission(principal, "notifications.manage");
  requireDatabase();
  const config = mailConfigFromEnv();
  const storage = mailStorage(config);
  const maxObjects = Math.max(1, Math.min(250, Math.trunc(input.maxObjects ?? 100)));
  const startedAt = Date.now();
  await saveSyncStart(principal, startedAt);

  let scanned = 0;
  let imported = 0;
  const failures: string[] = [];
  try {
    let continuationToken: string | undefined;
    const objects: { objectKey: string; etag?: string; byteSize: number; lastModifiedAt?: number }[] = [];
    while (objects.length < maxObjects) {
      const page = await storage.list({
        prefix: config.inboundPrefix,
        continuationToken,
        maxKeys: Math.min(250, maxObjects - objects.length)
      });
      objects.push(...page.items.filter((item) => !item.objectKey.endsWith("/")));
      continuationToken = page.nextContinuationToken;
      if (!continuationToken || page.items.length === 0) break;
    }
    scanned = objects.length;
    const keys = objects.map((item) => item.objectKey);
    const existing = keys.length
      ? await uow().withTransaction(platformScope(principal.userId), async (tx) => tx.query<SqlRow>(
          `SELECT raw_object_key FROM admin_mail_messages WHERE raw_bucket=$1 AND raw_object_key = ANY($2::text[])`,
          [config.bucket, keys]
        ), { readOnly: true })
      : { rows: [] as readonly SqlRow[], rowCount: 0 };
    const known = new Set(existing.rows.map((row) => text(row.raw_object_key)));

    for (const object of objects) {
      if (known.has(object.objectKey)) continue;
      if (object.byteSize > config.maxRawBytes) {
        failures.push(`${object.objectKey}: raw message exceeds ${config.maxRawBytes} bytes`);
        continue;
      }
      try {
        const stored = await storage.read(object.objectKey);
        const raw = await readStream(stored.stream, config.maxRawBytes);
        const parsed = parseAdminMailMime(raw);
        const publicId = `mail_${randomUUID()}`;
        const threadKey = adminMailThreadKey(parsed);
        const receivedAt = parsed.date ?? object.lastModifiedAt ?? Date.now();
        const rawSha256 = createHash("sha256").update(raw).digest("hex");
        await uow().withTransaction(platformScope(principal.userId), async (tx) => {
          const insert = await tx.query<SqlRow>(`
            INSERT INTO admin_mail_messages(
              public_id,direction,provider,internet_message_id,thread_key,in_reply_to,references_header,
              from_address,from_name,to_addresses,cc_addresses,bcc_addresses,reply_to_addresses,subject,
              body_text,body_html,body_preview,raw_bucket,raw_object_key,raw_etag,raw_sha256,
              has_attachments,attachment_count,is_read,delivery_status,received_at
            )
            VALUES($1,'inbound','ses',$2,$3,$4,$5::text[],$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,
                   $13,$14,$15,$16,$17,$18,$19,$20,$21,false,'received',to_timestamp($22::double precision/1000.0))
            ON CONFLICT (raw_bucket,raw_object_key) WHERE raw_bucket IS NOT NULL AND raw_object_key IS NOT NULL
            DO NOTHING
            RETURNING id::text AS message_uuid
          `, [
            publicId, parsed.internetMessageId ?? null, threadKey, parsed.inReplyTo ?? null, parsed.references,
            parsed.from.address, parsed.from.name ?? null, JSON.stringify(parsed.to), JSON.stringify(parsed.cc),
            JSON.stringify(parsed.bcc), JSON.stringify(parsed.replyTo), truncate(parsed.subject, 998),
            nullableTruncate(parsed.text, 500_000), nullableTruncate(parsed.html, 1_000_000),
            preview(parsed.text || parsed.subject), config.bucket, object.objectKey, object.etag ?? stored.etag ?? null, rawSha256,
            parsed.attachments.length > 0, parsed.attachments.length, receivedAt
          ]);
          if (!insert.rowCount) return;
          const messageUuid = text(insert.rows[0].message_uuid);
          for (const attachment of parsed.attachments) {
            await tx.query(`
              INSERT INTO admin_mail_attachments(message_id,part_index,filename,content_type,byte_size,content_id,disposition)
              VALUES($1::uuid,$2,$3,$4,$5,$6,$7)
              ON CONFLICT(message_id,part_index) DO NOTHING
            `, [messageUuid, attachment.partIndex, attachment.filename, attachment.contentType, attachment.byteSize, attachment.contentId ?? null, attachment.disposition ?? null]);
          }
          imported += 1;
        }, { isolation: "serializable" });
      } catch (error) {
        failures.push(`${object.objectKey}: ${message(error)}`);
      }
    }
    await saveSyncFinish(principal, { startedAt, scanned, imported, error: failures.length ? failures.slice(0, 3).join(" | ") : undefined, success: true });
    await recordAdminAudit(principal, "admin_mail.inbound_sync", "admin_mailbox", "ses_s3_inbound", "Admin mailbox S3 synchronization", { scanned, imported, failures: failures.length }).catch(() => undefined);
    return { ok: true, scanned, imported, failed: failures.length, warnings: failures.slice(0, 5) };
  } catch (error) {
    await saveSyncFinish(principal, { startedAt, scanned, imported, error: message(error), success: false }).catch(() => undefined);
    throw error;
  }
}

export async function createAdminMailAttachmentUpload(
  principal: SessionPrincipal,
  input: { filename: string; contentType: string; byteSize: number }
): Promise<{ objectKey: string; uploadUrl: string; headers: Readonly<Record<string, string>>; expiresInSeconds: number }> {
  assertAdminPermission(principal, "notifications.manage");
  const config = mailConfigFromEnv();
  const filename = cleanFilename(input.filename);
  const contentType = cleanContentType(input.contentType);
  const byteSize = Math.trunc(Number(input.byteSize));
  if (!Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > config.maxAttachmentBytes) {
    throw new Error(`Attachment must be between 1 and ${config.maxAttachmentBytes} bytes`);
  }
  const date = new Date().toISOString().slice(0, 10);
  const actor = createHash("sha256").update(principal.userId).digest("hex").slice(0, 12);
  const objectKey = `${config.composePrefix}${date}/${actor}/${randomUUID()}-${filename}`;
  const signed = await mailStorage(config).createUploadUrl({ objectKey, contentType, expiresInSeconds: 600 });
  return { objectKey, uploadUrl: signed.url, headers: signed.headers, expiresInSeconds: signed.expiresInSeconds };
}

export async function sendAdminMail(principal: SessionPrincipal, input: {
  to: readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
  subject: string;
  text: string;
  replyToMessageId?: string;
  attachments?: readonly Readonly<{ objectKey: string; filename: string; contentType: string; byteSize: number }>[];
}): Promise<{ id: string; providerMessageId: string }> {
  assertAdminPermission(principal, "notifications.manage");
  requireDatabase();
  const config = mailConfigFromEnv();
  if (!adminMailReadiness().outbound || !config.fromAddress) throw new Error("SES mailbox sending is not configured");

  const to = normalizeRecipients(input.to, 50);
  const cc = normalizeRecipients(input.cc ?? [], 50);
  const bcc = normalizeRecipients(input.bcc ?? [], 50);
  if (!to.length && !cc.length && !bcc.length) throw new Error("At least one recipient is required");
  if (to.length + cc.length + bcc.length > 50) throw new Error("A maximum of 50 recipients is allowed per message");
  const subject = cleanSubject(input.subject);
  const body = input.text.trim();
  if (!body || body.length > 500_000) throw new Error("Message must be between 1 and 500,000 characters");

  let parent: { internetMessageId?: string; references: readonly string[]; threadKey?: string } | undefined;
  if (input.replyToMessageId?.trim()) {
    parent = await uow().withTransaction(platformScope(principal.userId), async (tx) => {
      const result = await tx.query<SqlRow>(`
        SELECT internet_message_id,references_header,thread_key FROM admin_mail_messages
        WHERE public_id=$1 AND deleted_at IS NULL LIMIT 1
      `, [cleanPublicId(input.replyToMessageId!)]);
      if (!result.rowCount) throw new Error("Reply parent message not found");
      return {
        internetMessageId: optionalText(result.rows[0].internet_message_id),
        references: stringArray(result.rows[0].references_header),
        threadKey: text(result.rows[0].thread_key)
      };
    }, { readOnly: true });
  }

  const uploaded = input.attachments ?? [];
  if (uploaded.length > 20) throw new Error("A maximum of 20 attachments is allowed");
  let totalAttachmentBytes = 0;
  const attachments: { filename: string; contentType: string; bytes: Uint8Array }[] = [];
  const storage = mailStorage(config);
  for (const item of uploaded) {
    if (!item.objectKey.startsWith(config.composePrefix)) throw new Error("Invalid attachment object key");
    const filename = cleanFilename(item.filename);
    const contentType = cleanContentType(item.contentType);
    const metadata = await storage.head(item.objectKey);
    if (!metadata) throw new Error(`Attachment is no longer available: ${filename}`);
    if (metadata.byteSize > config.maxAttachmentBytes) throw new Error(`Attachment is too large: ${filename}`);
    totalAttachmentBytes += metadata.byteSize;
    if (totalAttachmentBytes > config.maxComposeBytes) throw new Error("Total attachments exceed the message size limit");
    const stored = await storage.read(item.objectKey);
    attachments.push({ filename, contentType, bytes: await readStream(stored.stream, config.maxAttachmentBytes) });
  }

  const from: AdminMailAddress = { address: config.fromAddress, name: config.fromName };
  const references = [...(parent?.references ?? []), ...(parent?.internetMessageId ? [parent.internetMessageId] : [])]
    .filter((value, index, all) => value && all.indexOf(value) === index);
  const built = buildAdminMailRawMime({
    from,
    to: to.map((address) => ({ address })),
    cc: cc.map((address) => ({ address })),
    bcc: bcc.map((address) => ({ address })),
    replyTo: config.replyTo ? [{ address: config.replyTo }] : undefined,
    subject,
    text: body,
    html: simpleHtml(body),
    internetMessageIdDomain: config.messageIdDomain,
    inReplyTo: parent?.internetMessageId,
    references,
    attachments
  });
  if (built.raw.byteLength > config.maxRawBytes) throw new Error("Composed MIME message exceeds the configured raw message limit");
  const parsed = parseAdminMailMime(built.raw);
  const publicId = `mail_${randomUUID()}`;
  const threadKey = parent?.threadKey || adminMailThreadKey({ subject, internetMessageId: built.internetMessageId });
  const now = Date.now();
  const datePath = new Date(now).toISOString().slice(0, 10).replaceAll("-", "/");
  const rawObjectKey = `${config.outboundPrefix}${datePath}/${publicId}.eml`;
  const rawSha256 = createHash("sha256").update(built.raw).digest("hex");

  const messageUuid = await uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const actor = await actorUuid(tx, principal);
    const result = await tx.query<SqlRow>(`
      INSERT INTO admin_mail_messages(
        public_id,direction,provider,internet_message_id,thread_key,in_reply_to,references_header,
        from_address,from_name,to_addresses,cc_addresses,bcc_addresses,reply_to_addresses,subject,
        body_text,body_html,body_preview,raw_bucket,raw_object_key,raw_sha256,has_attachments,attachment_count,
        is_read,delivery_status,created_by_user_id
      )
      VALUES($1,'outbound','ses',$2,$3,$4,$5::text[],$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,
             $12,$13,$14,$15,$16,$17,$18,$19,$20,true,'sending',$21::uuid)
      RETURNING id::text AS message_uuid
    `, [
      publicId, built.internetMessageId, threadKey, parent?.internetMessageId ?? null, references,
      config.fromAddress, config.fromName ?? null, JSON.stringify(to.map((address) => ({ address }))),
      JSON.stringify(cc.map((address) => ({ address }))), JSON.stringify(bcc.map((address) => ({ address }))),
      JSON.stringify(config.replyTo ? [{ address: config.replyTo }] : []), subject, body, simpleHtml(body), preview(body),
      config.bucket, rawObjectKey, rawSha256, parsed.attachments.length > 0, parsed.attachments.length, actor
    ]);
    const uuid = text(result.rows[0].message_uuid);
    for (const attachment of parsed.attachments) {
      await tx.query(`
        INSERT INTO admin_mail_attachments(message_id,part_index,filename,content_type,byte_size,content_id,disposition)
        VALUES($1::uuid,$2,$3,$4,$5,$6,$7)
      `, [uuid, attachment.partIndex, attachment.filename, attachment.contentType, attachment.byteSize, attachment.contentId ?? null, attachment.disposition ?? null]);
    }
    return uuid;
  }, { isolation: "serializable" });

  try {
    const archived = await storage.put({ objectKey: rawObjectKey, body: built.raw, contentType: "message/rfc822" });
    const delivery = await sendRawSesEmail({
      config: sesMailConfigFromEnv(),
      raw: built.raw,
      from: config.fromName ? `${config.fromName} <${config.fromAddress}>` : config.fromAddress,
      to,
      cc,
      bcc
    });
    await uow().withTransaction(platformScope(principal.userId), async (tx) => {
      await tx.query(`
        UPDATE admin_mail_messages
        SET provider_message_id=$2,raw_etag=$3,delivery_status='sent',sent_at=now(),updated_at=now(),
            delivery_detail=jsonb_build_object('sesMessageId',$2)
        WHERE id=$1::uuid
      `, [messageUuid, delivery.providerMessageId, archived.etag ?? null]);
    }, { isolation: "serializable" });
    for (const item of uploaded) await storage.delete(item.objectKey).catch(() => undefined);
    await recordAdminAudit(principal, "admin_mail.sent", "admin_mail_message", publicId, "Admin mailbox SES send", {
      provider: "ses", providerMessageId: delivery.providerMessageId, recipients: to.length + cc.length + bcc.length, attachments: parsed.attachments.length
    }).catch(() => undefined);
    return { id: publicId, providerMessageId: delivery.providerMessageId };
  } catch (error) {
    await uow().withTransaction(platformScope(principal.userId), async (tx) => {
      await tx.query(`
        UPDATE admin_mail_messages SET delivery_status='failed',delivery_detail=jsonb_build_object('error',$2),updated_at=now()
        WHERE id=$1::uuid
      `, [messageUuid, truncate(message(error), 1000)]);
    }, { isolation: "serializable" }).catch(() => undefined);
    throw error;
  }
}

export async function readAdminMailAttachment(principal: SessionPrincipal, messageId: string, partIndexRaw: number) {
  assertAdminPermission(principal, "notifications.manage");
  requireDatabase();
  const publicId = cleanPublicId(messageId);
  const partIndex = Math.trunc(partIndexRaw);
  if (!Number.isSafeInteger(partIndex) || partIndex < 0 || partIndex > 10_000) throw new Error("Invalid attachment part");
  const metadata = await uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT m.raw_bucket,m.raw_object_key,a.filename,a.content_type,a.byte_size
      FROM admin_mail_messages m
      JOIN admin_mail_attachments a ON a.message_id=m.id
      WHERE m.public_id=$1 AND a.part_index=$2 AND m.deleted_at IS NULL LIMIT 1
    `, [publicId, partIndex]);
    if (!result.rowCount) throw new Error("Attachment not found");
    return result.rows[0];
  }, { readOnly: true });
  const config = mailConfigFromEnv();
  if (text(metadata.raw_bucket) !== config.bucket) throw new Error("Attachment storage bucket mismatch");
  const stored = await mailStorage(config).read(text(metadata.raw_object_key));
  const raw = await readStream(stored.stream, config.maxRawBytes);
  const parsed = parseAdminMailMime(raw);
  const attachment = parsed.attachments.find((item) => item.partIndex === partIndex);
  if (!attachment) throw new Error("Attachment part is missing from raw message");
  await recordAdminPersonalDataAccess(principal, {
    eventType: "personal_data.exported",
    route: `/api/admin/mail/${publicId}/attachment/${partIndex}`,
    resourceType: "admin_mail_attachment",
    resourceId: `${publicId}:${partIndex}`,
    purpose: "customer_support",
    dataClasses: ["email_attachment"],
    recordCount: 1
  }).catch(() => undefined);
  return {
    filename: cleanFilename(text(metadata.filename) || attachment.filename),
    contentType: cleanContentType(text(metadata.content_type) || attachment.contentType),
    bytes: attachment.bytes
  };
}

function mailConfigFromEnv(env: NodeJS.ProcessEnv = process.env, strict = true): MailConfig {
  const enabled = env.BLS_MAIL_ENABLED === "true";
  const bucket = env.BLS_MAIL_S3_BUCKET?.trim() || undefined;
  const region = env.BLS_MAIL_AWS_REGION?.trim() || env.AWS_REGION?.trim() || undefined;
  const accessKeyId = env.BLS_MAIL_S3_ACCESS_KEY_ID?.trim() || env.BLS_MAIL_AWS_ACCESS_KEY_ID?.trim() || env.AWS_ACCESS_KEY_ID?.trim() || undefined;
  const secretAccessKey = env.BLS_MAIL_S3_SECRET_ACCESS_KEY?.trim() || env.BLS_MAIL_AWS_SECRET_ACCESS_KEY?.trim() || env.AWS_SECRET_ACCESS_KEY?.trim() || undefined;
  const sessionToken = env.BLS_MAIL_S3_SESSION_TOKEN?.trim() || env.BLS_MAIL_AWS_SESSION_TOKEN?.trim() || env.AWS_SESSION_TOKEN?.trim() || undefined;
  const endpoint = env.BLS_MAIL_S3_ENDPOINT?.trim() || undefined;
  const forcePathStyle = env.BLS_MAIL_S3_FORCE_PATH_STYLE === "true";
  const fromAddress = optionalEmail(env.BLS_MAIL_FROM);
  const replyTo = optionalEmail(env.BLS_MAIL_REPLY_TO);
  const config: MailConfig = {
    enabled,
    bucket,
    region,
    endpoint,
    forcePathStyle,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    inboundPrefix: cleanPrefix(env.BLS_MAIL_S3_INBOUND_PREFIX, "incoming/"),
    outboundPrefix: cleanPrefix(env.BLS_MAIL_S3_OUTBOUND_PREFIX, "outgoing/"),
    composePrefix: cleanPrefix(env.BLS_MAIL_S3_COMPOSE_PREFIX, "compose/"),
    fromAddress,
    fromName: env.BLS_MAIL_FROM_NAME?.trim().slice(0, 120) || undefined,
    replyTo,
    messageIdDomain: cleanDomain(env.BLS_MAIL_MESSAGE_ID_DOMAIN || "kontamou.site"),
    maxRawBytes: positiveInteger(env.BLS_MAIL_MAX_RAW_BYTES, 40 * 1024 * 1024, "BLS_MAIL_MAX_RAW_BYTES"),
    maxAttachmentBytes: positiveInteger(env.BLS_MAIL_MAX_ATTACHMENT_BYTES, 20 * 1024 * 1024, "BLS_MAIL_MAX_ATTACHMENT_BYTES"),
    maxComposeBytes: positiveInteger(env.BLS_MAIL_MAX_COMPOSE_BYTES, 30 * 1024 * 1024, "BLS_MAIL_MAX_COMPOSE_BYTES")
  };
  if (strict) {
    if (!enabled) throw new Error("Admin SES/S3 mailbox is disabled");
    if (!bucket || !region || !accessKeyId || !secretAccessKey) throw new Error("Admin mail S3 bucket, region and AWS credentials are required");
  }
  return config;
}

function mailStorage(config: MailConfig): S3ObjectStorage {
  if (!config.bucket || !config.region) throw new Error("Admin mail S3 is not configured");
  if (!globals.__blsAdminMailStorage) {
    globals.__blsAdminMailStorage = new S3ObjectStorage({
      bucket: config.bucket,
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: config.sessionToken,
      uploadTtlSeconds: 600
    });
  }
  return globals.__blsAdminMailStorage;
}

async function saveSyncStart(principal: SessionPrincipal, startedAt: number) {
  await uow().withTransaction(platformScope(principal.userId), async (tx) => {
    await tx.query(`
      INSERT INTO admin_mail_sync_state(source,last_sync_started_at,updated_at)
      VALUES('ses_s3_inbound',to_timestamp($1::double precision/1000.0),now())
      ON CONFLICT(source) DO UPDATE SET last_sync_started_at=excluded.last_sync_started_at,last_error=NULL,updated_at=now()
    `, [startedAt]);
  }, { isolation: "serializable" });
}

async function saveSyncFinish(principal: SessionPrincipal, input: { startedAt: number; scanned: number; imported: number; error?: string; success: boolean }) {
  await uow().withTransaction(platformScope(principal.userId), async (tx) => {
    await tx.query(`
      INSERT INTO admin_mail_sync_state(source,last_sync_started_at,last_sync_completed_at,last_success_at,last_error,scanned_objects,imported_messages,updated_at)
      VALUES('ses_s3_inbound',to_timestamp($1::double precision/1000.0),now(),CASE WHEN $5 THEN now() ELSE NULL END,$2,$3,$4,now())
      ON CONFLICT(source) DO UPDATE SET
        last_sync_completed_at=now(),
        last_success_at=CASE WHEN $5 THEN now() ELSE admin_mail_sync_state.last_success_at END,
        last_error=$2,scanned_objects=$3,imported_messages=$4,updated_at=now()
    `, [input.startedAt, input.error ?? null, input.scanned, input.imported, input.success]);
  }, { isolation: "serializable" });
}

async function actorUuid(tx: SqlExecutor, principal: SessionPrincipal): Promise<string> {
  const result = await tx.query<SqlRow>(`SELECT id::text AS user_uuid FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1`, [principal.userId]);
  if (!result.rowCount) throw new Error("Platform actor not found");
  return text(result.rows[0].user_uuid);
}

async function readStream(stream: AsyncIterable<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxBytes) throw new Error(`Stored email object exceeds ${maxBytes} bytes`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function mapListItem(row: SqlRow): AdminMailListItem {
  const direction = text(row.direction) === "outbound" ? "outbound" : "inbound";
  return {
    id: text(row.public_id),
    direction,
    from: { address: text(row.from_address), name: optionalText(row.from_name) },
    to: addressArray(row.to_addresses),
    subject: text(row.subject) || "(no subject)",
    preview: text(row.body_preview),
    isRead: row.is_read === true,
    isStarred: row.is_starred === true,
    archived: Boolean(row.archived_at),
    hasAttachments: row.has_attachments === true,
    attachmentCount: integer(row.attachment_count),
    deliveryStatus: deliveryStatus(row.delivery_status),
    occurredAt: epoch(direction === "inbound" ? row.received_at : row.sent_at) ?? epoch(row.created_at) ?? 0
  };
}

function mapMessage(row: SqlRow, attachments: readonly AdminMailAttachment[]): AdminMailMessage {
  return {
    ...mapListItem(row),
    cc: addressArray(row.cc_addresses),
    bcc: addressArray(row.bcc_addresses),
    replyTo: addressArray(row.reply_to_addresses),
    bodyText: optionalText(row.body_text),
    bodyHtml: optionalText(row.body_html),
    internetMessageId: optionalText(row.internet_message_id),
    inReplyTo: optionalText(row.in_reply_to),
    references: stringArray(row.references_header),
    providerMessageId: optionalText(row.provider_message_id),
    attachments
  };
}

function mapAttachment(row: SqlRow): AdminMailAttachment {
  return {
    partIndex: integer(row.part_index),
    filename: text(row.filename),
    contentType: text(row.content_type) || "application/octet-stream",
    byteSize: integer(row.byte_size),
    contentId: optionalText(row.content_id)
  };
}

function mapSync(row: SqlRow) {
  return {
    lastStartedAt: epoch(row.last_sync_started_at),
    lastCompletedAt: epoch(row.last_sync_completed_at),
    lastSuccessAt: epoch(row.last_success_at),
    lastError: optionalText(row.last_error),
    scannedObjects: integer(row.scanned_objects),
    importedMessages: integer(row.imported_messages)
  };
}

function normalizeFolder(value?: string): AdminMailFolder {
  return value === "sent" || value === "starred" || value === "archive" || value === "all" ? value : "inbox";
}

function normalizeRecipients(values: readonly string[], limit: number): string[] {
  if (!Array.isArray(values) || values.length > limit) throw new Error("Too many email recipients");
  const result: string[] = [];
  for (const raw of values) {
    for (const candidate of String(raw).split(/[;,]/)) {
      const email = candidate.trim().toLowerCase();
      if (!email) continue;
      if (!validEmail(email)) throw new Error(`Invalid email address: ${candidate.trim().slice(0, 80)}`);
      if (!result.includes(email)) result.push(email);
    }
  }
  return result;
}

function optionalEmail(raw: string | undefined): string | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value) return undefined;
  if (!validEmail(value)) throw new Error("Configured mailbox email address is invalid");
  return value;
}

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}

function cleanPublicId(value: string): string {
  const result = value.trim();
  if (!/^mail_[A-Za-z0-9-]{12,80}$/.test(result)) throw new Error("Invalid email message id");
  return result;
}

function cleanSubject(value: string): string {
  const result = value.trim().replace(/[\r\n]+/g, " ");
  if (!result || result.length > 998) throw new Error("Subject must be between 1 and 998 characters");
  return result;
}

function cleanFilename(value: string): string {
  const result = value.replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim().slice(0, 180);
  return result || "attachment";
}

function cleanContentType(value: string): string {
  const result = value.trim().toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(result) ? result : "application/octet-stream";
}

function cleanPrefix(value: string | undefined, fallback: string): string {
  const result = (value?.trim() || fallback).replace(/^\/+/, "").replace(/\.\.(\/|\\)/g, "");
  return result.endsWith("/") ? result : `${result}/`;
}

function cleanDomain(value: string): string {
  const result = value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  return /^[a-z0-9.-]+$/.test(result) && result.includes(".") ? result : "kontamou.site";
}

function deliveryStatus(value: unknown): AdminMailDeliveryStatus {
  const result = text(value) as AdminMailDeliveryStatus;
  return ["received","draft","queued","sending","sent","delivered","bounced","complained","failed"].includes(result) ? result : "failed";
}

function addressArray(value: unknown): AdminMailAddress[] {
  const source = typeof value === "string" ? safeJsonArray(value) : Array.isArray(value) ? value : [];
  return source.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const address = text((entry as Record<string, unknown>).address).trim().toLowerCase();
    if (!validEmail(address)) return [];
    const name = optionalText((entry as Record<string, unknown>).name);
    return [{ address, name }];
  });
}

function safeJsonArray(value: string): unknown[] {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  if (typeof value === "string") {
    if (value.startsWith("{") && value.endsWith("}")) return value.slice(1, -1).split(",").map((item) => item.replace(/^"|"$/g, "").trim()).filter(Boolean);
    return value.trim() ? [value.trim()] : [];
  }
  return [];
}

function simpleHtml(value: string): string {
  return `<!doctype html><html><body><div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#191919;white-space:pre-wrap">${escapeHtml(value)}</div></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function preview(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 280);
}

function truncate(value: string, max: number): string { return value.length <= max ? value : value.slice(0, max); }
function nullableTruncate(value: string | undefined, max: number): string | null { return value ? truncate(value, max) : null; }
function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function optionalText(value: unknown): string | undefined { const result = text(value).trim(); return result || undefined; }
function integer(value: unknown): number { const result = Number(value ?? 0); return Number.isFinite(result) ? Math.max(0, Math.trunc(result)) : 0; }
function epoch(value: unknown): number | undefined { if (!value) return undefined; const result = value instanceof Date ? value.getTime() : new Date(String(value)).getTime(); return Number.isFinite(result) ? result : undefined; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function requireDatabase(): void { if (!productionDatabaseConfigured()) throw new Error("Admin mail requires the production PostgreSQL database"); }
function positiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
