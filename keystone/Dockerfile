# Build container
FROM node:20-alpine AS build

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json .npmrc ./

# Install dependencies
RUN pnpm install

# Copy all source files
COPY . ./

# Build Keystone
RUN pnpm build

# Runtime container
FROM node:20-slim

WORKDIR /app

# Install pnpm for runtime
RUN npm install -g pnpm

# Copy built app from build stage
COPY --from=build /app /app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["pnpm", "start"]
