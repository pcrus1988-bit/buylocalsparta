import { randomUUID } from "node:crypto";
import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { S3ObjectStorage, type StoredObjectListItem } from "@buy-local-sparta/object-storage";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { adminMailThreadKey, buildAdminMailRawMime, parseAdminMailMime, type AdminMailAddress, type ParsedAdminMail } from "./admin-mail-mime";
import { sendRawSesEmail, sesMailConfigFromEnv, type SesMailConfig } from "./admin-mail-ses";

const REQUIRED_REGION = "eu-north-1";
const DEFAULT_BUCKET = "kontamou-inbound-emails";
const DEFAULT_FROM = ["partners@kontamou.site", "info@kontamou.site"] as const;
const MAX_RAW_BYTES = 30 * 1024 * 1024;
const MAX_SYNC_PAGES_PER_RUN = 25;
const MAX_SYNC_NEW = 40;
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 3 * 1024 * 1024;

type MailFolder = "inbox" | "sent" | "starred" | "archive" | "all";

export type AdminMailSummary = Readonly<{
  id: string;
  direction: "incoming" | "outgoing";
  status: string;
  from: string;
  to: readonly string[];
  cc: readonly string[];
  subject: string;
  preview: string;
  sentAt?: number;
  receivedAt?: number;
  attachmentCount: number;
  spamVerdict?: string;
  virusVerdict?: string;
  isRead: boolean;
  isStarred: boolean;
  archived: boolean;
  threadKey: string;
}>;

export type AdminMailThreadMessage = AdminMailSummary & Readonly<{
  bodyText: string;
  replyTo?: string;
  rfcMessageId?: string;
  inReplyTo?: string;
  references: readonly string[];
  attachments: readonly Readonly<{ index: number; filename: string; contentType: string; byteSize: number; inline: boolean }>[];
}>;

export type AdminMailWorkspace = Readonly<{
  configured: boolean;
  configurationMessage: string;
  fromAddresses: readonly string[];
  folder: MailFolder;
  query: string;
  messages: readonly AdminMailSummary[];
  thread: readonly AdminMailThreadMessage[];
  selectedId?: string;
  metrics: Readonly<{ inbox: number; unread: number; sent: number; starred: number; archived: number; all: number }>;
  lastInboundAt?: number;
}>;

type MailConfig = Readonly<{
  region: string;
  bucket: string;
  prefix: string;
  fromAddresses: readonly string[];
  displayName: string;
  messageIdDomain: string;
  ses: SesMailConfig;
}>;

type MailRow = SqlRow & {
  public_id: string;
  direction: "incoming" | "outgoing";
  status: string;
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string;
  preview: string;
  body_text: string;
  sent_at: Date | string | null;
  received_at: Date | string | null;
  attachment_count: number | string;
  attachments: unknown;
  spam_verdict: string | null;
  virus_verdict: string | null;
  is_read: boolean | null;
  is_starred: boolean | null;
  archived_at: Date | string | null;
  thread_key: string;
  reply_to: string | null;
  rfc_message_id: string | null;
  in_reply_to: string | null;
  reference_ids: string[];
};

export function adminMailConfiguration(env: NodeJS.ProcessEnv = process.env): Readonly<{
  configured: boolean;
  message: string;
  fromAddresses: readonly string[];
}> {
  if (!productionDatabaseConfigured(env)) return { configured: false, message: "PostgreSQL is not configured.", fromAddresses: DEFAULT_FROM };
  try {
    const config = resolveMailConfig(env);
    return { configured: true, message: `SES + S3 ready in ${config.region} · ${config.bucket}`, fromAddresses: config.fromAddresses };
  } catch (error) {
    return { configured: false, message: error instanceof Error ? error.message : String(error), fromAddresses: DEFAULT_FROM };
  }
}

