import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 10 * 60 * 1000;

type DailyPushBridgeIdentity = Readonly<{
  userId: string;
  vendorId: string;
}>;

type DailyPushBridgePayload = Readonly<{
  v: 1;
  userId: string;
  vendorId: string;
  iat: number;
  exp: number;
}>;

function signingKey(): Buffer {
  const source = process.env.BLS_AUTH_SECRET?.trim();
  if (!source || source.length < 32) throw new Error("Daily push bridge signing secret is not configured");
  return createHmac("sha256", source).update("kontamou:daily-push-bridge:v1").digest();
}

function encode(value: string): string { return Buffer.from(value, "utf8").toString("base64url"); }
function decode(value: string): string { return Buffer.from(value, "base64url").toString("utf8"); }

function signature(encodedPayload: string): string {
  return createHmac("sha256", signingKey()).update(encodedPayload).digest("base64url");
}

export function createDailyPushBridgeToken(identity: DailyPushBridgeIdentity, now = Date.now()): string {
  if (!identity.userId.trim() || !identity.vendorId.trim()) throw new Error("Daily push bridge identity is incomplete");
  const payload: DailyPushBridgePayload = {
    v: 1,
    userId: identity.userId.trim(),
    vendorId: identity.vendorId.trim(),
    iat: now,
    exp: now + TOKEN_TTL_MS
  };
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${signature(encoded)}`;
}

export function verifyDailyPushBridgeToken(token: string, now = Date.now()): DailyPushBridgeIdentity {
  const value = token.trim();
  const dot = value.lastIndexOf(".");
  if (dot <= 0 || value.length > 2000) throw new Error("Invalid Daily push bridge token");
  const encoded = value.slice(0, dot);
  const supplied = Buffer.from(value.slice(dot + 1), "base64url");
  const expected = Buffer.from(signature(encoded), "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("Invalid Daily push bridge token");

  let parsed: DailyPushBridgePayload;
  try { parsed = JSON.parse(decode(encoded)) as DailyPushBridgePayload; }
  catch { throw new Error("Invalid Daily push bridge token"); }
  if (parsed.v !== 1 || typeof parsed.userId !== "string" || typeof parsed.vendorId !== "string" || !parsed.userId.trim() || !parsed.vendorId.trim()) {
    throw new Error("Invalid Daily push bridge token");
  }
  if (!Number.isFinite(parsed.iat) || !Number.isFinite(parsed.exp) || parsed.exp <= now || parsed.iat > now + 60_000 || parsed.exp - parsed.iat > TOKEN_TTL_MS + 60_000) {
    throw new Error("Daily push bridge token expired");
  }
  return { userId: parsed.userId.trim(), vendorId: parsed.vendorId.trim() };
}

export function dailyPushBridgeOrigin(): string {
  return (process.env.BLS_DAILY_PUSH_BRIDGE_ORIGIN?.trim() || "https://buylocalsparta-web.vercel.app").replace(/\/$/, "");
}
