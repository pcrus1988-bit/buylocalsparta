import { createHash, randomUUID } from "node:crypto";

export type AdminMailAddress = Readonly<{ name?: string; address: string }>;
export type ParsedAdminMailAttachment = Readonly<{
  partIndex: number;
  filename: string;
  contentType: string;
  byteSize: number;
  contentId?: string;
  disposition?: string;
  bytes: Uint8Array;
}>;
export type ParsedAdminMail = Readonly<{
  headers: Readonly<Record<string, string>>;
  internetMessageId?: string;
  inReplyTo?: string;
  references: readonly string[];
  from: AdminMailAddress;
  to: readonly AdminMailAddress[];
  cc: readonly AdminMailAddress[];
  bcc: readonly AdminMailAddress[];
  replyTo: readonly AdminMailAddress[];
  subject: string;
  date?: number;
  text?: string;
  html?: string;
  attachments: readonly ParsedAdminMailAttachment[];
}>;

type MimePart = Readonly<{
  headers: Readonly<Record<string, string>>;
  body: Buffer;
}>;

export function parseAdminMailMime(raw: Uint8Array | string): ParsedAdminMail {
  const buffer = typeof raw === "string" ? Buffer.from(raw, "utf8") : Buffer.from(raw);
  const root = splitPart(buffer);
  const headers = root.headers;
  const bodies: { text: string[]; html: string[] } = { text: [], html: [] };
  const attachments: ParsedAdminMailAttachment[] = [];
  walkPart(root, bodies, attachments, { index: 0 });

  const from = parseAddressList(headers.from)[0] ?? { address: "unknown" };
  const references = [
    ...messageIds(headers.references),
    ...messageIds(headers["in-reply-to"])
  ].filter((value, index, all) => all.indexOf(value) === index);

  const date = headers.date ? Date.parse(headers.date) : Number.NaN;
  return {
    headers,
    internetMessageId: firstMessageId(headers["message-id"]),
    inReplyTo: firstMessageId(headers["in-reply-to"]),
    references,
    from,
    to: parseAddressList(headers.to),
    cc: parseAddressList(headers.cc),
    bcc: parseAddressList(headers.bcc),
    replyTo: parseAddressList(headers["reply-to"]),
    subject: decodeHeaderWords(headers.subject || "(no subject)").trim() || "(no subject)",
    date: Number.isFinite(date) ? date : undefined,
    text: bodies.text.join("\n\n").trim() || (bodies.html.length ? htmlToText(bodies.html.join("\n")) : undefined),
    html: bodies.html.join("\n").trim() || undefined,
    attachments
  };
}

