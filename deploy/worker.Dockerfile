FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

WORKDIR /app

COPY package.json ./
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

RUN npm install --omit=dev --ignore-scripts

COPY --chown=node:node packages ./packages
COPY --chown=node:node workers ./workers
COPY --chown=node:node deploy/worker-entrypoint.sh ./deploy/worker-entrypoint.sh

USER node
ENTRYPOINT ["./deploy/worker-entrypoint.sh"]
