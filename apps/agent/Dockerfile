# node:22 (not 20) — package.json pins packageManager pnpm@11.9.0, and pnpm 11
# fails on Node 20 with ERR_UNKNOWN_BUILTIN_MODULE.
FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY pnpm-workspace.yaml pnpm-lock.yaml* package.json turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/agent/package.json ./apps/agent/
RUN pnpm install --frozen-lockfile
COPY packages/shared ./packages/shared
COPY apps/agent ./apps/agent
RUN pnpm --filter @tapeworm/shared build
RUN pnpm --filter tapeworm-agent build

FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/agent/package.json ./apps/agent/
RUN pnpm install --prod
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/agent/dist ./apps/agent/dist
CMD ["pnpm", "--filter", "tapeworm-agent", "start"]
