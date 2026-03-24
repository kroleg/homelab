FROM node:24-alpine
RUN apk add --no-cache libreoffice font-noto font-noto-cjk font-noto-emoji msttcorefonts-installer fontconfig \
    && update-ms-fonts \
    && fc-cache -f
WORKDIR /app

RUN npm install -g pnpm@10

COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY src ./src
COPY views ./views

RUN pnpm typecheck
RUN pnpm prune --prod

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "src/server.ts"]
