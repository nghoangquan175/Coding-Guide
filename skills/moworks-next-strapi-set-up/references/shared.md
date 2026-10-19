# Shared files — both repos

## `.nvmrc` (TECH2)

One line, the major version only (`22`). Resolve it at run time: the newest Node **LTS**
that satisfies Strapi's own `engines.node` range in `package.json`. Never newer than that
range allows, never below 20.

## `.gitattributes`

```gitattributes
* text=auto eol=lf
```

The deploy target is Linux; CRLF in a shell script on the server is a one-line file that
fails with a message about `\r`.

## `.dockerignore`

```
node_modules
.next
dist
.git
.env*
!.env.sample
*.log
```

## Frontend `Dockerfile`

```dockerfile
ARG NODE_VERSION=<node-major>

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS deps
# pnpm-workspace.yaml carries onlyBuiltDependencies — without it sharp is never built
# inside the image and image optimisation degrades silently.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-fe,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .

# Every NEXT_PUBLIC_* is baked in here, which is why staging and production need
# separate builds and an image can never be promoted between them.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SITE_ENV
ARG NEXT_PUBLIC_STRAPI_API_URL
ARG NEXT_PUBLIC_GTM_ID
# Also needed at build time: pages prerender against it and the CSP img-src is built
# from it.
ARG STRAPI_API_URL
# STRAPI_API_TOKEN is deliberately NOT an ARG. It is the only credential in the stack
# that can WRITE, and a build arg is recorded in the layer metadata of the stage that
# used it — which a `cache-to: type=gha,mode=max` workflow then exports wholesale into
# a cache shared across runs. It belongs in the server's .env, read at runtime.

ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SITE_ENV=$NEXT_PUBLIC_SITE_ENV \
    NEXT_PUBLIC_STRAPI_API_URL=$NEXT_PUBLIC_STRAPI_API_URL \
    NEXT_PUBLIC_GTM_ID=$NEXT_PUBLIC_GTM_ID \
    STRAPI_API_URL=$STRAPI_API_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:${NODE_VERSION}-bookworm-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd -r nodejs && useradd -r -g nodejs nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

Needs `output: "standalone"` in `next.config.ts`, or the runner stage copies nothing.

## Backend `Dockerfile`

```dockerfile
ARG NODE_VERSION=<node-major>

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS deps
# sharp and better-sqlite3-adjacent native deps need a toolchain to build.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-be,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Strapi refuses to build without these present — they are throwaway build-time values,
# never the running secrets, which arrive from the server's .env.
ENV NODE_ENV=production \
    APP_KEYS=build,build,build,build \
    API_TOKEN_SALT=build \
    ADMIN_JWT_SECRET=build \
    TRANSFER_TOKEN_SALT=build \
    JWT_SECRET=build \
    ENCRYPTION_KEY=build \
    DATABASE_CLIENT=postgres
RUN pnpm build

FROM node:${NODE_VERSION}-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd -r strapi && useradd -r -m -g strapi strapi
ENV HOME=/home/strapi

COPY --from=build --chown=strapi:strapi /app ./

RUN mkdir -p /app/public/uploads && chown -R strapi:strapi /app/public
VOLUME ["/app/public/uploads"]

USER strapi
EXPOSE 1337
CMD ["node", "node_modules/@strapi/strapi/bin/strapi.js", "start"]
```

The admin SPA is pre-built into `dist/`, so **any schema, controller or route change
needs a rebuild** — `NODE_OPTIONS='--max-old-space-size=3072' pnpm build` on a small box.

## `docker-compose.yml` (the deploy file)

The tech leader's `deploy.yml` scp's this to the server by this exact name and runs it
there against the image it just pushed. Keep the shape; leave `${ECR_IMAGE}` unresolved.

```yaml
services:
  app:
    image: ${ECR_IMAGE}
    container_name: <slug>-<frontend|backend>
    restart: unless-stopped
    network_mode: host
    env_file:
      - .env
    environment:
      - NODE_ENV=production
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://localhost:<port>').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

## `ecosystem.config.js` (TECH26–28, TECH31)

One per repo, at the repo root — the criteria name the path. Two repos means two files,
each declaring its own app.

```js
/**
 * PM2 process definition. Client requirement: PM2 manages the process, `pm2 list` shows
 * it online, auto-restart on failure.
 *
 *     pnpm build && pnpm pm2 start ecosystem.config.js
 *
 * On a server, additionally `pm2 save` after starting and `pm2 startup` once, so it
 * comes back after a reboot. Crash restart alone is PM2's default and needs nothing.
 *
 * Runs the framework's own bin script under node directly, not `pnpm start`: PM2 then
 * supervises the real server process — clean restarts, honest max_memory_restart
 * accounting, and no Windows .cmd-shim problems when testing locally.
 *
 * NODE_ENV=production is set here. Next would set it anyway; Strapi would not — it
 * inherits the process environment, and a PM2-set variable beats .env because dotenv
 * never overrides an existing process env.
 *
 * Ports and secrets stay in .env — this file adds no environment-specific values, so
 * the same file serves every box. The process NAME is the exception: an unset
 * DEPLOY_ENV resolves to `-local`, which is simply true on a dev machine and fails
 * loudly on a misconfigured server instead of silently claiming an environment.
 */
const DEPLOY_ENV = process.env.DEPLOY_ENV || 'local';

module.exports = {
  apps: [
    {
      name: `<slug>-<frontend|backend>-${DEPLOY_ENV}`,
      script: './node_modules/next/dist/bin/next',   // frontend
      // script: './node_modules/@strapi/strapi/bin/strapi.js',  // backend
      args: 'start',
      interpreter: 'node',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '1G',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
```