export async function syncAdminInboundMail(input: { maxNew?: number } = {}): Promise<{ indexed: number; scanned: number; failed: number }> {
  const config = resolveMailConfig();
  const storage = inboundStorage(config);
  const pool = getProductionPostgresRuntime().sqlPool;
  const maxNew = Math.max(1, Math.min(100, Math.floor(input.maxNew ?? MAX_SYNC_NEW)));
  const scope = `${config.bucket}:${config.prefix || "/"}`;
  const cursor = await pool.query<{ continuation_token: string | null }>(
    "SELECT continuation_token FROM admin_mail_sync_state WHERE scope=$1 LIMIT 1",
    [scope]
  );
  let continuationToken = cursor.rows[0]?.continuation_token || undefined;
  let indexed = 0;
  let scanned = 0;
  let failed = 0;
  let pages = 0;
  let recoveredStaleCursor = false;

  while (pages < MAX_SYNC_PAGES_PER_RUN && indexed < maxNew) {
    const remaining = Math.max(1, maxNew - indexed);
    let page: Awaited<ReturnType<S3ObjectStorage["list"]>>;
    try {
      page = await storage.list({
        prefix: config.prefix || undefined,
        maxKeys: Math.min(100, remaining),
        continuationToken
      });
    } catch (error) {
      if (continuationToken && !recoveredStaleCursor) {
        recoveredStaleCursor = true;
        continuationToken = undefined;
        await pool.query(
          "UPDATE admin_mail_sync_state SET continuation_token=NULL,updated_at=now() WHERE scope=$1",
          [scope]
        ).catch(() => undefined);
        continue;
      }
      throw error;
    }
    pages += 1;
    scanned += page.items.length;

    const eligible = page.items.filter((item) => item.byteSize > 0 && item.byteSize <= MAX_RAW_BYTES);
    if (eligible.length) {
      const keys = eligible.map((item) => item.objectKey);
      const existing = await pool.query<{ s3_object_key: string }>(
        "SELECT s3_object_key FROM admin_mail_messages WHERE s3_object_key = ANY($1::text[])",
        [keys]
      );
      const known = new Set(existing.rows.map((row) => row.s3_object_key));

      for (const object of eligible) {
        if (known.has(object.objectKey)) continue;
        try {
          const stored = await storage.read(object.objectKey);
          const bytes = await readStreamBounded(stored.stream, MAX_RAW_BYTES);
          const parsed = parseAdminMailMime(bytes);
          await persistInbound(parsed, object);
          indexed += 1;
          await pool.query("DELETE FROM admin_mail_ingest_failures WHERE s3_object_key=$1", [object.objectKey]).catch(() => undefined);
        } catch (error) {
          failed += 1;
          const errorMessage = (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, " ").slice(0, 1000);
          await pool.query(`
            INSERT INTO admin_mail_ingest_failures (s3_object_key,error_message,attempts,first_failed_at,last_failed_at)
            VALUES ($1,$2,1,now(),now())
            ON CONFLICT (s3_object_key) DO UPDATE
            SET error_message=EXCLUDED.error_message,
                attempts=admin_mail_ingest_failures.attempts+1,
                last_failed_at=now()
          `, [object.objectKey, errorMessage]);
        }
      }
    }

    continuationToken = page.nextContinuationToken;
    await pool.query(`
      INSERT INTO admin_mail_sync_state (scope,continuation_token,updated_at)
      VALUES ($1,$2,now())
      ON CONFLICT (scope) DO UPDATE
      SET continuation_token=EXCLUDED.continuation_token,updated_at=now()
    `, [scope, continuationToken || null]);

    if (!continuationToken) break;
  }

  return { indexed, scanned, failed };
}

