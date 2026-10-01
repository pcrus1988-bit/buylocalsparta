import { randomBytes } from "node:crypto";

export type ParsedMailAttachment = Readonly<{
  index: number;
  filename: string;
  contentType: string;
  contentId?: string;
  inline: boolean;
  byteSize: number;
  bytes: Uint8Array;
}>;

export type ParsedMailMessage = Readonly<{
  messageId?: string;
  inReplyTo?: string;
  references: readonly string[];
  from: string;
  to: readonly string[];
  cc: readonly string[];
  bcc: readonly string[];
  replyTo?: string;
  subject: string;
  sentAt?: number;
  text: string;
  htmlText?: string;
  attachments: readonly ParsedMailAttachment[];
  headers: Readonly<Record<string, string>>;
}>;

type MimePart = Readonly<{
  headers: Record<string, string>;
  contentType: string;
  charset?: string;
  filename?: string;
  disposition?: string;
  contentId?: string;
  transferEncoding?: string;
  body: string;
}>;

export function parseRawEmail(raw: Uint8Array | string): ParsedMailMessage {
  const source = typeof raw === "string" ? raw : Buffer.from(raw).toString("latin1");
  const root = parsePart(source);
  const headers = root.headers;
  const collected = collectParts(root);
  const plain = collected.textParts.map((part) => decodeTextPart(part)).filter(Boolean).join("\n\n").trim();
  const htmlText = collected.htmlParts.map((part) => stripHtml(decodeTextPart(part))).filter(Boolean).join("\n\n").trim();
  const attachments = collected.attachments.map((part, index): ParsedMailAttachment => {
    const bytes = decodeTransfer(part.body, part.transferEncoding);
    return {
      index,
      filename: sanitizeFilename(part.filename || `attachment-${index + 1}`),
      contentType: part.contentType || "application/octet-stream",
      contentId: cleanContentId(part.contentId),
      inline: (part.disposition || "").toLowerCase().startsWith("inline"),
      byteSize: bytes.byteLength,
      bytes
    };
  });

  const dateValue = headers.date ? Date.parse(headers.date) : Number.NaN;
  return {
    messageId: cleanMessageId(headers["message-id"]),
    inReplyTo: cleanMessageId(headers["in-reply-to"]),
    references: extractMessageIds(headers.references),
    from: decodeHeader(headers.from || "unknown"),
    to: splitAddressHeader(headers.to),
    cc: splitAddressHeader(headers.cc),
    bcc: splitAddressHeader(headers.bcc),
    replyTo: headers["reply-to"] ? decodeHeader(headers["reply-to"]) : undefined,
    subject: decodeHeader(headers.subject || "(no subject)").trim() || "(no subject)",
    sentAt: Number.isFinite(dateValue) ? dateValue : undefined,
    text: plain || htmlText || "(No readable text body.)",
    htmlText: htmlText || undefined,
    attachments,
    headers
  };
}

export function buildRawEmail(input: {
  from: string;
  to: readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
  subject: string;
  text: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: readonly string[];
  messageIdDomain: string;
  attachments?: readonly Readonly<{ filename: string; contentType: string; bytes: Uint8Array }>[];
}): { raw: Uint8Array; messageId: string } {
  const boundary = `km_${randomBytes(18).toString("hex")}`;
  const alternative = `km_alt_${randomBytes(18).toString("hex")}`;
  const messageId = `<${Date.now()}.${randomBytes(12).toString("hex")}@${input.messageIdDomain}>`;
  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    `From: ${input.from}`,
    `To: ${input.to.join(", ")}`,
    input.cc?.length ? `Cc: ${input.cc.join(", ")}` : undefined,
    input.replyTo ? `Reply-To: ${input.replyTo}` : undefined,
    input.inReplyTo ? `In-Reply-To: ${normalizeMessageId(input.inReplyTo)}` : undefined,
    input.references?.length ? `References: ${input.references.map(normalizeMessageId).join(" ")}` : undefined,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`
  ].filter((value): value is string => Boolean(value));

  const safeText = input.text.replace(/\r?\n/g, "\r\n");
  const safeHtml = `<!doctype html><html><body style="font-family:Arial,sans-serif;white-space:pre-wrap">${escapeHtml(input.text).replace(/\r?\n/g, "<br>")}</body></html>`;
  const bodyParts = [
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    "",
    `--${alternative}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(safeText, "utf8")),
    `--${alternative}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(safeHtml, "utf8")),
    `--${alternative}--`
  ];

  for (const attachment of input.attachments || []) {
    const filename = sanitizeFilename(attachment.filename);
    bodyParts.push(
      `--${boundary}`,
      `Content-Type: ${safeContentType(attachment.contentType)}; name="${escapeQuoted(filename)}"`,
      `Content-Disposition: attachment; filename="${escapeQuoted(filename)}"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(Buffer.from(attachment.bytes))
    );
  }
  bodyParts.push(`--${boundary}--`, "");

  const raw = Buffer.from([...headers, "", ...bodyParts].join("\r\n"), "utf8");
  return { raw, messageId };
}

