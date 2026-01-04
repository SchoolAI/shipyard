# Dockerfile for peer-plan signaling server
# Optimized for small image size and fast startup

FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies (production only)
RUN npm install --omit=dev

# Copy application code
COPY src/ ./src/

# Expose port (matches fly.toml internal_port)
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Run the server
CMD ["node", "src/server.js"]
