# ---------- Build stage ----------
FROM node:20-alpine AS builder

# Work directory inside the container
WORKDIR /app

# Copy package files first (better layer caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the source code
COPY . .

# Build-time environment variables for Vite
# Default to localhost:3001 so the frontend talks to the HR API via port-forward
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=${VITE_API_URL}

ARG VITE_ADMIN_EMAILS=zama@hr.com
ENV VITE_ADMIN_EMAILS=${VITE_ADMIN_EMAILS}

# Build the production bundle
RUN npm run build

# ---------- Runtime stage ----------
FROM nginx:alpine

# Copy compiled frontend to nginx's web root
COPY --from=builder /app/dist /usr/share/nginx/html

# Replace default nginx config with SPA-friendly config
RUN echo 'server { \
    listen 80; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Container listens on port 80
EXPOSE 80

# Start nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
