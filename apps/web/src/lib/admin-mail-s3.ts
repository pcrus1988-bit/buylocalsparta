import { createHash, createHmac } from "node:crypto";

export type AdminMailS3Config = Readonly<{
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  timeoutMs: number;
}>;

export type AdminMailS3Object = Readonly<{
  key: string;
  size: number;
  etag?: string;
  lastModified?: number;
}>;

export function adminMailS3Configured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    (env.BLS_MAIL_AWS_REGION?.trim() || env.AWS_REGION?.trim()) &&
    (env.BLS_MAIL_AWS_ACCESS_KEY_ID?.trim() || env.AWS_ACCESS_KEY_ID?.trim()) &&
    (env.BLS_MAIL_AWS_SECRET_ACCESS_KEY?.trim() || env.AWS_SECRET_ACCESS_KEY?.trim())
  );
}

export function adminMailS3ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AdminMailS3Config {
  const region = env.BLS_MAIL_AWS_REGION?.trim() || env.AWS_REGION?.trim();
  const accessKeyId = env.BLS_MAIL_AWS_ACCESS_KEY_ID?.trim() || env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.BLS_MAIL_AWS_SECRET_ACCESS_KEY?.trim() || env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!region) throw new Error("BLS_MAIL_AWS_REGION or AWS_REGION is required for Admin mail S3");
  if (!accessKeyId || !secretAccessKey) throw new Error("AWS credentials are required for Admin mail S3");
  return {
    bucket: env.BLS_MAIL_S3_BUCKET?.trim() || "kontamou-inbound-emails",
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken: env.BLS_MAIL_AWS_SESSION_TOKEN?.trim() || env.AWS_SESSION_TOKEN?.trim() || undefined,
    timeoutMs: positiveInteger(env.BLS_MAIL_S3_TIMEOUT_MS, 12000, "BLS_MAIL_S3_TIMEOUT_MS")
  };
}

export async function listAdminMailS3Objects(input: {
  config: AdminMailS3Config;
  prefix?: string;
  continuationToken?: string;
  maxKeys?: number;
}): Promise<{ objects: readonly AdminMailS3Object[]; nextContinuationToken?: string }> {
  const maxKeys = Math.min(1000, Math.max(1, input.maxKeys ?? 1000));
  const url = bucketUrl(input.config);
  url.searchParams.set("list-type", "2");
  url.searchParams.set("max-keys", String(maxKeys));
  if (input.prefix) url.searchParams.set("prefix", input.prefix);
  if (input.continuationToken) url.searchParams.set("continuation-token", input.continuationToken);
  const response = await signedFetch(input.config, url, { method: "GET" });
  const xml = await response.text();
  if (!response.ok) throw new Error("Admin mail S3 list failed (" + response.status + "): " + xml.slice(0, 500));
  const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].flatMap((match) => {
    const block = match[1] || "";
    const key = xmlValue(block, "Key");
    if (!key) return [];
    const size = Number(xmlValue(block, "Size") || "0");
    const modifiedRaw = xmlValue(block, "LastModified");
    const modified = modifiedRaw ? Date.parse(modifiedRaw) : Number.NaN;
    return [{
      key,
      size: Number.isFinite(size) && size >= 0 ? size : 0,
      etag: xmlValue(block, "ETag")?.replace(/^"|"$/g, ""),
      lastModified: Number.isFinite(modified) ? modified : undefined
    }];
  });
  return {
    objects,
    nextContinuationToken: xmlValue(xml, "NextContinuationToken") || undefined
  };
}

export async function getAdminMailS3Object(config: AdminMailS3Config, key: string): Promise<Readonly<{
  bytes: Uint8Array;
  contentType?: string;
  etag?: string;
}>> {
  const response = await signedFetch(config, objectUrl(config, key), { method: "GET" });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error("Admin mail S3 read failed (" + response.status + "): " + body.slice(0, 300));
    Object.assign(error, { status: response.status });
    throw error;
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || undefined,
    etag: response.headers.get("etag")?.replace(/^"|"$/g, "") || undefined
  };
}

