import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { accountAuthSecret } from "./account-auth-secret.ts";

const SAVE_TOKEN_VERSION = "v1";
const SAVE_TOKEN_TTL_MS = 5 * 60 * 1000;

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function imageDigest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("base64url");
}

function saveSignature(input: {
  userPublicId: string;
  productId: string;
  predictionId: string;
  imageHash: string;
  expiresAt: number;
  nonce: string;
}): string {
  const message = JSON.stringify([
    "customer-try-on-save",
    SAVE_TOKEN_VERSION,
    input.userPublicId,
    input.productId,
    input.predictionId,
    input.imageHash,
    input.expiresAt,
    input.nonce
  ]);
  return createHmac("sha256", accountAuthSecret()).update(message).digest("base64url");
}

export function customerTryOnBrowserStorageScope(userPublicId: string): string {
  return createHmac("sha256", accountAuthSecret())
    .update(`customer-try-on-browser:${userPublicId}`)
    .digest("base64url")
    .slice(0, 32);
}

export function issueCustomerTryOnSaveToken(input: {
  userPublicId: string;
  productId: string;
  predictionId: string;
  imageBytes: Uint8Array;
  now?: number;
}): string {
  const now = input.now ?? Date.now();
  const expiresAt = now + SAVE_TOKEN_TTL_MS;
  const nonce = randomBytes(12).toString("base64url");
  const imageHash = imageDigest(input.imageBytes);
  const signature = saveSignature({ ...input, imageHash, expiresAt, nonce });
  return [SAVE_TOKEN_VERSION, expiresAt.toString(36), nonce, signature].join(".");
}

export function assertCustomerTryOnSaveToken(input: {
  token: unknown;
  userPublicId: string;
  productId: string;
  predictionId: string;
  imageBytes: Uint8Array;
  now?: number;
}): void {
  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (!token || token.length > 240) throw new Error("INVALID_TRY_ON_SAVE_TOKEN");
  const [version, encodedExpiry, nonce, signature, extra] = token.split(".");
  if (extra || version !== SAVE_TOKEN_VERSION || !encodedExpiry || !nonce || !signature) {
    throw new Error("INVALID_TRY_ON_SAVE_TOKEN");
  }

  const expiresAt = Number.parseInt(encodedExpiry, 36);
  const now = input.now ?? Date.now();
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) throw new Error("TRY_ON_SAVE_TOKEN_EXPIRED");
  if (expiresAt > now + SAVE_TOKEN_TTL_MS + 60_000) throw new Error("INVALID_TRY_ON_SAVE_TOKEN");
  if (!/^[A-Za-z0-9_-]{12,40}$/.test(nonce) || !/^[A-Za-z0-9_-]{40,64}$/.test(signature)) {
    throw new Error("INVALID_TRY_ON_SAVE_TOKEN");
  }

  const expected = saveSignature({
    userPublicId: input.userPublicId,
    productId: input.productId,
    predictionId: input.predictionId,
    imageHash: imageDigest(input.imageBytes),
    expiresAt,
    nonce
  });
  if (!safeEqual(signature, expected)) throw new Error("INVALID_TRY_ON_SAVE_TOKEN");
}
