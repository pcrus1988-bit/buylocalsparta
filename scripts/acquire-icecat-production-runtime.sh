#!/usr/bin/env bash
set -euo pipefail

: "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:?GitHub OIDC token request token is required}"
: "${ACTIONS_ID_TOKEN_REQUEST_URL:?GitHub OIDC token request URL is required}"
: "${ICECAT_RUNTIME_BROKER_URL:?Icecat runtime broker URL is required}"
: "${ICECAT_RUNTIME_AUDIENCE:?Icecat runtime audience is required}"
: "${GITHUB_ENV:?GitHub environment file is required}"

runtime_file="$(mktemp)"
trap 'rm -f "$runtime_file"' EXIT

oidc_response="$(curl --fail --silent --show-error \
  -H "Authorization: Bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
  "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=${ICECAT_RUNTIME_AUDIENCE}")"
oidc_token="$(jq -er '.value' <<<"$oidc_response")"

status="$(curl --silent --show-error \
  --output "$runtime_file" \
  --write-out '%{http_code}' \
  --request POST \
  -H "Authorization: Bearer ${oidc_token}" \
  -H 'Content-Type: application/json' \
  "$ICECAT_RUNTIME_BROKER_URL")"
if [[ "$status" != "200" ]]; then
  broker_error="$(jq -r '.error // "runtime broker rejected request"' "$runtime_file" 2>/dev/null || true)"
  echo "::error title=Icecat runtime broker::${broker_error}"
  exit 1
fi

export_secret() {
  local json_key="$1"
  local env_name="$2"
  local value
  value="$(jq -er --arg key "$json_key" '.[$key]' "$runtime_file")"
  echo "::add-mask::${value}"
  printf '%s=%s\n' "$env_name" "$value" >> "$GITHUB_ENV"
  printf -v "$env_name" '%s' "$value"
  export "$env_name"
}

export_secret username ICECAT_USERNAME
export_secret apiToken ICECAT_API_TOKEN
export_secret contentToken ICECAT_CONTENT_TOKEN
export_secret password ICECAT_PASSWORD
export_secret databasePassword ICECAT_WORKER_DB_PASSWORD

db_user="$(jq -er '.databaseUser' "$runtime_file")"
project_ref="$(jq -er '.databaseProjectRef' "$runtime_file")"
db_region="$(jq -er '.databaseRegion' "$runtime_file")"
encoded_db_user="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "${db_user}.${project_ref}")"
encoded_db_password="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$ICECAT_WORKER_DB_PASSWORD")"
echo "::add-mask::${encoded_db_password}"
resolved_url=""

probe_endpoint() {
  local host="$1"
  local mode="$2"
  local query=""
  if [[ "$mode" == "verify-full" ]]; then
    query='?sslmode=verify-full'
  elif [[ "$mode" == "require" ]]; then
    query='?sslmode=require'
  fi
  local candidate="postgresql://${encoded_db_user}:${encoded_db_password}@${host}:5432/postgres${query}"
  if DATABASE_URL="$candidate" PROBE_HOST="$host" PROBE_MODE="$mode" node --input-type=module <<'NODE'
import pg from "pg";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 7000 });
try {
  await client.connect();
  const result = await client.query("select current_user as current_user");
  if (result.rows[0]?.current_user !== "bls_icecat_worker") {
    console.error(JSON.stringify({ host: process.env.PROBE_HOST, mode: process.env.PROBE_MODE, code: "unexpected_user" }));
    process.exitCode = 1;
  }
} catch (error) {
  const raw = error instanceof Error ? error.message : String(error);
  const secret = process.env.ICECAT_WORKER_DB_PASSWORD ?? "";
  const message = secret ? raw.replaceAll(secret, "***") : raw;
  console.error(JSON.stringify({
    host: process.env.PROBE_HOST,
    mode: process.env.PROBE_MODE,
    code: typeof error === "object" && error && "code" in error ? String(error.code) : "unknown",
    message
  }));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
NODE
  then
    resolved_url="$candidate"
    return 0
  fi
  return 1
}

# Supabase's current shared-pooler contract uses aws-[region].pooler.supabase.com,
# where the region identifier can include a numeric pooler shard prefix.
# Prefer certificate-verifying TLS; retain `require` only as a diagnostic fallback
# so a certificate-policy problem is distinguishable from DNS/authentication failures.
for shard in 0 1 2 3; do
  host="aws-${shard}-${db_region}.pooler.supabase.com"
  if probe_endpoint "$host" verify-full; then
    break
  fi
done

if [[ -z "$resolved_url" ]]; then
  echo "::notice title=Icecat database runtime::Certificate-verifying probes failed; checking TLS-required mode to classify the fault."
  for shard in 0 1 2 3; do
    host="aws-${shard}-${db_region}.pooler.supabase.com"
    if probe_endpoint "$host" require; then
      echo "::error title=Icecat database TLS::Supavisor accepted the dedicated identity only with sslmode=require; refusing to downgrade from verify-full."
      exit 1
    fi
  done
  echo "::error title=Icecat database runtime::No Supavisor session endpoint accepted the dedicated worker identity. See sanitized probe errors above."
  exit 1
fi

echo "::add-mask::${resolved_url}"
printf 'DATABASE_URL=%s\n' "$resolved_url" >> "$GITHUB_ENV"
