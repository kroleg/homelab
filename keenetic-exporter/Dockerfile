FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src

# Fail build if TypeScript has errors
RUN npm run typecheck

# Remove dev deps for smaller image
RUN npm prune --omit=dev

EXPOSE 9101

CMD ["node", "src/server.ts"]