export async function adminMailWorkspace(
  principal: SessionPrincipal,
  input: { folder?: string; q?: string; selectedId?: string } = {}
): Promise<AdminMailWorkspace> {
  const configuration = adminMailConfiguration();
  const folder = normalizeFolder(input.folder);
  const query = (input.q || "").trim().slice(0, 200);
  if (!configuration.configured) {
    return {
      configured: false,
      configurationMessage: configuration.message,
      fromAddresses: configuration.fromAddresses,
      folder,
      query,
      messages: [],
      thread: [],
      selectedId: input.selectedId,
      metrics: { inbox: 0, unread: 0, sent: 0, starred: 0, archived: 0, all: 0 }
    };
  }

  const pool = getProductionPostgresRuntime().sqlPool;
  if (input.selectedId && /^mail_[a-f0-9]{32}$/i.test(input.selectedId)) {
    await markAdminMailRead(principal, input.selectedId, true);
  }
  const metricsResult = await pool.query<SqlRow>(`
    SELECT
      count(*) FILTER (WHERE m.direction='incoming' AND COALESCE(s.archived_at IS NOT NULL,false)=false)::int AS inbox,
      count(*) FILTER (WHERE m.direction='incoming' AND COALESCE(s.archived_at IS NOT NULL,false)=false AND COALESCE(s.is_read,false)=false)::int AS unread,
      count(*) FILTER (WHERE m.direction='outgoing')::int AS sent,
      count(*) FILTER (WHERE COALESCE(s.is_starred,false)=true)::int AS starred,
      count(*) FILTER (WHERE s.archived_at IS NOT NULL)::int AS archived,
      count(*)::int AS all,
      max(m.received_at) FILTER (WHERE m.direction='incoming') AS last_inbound_at
    FROM admin_mail_messages m
    LEFT JOIN admin_mail_state s ON s.message_id=m.id AND s.user_public_id=$1
  `, [principal.userId]);
  const metric = metricsResult.rows[0] || {};

  const params: unknown[] = [principal.userId];
  const where: string[] = [];
  if (folder === "inbox") {
    where.push("m.direction='incoming'", "s.archived_at IS NULL");
  } else if (folder === "sent") where.push("m.direction='outgoing'");
  else if (folder === "starred") where.push("COALESCE(s.is_starred,false)=true");
  else if (folder === "archive") where.push("s.archived_at IS NOT NULL");
  if (query) {
    params.push(`%${query}%`);
    const index = params.length;
    where.push(`(m.subject ILIKE $${index} OR m.from_address ILIKE $${index} OR array_to_string(m.to_addresses,' ') ILIKE $${index} OR m.preview ILIKE $${index} OR m.body_text ILIKE $${index})`);
  }
  params.push(120);
  const limitParam = params.length;
  const list = await pool.query<MailRow>(`
    SELECT m.public_id,m.direction,m.status,m.from_address,m.to_addresses,m.cc_addresses,m.subject,m.preview,m.body_text,
           m.sent_at,m.received_at,m.attachment_count,m.attachments,m.spam_verdict,m.virus_verdict,m.thread_key,
           m.reply_to,m.rfc_message_id,m.in_reply_to,m.reference_ids,
           COALESCE(s.is_read,false) AS is_read,COALESCE(s.is_starred,false) AS is_starred,s.archived_at
    FROM admin_mail_messages m
    LEFT JOIN admin_mail_state s ON s.message_id=m.id AND s.user_public_id=$1
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY COALESCE(m.received_at,m.sent_at,m.created_at) DESC
    LIMIT $${limitParam}
  `, params);

  let messages = list.rows.map(projectSummary);
  const selectedId = input.selectedId && messages.some((message) => message.id === input.selectedId)
    ? input.selectedId
    : input.selectedId || messages[0]?.id;
  const autoSelected = !input.selectedId && selectedId
    ? messages.find((message) => message.id === selectedId)
    : undefined;
  const autoSelectedUnread = Boolean(autoSelected && !autoSelected.isRead);
  if (autoSelected && !autoSelected.isRead) {
    await markAdminMailRead(principal, autoSelected.id, true);
    messages = messages.map((message) => message.id === autoSelected.id ? { ...message, isRead: true } : message);
  }
  let thread: readonly AdminMailThreadMessage[] = [];
  if (selectedId) {
    const selected = await pool.query<{ thread_key: string }>("SELECT thread_key FROM admin_mail_messages WHERE public_id=$1 LIMIT 1", [selectedId]);
    const threadKey = selected.rows[0]?.thread_key;
    if (threadKey) {
      const rows = await pool.query<MailRow>(`
        SELECT m.public_id,m.direction,m.status,m.from_address,m.to_addresses,m.cc_addresses,m.subject,m.preview,m.body_text,
               m.sent_at,m.received_at,m.attachment_count,m.attachments,m.spam_verdict,m.virus_verdict,m.thread_key,
               m.reply_to,m.rfc_message_id,m.in_reply_to,m.reference_ids,
               COALESCE(s.is_read,false) AS is_read,COALESCE(s.is_starred,false) AS is_starred,s.archived_at
        FROM admin_mail_messages m
        LEFT JOIN admin_mail_state s ON s.message_id=m.id AND s.user_public_id=$1
        WHERE m.thread_key=$2
        ORDER BY COALESCE(m.received_at,m.sent_at,m.created_at) ASC
        LIMIT 100
      `, [principal.userId, threadKey]);
      thread = rows.rows.map(projectThread);
    }
  }

  return {
    configured: true,
    configurationMessage: configuration.message,
    fromAddresses: configuration.fromAddresses,
    folder,
    query,
    messages,
    thread,
    selectedId,
    metrics: {
      inbox: Number(metric.inbox || 0),
      unread: Math.max(0, Number(metric.unread || 0) - (autoSelectedUnread && autoSelected?.direction === "incoming" && !autoSelected.archived ? 1 : 0)),
      sent: Number(metric.sent || 0),
      starred: Number(metric.starred || 0),
      archived: Number(metric.archived || 0),
      all: Number(metric.all || 0)
    },
    lastInboundAt: epochOptional(metric.last_inbound_at)
  };
}

