# FormMaker — single-container deployment.
#
# Builds the Angular SPA and bundles the Express backend (src/server/*.ts →
# a single dist/server/index.js via ncc), then runs one Node process that serves
# both the built app with an SPA fallback and the JSON API.

# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:26-alpine AS build
WORKDIR /app

# Install dependencies first so the layer can be cached.
# better-sqlite3 compiles from source when no prebuilt binary matches (musl/new Node),
# which needs python3 + make + g++ on Alpine.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci

# Curated source copy (avoids shipping node_modules/dist into the context).
COPY angular.json tsconfig.json tsconfig.app.json tsconfig.spec.json tsconfig.server.json ./
COPY scripts ./scripts
COPY public ./public
COPY src ./src

# "prebuild" automatically runs icons:copy (regenerates SVG icon bundle).
# build:server bundles the Express API into dist/server/index.js (single file).
RUN npm run build && npm run build:server

# ---------- Runtime stage ----------
FROM node:26-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV SQLITE_PATH=server/data/formmaker.sqlite

# Production dependencies for the Express API.
# The toolchain is only needed to compile better-sqlite3; drop it afterwards.
COPY package.json package-lock.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && npm ci --omit=dev \
  && npm cache clean --force \
  && apk del .build-deps

# Built SPA + bundled server.
COPY --from=build /app/dist ./dist

# Forms + submissions are persisted here (see src/server/database.ts).
RUN mkdir -p server/data && chown node:node server/data
USER node
VOLUME ["/app/server/data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server/index.js"]
