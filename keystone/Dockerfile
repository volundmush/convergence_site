# Build container
FROM node:20-slim AS build

WORKDIR /app

# Install OpenSSL and pnpm - must match runtime environment
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/* && npm install -g pnpm
COPY package.json .npmrc ./
RUN pnpm install

# Copy all source files
COPY . ./

# Build Keystone
RUN pnpm build

# Runtime container
FROM node:20-slim

WORKDIR /app

# Install OpenSSL 1.1 and pnpm for runtime
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/* && npm install -g pnpm

# Copy built app from build stage
COPY --from=build /app /app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["pnpm", "start"]
