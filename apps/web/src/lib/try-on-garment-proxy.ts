import { accountAuthSecret } from "./account-auth-secret";

const TOKEN_TTL_MS = 3 * 60 * 1000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type GarmentProxyPayload = Readonly<{
  v: 1;
  src: string;
  exp: number;
}>;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + 0x8000)));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function safeSourceUrl(value: string): string {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:") throw new Error("TRY_ON_PRODUCT_IMAGE_LOAD_FAILED");
  if (
    host === "localhost"
    || host === "127.0.0.1"
    || host === "::1"
    || host.endsWith(".local")
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) throw new Error("TRY_ON_PRODUCT_IMAGE_LOAD_FAILED");
  return url.toString();
}

async function hmacKey(usages: KeyUsage[]): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(accountAuthSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages
  );
}

export async function issueTryOnGarmentProxyToken(src: string, now = Date.now()): Promise<string> {
  const payload: GarmentProxyPayload = {
    v: 1,
    src: safeSourceUrl(src),
    exp: now + TOKEN_TTL_MS
  };
  const encoded = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(["sign"]);
  const signature = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(encoded)));
  return `${encoded}.${bytesToBase64Url(signature)}`;
}

export async function verifyTryOnGarmentProxyToken(token: string, now = Date.now()): Promise<string> {
  const [encoded, signatureText, extra] = token.split(".");
  if (!encoded || !signatureText || extra) throw new Error("INVALID_TRY_ON_GARMENT_PROXY_TOKEN");
  const key = await hmacKey(["verify"]);
  const valid = await globalThis.crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBytes(signatureText),
    encoder.encode(encoded)
  );
  if (!valid) throw new Error("INVALID_TRY_ON_GARMENT_PROXY_TOKEN");

  const payload = JSON.parse(decoder.decode(base64UrlToBytes(encoded))) as Partial<GarmentProxyPayload>;
  if (payload.v !== 1 || typeof payload.src !== "string" || typeof payload.exp !== "number") {
    throw new Error("INVALID_TRY_ON_GARMENT_PROXY_TOKEN");
  }
  if (!Number.isFinite(payload.exp) || payload.exp < now || payload.exp > now + TOKEN_TTL_MS + 30_000) {
    throw new Error("TRY_ON_GARMENT_PROXY_TOKEN_EXPIRED");
  }
  return safeSourceUrl(payload.src);
}