export async function markAdminMailRead(principal: SessionPrincipal, publicId: string, isRead: boolean): Promise<void> {
  await upsertState(principal, publicId, { isRead });
}

export async function starAdminMail(principal: SessionPrincipal, publicId: string, isStarred: boolean): Promise<void> {
  await upsertState(principal, publicId, { isStarred });
}

export async function archiveAdminMail(principal: SessionPrincipal, publicId: string, archived: boolean): Promise<void> {
  await upsertState(principal, publicId, { archived });
}

export async function getAdminMailAttachment(
  principal: SessionPrincipal,
  publicId: string,
  attachmentIndex: number
): Promise<{ filename: string; contentType: string; bytes: Uint8Array }> {
  void principal;
  if (!Number.isSafeInteger(attachmentIndex) || attachmentIndex < 0 || attachmentIndex > 100) throw new Error("Invalid attachment index");
  const pool = getProductionPostgresRuntime().sqlPool;
  const result = await pool.query<{ direction: string; s3_object_key: string | null; virus_verdict: string | null }>(
    "SELECT direction,s3_object_key,virus_verdict FROM admin_mail_messages WHERE public_id=$1 LIMIT 1",
    [publicId]
  );
  const row = result.rows[0];
  if (!row || row.direction !== "incoming" || !row.s3_object_key) throw new Error("Attachment source is not available");
  if (row.virus_verdict && row.virus_verdict.toUpperCase() !== "PASS") throw new Error("Attachment blocked by SES virus screening");
  const config = resolveMailConfig();
  const stored = await inboundStorage(config).read(row.s3_object_key);
  const parsed = parseAdminMailMime(await readStreamBounded(stored.stream, MAX_RAW_BYTES));
  const attachment = parsed.attachments[attachmentIndex];
  if (!attachment) throw new Error("Attachment not found");
  return { filename: attachment.filename, contentType: attachment.contentType, bytes: attachment.bytes };
}

