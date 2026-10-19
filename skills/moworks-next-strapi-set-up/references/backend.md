# Backend — Strapi file bodies

`<slug>` is the project slug, `<pg-port>` the port chosen in preflight. Everything here
is proven on READY.QUIT.SOLID and Galambila; genericised, not invented.

## Plugins to install

```bash
pnpm add @_sh/strapi-plugin-ckeditor @strapi/provider-email-nodemailer strapi-plugin-webp-converter
```

- **CKEditor 5** (TECH5) — the *community* package, plugin id `ckeditor5`. Not
  `@ckeditor/strapi-plugin-ckeditor`: the official one loads the editor from CKEditor's
  CDN and since v44 demands a signed-up licence key even on the free tier. The community
  build bundles CKEditor via npm and its `defaultHtml` preset carries `licenseKey: 'GPL'`.
  In a schema: `customField: "plugin::ckeditor5.CKEditor"`, `options: { preset: "defaultHtml" }`.
- **webp-converter** — the "images served in WebP" criterion, done server-side at upload
  time, so the frontend serves the stored file like any other upload.
- A newly installed plugin needs a full dev-server restart to appear; the admin bundle
  builds at boot. Schema edits alone hot-reload.

If CKEditor kills the admin with *"does not provide an export named 'default'"*, pin
`fuzzysort` to `^4.0.2` in `pnpm-workspace.yaml` `overrides`. The general fix for that
class of failure is `optimizeDeps.include` in `src/admin/vite.config.ts` — a custom
field's Input is lazy-loaded, so its deps dodge Vite's cold-start scan.

## `pnpm-workspace.yaml` (single package, still required)

```yaml
# Strapi needs a FLAT node_modules — its admin is served by Vite in dev, and Vite's
# CJS interop mishandles exports-map-less packages reached only through pnpm's
# isolated .pnpm tree. This setting lived in .npmrc as node-linker=hoisted and stopped
# being read when pnpm moved its own settings into this file.
nodeLinker: hoisted

packages: []

onlyBuiltDependencies:
  - '@parcel/watcher'
  - '@swc/core'
  - core-js-pure
  - esbuild
  - sharp
```

## `compose.dev.yml`

Named `compose.dev.yml`, **not** `docker-compose.yml` — that name is taken by the deploy
file the workflow scp's to the server. A bare `docker compose up` in this directory must
not pick up the deploy stack.

```yaml
# Local development services — NOT the deploy stack.
#
#     pnpm db:up / pnpm db:down / pnpm db:logs
#
# Credentials are deliberately simple local-dev values matching .env.sample verbatim,
# safe ONLY because every port binds to 127.0.0.1. Servers get strong credentials via
# env, never from this file.
services:
  postgres:
    image: postgres:16-alpine
    container_name: <slug>-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: <slug>
      POSTGRES_USER: <slug>
      POSTGRES_PASSWORD: <slug>
    ports:
      # Non-default port so it never clashes with another project's postgres.
      - "127.0.0.1:<pg-port>:5432"
    volumes:
      - <slug>-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U <slug> -d <slug>"]
      interval: 5s
      timeout: 3s
      retries: 10

  mailpit:
    image: axllent/mailpit:latest
    container_name: <slug>-mailpit
    restart: unless-stopped
    ports:
      - "127.0.0.1:1026:1025"   # SMTP
      - "127.0.0.1:8026:8025"   # inbox UI

volumes:
  <slug>-postgres-data:
```

Add to `package.json` scripts:

```json
"db:up": "docker compose -f compose.dev.yml up -d",
"db:down": "docker compose -f compose.dev.yml down",
"db:logs": "docker compose -f compose.dev.yml logs -f",
"typecheck": "tsc --noEmit"
```

## `config/database.ts` — relational only (TECH15)

