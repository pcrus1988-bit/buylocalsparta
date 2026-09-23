import "server-only";

import { createPublicKey, timingSafeEqual, verify } from "node:crypto";

const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_JWKS_URL = "https://token.actions.githubusercontent.com/.well-known/jwks";
const EXPECTED_AUDIENCE = "https://kontamou.site";
const EXPECTED_REPOSITORY = "pcrus1988-bit/buylocalsparta";
const EXPECTED_REPOSITORY_ID = "1337008113";
const EXPECTED_REF = "refs/heads/main";
const EXPECTED_WORKFLOW_REF = "pcrus1988-bit/buylocalsparta/.github/workflows/google-merchant-production-sync.yml@refs/heads/main";
const ALLOWED_EVENTS = new Set(["push", "schedule", "workflow_dispatch"]);
const JWKS_CACHE_MS = 10 * 60_000;
const CLOCK_SKEW_SECONDS = 60;
const MAX_TOKEN_AGE_SECONDS = 10 * 60;

type GithubOidcHeader = Readonly<{
  alg?: string;
  kid?: string;
  typ?: string;
}>;

type GithubOidcClaims = Readonly<{
  iss?: string;
  aud?: string | readonly string[];
  exp?: number;
  iat?: number;
  nbf?: number;
  jti?: string;
  repository?: string;
  repository_id?: string;
  repository_visibility?: string;
  ref?: string;
  event_name?: string;
  workflow_ref?: string;
  runner_environment?: string;
}>;

type JsonWebKey = Readonly<{
  kid?: string;
  kty?: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
}>;

type JsonWebKeySet = Readonly<{ keys?: readonly JsonWebKey[] }>;

let cachedJwks: Readonly<{ expiresAt: number; keys: readonly JsonWebKey[] }> | undefined;

export type GoogleSchedulerAuthMode = "vercel_bearer" | "github_oidc";

function safeEquals(left: string, right: string): boolean {
  if (!left || !right) return false;
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function bearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization?.startsWith("Bearer ")) return undefined;
  const token = authorization.slice("Bearer ".length).trim();
  return token || undefined;
}

function decodeJsonPart<T>(part: string): T | undefined {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
  } catch {
    return undefined;
  }
}

function audienceMatches(audience: GithubOidcClaims["aud"]): boolean {
  if (typeof audience === "string") return audience === EXPECTED_AUDIENCE;
  return Array.isArray(audience) && audience.includes(EXPECTED_AUDIENCE);
}

function claimsAreTrusted(claims: GithubOidcClaims, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (claims.iss !== GITHUB_ISSUER || !audienceMatches(claims.aud)) return false;
  if (claims.repository !== EXPECTED_REPOSITORY || claims.repository_id !== EXPECTED_REPOSITORY_ID) return false;
  if (claims.repository_visibility !== "public" || claims.ref !== EXPECTED_REF) return false;
  if (claims.workflow_ref !== EXPECTED_WORKFLOW_REF || !claims.event_name || !ALLOWED_EVENTS.has(claims.event_name)) return false;
  if (claims.runner_environment !== "github-hosted") return false;
  if (!claims.jti || typeof claims.exp !== "number" || typeof claims.iat !== "number") return false;
  if (claims.exp < nowSeconds - CLOCK_SKEW_SECONDS) return false;
  if (claims.iat > nowSeconds + CLOCK_SKEW_SECONDS || claims.iat < nowSeconds - MAX_TOKEN_AGE_SECONDS) return false;
  if (typeof claims.nbf === "number" && claims.nbf > nowSeconds + CLOCK_SKEW_SECONDS) return false;
  return true;
}

async function githubJwks(now = Date.now()): Promise<readonly JsonWebKey[]> {
  if (cachedJwks && cachedJwks.expiresAt > now) return cachedJwks.keys;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(GITHUB_JWKS_URL, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`GitHub OIDC JWKS request failed (${response.status}).`);
    const body = await response.json() as JsonWebKeySet;
    const keys = (body.keys ?? []).filter((key) =>
      typeof key.kid === "string"
      && key.kty === "RSA"
      && typeof key.n === "string"
      && typeof key.e === "string"
    );
    if (!keys.length) throw new Error("GitHub OIDC JWKS returned no usable RSA keys.");
    cachedJwks = { expiresAt: now + JWKS_CACHE_MS, keys };
    return keys;
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyGithubOidcToken(token: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  const header = decodeJsonPart<GithubOidcHeader>(encodedHeader);
  const claims = decodeJsonPart<GithubOidcClaims>(encodedClaims);
  if (!header || !claims || header.alg !== "RS256" || !header.kid || header.typ !== "JWT") return false;
  if (!claimsAreTrusted(claims)) return false;

  const keys = await githubJwks();
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    cachedJwks = undefined;
    const refreshed = await githubJwks();
    const refreshedKey = refreshed.find((key) => key.kid === header.kid);
    if (!refreshedKey) return false;
    return verifyTokenSignature(encodedHeader, encodedClaims, encodedSignature, refreshedKey);
  }
  return verifyTokenSignature(encodedHeader, encodedClaims, encodedSignature, jwk);
}

function verifyTokenSignature(
  encodedHeader: string,
  encodedClaims: string,
  encodedSignature: string,
  jwk: JsonWebKey
): boolean {
  try {
    const key = createPublicKey({ key: jwk as JsonWebKey & JsonWebKeyInput, format: "jwk" });
    return verify(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedClaims}`, "utf8"),
      key,
      Buffer.from(encodedSignature, "base64url")
    );
  } catch {
    return false;
  }
}

type JsonWebKeyInput = {
  kty: string;
  n?: string;
  e?: string;
  [key: string]: unknown;
};

export async function authorizeGoogleSchedulerRequest(
  request: Request,
  cronSecret: string | undefined = process.env.CRON_SECRET
): Promise<GoogleSchedulerAuthMode | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const configuredSecret = cronSecret?.trim();
  if (configuredSecret && safeEquals(token, configuredSecret)) return "vercel_bearer";

  try {
    return await verifyGithubOidcToken(token) ? "github_oidc" : null;
  } catch {
    return null;
  }
}