export async function sendAdminMail(
  principal: SessionPrincipal,
  input: {
    from: string;
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    text: string;
    inReplyToId?: string;
    attachments?: readonly File[];
  }
): Promise<{ publicId: string; providerMessageId: string }> {
  const config = resolveMailConfig();
  const fromAddress = normalizeEmail(input.from);
  if (!config.fromAddresses.includes(fromAddress)) throw new Error("This From address is not allowed for Admin Mail");
  const to = parseEmailList(input.to);
  const cc = parseEmailList(input.cc || "");
  const bcc = parseEmailList(input.bcc || "");
  if (!to.length) throw new Error("At least one recipient is required");
  const subject = input.subject.trim().slice(0, 240);
  if (!subject) throw new Error("Subject is required");
  const text = input.text.trim();
  if (!text) throw new Error("Message body is required");
  if (text.length > 500_000) throw new Error("Message body is too large");

  const attachments = await normalizeOutgoingAttachments(input.attachments || []);
  const pool = getProductionPostgresRuntime().sqlPool;
  let inReplyTo: string | undefined;
  let references: readonly string[] = [];
  let threadKey: string | undefined;
  if (input.inReplyToId) {
    const reply = await pool.query<{ rfc_message_id: string | null; reference_ids: string[]; thread_key: string }>(
      "SELECT rfc_message_id,reference_ids,thread_key FROM admin_mail_messages WHERE public_id=$1 LIMIT 1",
      [input.inReplyToId]
    );
    const row = reply.rows[0];
    if (row) {
      inReplyTo = row.rfc_message_id || undefined;
      references = [...(row.reference_ids || []), ...(row.rfc_message_id ? [row.rfc_message_id] : [])].slice(-30);
      threadKey = row.thread_key;
    }
  }

  const built = buildAdminMailRawMime({
    from: { name: config.displayName, address: fromAddress },
    to: to.map((address) => ({ address })),
    cc: cc.map((address) => ({ address })),
    bcc: bcc.map((address) => ({ address })),
    replyTo: [{ address: fromAddress }],
    subject,
    text,
    inReplyTo,
    references,
    internetMessageIdDomain: config.messageIdDomain,
    attachments
  });

  const publicId = `mail_${randomUUID().replace(/-/g, "")}`;
  const finalThreadKey = threadKey || adminMailThreadKey({
    subject,
    internetMessageId: built.internetMessageId,
    inReplyTo,
    references
  });
  const attachmentMetadata = attachments.map((attachment, index) => ({
    index,
    filename: attachment.filename,
    contentType: attachment.contentType,
    byteSize: attachment.bytes.byteLength,
    inline: false
  }));

  // Persist the operator action before handing the message to SES. This avoids
  // presenting a delivered email as an unsaved failure if a later DB write fails.
  await pool.query(`
    INSERT INTO admin_mail_messages (
      public_id,direction,provider,transport_key,rfc_message_id,in_reply_to,reference_ids,thread_key,
      from_address,to_addresses,cc_addresses,bcc_addresses,reply_to,subject,preview,body_text,has_attachments,attachment_count,attachments,
      status,created_by_user_public_id
    ) VALUES (
      $1,'outgoing','ses',$2,$3,$4,$5,$6,$7,$8,$9,$10,$7,$11,$12,$13,$14,$15,$16::jsonb,'queued',$17
    )
  `, [
    publicId,
    `outbound:${publicId}`,
    built.internetMessageId,
    inReplyTo || null,
    references,
    finalThreadKey,
    fromAddress,
    to,
    cc,
    bcc,
    subject,
    preview(text),
    text,
    attachmentMetadata.length > 0,
    attachmentMetadata.length,
    JSON.stringify(attachmentMetadata),
    principal.userId
  ]);

  let sendResult: { providerMessageId: string };
  try {
    sendResult = await sendRawSesEmail({
      config: config.ses,
      raw: built.raw,
      from: fromAddress,
      to,
      cc,
      bcc
    });
  } catch (error) {
    const deliveryError = (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, " ").slice(0, 1000);
    await pool.query(
      "UPDATE admin_mail_messages SET status='failed',delivery_error=$2,updated_at=now() WHERE public_id=$1",
      [publicId, deliveryError]
    ).catch(() => undefined);
    throw error;
  }

  try {
    await pool.query(`
      UPDATE admin_mail_messages
      SET transport_key=$2,ses_message_id=$3,status='sent',sent_at=now(),delivery_error=NULL,updated_at=now()
      WHERE public_id=$1
    `, [publicId, `ses:${sendResult.providerMessageId}`, sendResult.providerMessageId]);
  } catch (error) {
    // SES has already accepted the message. Do not tell the operator that sending
    // failed and risk a duplicate; the durable queued row remains available for repair.
    console.error(JSON.stringify({
      level: "error",
      event: "admin_mail.sent_state_update_failed",
      publicId,
      providerMessageId: sendResult.providerMessageId,
      message: error instanceof Error ? error.message : String(error)
    }));
  }

  return { publicId, providerMessageId: sendResult.providerMessageId };
}

