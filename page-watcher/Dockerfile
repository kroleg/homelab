FROM node:24-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy migrations
COPY migrations ./migrations

# Copy drizzle config
COPY drizzle.config.ts ./

# Copy source code
COPY src ./src

# Expose port
EXPOSE 3004

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3004/health || exit 1

# Start the application
CMD ["node", "src/index.ts"]
