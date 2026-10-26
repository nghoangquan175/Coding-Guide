---
name: ec2-pm2-deploy
description: Put a Next.js + Strapi (or any two-app Node) repo into production on a single EC2 box behind Cloudflare without Docker — GitHub Actions ships a release tarball over SSH, the server installs and builds it into a release directory, and PM2 runs it with zero-downtime reloads and one-command rollback. Covers sizing, swap, Node/pnpm/PM2, Nginx, Let's Encrypt via certbot DNS-01, locking the origin to Cloudflare, DNS, the workflow, the first Strapi admin and API token, and verification behind a Cloudflare challenge. Use when asked to deploy to EC2/a VPS with PM2, without containers, or when a client's criteria require PM2.
---

# EC2 + PM2 deploy

```
push to main ──▶ Actions: git archive ──scp──▶ EC2: releases/<sha>  install + build
                                                       │
                                     current ──symlink─┘ ──▶ pm2 reload ──▶ smoke test
```

The sibling skill `ec2-docker-ghcr-deploy` is the proven path (quannh.xyz runs on it).
This one reuses its server hardening and swaps the runtime for PM2. **It has not been
run end to end yet** — on the first project, verify each step rather than trusting it,
and fold what you learn back into this file.

File bodies live in `references/`:
- `references/server.md` — swap, Node + pnpm + PM2, certbot (venv), Nginx, Cloudflare allowlist
- `references/pipeline.md` — release layout, `ecosystem.config.js`, `deploy.yml`, rollback

## Why build on the server

`better-sqlite3`, `sharp` and `@swc/core` ship native binaries linked against the
build machine's glibc. Build on `ubuntu-latest` (glibc 2.39), run on Amazon Linux 2023
(glibc 2.34), and the app dies at start with `GLIBC_2.38 not found`. So the server
installs and builds its own release. Two consequences:

- The box needs **≥ 2 GB RAM, or 1 GB + 2 GB swap** and patience: a Strapi admin build
  on a t3.micro takes minutes with `NODE_OPTIONS=--max-old-space-size=1536`.
- The running site stays up while the next release builds — it lives in its own
  directory and only goes live when `current` is switched.

If the box is too small to build at all, either resize it, or build in Actions inside an
`amazonlinux:2023` container (matching glibc) and ship the built release — note that as
a deliberate deviation.

## What you need from the user — ask once, up front

Same as the Docker skill: **public/Elastic IP**, SSH key path, security group with **22,
80, 443** open, which hosts serve the site and the CMS (check the zone for an existing
apex record first), and a Cloudflare token with `Zone:DNS:Edit`.

## 1. Look at the box

```bash
ssh -i <key> ec2-user@<ip> 'cat /etc/os-release | grep PRETTY; nproc; free -m; df -h /; swapon --show'
```

Report RAM and disk honestly. With PM2 the disk holds node_modules for each kept
release — keep **3 releases** on an 8 GB disk, and say 16 GB is the comfortable size.

## 2. Server baseline

Swap (2 GB), Node 22 + corepack/pnpm, PM2 with a systemd startup unit, Nginx, certbot in
a Python venv with the Cloudflare plugin. `references/server.md`.

## 3. Repo changes before the first deploy

- **Pin `"packageManager": "pnpm@<version>"`** in each app — corepack on the server
  otherwise fetches the newest pnpm.
- `ecosystem.config.js` at the repo root (`references/pipeline.md`): absolute `cwd`
  through the `current` symlink, `node_args: "--env-file=.env"` so each app reads its
  own env file, memory caps, `HOSTNAME=127.0.0.1` for Next.
- Next `output: "standalone"` and run `.next/standalone/server.js` — `next start`
  refuses to serve a standalone build. The deploy script copies `.next/static` and
  `public/` into the standalone folder.
