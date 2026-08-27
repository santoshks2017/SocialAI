# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /usr/src/app

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

RUN npm run build -w @cardeko/shared
ENV VITE_API_URL="http://localhost:3001/v1"
RUN npm run build -w web

# Stage 2: Fast, lightweight Nginx static web server
FROM nginx:alpine AS final
COPY --from=build /usr/src/app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
