#!/usr/bin/env bash
set -euo pipefail

: "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:?GitHub OIDC token request token is required}"
: "${ACTIONS_ID_TOKEN_REQUEST_URL:?GitHub OIDC token request URL is required}"
: "${ICECAT_RUNTIME_BROKER_URL:?Icecat runtime broker URL is required}"
: "${ICECAT_RUNTIME_AUDIENCE:?Icecat runtime audience is required}"
: "${GITHUB_ENV:?GitHub environment file is required}"
: "${GITHUB_WORKSPACE:?GitHub workspace is required}"

readonly SUPABASE_CA_PATH="${GITHUB_WORKSPACE}/config/certs/supabase-root-2021.crt"
readonly SUPABASE_CA_SHA256="700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7"

if [[ ! -f "$SUPABASE_CA_PATH" ]]; then
  echo "::error title=Icecat database TLS::Pinned Supabase CA certificate is missing."
  exit 1
fi
actual_ca_sha256="$(sha256sum "$SUPABASE_CA_PATH" | awk '{print $1}')"
if [[ "$actual_ca_sha256" != "$SUPABASE_CA_SHA256" ]]; then
  echo "::error title=Icecat database TLS::Pinned Supabase CA certificate checksum does not match the reviewed certificate."
  exit 1
fi
# Node reads NODE_EXTRA_CA_CERTS only when a process starts. Persist it for every
# later Node process in this workflow and export it for the connection probes below.
export NODE_EXTRA_CA_CERTS="$SUPABASE_CA_PATH"
printf 'NODE_EXTRA_CA_CERTS=%s\n' "$SUPABASE_CA_PATH" >> "$GITHUB_ENV"

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
  local candidate="postgresql://${encoded_db_user}:${encoded_db_password}@${host}:5432/postgres?sslmode=verify-full"
  if DATABASE_URL="$candidate" PROBE_HOST="$host" node --input-type=module <<'NODE'
import pg from "pg";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 7000 });
try {
  await client.connect();
  const result = await client.query("select current_user as current_user");
  if (result.rows[0]?.current_user !== "bls_icecat_worker") {
    console.error(JSON.stringify({ host: process.env.PROBE_HOST, code: "unexpected_user" }));
    process.exitCode = 1;
  }
} catch (error) {
  const raw = error instanceof Error ? error.message : String(error);
  const secret = process.env.ICECAT_WORKER_DB_PASSWORD ?? "";
  const message = secret ? raw.replaceAll(secret, "***") : raw;
  console.error(JSON.stringify({
    host: process.env.PROBE_HOST,
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

# Supabase's shared-pooler session endpoints are IPv4-capable. The pinned
# Supabase root CA augments Node's trust store while sslmode=verify-full keeps
# certificate-chain and hostname verification enabled.
for shard in 0 1 2 3; do
  host="aws-${shard}-${db_region}.pooler.supabase.com"
  if probe_endpoint "$host"; then
    break
  fi
done

if [[ -z "$resolved_url" ]]; then
  echo "::error title=Icecat database runtime::No certificate-verified Supavisor session endpoint accepted the dedicated worker identity. See sanitized probe errors above."
  exit 1
fi

echo "::add-mask::${resolved_url}"
printf 'DATABASE_URL=%s\n' "$resolved_url" >> "$GITHUB_ENV"