export function buildAdminMailRawMime(input: {
  from: AdminMailAddress;
  to: readonly AdminMailAddress[];
  cc?: readonly AdminMailAddress[];
  bcc?: readonly AdminMailAddress[];
  replyTo?: readonly AdminMailAddress[];
  subject: string;
  text: string;
  html?: string;
  internetMessageIdDomain: string;
  inReplyTo?: string;
  references?: readonly string[];
  attachments?: readonly Readonly<{ filename: string; contentType: string; bytes: Uint8Array; contentId?: string }>[];
}): { raw: Uint8Array; internetMessageId: string } {
  const internetMessageId = `<${randomUUID()}@${cleanMessageIdDomain(input.internetMessageIdDomain)}>`;
  const mixedBoundary = `bls-mixed-${randomUUID()}`;
  const alternativeBoundary = `bls-alt-${randomUUID()}`;
  const attachments = input.attachments ?? [];
  const lines: string[] = [
    `From: ${formatAddress(input.from)}`,
    `To: ${input.to.map(formatAddress).join(", ")}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.map(formatAddress).join(", ")}`] : []),
    ...(input.replyTo?.length ? [`Reply-To: ${input.replyTo.map(formatAddress).join(", ")}`] : []),
    `Subject: ${encodeHeaderWord(input.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${internetMessageId}`,
    ...(input.inReplyTo ? [`In-Reply-To: ${normalizeMessageId(input.inReplyTo)}`] : []),
    ...(input.references?.length ? [`References: ${input.references.map(normalizeMessageId).join(" ")}`] : []),
    "MIME-Version: 1.0"
  ];

  const textPart = [
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(input.text, "utf8").toString("base64"))
  ].join("\r\n");
  const html = input.html?.trim();
  const body = html
    ? [
        `--${alternativeBoundary}`,
        textPart,
        `--${alternativeBoundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        wrapBase64(Buffer.from(html, "utf8").toString("base64")),
        `--${alternativeBoundary}--`
      ].join("\r\n")
    : textPart;

  if (!attachments.length) {
    lines.push(
      html ? `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"` : "Content-Type: text/plain; charset=UTF-8",
      ...(html ? ["", body] : ["Content-Transfer-Encoding: base64", "", wrapBase64(Buffer.from(input.text, "utf8").toString("base64"))])
    );
    return { raw: Buffer.from(lines.join("\r\n"), "utf8"), internetMessageId };
  }

  lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`, "");
  if (html) {
    lines.push(`--${mixedBoundary}`, `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`, "", body);
  } else {
    lines.push(`--${mixedBoundary}`, textPart);
  }
  for (const attachment of attachments) {
    const safeName = cleanFilename(attachment.filename);
    lines.push(
      `--${mixedBoundary}`,
      `Content-Type: ${cleanContentType(attachment.contentType)}; name*=UTF-8''${encodeRfc2231(safeName)}`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename*=UTF-8''${encodeRfc2231(safeName)}`,
      ...(attachment.contentId ? [`Content-ID: <${attachment.contentId.replace(/[<>\r\n]/g, "")}>`] : []),
      "",
      wrapBase64(Buffer.from(attachment.bytes).toString("base64"))
    );
  }
  lines.push(`--${mixedBoundary}--`, "");
  return { raw: Buffer.from(lines.join("\r\n"), "utf8"), internetMessageId };
}

export function adminMailThreadKey(input: { subject: string; internetMessageId?: string; inReplyTo?: string; references?: readonly string[] }): string {
  const parent = input.references?.at(-1) || input.inReplyTo;
  const basis = parent
    ? `message:${normalizeMessageId(parent).toLowerCase()}`
    : `subject:${normalizeThreadSubject(input.subject).toLowerCase()}`;
  return createHash("sha256").update(basis).digest("hex");
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<\/div\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function walkPart(part: MimePart, bodies: { text: string[]; html: string[] }, attachments: ParsedAdminMailAttachment[], counter: { index: number }): void {
  const contentType = parseParameterizedHeader(part.headers["content-type"] || "text/plain; charset=us-ascii");
  if (contentType.value.startsWith("multipart/") && contentType.params.boundary) {
    for (const child of splitMultipart(part.body, contentType.params.boundary)) {
      walkPart(child, bodies, attachments, counter);
    }
    return;
  }

  const disposition = parseParameterizedHeader(part.headers["content-disposition"] || "");
  const filenameRaw = disposition.params.filename || contentType.params.name;
  const isAttachment = disposition.value === "attachment" || Boolean(filenameRaw) || (!contentType.value.startsWith("text/") && contentType.value !== "message/rfc822");
  const decodedBytes = decodeTransfer(part.body, part.headers["content-transfer-encoding"]);
  const partIndex = counter.index++;

  if (isAttachment) {
    attachments.push({
      partIndex,
      filename: cleanFilename(decodeHeaderWords(filenameRaw || `attachment-${partIndex}`)),
      contentType: cleanContentType(contentType.value || "application/octet-stream"),
      byteSize: decodedBytes.byteLength,
      contentId: cleanContentId(part.headers["content-id"]),
      disposition: disposition.value || undefined,
      bytes: decodedBytes
    });
    return;
  }

  const charset = contentType.params.charset || "utf-8";
  if (contentType.value === "text/html") bodies.html.push(decodeCharset(decodedBytes, charset));
  else if (contentType.value === "text/plain" || !contentType.value) bodies.text.push(decodeCharset(decodedBytes, charset));
  else if (contentType.value === "message/rfc822") {
    try {
      const nested = parseAdminMailMime(decodedBytes);
      if (nested.text) bodies.text.push(nested.text);
      if (nested.html) bodies.html.push(nested.html);
      for (const attachment of nested.attachments) attachments.push({ ...attachment, partIndex: counter.index++ });
    } catch {
      bodies.text.push(decodeCharset(decodedBytes, charset));
    }
  }
}

function splitPart(buffer: Buffer): MimePart {
  const text = buffer.toString("latin1");
  const match = /\r?\n\r?\n/.exec(text);
  if (!match || match.index === undefined) return { headers: {}, body: buffer };
  const headerText = text.slice(0, match.index);
  const bodyStart = match.index + match[0].length;
  return { headers: parseHeaders(headerText), body: buffer.subarray(bodyStart) };
}

function splitMultipart(body: Buffer, boundary: string): MimePart[] {
  const text = body.toString("latin1");
  const marker = `--${boundary}`;
  const endMarker = `--${boundary}--`;
  const parts: MimePart[] = [];
  let cursor = text.indexOf(marker);
  while (cursor >= 0) {
    cursor += marker.length;
    if (text.startsWith("--", cursor) || text.startsWith(endMarker, cursor - marker.length)) break;
    if (text.startsWith("\r\n", cursor)) cursor += 2;
    else if (text.startsWith("\n", cursor)) cursor += 1;
    const next = text.indexOf(marker, cursor);
    if (next < 0) break;
    let end = next;
    while (end > cursor && (text[end - 1] === "\n" || text[end - 1] === "\r")) end -= 1;
    if (end > cursor) parts.push(splitPart(Buffer.from(text.slice(cursor, end), "latin1")));
    cursor = next;
  }
  return parts;
}

function parseHeaders(headerText: string): Record<string, string> {
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, " ");
  const result: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (!key) continue;
    result[key] = result[key] ? `${result[key]}, ${value}` : value;
  }
  return result;
}

