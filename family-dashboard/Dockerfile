FROM node:24-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY src ./src

RUN pnpm run typecheck

RUN pnpm prune --prod

EXPOSE 3006

CMD ["node", "src/server.ts"]
