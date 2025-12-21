FROM node:24-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY src ./src

# Fail build if TypeScript has errors
RUN pnpm run typecheck

# Remove dev deps for smaller image
RUN pnpm prune --prod

EXPOSE 3002

CMD ["node", "src/server.ts"]
