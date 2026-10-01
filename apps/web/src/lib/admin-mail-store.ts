import { createHash, randomUUID } from "node:crypto";
import { parseAdminMailMime, type AdminMailAddress, type ParsedAdminMail } from "./admin-mail-mime";
import {
  adminMailS3ConfigFromEnv,
  adminMailS3Configured,
  getAdminMailS3Object,
  listAdminMailS3Objects,
  putAdminMailS3Object,
  type AdminMailS3Config,
  type AdminMailS3Object
} from "./admin-mail-s3";

const SYSTEM_PREFIX = "_admin-mail/";
const SENT_PREFIX = "_admin-mail/sent/";
const STATE_PREFIX = "_admin-mail/state/";
const MAX_RAW_BYTES = 30 * 1024 * 1024;

export type AdminMailboxFolder = "inbox" | "sent" | "archive" | "trash";

export type AdminMailSummary = Readonly<{
  id: string;
  direction: "inbound" | "outbound";
  folder: AdminMailboxFolder;
  from: AdminMailAddress;
  to: readonly AdminMailAddress[];
  subject: string;
  receivedAt: number;
  preview: string;
  unread: boolean;
  starred: boolean;
  hasAttachments: boolean;
  attachmentCount: number;
  byteSize: number;
}>;

export type AdminMailDetail = AdminMailSummary & Readonly<{
  cc: readonly AdminMailAddress[];
  bcc: readonly AdminMailAddress[];
  replyTo: readonly AdminMailAddress[];
  text: string;
  htmlAvailable: boolean;
  internetMessageId?: string;
  inReplyTo?: string;
  references: readonly string[];
  attachments: readonly Readonly<{ partIndex: number; filename: string; contentType: string; byteSize: number }>[];
}>;

type MailState = Readonly<{
  read?: boolean;
  starred?: boolean;
  archived?: boolean;
  deleted?: boolean;
  updatedAt?: number;
}>;

type ParsedCacheEntry = Readonly<{ expiresAt: number; parsed: ParsedAdminMail }>;
const globals = globalThis as typeof globalThis & { __blsAdminMailParsedCache?: Map<string, ParsedCacheEntry> };
const parsedCache = globals.__blsAdminMailParsedCache ??= new Map<string, ParsedCacheEntry>();

export function adminMailStorageConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return adminMailS3Configured(env);
}

