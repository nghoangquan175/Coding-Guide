---
name: moworks-next-strapi-set-up
description: Stand up a new Mo Works Next.js + Strapi project from two empty GitHub repos — scaffold both apps into the client's repo shape, wire the TECH criteria into the code, boot Postgres, create the Strapi admin, verify both apps really run, and push the first commit. Use when starting a new project, initialising a fresh Next.js + Strapi pair, or when handed a frontend and a backend repo URL to set up.
---

# Mo Works — new Next.js + Strapi project

```
/moworks-next-strapi-set-up <frontend-repo-url> <backend-repo-url>
```

Run from the empty folder that will hold both clones. When this finishes, `pnpm dev`
works in either repo against a real database and there is nothing left to configure.

## The shape this builds

Two repos, never a monorepo — each app at its own repo root. That is the client's
structure, and the deploy pipelines diverge anyway.

| | Frontend repo | Backend repo |
|---|---|---|
| App | Next.js (App Router, `src/`) | Strapi 5, TypeScript |
| Local data | — | Postgres + Mailpit via `compose.dev.yml` |
| CI | `ci.yml` — lint, typecheck, build | same |
| Deploy files | `Dockerfile`, `docker-compose.yml`, `ecosystem.config.js` | same |
| **Not** written | `deploy.yml` | `deploy.yml` |

**`deploy.yml` is the tech leader's.** It needs ECR repos, SSH keys, Telegram tokens
and GitHub Environments that do not exist on day one — writing a plausible-looking one
that has never run is worse than leaving the slot empty. Ship the Docker files and the
PM2 file so his workflow has something to call, and say so in the handover.

## Decisions already made — do not relitigate

- **Versions resolve at run time.** Take whatever `latest` gives, then *enforce the
  floors*: Node ≥ 20 LTS, Next ≥ 15, Strapi ≥ 5. Abort loudly if a floor fails.
- **Tailwind is held at v3** even though v4 is newer. v4 deletes `tailwind.config.ts`
  and the `@layer utilities` model the house typography system is built on. Scaffold
  with `--no-tailwind` and add v3 by hand. Do not "helpfully" upgrade it.
- **Both PM2 and Docker.** Staging deploys a Docker image; `ecosystem.config.js` is
  still committed to each repo root — criteria TECH28/TECH31 name the file by path.
- **Postgres from the first minute.** No SQLite, not even locally. Running the same
  engine everywhere closes the SQL-dialect parity gap.
- **Nothing is invented for the server.** Ubuntu, Caddy, SSL, firewall, SES, PageSpeed
  — none of it is reachable from here. It goes into `DEPLOYMENT.md` as a checklist.

Source material: `C:\GENERAL KNOWLEDGE\Setup\setup-next-strapi.md` (the playbook, with
the reasoning behind every choice below). Reference repos, when they are on the machine:
`C:\PROJECT\Moworks-Glambila\galambila-{frontend,backend}` for the client shape,
`C:\PROJECT\READY.QUIT.SOLID` for the stack the house style came from.

## 1. Read the arguments, confirm the plan

Two URLs. Which is which comes from the repo name (`*-frontend` / `*-backend`, or
`*-fe` / `*-be`). If neither name says, **ask** — do not guess and scaffold Strapi into
the frontend repo.

The project slug is the repo name with the suffix stripped (`acme-frontend` → `acme`).
It names the Postgres database, the compose containers and the PM2 processes.

Then state in one block, before touching anything: slug, both URLs, the versions about
to be installed, the ports. Proceed unless told otherwise.

## 2. Preflight

```bash
node -v && pnpm -v && git --version && gh auth status && docker info | head -3
```

- Node ≥ 20. If `nvm` is on the machine, that is what sets it.
- Docker must be *running*, not merely installed — Strapi's scaffolder tests the DB
  connection during setup, so the database has to exist first (step 4).
- The working folder must be empty apart from what this run creates.
- Pick free ports before writing anything: FE `3000`, BE `1337`, Postgres `5433`,
  Mailpit `1026`/`8026`. If one answers, walk up until one does not, and use that
  number consistently across `.env`, `compose.dev.yml` and the report.

## 3. Clone both repos

```bash
git clone <fe-url> && git clone <be-url>
```

An empty repo clones with a warning — that is fine. In **each** clone, immediately:

```bash
git config user.name "Quan" && git config user.email "quan.nguyen@moworks.com.au"
```

Per-repo, every time. The global identity is not the work identity.

## 4. Backend first — database, then Strapi

Postgres must be up before the scaffolder runs. Write `compose.dev.yml` from
`references/backend.md`, then:

```bash
docker compose -f compose.dev.yml up -d && docker compose -f compose.dev.yml ps
```

Wait for the healthcheck to report healthy, then scaffold into a temp directory and
move the result in — scaffolders refuse a directory that already has `.git` in it:

```bash
pnpm create strapi@latest <tmp>/be --typescript --use-pnpm --no-run --skip-cloud \
  --dbclient=postgres --dbhost=127.0.0.1 --dbport=<pg-port> \
  --dbname=<slug> --dbusername=<slug> --dbpassword=<slug>
```

If a flag is rejected, run `pnpm create strapi@latest --help` and adapt. Never fall
through to the interactive prompts — an unattended run hangs there forever.

