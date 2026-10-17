import { createPublicKey, verify as verifySignature } from "node:crypto";

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_JWKS = "https://token.actions.githubusercontent.com/.well-known/jwks";
export const CATALOGUE_INTAKE_OIDC_AUDIENCE = "kontamou-catalogue-intake";
const EXPECTED_REPOSITORY = "pcrus1988-bit/buylocalsparta";
const EXPECTED_REPOSITORY_ID = "1337008113";
const EXPECTED_OWNER_ID = "250801106";
const EXPECTED_REF = "refs/heads/main";
const EXPECTED_WORKFLOW = "Catalogue intake automation";
const EXPECTED_WORKFLOW_REF = `${EXPECTED_REPOSITORY}/.github/workflows/catalogue-intake-automation.yml@${EXPECTED_REF}`;
const ALLOWED_EVENTS = new Set(["push", "schedule", "workflow_dispatch"]);
const CLOCK_SKEW_SECONDS = 60;
const JWKS_TTL_MS = 60 * 60 * 1000;

type JwtHeader = Readonly<{
  alg?: string;
  kid?: string;
  typ?: string;
}>;

export type CatalogueIntakeGithubClaims = Readonly<{
  iss: string;
  aud: string | readonly string[];
  exp: number;
  iat: number;
  nbf?: number;
  jti?: string;
  repository: string;
  repository_id: string;
  repository_owner_id: string;
  ref: string;
  ref_type?: string;
  event_name: string;
  workflow: string;
  workflow_ref: string;
  run_id: string;
  run_attempt: string;
  runner_environment?: string;
}>;

type RsaJwk = Readonly<{
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
}>;

let jwksCache: Readonly<{ expiresAt: number; keys: readonly RsaJwk[] }> | undefined;

export async function verifyCatalogueIntakeGithubToken(token: string): Promise<CatalogueIntakeGithubClaims> {
  const compact = token.trim();
  const parts = compact.split(".");
  if (parts.length !== 3) throw new Error("invalid GitHub OIDC token");

  const header = decodeJson<JwtHeader>(parts[0]);
  const claims = decodeJson<CatalogueIntakeGithubClaims>(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("unsupported GitHub OIDC signing header");

  const jwk = (await githubSigningKeys()).find((candidate) =>
    candidate.kid === header.kid
    && candidate.kty === "RSA"
    && (candidate.use === undefined || candidate.use === "sig")
    && (candidate.alg === undefined || candidate.alg === "RS256")
  );
  if (!jwk?.n || !jwk.e) throw new Error("GitHub OIDC signing key was not found");

  const publicKey = createPublicKey({
    key: jwk as never,
    format: "jwk"
  });
  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`, "utf8");
  const signature = Buffer.from(parts[2], "base64url");
  if (!verifySignature("RSA-SHA256", signingInput, publicKey, signature)) {
    throw new Error("GitHub OIDC signature verification failed");
  }

  validateClaims(claims);
  return claims;
}

function validateClaims(claims: CatalogueIntakeGithubClaims): void {
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== GITHUB_OIDC_ISSUER) throw new Error("unexpected GitHub OIDC issuer");
  if (!audienceIncludes(claims.aud, CATALOGUE_INTAKE_OIDC_AUDIENCE)) throw new Error("unexpected GitHub OIDC audience");
  if (!Number.isFinite(claims.exp) || claims.exp < now - CLOCK_SKEW_SECONDS) throw new Error("expired GitHub OIDC token");
  if (!Number.isFinite(claims.iat) || claims.iat > now + CLOCK_SKEW_SECONDS) throw new Error("invalid GitHub OIDC issued-at time");
  if (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + CLOCK_SKEW_SECONDS)) {
    throw new Error("GitHub OIDC token is not active yet");
  }
  if (claims.repository !== EXPECTED_REPOSITORY) throw new Error("unexpected GitHub repository");
  if (claims.repository_id !== EXPECTED_REPOSITORY_ID) throw new Error("unexpected GitHub repository id");
  if (claims.repository_owner_id !== EXPECTED_OWNER_ID) throw new Error("unexpected GitHub repository owner id");
  if (claims.ref !== EXPECTED_REF || (claims.ref_type && claims.ref_type !== "branch")) throw new Error("GitHub OIDC token is not for main");
  if (claims.workflow !== EXPECTED_WORKFLOW || claims.workflow_ref !== EXPECTED_WORKFLOW_REF) {
    throw new Error("unexpected GitHub Actions workflow");
  }
  if (!ALLOWED_EVENTS.has(claims.event_name)) throw new Error("unexpected GitHub Actions event");
  if (claims.runner_environment && claims.runner_environment !== "github-hosted") throw new Error("unexpected GitHub runner environment");
  if (!claims.run_id || !claims.run_attempt) throw new Error("GitHub Actions run identity is missing");
}

async function githubSigningKeys(): Promise<readonly RsaJwk[]> {
  const now = Date.now();
  if (jwksCache && jwksCache.expiresAt > now) return jwksCache.keys;

  const response = await fetch(GITHUB_OIDC_JWKS, {
    headers: { accept: "application/json", "user-agent": "KONTAMOU-Catalogue-Intake-OIDC/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) throw new Error(`GitHub OIDC JWKS fetch failed (${response.status})`);

  const payload = await response.json() as { keys?: RsaJwk[] };
  if (!Array.isArray(payload.keys) || payload.keys.length === 0) throw new Error("GitHub OIDC JWKS is empty");
  jwksCache = { expiresAt: now + JWKS_TTL_MS, keys: payload.keys };
  return payload.keys;
}

function audienceIncludes(audience: string | readonly string[], expected: string): boolean {
  return typeof audience === "string" ? audience === expected : Array.isArray(audience) && audience.includes(expected);
}

function decodeJson<T>(part: string): T {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
  } catch {
    throw new Error("invalid GitHub OIDC token encoding");
  }
}
