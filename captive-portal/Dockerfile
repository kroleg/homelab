FROM node:24-alpine
WORKDIR /app
RUN npm install -g pnpm@11
COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile
COPY src ./src
COPY scripts ./scripts
COPY test ./test
RUN pnpm typecheck && pnpm check:views && pnpm test && pnpm prune --prod
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/health || exit 1
CMD ["node", "src/server.ts"]