function parsePart(source: string): MimePart {
  const split = splitHeadersAndBody(source);
  const headers = parseHeaders(split.headers);
  const content = parseParameterizedHeader(headers["content-type"] || "text/plain");
  const disposition = parseParameterizedHeader(headers["content-disposition"] || "");
  return {
    headers,
    contentType: (content.value || "text/plain").toLowerCase(),
    charset: content.params.charset,
    filename: disposition.params.filename || content.params.name,
    disposition: disposition.value,
    contentId: headers["content-id"],
    transferEncoding: headers["content-transfer-encoding"],
    body: split.body
  };
}

function collectParts(root: MimePart): {
  textParts: MimePart[];
  htmlParts: MimePart[];
  attachments: MimePart[];
} {
  const result = { textParts: [] as MimePart[], htmlParts: [] as MimePart[], attachments: [] as MimePart[] };
  visit(root, result);
  return result;
}

function visit(part: MimePart, out: { textParts: MimePart[]; htmlParts: MimePart[]; attachments: MimePart[] }) {
  if (part.contentType.startsWith("multipart/")) {
    const boundary = parseParameterizedHeader(part.headers["content-type"] || "").params.boundary;
    if (!boundary) return;
    for (const child of splitMultipart(part.body, boundary)) visit(parsePart(child), out);
    return;
  }
  const disposition = (part.disposition || "").toLowerCase();
  if (part.filename || disposition.startsWith("attachment")) {
    out.attachments.push(part);
    return;
  }
  if (part.contentType.startsWith("text/plain")) out.textParts.push(part);
  else if (part.contentType.startsWith("text/html")) out.htmlParts.push(part);
}

function splitHeadersAndBody(source: string): { headers: string; body: string } {
  const match = /\r?\n\r?\n/.exec(source);
  if (!match || match.index === undefined) return { headers: source, body: "" };
  return { headers: source.slice(0, match.index), body: source.slice(match.index + match[0].length) };
}

function parseHeaders(block: string): Record<string, string> {
  const unfolded = block.replace(/\r?\n[ \t]+/g, " ");
  const headers: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
  }
  return headers;
}

function parseParameterizedHeader(value: string): { value: string; params: Record<string, string> } {
  const segments = splitSemicolonAware(value);
  const base = (segments.shift() || "").trim();
  const params: Record<string, string> = {};
  for (const segment of segments) {
    const index = segment.indexOf("=");
    if (index < 1) continue;
    const key = segment.slice(0, index).trim().toLowerCase();
    const raw = segment.slice(index + 1).trim().replace(/^"|"$/g, "");
    params[key.replace(/\*$/, "")] = decodeRfc2231(raw);
  }
  return { value: base, params };
}

function splitSemicolonAware(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of value) {
    if (char === '"') quoted = !quoted;
    if (char === ";" && !quoted) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  parts.push(current);
  return parts;
}

function splitMultipart(body: string, boundary: string): string[] {
  const marker = `--${boundary}`;
  const end = `--${boundary}--`;
  const lines = body.split(/\r?\n/);
  const parts: string[] = [];
  let current: string[] | undefined;
  for (const line of lines) {
    if (line === marker || line === end) {
      if (current?.length) parts.push(current.join("\r\n"));
      current = line === end ? undefined : [];
      if (line === end) break;
      continue;
    }
    if (current) current.push(line);
  }
  return parts;
}