Pin `pm2` as a devDependency so `pnpm pm2 …` behaves the same everywhere.

**Windows gotcha:** `pm2 kill` with apps running can orphan a child — an old server keeps
the port and the resurrected one crash-loops on EADDRINUSE while the orphan answers,
which looks deceptively like it is working. Always `pm2 delete all` *before* `pm2 kill`.

## `.github/workflows/ci.yml`

Build only. No deploy job, no notifications, no secrets — nothing here should fail
because a server does not exist yet. **Both repos get one, and they are not the same
file.**

### Frontend

```yaml
name: CI

on:
  pull_request:
    branches: [main, staging]
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # corepack BEFORE setup-node: `cache: pnpm` resolves the store path by running
      # pnpm, so the cache step fails outright if pnpm is not on PATH yet.
      - run: corepack enable
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm build
```

`pnpm build` prerenders and a CI runner has no Strapi. Make every CMS read degrade to
the mock fallback, and set `CMS_REQUIRED=1` only on staging and production builds —
there, an unreachable CMS *should* fail the build rather than silently ship fallback
copy.

### Backend

Two differences, both of which fail the run if copied from the frontend's file:

```yaml
name: CI

on:
  pull_request:
    branches: [main, staging]
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: corepack enable
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      # `strapi build` EVALUATES config/database.ts even though it never connects, and
      # that file throws on any non-relational client. Without this the run dies on our
      # own guard, with no database anywhere near it.
      - run: pnpm build
        env:
          DATABASE_CLIENT: postgres
```

**No `pnpm lint` step.** `create-strapi-app` ships no `lint` script, so the step fails
with "command not found" rather than passing vacuously. Either leave it out, or add
ESLint to the backend deliberately and then add the step — never carry the line across
from the frontend and assume it runs.

`typecheck` is the `"typecheck": "tsc --noEmit"` added in `references/backend.md`;
neither scaffolder ships one.

## `AGENTS.md` + `CLAUDE.md`

`CLAUDE.md` is one line: `@AGENTS.md`. One source of truth for every AI tool.

`AGENTS.md` starts with, at minimum:

- **"This is NOT the Next.js you know — read `node_modules/next/dist/docs/` before
  writing code."** Next 16 is recent enough that model training data is confidently
  wrong about it.
- The class conventions: arbitrary px over scale tokens, numeric breakpoint prefixes,
  never build a class name by concatenation.
- Where the CMS contract lives (`src/lib/api/`, one file per content type) and the
  `import "server-only"` rule.
- The git model, verbatim: *"`main` is the trunk and is **integration only — never
  deployed**. `staging` and `production` are deployment pointers."* Then
  `feat/xyz ──PR──▶ main ──merge──▶ staging ──(QA)──▶ production`, hotfixes off
  `production` and back-merged into `main`.
- Conventional Commits with optional scope (`feat(blog): add side images`); branch
  prefixes `feat/ fix/ refactor/ style/ seo/ chore/`, kebab-case after the slash.

## `README.md`

Local setup in the order a new developer actually runs it: prerequisites, `nvm use`,
`pnpm install`, `pnpm db:up` (backend), `.env` from `.env.sample`, `pnpm dev`, the admin
URL. Nothing aspirational — only commands verified in step 8.

## `DEPLOYMENT.md` (TECH30)

The manual-deployment fallback, and the honest list of what is not done yet. Sections:

1. **Server baseline** — Ubuntu LTS 22.04/24.04, ≥ 2 vCPU / 2 GB RAM, AWS Lightsail or
   EC2, ports 80 and 443 only.
2. **Reverse proxy** — Caddy (preferred; it automates certificates) or Nginx, proxying
   to `127.0.0.1:3000` and `127.0.0.1:1337`. HSTS is already sent by the app, so TLS at
   the proxy is mandatory, not optional.
3. **Manual deploy** — pull, `pnpm install --frozen-lockfile`, build both, `pm2 restart`,
   `pm2 save`.
4. **Environments** — staging may run Strapi in development mode so the Content-Type
   Builder stays usable; production runs `NODE_ENV=production`. Separate image builds
   per environment, because every `NEXT_PUBLIC_*` is baked in at build time.
5. **Backups** — hourly `pg_dump`, keep ~48.
6. **Handover** — Strapi admin credentials, the securityheaders.com report, the
   PageSpeed report.
7. **Owned by the tech leader** — `deploy.yml`, ECR repositories, GitHub Environment
   secrets and variables, branch protection.
