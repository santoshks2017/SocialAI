# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.12.0

# --- Base Stage ---
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /usr/src/app

# --- Build Stage ---
FROM base AS build
# Install system build dependencies required for native packages (e.g. node-canvas / napi-rs) and openssl for Prisma
RUN apk add --no-cache python3 make g++ openssl

# Copy workspace package and configuration files first to optimize layer caching
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/pattern-engine/package.json ./packages/pattern-engine/
COPY packages/render-engine/package.json ./packages/render-engine/
COPY packages/scraper/package.json ./packages/scraper/
COPY packages/shared/package.json ./packages/shared/
COPY packages/template-engine/package.json ./packages/template-engine/

# Copy Prisma schema before npm ci so postinstall (prisma generate) has the schema available
COPY apps/api/prisma/schema.prisma ./apps/api/prisma/

# Install ALL dependencies (including devDependencies required for typescript compilation)
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy the rest of the workspace source code
COPY . .

# Generate the Prisma client for the container's OS architecture (Linux/Alpine)
RUN npm run postinstall -w @cardeko/api

# Build the backend API server and its dependent packages (TypeScript compilation)
RUN npm run build -w @cardeko/pattern-engine \
    -w @cardeko/render-engine \
    -w @cardeko/scraper \
    -w @cardeko/template-engine \
    -w @cardeko/api

# Copy the generated Prisma client to the dist directory (since tsc does not copy JS/generated files)
RUN cp -r apps/api/src/generated apps/api/dist/src/

# Prune devDependencies to keep the production image minimal
RUN npm prune --omit=dev

# Install platform-specific optional dependencies for sharp and @napi-rs/canvas on Alpine AFTER pruning so they are not deleted
RUN --mount=type=cache,target=/root/.npm \
    npm install --os=linux --libc=musl sharp -w @cardeko/api && \
    npm install --os=linux --libc=musl @napi-rs/canvas -w @cardeko/render-engine

# --- Final Production Stage ---
FROM base AS final
ENV NODE_ENV production

# Run the application as a non-root user
USER node

# Copy build output and pruned node_modules from the build stage
COPY --from=build --chown=node:node /usr/src/app /usr/src/app

# Expose the API port
EXPOSE 3001

# Start the Fastify API server using the compiled entry point
CMD ["node", "apps/api/dist/src/index.js"]