function parseParameterizedHeader(value: string): { value: string; params: Record<string, string> } {
  const pieces = splitSemicolon(value);
  const main = (pieces.shift() || "").trim().toLowerCase();
  const params: Record<string, string> = {};
  for (const piece of pieces) {
    const eq = piece.indexOf("=");
    if (eq <= 0) continue;
    const key = piece.slice(0, eq).trim().toLowerCase();
    let raw = piece.slice(eq + 1).trim();
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1);
    if (key.endsWith("*")) {
      const decoded = decodeRfc2231(raw);
      params[key.slice(0, -1)] = decoded;
    } else {
      params[key] = raw.replace(/\\(["\\])/g, "$1");
    }
  }
  return { value: main, params };
}

function splitSemicolon(value: string): string[] {
  const out: string[] = [];
  let current = "", quoted = false, quote = "";
  for (const ch of value) {
    if ((ch === '"' || ch === "'")) {
      if (!quoted) { quoted = true; quote = ch; }
      else if (quote === ch) quoted = false;
    }
    if (ch === ";" && !quoted) { out.push(current); current = ""; }
    else current += ch;
  }
  out.push(current);
  return out;
}

function parseAddressList(value?: string): AdminMailAddress[] {
  if (!value?.trim()) return [];
  return splitAddressList(value).flatMap((part) => {
    const trimmed = decodeHeaderWords(part.trim());
    const angle = trimmed.match(/^(.*)<([^<>]+)>$/);
    const address = (angle?.[2] || trimmed).trim().replace(/^mailto:/i, "").toLowerCase();
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) return [];
    const name = angle?.[1]?.trim().replace(/^["']|["']$/g, "") || undefined;
    return [{ address, name: name || undefined }];
  });
}

function splitAddressList(value: string): string[] {
  const out: string[] = [];
  let current = "", quoted = false, quote = "", angleDepth = 0;
  for (const ch of value) {
    if ((ch === '"' || ch === "'")) {
      if (!quoted) { quoted = true; quote = ch; }
      else if (quote === ch) quoted = false;
    } else if (!quoted && ch === "<") angleDepth += 1;
    else if (!quoted && ch === ">") angleDepth = Math.max(0, angleDepth - 1);
    if (ch === "," && !quoted && angleDepth === 0) { if (current.trim()) out.push(current.trim()); current = ""; }
    else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function decodeTransfer(body: Buffer, encoding?: string): Buffer {
  const kind = encoding?.trim().toLowerCase();
  if (kind === "base64") return Buffer.from(body.toString("ascii").replace(/\s+/g, ""), "base64");
  if (kind === "quoted-printable") return decodeQuotedPrintable(body.toString("latin1"));
  return body;
}

function decodeQuotedPrintable(input: string): Buffer {
  const normalized = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < normalized.length; i += 1) {
    if (normalized[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(normalized.slice(i + 1, i + 3))) {
      bytes.push(Number.parseInt(normalized.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(normalized.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function decodeHeaderWords(value: string): string {
  return value.replace(/=\?([^?\s]+)\?([bBqQ])\?([^?]*)\?=/g, (_match, charset: string, mode: string, encoded: string) => {
    try {
      const bytes = mode.toLowerCase() === "b"
        ? Buffer.from(encoded, "base64")
        : decodeQuotedPrintable(encoded.replace(/_/g, " "));
      return decodeCharset(bytes, charset);
    } catch {
      return encoded;
    }
  }).replace(/\?=\s+=\?/g, "?==?");
}

function decodeCharset(bytes: Uint8Array, charset: string): string {
  const normalized = charset.trim().replace(/^["']|["']$/g, "").toLowerCase();
  const aliases: Record<string, string> = {
    "utf8": "utf-8",
    "us-ascii": "utf-8",
    "ascii": "utf-8",
    "iso-8859-1": "windows-1252",
    "latin1": "windows-1252"
  };
  try {
    return new TextDecoder(aliases[normalized] || normalized || "utf-8", { fatal: false }).decode(bytes);
  } catch {
    return Buffer.from(bytes).toString("utf8");
  }
}

function messageIds(value?: string): string[] {
  if (!value) return [];
  const matches = value.match(/<[^<>\s]+>/g);
  return matches ? matches.map(normalizeMessageId) : [];
}

function firstMessageId(value?: string): string | undefined {
  return messageIds(value)[0];
}

function normalizeMessageId(value: string): string {
  const trimmed = value.trim().replace(/[\r\n]/g, "");
  if (!trimmed) return "";
  return trimmed.startsWith("<") && trimmed.endsWith(">") ? trimmed : `<${trimmed.replace(/[<>]/g, "")}>`;
}

function normalizeThreadSubject(subject: string): string {
  let value = decodeHeaderWords(subject).trim();
  for (let i = 0; i < 8; i += 1) {
    const next = value.replace(/^\s*(re|fw|fwd)\s*:\s*/i, "").trim();
    if (next === value) break;
    value = next;
  }
  return value || "(no subject)";
}

function cleanMessageIdDomain(value: string): string {
  const domain = value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  return /^[a-z0-9.-]+$/.test(domain) && domain.includes(".") ? domain : "kontamou.site";
}

function cleanFilename(value: string): string {
  const result = value.replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim().slice(0, 180);
  return result || "attachment";
}

function cleanContentType(value: string): string {
  const result = value.trim().toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(result) ? result : "application/octet-stream";
}

function cleanContentId(value?: string): string | undefined {
  const result = value?.trim().replace(/^<|>$/g, "").replace(/[\r\n]/g, "");
  return result || undefined;
}

function decodeRfc2231(value: string): string {
  const match = value.match(/^([^']*)'[^']*'(.*)$/);
  const charset = match?.[1] || "utf-8";
  const payload = match?.[2] || value;
  try {
    const bytes: number[] = [];
    for (let i = 0; i < payload.length; i += 1) {
      if (payload[i] === "%" && /^[0-9A-Fa-f]{2}$/.test(payload.slice(i + 1, i + 3))) {
        bytes.push(Number.parseInt(payload.slice(i + 1, i + 3), 16));
        i += 2;
      } else bytes.push(payload.charCodeAt(i) & 0xff);
    }
    return decodeCharset(Uint8Array.from(bytes), charset);
  } catch {
    return payload;
  }
}

function formatAddress(value: AdminMailAddress): string {
  const address = value.address.trim().toLowerCase().replace(/[\r\n<>]/g, "");
  if (!value.name?.trim()) return address;
  return `${encodeHeaderWord(value.name.trim())} <${address}>`;
}

function encodeHeaderWord(value: string): string {
  const clean = value.replace(/[\r\n]/g, " ").trim().slice(0, 998);
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function encodeRfc2231(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function escapeQuoted(value: string): string {
  return value.replace(/[\r\n]/g, " ").replace(/(["\\])/g, "\\$1");
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join("\r\n") || "";
}