function resolveMailConfig(env: NodeJS.ProcessEnv = process.env): MailConfig {
  const enabled = env.BLS_MAIL_ENABLED?.trim().toLowerCase();
  if (enabled && enabled !== "true" && enabled !== "false") {
    throw new Error("BLS_MAIL_ENABLED must be true or false when configured.");
  }
  if (enabled === "false") {
    throw new Error("Admin Mail is disabled because BLS_MAIL_ENABLED=false.");
  }
  // The mailbox is operational by default when the existing SES/S3 settings are
  // valid. BLS_MAIL_ENABLED=false remains an emergency kill switch.
  const ses = sesMailConfigFromEnv(env);
  const region = ses.region.trim();
  if (region !== REQUIRED_REGION) throw new Error(`Admin Mail is locked to AWS ${REQUIRED_REGION}; configured region is ${region || "empty"}.`);
  const bucket = (env.BLS_MAIL_INBOUND_BUCKET || env.KONTAMOU_MAIL_INBOUND_BUCKET || env.SES_INBOUND_BUCKET || DEFAULT_BUCKET).trim();
  if (!bucket) throw new Error("Admin Mail inbound S3 bucket is missing");
  const explicitFromAddresses = env.BLS_MAIL_FROM_ADDRESSES || env.KONTAMOU_MAIL_FROM_ADDRESSES;
  const sourceList = explicitFromAddresses
    ? explicitFromAddresses.split(",")
    : [env.BLS_MAIL_FROM || "", ...DEFAULT_FROM];
  const fromAddresses = [...new Set(sourceList.map((value) => value.trim()).filter(Boolean).map((value) => normalizeEmail(value)))];
  if (!fromAddresses.length) throw new Error("Admin Mail requires at least one From address");
  return {
    region,
    bucket,
    prefix: (env.BLS_MAIL_INBOUND_PREFIX || env.KONTAMOU_MAIL_INBOUND_PREFIX || "").trim().replace(/^\/+/, ""),
    fromAddresses,
    displayName: (env.KONTAMOU_MAIL_DISPLAY_NAME || env.BLS_MAIL_FROM_NAME || "ΚΟΝΤΑ ΜΟΥ").trim() || "ΚΟΝΤΑ ΜΟΥ",
    messageIdDomain: (env.BLS_MAIL_MESSAGE_ID_DOMAIN || "kontamou.site").trim() || "kontamou.site",
    ses
  };
}

function inboundStorage(config: MailConfig): S3ObjectStorage {
  return new S3ObjectStorage({
    bucket: config.bucket,
    region: config.region,
    accessKeyId: config.ses.accessKeyId,
    secretAccessKey: config.ses.secretAccessKey,
    sessionToken: config.ses.sessionToken,
    uploadTtlSeconds: 900
  });
}

async function persistInbound(parsed: ParsedAdminMail, object: StoredObjectListItem): Promise<void> {
  const publicId = `mail_${randomUUID().replace(/-/g, "")}`;
  const threadKey = adminMailThreadKey({
    subject: parsed.subject,
    internetMessageId: parsed.internetMessageId,
    inReplyTo: parsed.inReplyTo,
    references: parsed.references
  });
  const attachmentMetadata = parsed.attachments.map((attachment, index) => ({
    index,
    filename: attachment.filename,
    contentType: attachment.contentType,
    byteSize: attachment.byteSize,
    inline: attachment.disposition === "inline"
  }));
  const receivedAt = object.lastModified ? new Date(object.lastModified) : new Date();
  const spamVerdict = parsed.headers["x-ses-spam-verdict"]?.trim() || undefined;
  const virusVerdict = parsed.headers["x-ses-virus-verdict"]?.trim() || undefined;
  const bodyText = parsed.text?.trim() || "(No readable text body.)";
  await getProductionPostgresRuntime().sqlPool.query(`
    INSERT INTO admin_mail_messages (
      public_id,direction,provider,transport_key,s3_object_key,rfc_message_id,in_reply_to,reference_ids,thread_key,
      from_address,to_addresses,cc_addresses,bcc_addresses,reply_to,subject,preview,body_text,has_attachments,attachment_count,attachments,
      spam_verdict,virus_verdict,status,sent_at,received_at
    ) VALUES (
      $1,'incoming','ses',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,'received',$21,$22
    )
    ON CONFLICT (transport_key) DO NOTHING
  `, [
    publicId,
    `s3:${object.objectKey}`,
    object.objectKey,
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
    attachmentMetadata.length > 0,
    attachmentMetadata.length,
    JSON.stringify(attachmentMetadata),
    spamVerdict || null,
    virusVerdict || null,
    parsed.date ? new Date(parsed.date) : null,
    receivedAt
  ]);
}

async function upsertState(
  principal: SessionPrincipal,
  publicId: string,
  patch: { isRead?: boolean; isStarred?: boolean; archived?: boolean }
): Promise<void> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const message = await pool.query<{ id: string }>("SELECT id::text AS id FROM admin_mail_messages WHERE public_id=$1 LIMIT 1", [publicId]);
  if (!message.rows[0]) throw new Error("Mail message not found");
  await pool.query(`
    INSERT INTO admin_mail_state (message_id,user_public_id,is_read,is_starred,archived_at,updated_at)
    VALUES ($1::uuid,$2,COALESCE($3::boolean,false),COALESCE($4::boolean,false),$5::timestamptz,now())
    ON CONFLICT (message_id,user_public_id) DO UPDATE SET
      is_read=COALESCE($3::boolean,admin_mail_state.is_read),
      is_starred=COALESCE($4::boolean,admin_mail_state.is_starred),
      archived_at=CASE WHEN $6::boolean IS NULL THEN admin_mail_state.archived_at WHEN $6 THEN now() ELSE NULL END,
      updated_at=now()
  `, [
    message.rows[0].id,
    principal.userId,
    patch.isRead ?? null,
    patch.isStarred ?? null,
    patch.archived === true ? new Date() : null,
    patch.archived ?? null
  ]);
}