```ts
import type { Core } from '@strapi/strapi';

/**
 * Relational only — client requirement. Postgres is what every environment runs
 * (locally via `pnpm db:up`); mysql stays available because the requirement allows
 * it, should a host ever dictate it. There is deliberately no sqlite branch.
 */
const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Database => {
  const client = env('DATABASE_CLIENT', 'postgres');

  if (client !== 'postgres' && client !== 'mysql') {
    throw new Error(
      `Unsupported DATABASE_CLIENT: ${client}. This project is relational-only ` +
        `(client requirement) — use "postgres" (pnpm db:up for local dev) or "mysql".`
    );
  }

  const ssl = env.bool('DATABASE_SSL', false) && {
    key: env('DATABASE_SSL_KEY', undefined),
    cert: env('DATABASE_SSL_CERT', undefined),
    ca: env('DATABASE_SSL_CA', undefined),
    rejectUnauthorized: env.bool('DATABASE_SSL_REJECT_UNAUTHORIZED', true),
  };

  const pool = { min: env.int('DATABASE_POOL_MIN', 2), max: env.int('DATABASE_POOL_MAX', 10) };

  const connections: Record<'postgres' | 'mysql', Core.Config.Database['connection']> = {
    postgres: {
      client: 'postgres',
      connection: {
        connectionString: env('DATABASE_URL'),
        host: env('DATABASE_HOST', '127.0.0.1'),
        port: env.int('DATABASE_PORT', <pg-port>),
        database: env('DATABASE_NAME', '<slug>'),
        user: env('DATABASE_USERNAME', '<slug>'),
        password: env('DATABASE_PASSWORD', '<slug>'),
        ssl,
        schema: env('DATABASE_SCHEMA', 'public'),
      },
      pool,
    },
    mysql: {
      client: 'mysql',
      connection: {
        host: env('DATABASE_HOST', '127.0.0.1'),
        port: env.int('DATABASE_PORT', 3306),
        database: env('DATABASE_NAME', '<slug>'),
        user: env('DATABASE_USERNAME', '<slug>'),
        password: env('DATABASE_PASSWORD', '<slug>'),
        ssl,
      },
      pool,
    },
  };

  return {
    connection: {
      ...connections[client],
      acquireConnectionTimeout: env.int('DATABASE_CONNECTION_TIMEOUT', 60000),
    },
  };
};

export default config;
```

## `config/middlewares.ts` — CORS allowlist (TECH9)

```ts
import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Middlewares => [
  'strapi::logger',
  'strapi::errors',
  // The ADMIN panel's own CSP — not the site's. The site's five headers are set in the
  // frontend's next.config.ts; don't confuse the two. ws:/wss: in connect-src is what
  // any socket.io-based admin plugin needs. useDefaults keeps every other Strapi rule;
  // naming a directive replaces it wholesale, so img-src/media-src restate the defaults.
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'connect-src': ["'self'", 'https:', 'ws:', 'wss:', 'http:'],
          'img-src': ["'self'", 'data:', 'blob:', 'https://market-assets.strapi.io'],
          'media-src': ["'self'", 'data:', 'blob:'],
          upgradeInsecureRequests: null,
        },
      },
    },
  },
  {
    name: 'strapi::cors',
    config: {
      // Client requirement: no wildcard. `strapi::cors`'s own default is origin: '*'.
      // One comma-separated env var covers every environment — set the real staging and
      // production frontend origins there; the default only covers local dev.
      origin: env.array('CORS_ALLOWED_ORIGINS', ['http://localhost:3000']),
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
```

On a server the allowlist lives in that box's `.env`, not in the repo.

## `config/plugins.ts` — upload cap (TECH8), CKEditor (TECH5), SMTP (TECH24)

