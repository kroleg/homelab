FROM node:24-slim

WORKDIR /usr/app

RUN npm install -g pnpm@10

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY src ./src
COPY migrations ./migrations

CMD ["node", "src/main.ts"]
