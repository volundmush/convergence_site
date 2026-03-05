FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies with pnpm
RUN pnpm install --frozen-lockfile || pnpm install

# Copy application code
COPY . .

# Build Keystone CMS (prisma client generation)
RUN pnpm prisma generate || true

# Expose port (Keystone default is 3000)
EXPOSE 3000

# Copy entrypoint script
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start Keystone with build at runtime
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
