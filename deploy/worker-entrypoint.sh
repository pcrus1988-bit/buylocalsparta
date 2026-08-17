#!/bin/sh
set -eu

role="${BLS_WORKER_ROLE:-}"
case "$role" in
  postgres)
    exec node --experimental-strip-types workers/postgres-worker.ts
    ;;
  search)
    exec node --experimental-strip-types workers/search-worker.ts
    ;;
  notifications)
    exec node --experimental-strip-types workers/notification-worker.ts
    ;;
  media)
    exec node --experimental-strip-types workers/media-worker.ts
    ;;
  "")
    echo "BLS_WORKER_ROLE is required (postgres|search|notifications|media)" >&2
    exit 64
    ;;
  *)
    echo "Unsupported BLS_WORKER_ROLE: $role" >&2
    exit 64
    ;;
esac
