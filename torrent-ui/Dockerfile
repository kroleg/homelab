FROM node:24-alpine
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
COPY views ./views

RUN npm run typecheck
RUN npm prune --omit=dev

EXPOSE 3007

HEALTHCHECK --interval=5s --timeout=3s --start-period=2s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3007/health || exit 1

CMD ["node", "src/server.ts"]