export async function putAdminMailS3Object(input: {
  config: AdminMailS3Config;
  key: string;
  bytes: Uint8Array | string;
  contentType?: string;
}): Promise<void> {
  const body = typeof input.bytes === "string" ? Buffer.from(input.bytes, "utf8") : Buffer.from(input.bytes);
  const response = await signedFetch(input.config, objectUrl(input.config, input.key), {
    method: "PUT",
    body,
    contentType: input.contentType || "application/octet-stream"
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error("Admin mail S3 write failed (" + response.status + "): " + errorBody.slice(0, 500));
  }
}

async function signedFetch(
  config: AdminMailS3Config,
  url: URL,
  input: { method: "GET" | "PUT"; body?: Uint8Array; contentType?: string }
): Promise<Response> {
  const body = input.body ? Buffer.from(input.body) : Buffer.alloc(0);
  const payloadHash = createHash("sha256").update(body).digest("hex");
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const canonicalHeaders: Array<[string, string]> = [
    ["host", url.host],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", amzDate]
  ];
  if (input.contentType) canonicalHeaders.push(["content-type", input.contentType]);
  if (config.sessionToken) canonicalHeaders.push(["x-amz-security-token", config.sessionToken]);
  canonicalHeaders.sort(([a], [b]) => a.localeCompare(b));
  const signedHeaders = canonicalHeaders.map(([key]) => key).join(";");
  const canonicalHeaderText = canonicalHeaders.map(([key, value]) => key + ":" + normalizeHeaderValue(value) + "\n").join("");
  const canonicalQuery = [...url.searchParams.entries()]
    .sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv))
    .map(([key, value]) => awsEncode(key) + "=" + awsEncode(value))
    .join("&");
  const canonicalRequest = [
    input.method,
    canonicalPath(url.pathname),
    canonicalQuery,
    canonicalHeaderText,
    signedHeaders,
    payloadHash
  ].join("\n");
  const scope = dateStamp + "/" + config.region + "/s3/aws4_request";
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    createHash("sha256").update(canonicalRequest, "utf8").digest("hex")
  ].join("\n");
  const kDate = hmac(Buffer.from("AWS4" + config.secretAccessKey, "utf8"), dateStamp);
  const kRegion = hmac(kDate, config.region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");
  const headers: Record<string, string> = {
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    authorization: "AWS4-HMAC-SHA256 Credential=" + config.accessKeyId + "/" + scope + ", SignedHeaders=" + signedHeaders + ", Signature=" + signature
  };
  if (input.contentType) headers["content-type"] = input.contentType;
  if (config.sessionToken) headers["x-amz-security-token"] = config.sessionToken;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    return await fetch(url, {
      method: input.method,
      headers,
      body: input.method === "PUT" ? body : undefined,
      signal: controller.signal,
      cache: "no-store"
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Admin mail S3 request timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function bucketUrl(config: AdminMailS3Config): URL {
  return new URL("https://" + config.bucket + ".s3." + config.region + ".amazonaws.com/");
}

function objectUrl(config: AdminMailS3Config, key: string): URL {
  const url = bucketUrl(config);
  url.pathname = "/" + key.split("/").map((part) => encodeURIComponent(part)).join("/");
  return url;
}

function canonicalPath(pathname: string): string {
  return pathname.split("/").map((part) => awsEncode(decodeURIComponent(part))).join("/");
}

function xmlValue(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp("<" + tag + ">([\\s\\S]*?)<\\/" + tag + ">"));
  return match?.[1] ? decodeXml(match[1]) : undefined;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => "%" + character.charCodeAt(0).toString(16).toUpperCase());
}

function hmac(key: Uint8Array, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function positiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(name + " must be a positive integer");
  return value;
}
