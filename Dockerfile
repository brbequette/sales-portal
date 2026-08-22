FROM node:20-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
WORKDIR /app
COPY . .
# Build-time placeholders apply to this command only and are never persisted in
# the image configuration. Runtime secrets are injected by Docker Compose.
RUN npx prisma generate && \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXTAUTH_SECRET=build-only-not-for-runtime \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    OPENAI_API_KEY=build-only-not-for-runtime \
    npm run build

# Development dependencies and Prisma engines are prepared while the image has
# build-time network access. The running dev container stays internal-only.
FROM dependencies AS development
WORKDIR /app
COPY prisma ./prisma
RUN npx prisma generate

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
