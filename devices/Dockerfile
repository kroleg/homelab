FROM node:24-alpine
WORKDIR /app

COPY package.json package-lock.json tsconfig.json drizzle.config.ts ./
RUN npm ci

COPY src ./src
COPY migrations ./migrations

RUN npm run typecheck
RUN npm prune --omit=dev

EXPOSE 3009

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3009/health || exit 1

CMD ["node", "src/server.ts"]