export async function adminMailStorageReadiness(): Promise<{ ok: boolean; bucket: string; message: string }> {
  if (!adminMailStorageConfigured()) return { ok: false, bucket: process.env.BLS_MAIL_S3_BUCKET?.trim() || "kontamou-inbound-emails", message: "AWS mail S3 credentials are not configured" };
  const config = adminMailS3ConfigFromEnv();
  try {
    await listAdminMailS3Objects({ config, maxKeys: 1 });
    return { ok: true, bucket: config.bucket, message: "SES/S3 mailbox storage is reachable" };
  } catch (error) {
    return { ok: false, bucket: config.bucket, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function listAdminMailbox(input: {
  folder: AdminMailboxFolder;
  q?: string;
  limit?: number;
}): Promise<{ messages: readonly AdminMailSummary[]; counts: Record<AdminMailboxFolder, number>; scanned: number; truncated: boolean }> {
  const config = adminMailS3ConfigFromEnv();
  const limit = Math.min(100, Math.max(10, input.limit ?? 60));
  const q = input.q?.trim().toLocaleLowerCase("el-GR") || "";
  const objects = await listRawObjects(config, q ? 3000 : 1500);
  const ordered = [...objects].sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));
  const scanLimit = Math.min(ordered.length, q ? 300 : Math.max(120, limit * 3));
  const scannedObjects = ordered.slice(0, scanLimit);
  const summaries = await mapLimit(scannedObjects, 10, async (entry) => {
    try {
      return await loadSummary(config, entry);
    } catch (error) {
      console.error(JSON.stringify({ level: "error", event: "admin_mail.summary_failed", key: entry.key, message: error instanceof Error ? error.message : String(error) }));
      return undefined;
    }
  });
  const present = summaries.filter((item): item is AdminMailSummary => Boolean(item));
  const counts: Record<AdminMailboxFolder, number> = { inbox: 0, sent: 0, archive: 0, trash: 0 };
  for (const item of present) counts[item.folder] += 1;
  const filtered = present.filter((item) => {
    if (item.folder !== input.folder) return false;
    if (!q) return true;
    return [
      item.subject,
      item.from.name,
      item.from.address,
      ...item.to.flatMap((address) => [address.name, address.address]),
      item.preview
    ].filter(Boolean).join(" ").toLocaleLowerCase("el-GR").includes(q);
  });
  return { messages: filtered.slice(0, limit), counts, scanned: scannedObjects.length, truncated: ordered.length > scanLimit || filtered.length > limit };
}

export async function getAdminMailDetail(id: string, options: { markRead?: boolean } = {}): Promise<AdminMailDetail> {
  const config = adminMailS3ConfigFromEnv();
  const key = decodeMailId(id);
  assertAllowedKey(key);
  const entry = { key, size: 0, lastModified: undefined } satisfies AdminMailS3Object;
  const parsed = await loadParsed(config, entry);
  let state = await loadState(config, key);
  if (options.markRead !== false && !state.read) {
    state = await writeState(config, key, { ...state, read: true, updatedAt: Date.now() });
  }
  return detailFromParsed(key, parsed, state, entry);
}

export async function getAdminMailAttachment(id: string, partIndex: number): Promise<{ filename: string; contentType: string; bytes: Uint8Array }> {
  const config = adminMailS3ConfigFromEnv();
  const key = decodeMailId(id);
  assertAllowedKey(key);
  const parsed = await loadParsed(config, { key, size: 0 });
  const attachment = parsed.attachments.find((item) => item.partIndex === partIndex);
  if (!attachment) throw new Error("Attachment not found");
  return { filename: attachment.filename, contentType: attachment.contentType, bytes: attachment.bytes };
}

export async function updateAdminMailState(id: string, patch: Readonly<{
  read?: boolean;
  starred?: boolean;
  archived?: boolean;
  deleted?: boolean;
}>): Promise<MailState> {
  const config = adminMailS3ConfigFromEnv();
  const key = decodeMailId(id);
  assertAllowedKey(key);
  const current = await loadState(config, key);
  return writeState(config, key, { ...current, ...patch, updatedAt: Date.now() });
}

export async function archiveSentAdminMail(input: { raw: Uint8Array; sentAt?: number }): Promise<{ key: string; id: string }> {
  const config = adminMailS3ConfigFromEnv();
  const sentAt = input.sentAt ?? Date.now();
  const date = new Date(sentAt);
  const path = [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("/");
  const key = SENT_PREFIX + path + "/" + String(sentAt) + "-" + randomUUID() + ".eml";
  await putAdminMailS3Object({ config, key, bytes: input.raw, contentType: "message/rfc822" });
  return { key, id: encodeMailId(key) };
}

export async function archiveSentAdminMailBestEffort(input: { raw: Uint8Array; sentAt?: number }): Promise<boolean> {
  if (!adminMailStorageConfigured()) return false;
  try {
    await archiveSentAdminMail(input);
    return true;
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "admin_mail.sent_archive_failed", message: error instanceof Error ? error.message : String(error) }));
    return false;
  }
}

async function listRawObjects(config: AdminMailS3Config, hardLimit: number): Promise<AdminMailS3Object[]> {
  const prefix = process.env.BLS_MAIL_S3_INBOUND_PREFIX?.trim() || "";
  const objects: AdminMailS3Object[] = [];
  let continuationToken: string | undefined;
  for (let page = 0; page < 5 && objects.length < hardLimit; page += 1) {
    const result = await listAdminMailS3Objects({ config, prefix, continuationToken, maxKeys: Math.min(1000, hardLimit - objects.length) });
    for (const entry of result.objects) {
      if (entry.key.startsWith(SYSTEM_PREFIX)) continue;
      if (!entry.key || entry.size <= 0 || entry.size > MAX_RAW_BYTES) continue;
      objects.push(entry);
    }
    continuationToken = result.nextContinuationToken;
    if (!continuationToken) break;
  }

  continuationToken = undefined;
  for (let page = 0; page < 3 && objects.length < hardLimit + 1000; page += 1) {
    const result = await listAdminMailS3Objects({ config, prefix: SENT_PREFIX, continuationToken, maxKeys: 1000 });
    objects.push(...result.objects.filter((entry) => entry.size > 0 && entry.size <= MAX_RAW_BYTES));
    continuationToken = result.nextContinuationToken;
    if (!continuationToken) break;
  }
  return dedupeObjects(objects);
}

function dedupeObjects(objects: readonly AdminMailS3Object[]): AdminMailS3Object[] {
  const byKey = new Map<string, AdminMailS3Object>();
  for (const entry of objects) byKey.set(entry.key, entry);
  return [...byKey.values()];
}

async function loadSummary(config: AdminMailS3Config, entry: AdminMailS3Object): Promise<AdminMailSummary> {
  const [parsed, state] = await Promise.all([loadParsed(config, entry), loadState(config, entry.key)]);
  return summaryFromParsed(entry.key, parsed, state, entry);
}