- Strapi: `proxy: { koa: env.bool('IS_PROXIED', false) }`, `IS_PROXIED=true` and
  `HOST=127.0.0.1` in production (no container boundary now — don't listen on 0.0.0.0).

## 4. TLS, Nginx, Cloudflare-only origin

Identical to the Docker skill, except certbot runs from its venv. Issue one cert for both
hosts with DNS-01, renew from a systemd timer that reloads Nginx, redirect `:80` to
HTTPS, `444` unknown hosts, and allow only Cloudflare via
`geo $realip_remote_addr` — **never** allow/deny next to `real_ip_header`, which tests
the visitor's IP and 403s everyone. `references/server.md`.

## 5. Server layout and secrets

```
/opt/<slug>/
├── releases/<sha>/{frontend,backend,ecosystem.config.js}
├── current -> releases/<sha>
└── shared/
    ├── frontend.env      STRAPI_API_TOKEN, NEXT_PUBLIC_* (read at build AND run)
    ├── backend.env       secrets, HOST=127.0.0.1, PUBLIC_URL, IS_PROXIED=true, CORS
    ├── db/               SQLite (.tmp)          — symlinked into each release
    └── uploads/          Strapi public/uploads  — symlinked into each release
```

Env files mode 600. Generate secrets locally, `scp`, delete the local copies.

## 6. CI/CD

`references/pipeline.md` has the workflow and the server-side `deploy.sh` it calls.
Carried over from the Docker skill: a **dedicated deploy key** (never the user's key),
`EC2_KNOWN_HOSTS` from `ssh-keyscan`, no `environment:` block on a private free repo,
`concurrency` so deploys queue, and the **smoke test on the server** through Nginx with
`--resolve` because Cloudflare challenges a runner's curl.

A failed install or build leaves `current` untouched — the script switches the symlink
only after both builds succeed, then `pm2 startOrReload` + `pm2 save`.

## 7. DNS — last

CMS record any time; switch the apex only after the first deploy is healthy.

## 8. First admin and the frontend's token

```bash
cd /opt/<slug>/current/backend
node --env-file=.env node_modules/@strapi/strapi/bin/strapi.js admin:create-user \
  --firstname=<f> --lastname=<l> --email=<email> --password="$PW"
```

Then `POST /admin/login` → `POST /admin/api-tokens` (`full-access`, `lifespan: null`)
through `curl --resolve <cms>:443:127.0.0.1`, write the key into `shared/frontend.env`,
`pm2 reload <slug>-frontend --update-env`. Prove it: with token → 200, without → 403.

## 9. Verify

Same table as the Docker skill, with PM2 in place of compose:

| Check | How |
|---|---|
| Processes online | `pm2 list`, `pm2 logs --lines 50 --nostream` |
| Survives reboot | `systemctl is-enabled pm2-ec2-user nginx *.timer`, `pm2 save` done |
| Origin cert / edge / bypass blocked | as in the Docker skill |
| Rollback works | `deploy.sh rollback` once, then deploy forward again |

Driving a browser against production behind a Cloudflare challenge: SSH-tunnel to the
origin and launch the browser with `--host-resolver-rules` and the URL on the command
line — details in the Docker skill, step 9.

## Mistakes already made on the Docker run — they apply here too

The full table with symptoms is in `ec2-docker-ghcr-deploy` ("Mistakes made on the
first run"). The ones that carry over to PM2:

| Mistake | Avoid it by |
|---|---|
| Nginx `allow/deny` beside `real_ip_header` → every real visitor got 403 | `geo $realip_remote_addr`, and test the real path through Cloudflare, not only the bypass |
| No `packageManager` pin → corepack fetched a newer pnpm that broke the install | Pin `pnpm@<version>` in each app |
| Smoke test run from the Actions runner → Cloudflare challenge 403 | Smoke-test on the server with `--resolve` |
| Asked AWS/Cloudflare for things the local credentials couldn't do | Ask the user for IP, open ports and token scope up front |
| `.pem` rejected on Windows; wrong SSH user; PowerShell expanding `$(...)` locally | `icacls` the key, try `ec2-user`, run remote commands from bash in single quotes |
| Misread a prod browser test (tunnel latency, detached DevTools session) | Time against the page's clock; launch the browser on the target URL |

PM2-specific traps to watch for on the first real run — confirm, then promote them into
the table above:

- Shipping `node_modules` built on the Ubuntu runner → `GLIBC_* not found` on AL2023.
  This skill builds on the server for exactly that reason.
- A build dying from memory on a 1 GB box (`JavaScript heap out of memory` / OOM killer)
  → swap on, `NODE_OPTIONS=--max-old-space-size=1536`.
- Forgetting `pm2 save` / the `pm2 startup` sudo line → nothing comes back after reboot.

## Reminders

- PM2 on the server only. On Windows dev machines `pm2 kill` with apps running orphans a
  child that keeps the port — `pm2 delete all` first.
- `pm2 startup` prints a `sudo env PATH=... pm2 startup systemd -u <user>` line — run
  that line, then `pm2 save` after the first start, or nothing comes back after a reboot.
- Every `NEXT_PUBLIC_*` is baked at build time: changing one in `shared/frontend.env`
  needs a rebuild (redeploy), not just a reload.
- Strapi schema/admin changes need a rebuild too — the admin is pre-built into `dist/`.
