FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package-lock.json package.json ./
COPY apps/api/package.json ./apps/api/
RUN npm ci --workspace=apps/api --omit=dev

FROM base AS builder
COPY package-lock.json package.json ./
COPY apps/api/package.json ./apps/api/
RUN npm ci --workspace=apps/api
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production

RUN addgroup -S seasmp && adduser -S seasmp -G seasmp

# Hoisted (root) production node_modules
COPY --from=deps /app/node_modules ./node_modules
# Workspace-local packages npm didn't hoist (e.g. socket.io due to version conflicts)
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
# Compiled JS and Prisma schema
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
# Prisma generated query-engine binary
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

RUN chown -R seasmp:seasmp /app
USER seasmp

# Run from the workspace dir so Node resolves both /app/node_modules
# and /app/apps/api/node_modules (workspace-local packages)
WORKDIR /app/apps/api

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1

CMD ["node", "dist/server.js"]