async function loadParsed(config: AdminMailS3Config, entry: AdminMailS3Object): Promise<ParsedAdminMail> {
  const cacheKey = entry.key + ":" + (entry.etag || "");
  const cached = parsedCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.parsed;
  const object = await getAdminMailS3Object(config, entry.key);
  if (object.bytes.byteLength > MAX_RAW_BYTES) throw new Error("Email object exceeds Admin mailbox size limit");
  const parsed = parseAdminMailMime(object.bytes);
  parsedCache.set(cacheKey, { parsed, expiresAt: Date.now() + 60000 });
  if (parsedCache.size > 300) {
    const first = parsedCache.keys().next().value;
    if (first) parsedCache.delete(first);
  }
  return parsed;
}

async function loadState(config: AdminMailS3Config, sourceKey: string): Promise<MailState> {
  try {
    const object = await getAdminMailS3Object(config, stateKey(sourceKey));
    const parsed = JSON.parse(Buffer.from(object.bytes).toString("utf8")) as Record<string, unknown>;
    if (parsed.sourceKey !== sourceKey) return {};
    return {
      read: parsed.read === true,
      starred: parsed.starred === true,
      archived: parsed.archived === true,
      deleted: parsed.deleted === true,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : undefined
    };
  } catch (error) {
    if (typeof error === "object" && error && "status" in error && Number((error as { status?: unknown }).status) === 404) return {};
    return {};
  }
}

async function writeState(config: AdminMailS3Config, sourceKey: string, state: MailState): Promise<MailState> {
  await putAdminMailS3Object({
    config,
    key: stateKey(sourceKey),
    bytes: JSON.stringify({ sourceKey, ...state }),
    contentType: "application/json"
  });
  return state;
}

function summaryFromParsed(key: string, parsed: ParsedAdminMail, state: MailState, entry: AdminMailS3Object): AdminMailSummary {
  const direction = key.startsWith(SENT_PREFIX) ? "outbound" : "inbound";
  const folder: AdminMailboxFolder = state.deleted ? "trash" : state.archived ? "archive" : direction === "outbound" ? "sent" : "inbox";
  const body = parsed.text?.replace(/\s+/g, " ").trim() || "";
  return {
    id: encodeMailId(key),
    direction,
    folder,
    from: parsed.from,
    to: parsed.to,
    subject: parsed.subject,
    receivedAt: parsed.date ?? entry.lastModified ?? Date.now(),
    preview: body.slice(0, 180),
    unread: direction === "inbound" && state.read !== true,
    starred: state.starred === true,
    hasAttachments: parsed.attachments.length > 0,
    attachmentCount: parsed.attachments.length,
    byteSize: entry.size || 0
  };
}

function detailFromParsed(key: string, parsed: ParsedAdminMail, state: MailState, entry: AdminMailS3Object): AdminMailDetail {
  const summary = summaryFromParsed(key, parsed, state, entry);
  return {
    ...summary,
    cc: parsed.cc,
    bcc: parsed.bcc,
    replyTo: parsed.replyTo,
    text: parsed.text?.trim() || "",
    htmlAvailable: Boolean(parsed.html?.trim()),
    internetMessageId: parsed.internetMessageId,
    inReplyTo: parsed.inReplyTo,
    references: parsed.references,
    attachments: parsed.attachments.map(({ partIndex, filename, contentType, byteSize }) => ({ partIndex, filename, contentType, byteSize }))
  };
}

function stateKey(sourceKey: string): string {
  return STATE_PREFIX + createHash("sha256").update(sourceKey).digest("hex") + ".json";
}

function encodeMailId(key: string): string {
  return Buffer.from(key, "utf8").toString("base64url");
}

function decodeMailId(id: string): string {
  if (!/^[A-Za-z0-9_-]{2,1000}$/.test(id)) throw new Error("Invalid Admin mail id");
  const key = Buffer.from(id, "base64url").toString("utf8");
  if (!key || key.length > 1000) throw new Error("Invalid Admin mail id");
  return key;
}

function assertAllowedKey(key: string): void {
  if (key.startsWith(SENT_PREFIX)) return;
  if (key.startsWith(SYSTEM_PREFIX)) throw new Error("Invalid Admin mail object");
  const prefix = process.env.BLS_MAIL_S3_INBOUND_PREFIX?.trim() || "";
  if (prefix && !key.startsWith(prefix)) throw new Error("Admin mail object is outside the inbound prefix");
}

async function mapLimit<T, R>(items: readonly T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return output;
}
