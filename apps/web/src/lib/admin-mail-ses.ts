import { createHash, createHmac } from "node:crypto";

export type SesMailConfig = Readonly<{
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  endpoint?: string;
  timeoutMs: number;
}>;

export function sesMailConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SesMailConfig {
  const region = env.BLS_MAIL_AWS_REGION?.trim() || env.AWS_REGION?.trim();
  const accessKeyId = env.BLS_MAIL_AWS_ACCESS_KEY_ID?.trim() || env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.BLS_MAIL_AWS_SECRET_ACCESS_KEY?.trim() || env.AWS_SECRET_ACCESS_KEY?.trim();
  const sessionToken = env.BLS_MAIL_AWS_SESSION_TOKEN?.trim() || env.AWS_SESSION_TOKEN?.trim() || undefined;
  if (!region) throw new Error("BLS_MAIL_AWS_REGION or AWS_REGION is required for SES mail");
  if (!accessKeyId || !secretAccessKey) {
    const missing = [
      !accessKeyId ? "BLS_MAIL_AWS_ACCESS_KEY_ID" : undefined,
      !secretAccessKey ? "BLS_MAIL_AWS_SECRET_ACCESS_KEY" : undefined
    ].filter((value): value is string => Boolean(value));
    throw new Error(`AWS credentials are required for SES mail. Missing production variable${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
  }
  if (!/^[A-Z0-9]{16,128}$/.test(accessKeyId)) {
    throw new Error("BLS_MAIL_AWS_ACCESS_KEY_ID is malformed. Paste only the AWS Access key ID as one line (letters/numbers only; no label, quotes or line breaks).");
  }
  if ([...secretAccessKey].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new Error("BLS_MAIL_AWS_SECRET_ACCESS_KEY contains an invalid control character. Paste only the AWS Secret access key as one line.");
  }
  const timeoutMs = positiveInteger(env.BLS_MAIL_SES_TIMEOUT_MS, 12_000, "BLS_MAIL_SES_TIMEOUT_MS");
  return {
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    endpoint: env.BLS_MAIL_SES_ENDPOINT?.trim() || undefined,
    timeoutMs
  };
}

export function sesMailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.BLS_MAIL_ENABLED !== "true") return false;
  return Boolean(
    (env.BLS_MAIL_AWS_REGION?.trim() || env.AWS_REGION?.trim()) &&
    (env.BLS_MAIL_AWS_ACCESS_KEY_ID?.trim() || env.AWS_ACCESS_KEY_ID?.trim()) &&
    (env.BLS_MAIL_AWS_SECRET_ACCESS_KEY?.trim() || env.AWS_SECRET_ACCESS_KEY?.trim()) &&
    env.BLS_MAIL_FROM?.trim()
  );
}

export async function sendRawSesEmail(input: {
  config: SesMailConfig;
  raw: Uint8Array;
  from: string;
  to: readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
  configurationSetName?: string;
  emailTags?: readonly Readonly<{ name: string; value: string }>[];
}): Promise<{ providerMessageId: string }> {
  if (!input.to.length && !input.cc?.length && !input.bcc?.length) throw new Error("At least one email recipient is required");
  const endpoint = new URL(input.config.endpoint || `https://email.${input.config.region}.amazonaws.com`);
  endpoint.pathname = "/v2/email/outbound-emails";
  endpoint.search = "";

  const payload = JSON.stringify({
    FromEmailAddress: input.from,
    Destination: {
      ToAddresses: input.to,
      CcAddresses: input.cc ?? [],
      BccAddresses: input.bcc ?? []
    },
    Content: { Raw: { Data: Buffer.from(input.raw).toString("base64") } },
    ...(input.configurationSetName?.trim() ? { ConfigurationSetName: input.configurationSetName.trim() } : {}),
    ...(input.emailTags?.length ? {
      EmailTags: input.emailTags.map((tag) => ({
        Name: validSesTagPart(tag.name, "name"),
        Value: validSesTagPart(tag.value, "value")
      }))
    } : {})
  });
  const headers = signAwsRequest({
    method: "POST",
    url: endpoint,
    body: payload,
    region: input.config.region,
    service: "ses",
    accessKeyId: input.config.accessKeyId,
    secretAccessKey: input.config.secretAccessKey,
    sessionToken: input.config.sessionToken,
    contentType: "application/json"
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.config.timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: payload,
      signal: controller.signal,
      cache: "no-store"
    });
    const responseText = await response.text();
    const parsed = safeJson(responseText);
    if (!response.ok) {
      const providerMessage = textValue(parsed?.message) || textValue(parsed?.Message) || responseText.slice(0, 500);
      throw new Error(`SES send failed (${response.status})${providerMessage ? `: ${providerMessage}` : ""}`);
    }
    const providerMessageId = textValue(parsed?.MessageId) || textValue(parsed?.messageId);
    if (!providerMessageId) throw new Error("SES did not return a MessageId");
    return { providerMessageId };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("SES send timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function signAwsRequest(input: {
  method: string;
  url: URL;
  body: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  contentType: string;
}): Record<string, string> {
  const now = new Date();
  const amzDate = awsDateTime(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(input.body);
  const canonicalUri = input.url.pathname || "/";
  const canonicalQuery = [...input.url.searchParams.entries()]
    .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue))
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
    .join("&");

  const canonicalHeaderEntries: [string, string][] = [
    ["content-type", input.contentType],
    ["host", input.url.host],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", amzDate]
  ];
  if (input.sessionToken) canonicalHeaderEntries.push(["x-amz-security-token", input.sessionToken]);
  canonicalHeaderEntries.sort(([a], [b]) => a.localeCompare(b));
  const canonicalHeaders = canonicalHeaderEntries.map(([key, value]) => `${key}:${normalizeHeaderValue(value)}\n`).join("");
  const signedHeaders = canonicalHeaderEntries.map(([key]) => key).join(";");

  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest)
  ].join("\n");

  const kDate = hmac(Buffer.from(`AWS4${input.secretAccessKey}`, "utf8"), dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return {
    "content-type": input.contentType,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(input.sessionToken ? { "x-amz-security-token": input.sessionToken } : {}),
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Uint8Array, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function awsDateTime(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function safeJson(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function validSesTagPart(value: string, label: "name" | "value"): string {
  const clean = value.trim();
  if (!clean || clean.length > 256 || !/^[A-Za-z0-9_-]+$/.test(clean)) {
    throw new Error(`SES email tag ${label} must contain only ASCII letters, numbers, underscores or dashes and be 1-256 characters`);
  }
  return clean;
}

function positiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
