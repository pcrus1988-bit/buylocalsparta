import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.7";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.2.10";

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "kontamou-icecat-runtime";
const REPOSITORY = "pcrus1988-bit/buylocalsparta";
const REPOSITORY_ID = "1337008113";
const OWNER = "pcrus1988-bit";
const OWNER_ID = "250801106";
const ALLOWED_WORKFLOWS = new Set([
  `${REPOSITORY}/.github/workflows/open-icecat-production-index.yml@refs/heads/main`,
  `${REPOSITORY}/.github/workflows/open-icecat-production-detail.yml@refs/heads/main`
]);
const ALLOWED_EVENTS = new Set(["push", "schedule", "workflow_dispatch"]);
const REQUIRED_SECRET_NAMES = [
  "icecat_username",
  "icecat_api_token",
  "icecat_content_token",
  "icecat_password",
  "icecat_worker_db_password"
] as const;
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "pragma": "no-cache"
    }
  });
}

function bearer(req: Request): string | null {
  const value = req.headers.get("authorization")?.trim() ?? "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const token = bearer(req);
  if (!token) return json({ error: "missing_oidc_token" }, 401);

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["RS256"],
      clockTolerance: 5
    });

    const workflowRef = String(payload.workflow_ref ?? "");
    const eventName = String(payload.event_name ?? "");
    const authorized =
      payload.repository === REPOSITORY &&
      String(payload.repository_id ?? "") === REPOSITORY_ID &&
      payload.repository_owner === OWNER &&
      String(payload.repository_owner_id ?? "") === OWNER_ID &&
      payload.ref === "refs/heads/main" &&
      payload.ref_type === "branch" &&
      payload.runner_environment === "github-hosted" &&
      payload.repository_visibility === "public" &&
      ALLOWED_WORKFLOWS.has(workflowRef) &&
      ALLOWED_EVENTS.has(eventName);

    if (!authorized) return json({ error: "oidc_claims_not_authorized" }, 403);

    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) return json({ error: "broker_database_unavailable" }, 503);
    const sql = postgres(dbUrl, { max: 1, prepare: false, idle_timeout: 2, connect_timeout: 5 });
    try {
      const rows = await sql<{ name: string; decrypted_secret: string }[]>`
        select name, decrypted_secret
        from vault.decrypted_secrets
        where name = any(${REQUIRED_SECRET_NAMES as unknown as string[]})
      `;
      const values = new Map(rows.map((row) => [row.name, row.decrypted_secret]));
      const missing = REQUIRED_SECRET_NAMES.filter((name) => !values.get(name));
      if (missing.length) return json({ error: "runtime_secret_incomplete", missing }, 503);

      return json({
        username: values.get("icecat_username"),
        apiToken: values.get("icecat_api_token"),
        contentToken: values.get("icecat_content_token"),
        password: values.get("icecat_password"),
        databasePassword: values.get("icecat_worker_db_password"),
        databaseUser: "bls_icecat_worker",
        databaseProjectRef: "eemihhfreggbigxejjhj",
        databaseRegion: "us-east-1"
      });
    } finally {
      await sql.end({ timeout: 2 });
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "icecat.runtime_broker.denied", message: error instanceof Error ? error.message : String(error) }));
    return json({ error: "invalid_oidc_token" }, 401);
  }
});
