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
  reports)
    exec node --experimental-strip-types --loader ./scripts/resolve-typescript-extension.mjs workers/report-worker.ts
    ;;
  crawler)
    exec node --experimental-strip-types workers/catalog-crawler-worker.ts
    ;;
  icecat)
    exec node --experimental-strip-types workers/open-icecat-worker.ts
    ;;
  icecat-detail)
    exec node --experimental-strip-types workers/open-icecat-detail-worker.ts
    ;;
  "")
    echo "BLS_WORKER_ROLE is required (postgres|search|notifications|media|reports|crawler|icecat|icecat-detail)" >&2
    exit 64
    ;;
  *)
    echo "Unsupported BLS_WORKER_ROLE: $role" >&2
    exit 64
    ;;
esac
