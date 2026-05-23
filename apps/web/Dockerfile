FROM node:22-alpine AS deps
WORKDIR /app
COPY package-lock.json package.json ./
COPY apps/web/package.json ./apps/web/
RUN npm ci --workspace=apps/web

FROM node:22-alpine AS builder
WORKDIR /app
# Place node_modules inside apps/web so Next.js/Turbopack resolves packages correctly
COPY --from=deps /app/node_modules ./apps/web/node_modules
COPY apps/web ./apps/web
WORKDIR /app/apps/web
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

RUN addgroup -S seasmp && adduser -S seasmp -G seasmp

COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static

RUN chown -R seasmp:seasmp /app
USER seasmp

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s \
  CMD wget -qO- http://127.0.0.1:3000 || exit 1

CMD ["node", "server.js"]
