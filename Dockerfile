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
    
    # Build-time environment variable for Vite
    # You can override this when building the image
    ARG VITE_API_URL
    ENV VITE_API_URL=${VITE_API_URL}
    
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
    