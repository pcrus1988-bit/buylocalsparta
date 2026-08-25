FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    BLS_WORKER_ROLE=media \
    BLS_CLAMAV_HOST=127.0.0.1 \
    BLS_CLAMAV_PORT=3310

# Keep malware scanning inside the isolated worker container. The scanner is bound
# only to loopback and is not an externally reachable service.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       ca-certificates clamav-daemon clamav-freshclam gosu \
    && mkdir -p /var/run/clamav /var/log/clamav /var/lib/clamav \
    && freshclam --stdout \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/aade-mydata/package.json packages/aade-mydata/package.json
COPY packages/boxnow-shipping/package.json packages/boxnow-shipping/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/media-processing/package.json packages/media-processing/package.json
COPY packages/meilisearch-search/package.json packages/meilisearch-search/package.json
COPY packages/object-storage/package.json packages/object-storage/package.json
COPY packages/postgres-runtime/package.json packages/postgres-runtime/package.json
COPY packages/resend-notifications/package.json packages/resend-notifications/package.json
COPY packages/viva-payments/package.json packages/viva-payments/package.json

RUN npm ci --omit=dev --ignore-scripts

COPY packages ./packages
COPY apps/web/src/lib ./apps/web/src/lib
COPY workers ./workers
COPY scripts/resolve-typescript-extension.mjs ./scripts/resolve-typescript-extension.mjs
COPY deploy/clamd.media.conf ./deploy/clamd.media.conf
COPY deploy/media-worker-entrypoint.sh ./deploy/media-worker-entrypoint.sh

# clamd deliberately drops to the unprivileged Node user after the root-owned
# signature refresh has completed.
RUN chown -R node:node /app /var/run/clamav /var/log/clamav /var/lib/clamav

ENTRYPOINT ["/bin/sh", "./deploy/media-worker-entrypoint.sh"]
