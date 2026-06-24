FROM node:20-alpine AS builder
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

FROM node:20-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/agent/package.json ./apps/agent/
RUN pnpm install --prod
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/agent/dist ./apps/agent/dist
CMD ["pnpm", "--filter", "tapeworm-agent", "start"]
