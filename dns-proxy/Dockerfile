FROM node:24-alpine

WORKDIR /usr/app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY src ./src

EXPOSE 53

CMD ["node", "src/server.ts"]