```ts
import type { Core } from '@strapi/strapi';

const allowedMediaTypes = [
  'image/*', 'video/*', 'audio/*', 'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.*', 'text/plain', 'text/csv',
];

const deniedExecutableTypes = [
  'application/vnd.microsoft.portable-executable', 'application/x-msdownload',
  'application/x-msdos-program', 'application/x-executable', 'application/x-dosexec',
  'application/x-sh', 'text/x-shellscript', 'application/x-mach-binary',
];

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  ckeditor5: { enabled: true },

  // Uploads convert to WebP at upload time (sharp, server-side) — the stored file IS
  // .webp, so the frontend needs no change. png/jpeg/jpg convert; svg passes through.
  // quality 85 + smartSubsample: sharp's default 80 visibly softens photographs, and
  // this encode is the only one the site ever serves. effort stays at the default — 6
  // doubled encode time on a 12MP photo to save 4%, and an editor waits out that time.
  'webp-converter': {
    enabled: true,
    config: { options: { quality: 85, smartSubsample: true } },
  },

  // Locally this is Mailpit (inbox at :8026, no auth, no TLS); on a server, real SMTP.
  // `auth` is only passed when a username is set — nodemailer treats an empty auth
  // object as "authenticate with nothing" and fails, where omitting it means "no auth".
  email: {
    config: {
      provider: 'nodemailer',
      providerOptions: {
        host: env('SMTP_HOST', '127.0.0.1'),
        port: env.int('SMTP_PORT', 1026),
        secure: env.bool('SMTP_SECURE', false),
        ...(env('SMTP_USERNAME')
          ? { auth: { user: env('SMTP_USERNAME'), pass: env('SMTP_PASSWORD') } }
          : {}),
      },
      settings: {
        defaultFrom: `${env('SMTP_FROM_NAME', '<slug>')} <${env('SMTP_FROM_EMAIL', 'no-reply@localhost')}>`,
        defaultReplyTo: env('SMTP_FROM_EMAIL', 'no-reply@localhost'),
      },
    },
  },

  upload: {
    config: {
      security: { allowedTypes: allowedMediaTypes, deniedTypes: deniedExecutableTypes },
      // 50 MB cap with a clear error above it. The local provider's checkFileSize
      // rejects with PayloadTooLargeError reading this value directly.
      //
      // 1000 * 1000, not 1024 * 1024: @strapi/utils is decimal end to end, so the
      // binary number still caps at the right bytes but makes the error message read
      // "52 MB" against a 50 MB limit. strapi::body's formidable.maxFileSize defaults
      // to 200 MB and never gets in front of this.
      sizeLimit: 50 * 1000 * 1000,
    },
  },
});

export default config;
```

## `config/server.ts` and `config/admin.ts`

Generated versions are close; make sure every secret reads from env with no fallback
literal — `APP_KEYS`, `ADMIN_JWT_SECRET`, `API_TOKEN_SALT`, `TRANSFER_TOKEN_SALT`,
`ENCRYPTION_KEY`. A committed default secret is a committed secret.

```ts
// server.ts
host: env('HOST', '0.0.0.0'),
port: env.int('PORT', 1337),
url: env('PUBLIC_URL', `http://localhost:${env.int('PORT', 1337)}`),
app: { keys: env.array('APP_KEYS')! },
```

## `.env.sample` (committed — keys and comments only)

```dotenv
# Server
HOST=0.0.0.0
PORT=1337
PUBLIC_URL=                      # the CMS's own public origin; used in admin links

# Secrets — generate per environment, never reuse across boxes
APP_KEYS=                        # 4 comma-separated base64 values
ADMIN_JWT_SECRET=
API_TOKEN_SALT=
TRANSFER_TOKEN_SALT=
ENCRYPTION_KEY=

# Database — relational only, no sqlite (client requirement)
DATABASE_CLIENT=postgres
DATABASE_HOST=127.0.0.1
DATABASE_PORT=<pg-port>
DATABASE_NAME=<slug>
DATABASE_USERNAME=<slug>
DATABASE_PASSWORD=
DATABASE_SSL=false

# CORS — explicit origins, comma separated. NEVER '*'. Per environment.
CORS_ALLOWED_ORIGINS=http://localhost:3000

# SMTP — Mailpit locally (:1026, inbox at :8026); real SMTP or SES on servers
SMTP_HOST=127.0.0.1
SMTP_PORT=1026
SMTP_SECURE=false
SMTP_USERNAME=                   # leave empty for Mailpit — see config/plugins.ts
SMTP_PASSWORD=
SMTP_FROM_NAME=<slug>
SMTP_FROM_EMAIL=no-reply@localhost

# development on staging (Content-Type Builder stays usable), production on prod
NODE_ENV=development
```

## Moving data between environments

`strapi export --no-encrypt` / `strapi import --force`. Carries content, uploaded files
(real bytes plus their DB rows) and config — deliberately not admin accounts or API
tokens; re-create those per server. `import --force` wipes the target DB first: fine on
a first deploy, never against a database editors have touched.
