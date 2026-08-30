import {
  createHash,
  createHmac,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify as verifySignature
} from "node:crypto";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_ENDPOINT = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const FLOW_TTL_MS = 10 * 60 * 1000;
const PENDING_TTL_MS = 15 * 60 * 1000;

export const GOOGLE_FLOW_COOKIE = "bls_google_oauth";
export const GOOGLE_PENDING_COOKIE = "bls_google_pending";

export type GoogleIdentity = Readonly<{
  subject: string;
  email: string;
  name?: string;
}>;

type FlowPayload = Readonly<{
  state: string;
  verifier: string;
  nonce: string;
  next: string;
  redirectUri: string;
  expiresAt: number;
}>;

type PendingPayload = Readonly<{
  subject: string;
  email: string;
  next: string;
  expiresAt: number;
}>;

type GoogleIdTokenClaims = Readonly<{
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  azp?: unknown;
  exp?: unknown;
  iat?: unknown;
  nonce?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
}>;

type GoogleJwk = Record<string, unknown> & { kid?: unknown; alg?: unknown; use?: unknown };
type GoogleJwksCache = { keys: GoogleJwk[]; expiresAt: number };
const globals = globalThis as typeof globalThis & { __blsGoogleJwks?: GoogleJwksCache };

export function safeAccountNext(value: string | null | undefined, fallback = "/account"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export function googleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim());
}

export function beginGoogleOAuth(request: Request, requestedNext?: string | null): { authorizationUrl: string; cookieValue: string; expiresAt: number } {
  const clientId = requiredEnv("GOOGLE_OAUTH_CLIENT_ID");
  requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET");
  const now = Date.now();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const next = safeAccountNext(requestedNext);
  const redirectUri = googleRedirectUri(request);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const expiresAt = now + FLOW_TTL_MS;
  const payload: FlowPayload = { state, verifier, nonce, next, redirectUri, expiresAt };

  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");

  return { authorizationUrl: url.toString(), cookieValue: signPayload("google-flow", payload), expiresAt };
}

export function readGoogleFlowCookie(value: string | undefined, returnedState: string | null): FlowPayload {
  const payload = readSignedPayload<FlowPayload>("google-flow", value);
  if (payload.expiresAt <= Date.now()) throw new Error("google_flow_expired");
  if (!returnedState || !safeEqual(payload.state, returnedState)) throw new Error("google_state_mismatch");
  if (!payload.verifier || !payload.nonce || !payload.redirectUri) throw new Error("google_flow_invalid");
  return payload;
}

export function createPendingGoogleCookie(identity: GoogleIdentity, next: string): { value: string; expiresAt: number } {
  const expiresAt = Date.now() + PENDING_TTL_MS;
  const payload: PendingPayload = {
    subject: identity.subject,
    email: identity.email,
    next: safeAccountNext(next),
    expiresAt
  };
  return { value: signPayload("google-pending", payload), expiresAt };
}

export function readPendingGoogleCookie(value: string | undefined): PendingPayload {
  const payload = readSignedPayload<PendingPayload>("google-pending", value);
  if (payload.expiresAt <= Date.now()) throw new Error("google_pending_expired");
  if (!payload.subject || !payload.email) throw new Error("google_pending_invalid");
  return { ...payload, next: safeAccountNext(payload.next) };
}

export async function exchangeGoogleAuthorizationCode(input: { code: string; flow: FlowPayload }): Promise<GoogleIdentity> {
  const clientId = requiredEnv("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET");
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: input.code,
      code_verifier: input.flow.verifier,
      grant_type: "authorization_code",
      redirect_uri: input.flow.redirectUri
    }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error("google_token_exchange_failed");
  const token = await response.json() as { id_token?: unknown };
  if (typeof token.id_token !== "string" || !token.id_token) throw new Error("google_id_token_missing");
  return verifyGoogleIdToken(token.id_token, { clientId, nonce: input.flow.nonce });
}