Then replace the generated `config/*.ts` with the hardened versions in
`references/backend.md` (relational-only database config, CORS allowlist, 50 MB upload
cap, admin secrets from env), install the plugins listed there, and set
`"strict": true` in `tsconfig.json`.

## 5. Frontend

```bash
pnpm create next-app@latest <tmp>/fe --ts --eslint --app --src-dir \
  --import-alias "@/*" --no-tailwind --use-pnpm --no-git
```

Move it in, then apply `references/frontend.md`: Tailwind v3 + PostCSS + SCSS added by
hand, the security-header block in `next.config.ts`, `output: "standalone"`, the house
source layout, `lib/cn.ts`, and the create-next-app boilerplate deleted — its
`prefers-color-scheme` block and Arial `body` rule fight the design system.

Leave the type scale empty. Colour ramps, font files and typography classes come from
the project's Figma and there is no Figma at setup time; the structure is there for
them to land in.

## 6. Secrets and `.env`

Generate real values — never ship a placeholder that boots:

```bash
node -e "console.log(Array.from({length:4},()=>require('crypto').randomBytes(16).toString('base64')).join(','))"   # APP_KEYS
node -e "console.log(require('crypto').randomBytes(16).toString('base64'))"                                        # each salt / secret
```

Write `.env` (ignored) **and** `.env.sample` (committed — keys and comments, never
values) in both repos. Key lists with per-key comments live in `references/backend.md`
and `references/frontend.md`.

## 7. Shared files, both repos

`.nvmrc`, `.gitattributes` (`eol=lf`), a `.gitignore` that un-ignores `.env.sample`,
`.dockerignore`, `Dockerfile`, `docker-compose.yml`, `ecosystem.config.js`,
`.github/workflows/ci.yml`, `AGENTS.md` plus a `CLAUDE.md` that is only `@AGENTS.md`,
`README.md`, and `DEPLOYMENT.md`. Bodies in `references/shared.md`.

Same list in both repos, but three of them are **written per repo, not copied**: the
Dockerfile, `ecosystem.config.js`, and `ci.yml` — the backend's workflow has no `lint`
step and needs `DATABASE_CLIENT` on its build. `references/shared.md` carries both
versions and says why.

## 8. Verify for real

Not "it should work" — see it work. Run what that repo's own CI runs, which is not the
same command in both:

```bash
# frontend
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm build

# backend — no lint script exists, and the build evaluates config/database.ts
pnpm install --frozen-lockfile && pnpm typecheck && DATABASE_CLIENT=postgres pnpm build
```

Backend: build, start, create the admin, confirm the login page answers.

```bash
pnpm strapi admin:create-user --firstname=Admin --lastname=User \
  --email=<email> --password=<generated>
```

Then, with both running:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:1337/admin
curl -D - -o /dev/null -sS http://localhost:3000 | grep -iE 'content-security|x-frame|strict-transport|x-content-type|referrer'
```

All five headers must be on the response before this step is done. Stop both processes
afterwards.

`ecosystem.config.js` is syntax-checked (`node -e "require('./ecosystem.config.js')"`),
not started — PM2 belongs on the server, and on Windows `pm2 kill` with apps running
orphans a child that keeps the port and makes the next start crash-loop.

Do not scaffold a temporary page or probe route to prove the UI renders. Typecheck,
lint, build, curl.

## 9. Commit and push

One commit per repo, Conventional Commits, no attribution trailers:

```
chore: scaffold Next.js <v> frontend with CI and deploy config
chore: scaffold Strapi <v> backend with CI and deploy config
```

Then all three long-lived branches, in the house model: **`main` is the trunk and is
integration only, never deployed. `staging` and `production` are deployment pointers.**

```
feat/xyz ──PR──▶ main ──merge──▶ staging ──(QA)──▶ production
```

Push `main`, then `staging` at the same commit — a pointer you fast-forward, never a
branch that diverges.

`production` is different, and this is the part worth copying exactly: create it as an
**orphan commit with an empty tree**, not as a copy of `main`.

```bash
git checkout --orphan production
git rm -rf . >/dev/null
git commit --allow-empty -m "production: intentionally blank until the first release" -m \
"A deployment pointer, not a working branch. The first real release replaces this
wholesale (git push origin staging:production --force), per DEPLOYMENT.md —
deliberately no parent history, so the branch is unambiguously 'nothing has shipped
yet'."
git push -u origin production
git checkout main
```

An empty `production` cannot be mistaken for a shipped release, and the force-push is
then the documented release mechanism rather than an accident waiting to happen.

Branch prefixes for everything after this: `feat/` `fix/` `refactor/` `style/` `seo/`
`chore/`, kebab-case after the slash. Hotfixes branch off `production`, PR into
`production`, then back-merge into `main`. Put that in `AGENTS.md`.

Branch protection needs a paid plan on a private repo; report it as outstanding rather
than silently skipping it.

## 10. Report

Short. What is running and on which ports, the admin credentials, the exact commands to
start each app tomorrow morning, then two lists:

- **For the tech leader** — `deploy.yml`, ECR repos, GitHub Environment secrets, branch
  protection.
- **Deferred to the server** — every criterion marked *server* in
  `references/criteria.md`, unticked, with the reason.

Walk the traceability table in `references/criteria.md` before writing the report, and
state honestly which criteria are met in code, which are deferred and which are
deviations. TECH32 and TECH33 cannot pass at setup — they are measured against a live
production URL that does not exist yet. Say so plainly instead of claiming them.
