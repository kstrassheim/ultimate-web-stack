# Stage 1: Build the React frontend
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY public/ ./public/
COPY src/ ./src/
COPY vite.config.js ./
COPY .swcrc ./
COPY jest.config.cjs ./
COPY jest.setup.js ./
COPY jest-preview-reporter.js ./
COPY cypress.config.js ./
COPY cypress/ ./cypress/
COPY logo_src/ ./logo_src/

# Install dependencies
RUN npm ci

# Create .deploy file to signal deployment mode (uses prod URLs from terraform.config.json)
RUN touch .deploy

# Build the frontend
RUN npm run build

# Stage 2: Serve with NGINX
FROM nginx:alpine

# Copy custom NGINX config
COPY --from=builder /app/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files from builder stage
COPY --from=builder /app/backend/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]