async function verifyGoogleIdToken(token: string, expected: { clientId: string; nonce: string }): Promise<GoogleIdentity> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("google_id_token_invalid");
  const header = decodeJson(parts[0]) as { alg?: unknown; kid?: unknown };
  const claims = decodeJson(parts[1]) as GoogleIdTokenClaims;
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) throw new Error("google_id_token_invalid");

  const keys = await googleJwks();
  const jwk = keys.find((key) => key.kid === header.kid && (key.alg == null || key.alg === "RS256") && (key.use == null || key.use === "sig"));
  if (!jwk) {
    globals.__blsGoogleJwks = undefined;
    const refreshed = await googleJwks();
    const retryKey = refreshed.find((key) => key.kid === header.kid && (key.alg == null || key.alg === "RS256") && (key.use == null || key.use === "sig"));
    if (!retryKey || !verifyJwtSignature(parts, retryKey)) throw new Error("google_id_token_signature_invalid");
  } else if (!verifyJwtSignature(parts, jwk)) {
    throw new Error("google_id_token_signature_invalid");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof claims.iss !== "string" || !GOOGLE_ISSUERS.has(claims.iss)) throw new Error("google_id_token_issuer_invalid");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(expected.clientId)) throw new Error("google_id_token_audience_invalid");
  if (typeof claims.azp === "string" && claims.azp !== expected.clientId) throw new Error("google_id_token_presenter_invalid");
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) throw new Error("google_id_token_expired");
  if (typeof claims.iat !== "number" || claims.iat > nowSeconds + 300) throw new Error("google_id_token_time_invalid");
  if (typeof claims.nonce !== "string" || !safeEqual(claims.nonce, expected.nonce)) throw new Error("google_id_token_nonce_invalid");
  if (claims.email_verified !== true) throw new Error("google_email_unverified");
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255) throw new Error("google_subject_invalid");
  if (typeof claims.email !== "string") throw new Error("google_email_missing");
  const email = normalizeEmail(claims.email);
  const name = typeof claims.name === "string" ? claims.name.trim().replace(/\s+/g, " ").slice(0, 160) : undefined;
  return { subject: claims.sub, email, ...(name ? { name } : {}) };
}

function verifyJwtSignature(parts: string[], jwk: GoogleJwk): boolean {
  try {
    const key = createPublicKey({ key: jwk as never, format: "jwk" });
    return verifySignature(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`, "utf8"),
      key,
      Buffer.from(parts[2], "base64url")
    );
  } catch {
    return false;
  }
}

async function googleJwks(): Promise<GoogleJwk[]> {
  const cached = globals.__blsGoogleJwks;
  if (cached && cached.expiresAt > Date.now()) return cached.keys;
  const response = await fetch(GOOGLE_JWKS_ENDPOINT, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error("google_keys_unavailable");
  const body = await response.json() as { keys?: unknown };
  if (!Array.isArray(body.keys)) throw new Error("google_keys_invalid");
  const keys = body.keys.filter((value): value is GoogleJwk => Boolean(value && typeof value === "object"));
  const cacheControl = response.headers.get("cache-control") ?? "";
  const seconds = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] ?? 3600);
  const ttlMs = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 24 * 60 * 60) * 1000 : 60 * 60 * 1000;
  globals.__blsGoogleJwks = { keys, expiresAt: Date.now() + ttlMs };
  return keys;
}

function googleRedirectUri(request: Request): string {
  const configured = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (configured) return configured;
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    return "https://kontamou.site/api/account/google/callback";
  }
  return `${new URL(request.url).origin}/api/account/google/callback`;
}

function requiredEnv(name: "GOOGLE_OAUTH_CLIENT_ID" | "GOOGLE_OAUTH_CLIENT_SECRET"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("google_oauth_not_configured");
  return value;
}

function oauthSigningSecret(): string {
  const secret = process.env.BLS_AUTH_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("BLS_AUTH_SECRET is required for Google OAuth state");
  return "buy-local-sparta-development-account-auth-secret-not-production";
}

function signPayload(purpose: string, payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", oauthSigningSecret()).update(`${purpose}:${encoded}`).digest("base64url");
  return `${encoded}.${signature}`;
}

function readSignedPayload<T>(purpose: string, value: string | undefined): T {
  if (!value) throw new Error(`${purpose}_missing`);
  const separator = value.lastIndexOf(".");
  if (separator <= 0) throw new Error(`${purpose}_invalid`);
  const encoded = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = createHmac("sha256", oauthSigningSecret()).update(`${purpose}:${encoded}`).digest("base64url");
  if (!safeEqual(signature, expected)) throw new Error(`${purpose}_invalid`);
  return decodeJson(encoded) as T;
}

function decodeJson(encoded: string): unknown {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("google_payload_invalid");
  }
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("google_email_invalid");
  return email;
}

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
