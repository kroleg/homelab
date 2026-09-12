FROM node:24-alpine
WORKDIR /app

RUN npm install -g pnpm@11

COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY src ./src

RUN pnpm run typecheck
RUN pnpm prune --prod

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "src/server.ts"]
