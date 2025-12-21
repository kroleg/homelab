FROM node:24-alpine

WORKDIR /app

RUN npm install -g pnpm@10

COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY src ./src
COPY migrations ./migrations

# Fail build if TypeScript has errors
RUN pnpm run typecheck

# Remove dev deps for smaller image
RUN pnpm prune --prod

CMD ["node", "src/main.ts"]
