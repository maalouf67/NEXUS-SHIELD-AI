FROM node:22-alpine AS build
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY services/api/package.json services/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace @nexus-shield/web
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /workspace/apps/web
COPY --from=build --chown=node:node /workspace/node_modules /workspace/node_modules
COPY --from=build --chown=node:node /workspace/apps/web/package.json ./package.json
COPY --from=build --chown=node:node /workspace/apps/web/next.config.js ./next.config.js
COPY --from=build --chown=node:node /workspace/apps/web/public ./public
COPY --from=build --chown=node:node /workspace/apps/web/.next ./.next

USER node
EXPOSE 3000
CMD ["node", "../../node_modules/next/dist/bin/next", "start", "--port", "3000"]
