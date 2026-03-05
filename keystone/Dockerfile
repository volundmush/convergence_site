FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* yarn.lock* ./
RUN npm install --legacy-peer-deps

# Copy application code
COPY . .

# Build Keystone CMS (prisma client generation)
RUN npx prisma generate || true

# Expose port (Keystone default is 3000)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start Keystone
CMD ["npm", "start"]
