FROM node:20-alpine

# Accept DATABASE_URL as build argument
ARG DATABASE_URL

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package files
COPY package.json .npmrc ./

# Install dependencies
RUN pnpm install

# Copy Prisma schema
COPY prisma/ ./prisma/

# Generate Prisma client with DATABASE_URL from build args
RUN DATABASE_URL=${DATABASE_URL} pnpm prisma generate

# Copy source files
COPY keystone.ts .
COPY schema.ts .

# Build Keystone for production
RUN pnpm build

# Copy entrypoint script
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Run the entrypoint script at startup
CMD ["/usr/local/bin/entrypoint.sh"]
