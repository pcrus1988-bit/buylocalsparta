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
resolved_url=""

for shard in 0 1 2 3; do
  candidate="postgresql://${db_user}.${project_ref}:${ICECAT_WORKER_DB_PASSWORD}@aws-${shard}-${db_region}.pooler.supabase.com:5432/postgres?sslmode=verify-full"
  if DATABASE_URL="$candidate" node --input-type=module <<'NODE'
import pg from "pg";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
let ok = false;
try {
  await client.connect();
  const result = await client.query("select current_user as current_user");
  ok = result.rows[0]?.current_user === "bls_icecat_worker";
} catch {
  ok = false;
} finally {
  await client.end().catch(() => undefined);
}
process.exit(ok ? 0 : 1);
NODE
  then
    resolved_url="$candidate"
    break
  fi
done

if [[ -z "$resolved_url" ]]; then
  echo "::error title=Icecat database runtime::No Supavisor session endpoint accepted the dedicated worker identity."
  exit 1
fi

echo "::add-mask::${resolved_url}"
printf 'DATABASE_URL=%s\n' "$resolved_url" >> "$GITHUB_ENV"