function decodeTextPart(part: MimePart): string {
  const bytes = decodeTransfer(part.body, part.transferEncoding);
  const charset = (part.charset || "utf-8").toLowerCase();
  if (charset.includes("iso-8859-1") || charset.includes("latin1")) return Buffer.from(bytes).toString("latin1");
  try { return new TextDecoder(charset as "utf-8").decode(bytes); }
  catch { return Buffer.from(bytes).toString("utf8"); }
}

function decodeTransfer(body: string, encoding?: string): Uint8Array {
  const kind = (encoding || "").trim().toLowerCase();
  if (kind === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64");
  if (kind === "quoted-printable") return decodeQuotedPrintable(body);
  return Buffer.from(body, "latin1");
}

function decodeQuotedPrintable(value: string): Uint8Array {
  const normalized = value.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < normalized.length; i += 1) {
    if (normalized[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(normalized.slice(i + 1, i + 3))) {
      bytes.push(Number.parseInt(normalized.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(normalized.charCodeAt(i) & 0xff);
  }
  return Uint8Array.from(bytes);
}

function decodeHeader(value: string): string {
  return value.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_all, charsetRaw: string, encodingRaw: string, data: string) => {
    const charset = String(charsetRaw).toLowerCase();
    const encoding = String(encodingRaw).toLowerCase();
    const bytes = encoding === "b"
      ? Buffer.from(data, "base64")
      : decodeQuotedPrintable(data.replace(/_/g, " "));
    if (charset.includes("iso-8859-1") || charset.includes("latin1")) return Buffer.from(bytes).toString("latin1");
    try { return new TextDecoder(charset as "utf-8").decode(bytes); }
    catch { return Buffer.from(bytes).toString("utf8"); }
  }).replace(/\?=\s+=\?/g, "?==?");
}

function splitAddressHeader(value?: string): readonly string[] {
  if (!value?.trim()) return [];
  const decoded = decodeHeader(value);
  const result: string[] = [];
  let current = "";
  let quoted = false;
  let angleDepth = 0;
  for (const char of decoded) {
    if (char === '"') quoted = !quoted;
    if (!quoted && char === "<") angleDepth += 1;
    if (!quoted && char === ">" && angleDepth > 0) angleDepth -= 1;
    if (char === "," && !quoted && angleDepth === 0) {
      if (current.trim()) result.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function extractMessageIds(value?: string): readonly string[] {
  if (!value) return [];
  return [...value.matchAll(/<[^<>\s]+>/g)].map((match) => match[0]).slice(-30);
}

function cleanMessageId(value?: string): string | undefined {
  return extractMessageIds(value)[0];
}

function normalizeMessageId(value: string): string {
  const cleaned = value.trim();
  return cleaned.startsWith("<") ? cleaned : `<${cleaned.replace(/[<>]/g, "")}>`;
}

function cleanContentId(value?: string): string | undefined {
  if (!value) return undefined;
  return value.trim().replace(/^<|>$/g, "") || undefined;
}

function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value.replace(/[\r\n]+/g, " ");
  return `=?UTF-8?B?${Buffer.from(value.replace(/[\r\n]+/g, " "), "utf8").toString("base64")}?=`;
}

function decodeRfc2231(value: string): string {
  const match = /^([^']*)'[^']*'(.*)$/.exec(value);
  if (!match) return decodeHeader(value);
  try { return decodeURIComponent(match[2]); } catch { return match[2]; }
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
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeFilename(value: string): string {
  return value.replace(/[\r\n\0]/g, "").replace(/[\\/]/g, "_").trim().slice(0, 180) || "attachment";
}

function safeContentType(value: string): string {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(normalized) ? normalized : "application/octet-stream";
}

function escapeQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function base64Lines(value: Buffer): string {
  return value.toString("base64").match(/.{1,76}/g)?.join("\r\n") || "";
}
