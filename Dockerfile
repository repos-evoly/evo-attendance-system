# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: dependencies
# Installs root npm dependencies (from package-lock.json), generates the
# Prisma Client for Linux, and installs the sync service's own dependencies
# independently (from sync/package-lock.json, postinstall/patch-package runs).
# ---------------------------------------------------------------------------
FROM node:24-slim AS deps

# Build tools required only in this stage:
# - python3/make/g++: better-sqlite3 has no Node 24 prebuilt binary, so npm ci
#   compiles it from source via node-gyp.
# - openssl: lets Prisma detect the system OpenSSL version correctly.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Root dependencies (devDependencies included: needed for prisma generate and
# the Next.js build in the next stage).
COPY package.json package-lock.json ./
RUN npm ci

# Prisma schema is required for client generation. The generated client
# (including the Linux query engine) lands in node_modules/.prisma and
# node_modules/@prisma/client.
COPY prisma ./prisma
RUN npx prisma generate

# Sync service dependencies. The patches/ directory must be present so
# patch-package can apply the @graphland/zkteco TCP timeout fix. npm's
# allow-scripts gate can skip lifecycle scripts during `npm ci`, so
# patch-package is invoked explicitly afterwards to guarantee the patch is
# applied to sync/node_modules.
COPY sync/package.json sync/package-lock.json ./sync/
COPY sync/patches ./sync/patches
WORKDIR /app/sync
RUN npm ci && npx patch-package

# ---------------------------------------------------------------------------
# Stage 2: build
# Copies the full source (respecting .dockerignore — no .env, no node_modules,
# no local artifacts) and produces the Next.js standalone output.
# ---------------------------------------------------------------------------
FROM node:24-slim AS build

# openssl lets Prisma detect debian-openssl-3.0.x during `next build`, matching
# the engine generated in the deps stage (without it Prisma falls back to
# debian-openssl-1.1.x and logs engine-not-found errors during page-data
# collection).
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: runtime
# Minimal image: standalone server + static assets + sync service with its own
# node_modules. No source-only dev files, no .env, no database tooling.
# ---------------------------------------------------------------------------
FROM node:24-slim AS runtime

# openssl provides libssl, which the Prisma query engine links against at
# runtime. Kept minimal: no build toolchain in the final image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

WORKDIR /app

# Next.js standalone output: server.js, traced node_modules (incl. Prisma
# Client + Linux engine), .next/server, and the traced copy of sync/ sources.
COPY --from=build /app/.next/standalone ./

# Static assets are not part of the standalone trace and must be copied
# separately. (No public/ directory exists in this project.)
COPY --from=build /app/.next/static ./.next/static

# Sync service: source files come from the standalone trace, but we copy the
# sync/ directory explicitly from the build context as well so the runtime
# layout is deterministic and complete (package.json, src/, patches/, etc.).
# .dockerignore already excludes sync/node_modules, sync/data, sync/out and
# sync/.env* from the context, so only source is copied here.
COPY sync ./sync

# Sync's own dependencies, installed in the deps stage (patch applied,
# pg included). This is what `npm run sync:postgres` -> `npx tsx` resolves.
COPY --from=deps /app/sync/node_modules ./sync/node_modules

# The sync lock file lives at <cwd>/data/sync.lock (sync/src/syncLock.ts).
# The spawn() cwd is /app/sync, so create /app/sync/data writable by `node`.
RUN mkdir -p /app/sync/data && chown -R node:node /app/sync/data

USER node

EXPOSE 3000

CMD ["node", "server.js"]
