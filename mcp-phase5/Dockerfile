FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Expose port (Railway sets PORT env var automatically)
EXPOSE 3000

# Start the server
CMD ["node", "build/index.js"]
