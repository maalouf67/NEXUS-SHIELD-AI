FROM node:22-alpine AS build
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY services/api/package.json services/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

COPY . .
RUN npm run build --workspace @nexus-shield/api
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000

WORKDIR /workspace
COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/package.json ./package.json
COPY --from=build --chown=node:node /workspace/services/api/package.json ./services/api/package.json
COPY --from=build --chown=node:node /workspace/services/api/dist ./services/api/dist
COPY --from=build --chown=node:node /workspace/services/api/certs ./services/api/certs
COPY --from=build --chown=node:node /workspace/database/init ./database/init

USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "services/api/dist/server.js"]
