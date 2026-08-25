#!/bin/sh
set -eu

if [ "${BLS_WORKER_ROLE:-media}" != "media" ]; then
  echo "media-worker image only supports BLS_WORKER_ROLE=media" >&2
  exit 64
fi

export BLS_WORKER_ROLE=media
export BLS_CLAMAV_HOST="${BLS_CLAMAV_HOST:-127.0.0.1}"
export BLS_CLAMAV_PORT="${BLS_CLAMAV_PORT:-3310}"

# Refresh signatures when possible. The image already contains a build-time database,
# so a temporary ClamAV CDN problem must not erase the last known-good signatures.
if ! freshclam --stdout; then
  echo "WARNING: freshclam refresh failed; starting with bundled signature database" >&2
fi

clamd --config-file=/app/deploy/clamd.media.conf &
clamd_pid=$!

cleanup() {
  kill "$clamd_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

attempt=0
while [ "$attempt" -lt 60 ]; do
  if node - <<'NODE'
const net = require('node:net');
const host = process.env.BLS_CLAMAV_HOST || '127.0.0.1';
const port = Number(process.env.BLS_CLAMAV_PORT || '3310');
const socket = net.createConnection({ host, port });
let reply = '';
const timeout = setTimeout(() => socket.destroy(new Error('timeout')), 1000);
socket.on('connect', () => socket.write(Buffer.from('zPING\0')));
socket.on('data', (chunk) => { reply += chunk.toString('utf8'); });
socket.on('error', () => { clearTimeout(timeout); process.exitCode = 1; });
socket.on('close', (hadError) => {
  clearTimeout(timeout);
  if (!hadError && reply.replace(/\0/g, '').trim() === 'PONG') process.exit(0);
  process.exit(1);
});
NODE
  then
    break
  fi
  if ! kill -0 "$clamd_pid" 2>/dev/null; then
    echo "ClamAV exited before becoming ready" >&2
    exit 70
  fi
  attempt=$((attempt + 1))
  sleep 1
done

if [ "$attempt" -ge 60 ]; then
  echo "ClamAV did not become ready within 60 seconds" >&2
  exit 70
fi

# Drop privileges for the marketplace worker. clamd itself is configured to run as node.
exec gosu node node --experimental-strip-types workers/media-worker.ts