function projectSummary(row: MailRow): AdminMailSummary {
  return {
    id: row.public_id,
    direction: row.direction,
    status: row.status,
    from: row.from_address,
    to: row.to_addresses || [],
    cc: row.cc_addresses || [],
    subject: row.subject,
    preview: row.preview,
    sentAt: epochOptional(row.sent_at),
    receivedAt: epochOptional(row.received_at),
    attachmentCount: Number(row.attachment_count || 0),
    spamVerdict: row.spam_verdict || undefined,
    virusVerdict: row.virus_verdict || undefined,
    isRead: row.is_read === true,
    isStarred: row.is_starred === true,
    archived: Boolean(row.archived_at),
    threadKey: row.thread_key
  };
}

function projectThread(row: MailRow): AdminMailThreadMessage {
  const attachments = Array.isArray(row.attachments)
    ? row.attachments.flatMap((value): Array<{ index: number; filename: string; contentType: string; byteSize: number; inline: boolean }> => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const item = value as Record<string, unknown>;
        if (typeof item.filename !== "string" || typeof item.index !== "number") return [];
        return [{
          index: item.index,
          filename: item.filename,
          contentType: typeof item.contentType === "string" ? item.contentType : "application/octet-stream",
          byteSize: Number(item.byteSize || 0),
          inline: item.inline === true
        }];
      })
    : [];
  return {
    ...projectSummary(row),
    bodyText: row.body_text,
    replyTo: row.reply_to || undefined,
    rfcMessageId: row.rfc_message_id || undefined,
    inReplyTo: row.in_reply_to || undefined,
    references: row.reference_ids || [],
    attachments
  };
}

async function normalizeOutgoingAttachments(files: readonly File[]): Promise<readonly { filename: string; contentType: string; bytes: Uint8Array }[]> {
  const actual = files.filter((file) => file.size > 0 && file.name);
  if (actual.length > 8) throw new Error("Up to 8 attachments are allowed");
  let total = 0;
  const result: Array<{ filename: string; contentType: string; bytes: Uint8Array }> = [];
  for (const file of actual) {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name} is larger than 3 MB`);
    total += file.size;
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) throw new Error("Total attachment size is larger than 3 MB");
    result.push({
      filename: file.name.replace(/[\r\n\0]/g, "").replace(/[\\/]/g, "_").slice(0, 180) || "attachment",
      contentType: file.type || "application/octet-stream",
      bytes: new Uint8Array(await file.arrayBuffer())
    });
  }
  return result;
}

async function readStreamBounded(stream: AsyncIterable<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new Error("Inbound email exceeds the configured raw message size limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

function parseEmailList(value: string): readonly string[] {
  if (!value.trim()) return [];
  const values = value.split(/[;,\n]+/).map((entry) => entry.trim()).filter(Boolean).map(normalizeEmail);
  return [...new Set(values)].slice(0, 50);
}

function normalizeEmail(value: string): string {
  const source = value.trim();
  const extracted = source.match(/<([^<>]+)>/)?.[1] || source;
  const email = extracted.trim().toLowerCase();
  if (!email) return "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Invalid email address: ${source.slice(0, 120)}`);
  return email;
}

function normalizeFolder(value?: string): MailFolder {
  return value === "sent" || value === "starred" || value === "archive" || value === "all" ? value : "inbox";
}

function normalizeSubject(value: string): string {
  return value.replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "").trim().toLowerCase().slice(0, 300);
}

function preview(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 280);
}

function epochOptional(value: unknown): number | undefined {
  if (!value) return undefined;
  const epoch = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(epoch) ? epoch : undefined;
}

function displayMailAddress(value: AdminMailAddress): string {
  return value.name?.trim() ? `${value.name.trim()} <${value.address}>` : value.address;
}
