---
name: ec2-docker-ghcr-deploy
description: Put a Next.js + Strapi (or any two-app) repo into production on a single EC2 box behind Cloudflare — GitHub Actions builds Docker images, pushes them to GHCR, then deploys over SSH with docker compose. Covers sizing the box, swap, Docker, Nginx, Let's Encrypt via certbot DNS-01, locking the origin to Cloudflare, DNS records, the CI/CD workflow, the first Strapi admin and API token, and how to verify a site that sits behind a Cloudflare challenge. Use when asked to deploy to EC2 with Docker/GHCR, set up CI/CD for a VPS, or take a project to production behind Cloudflare.
---

# EC2 + Docker + GHCR deploy

```
push to main ──▶ Actions: build 2 images ──▶ GHCR ──▶ ssh EC2: compose pull + up ──▶ smoke test
```

The server **never builds**. A small EC2 cannot build a Strapi admin (it wants 2–3 GB
RAM), and a build on the box competes with the running site. Actions builds, the box
pulls. Proven end to end on quannh.xyz (Next.js 16 + Strapi 5 SQLite, t3.micro-class).

File bodies live in `references/`:
- `references/server.md` — swap, Docker, Nginx, certbot, Cloudflare allowlist, timers
- `references/pipeline.md` — Dockerfile rules, `deploy.yml`, production compose, secrets

## What you need from the user — ask once, up front

- **Public IP** of the instance (prefer an Elastic IP — a plain public IP changes on
  stop/start). Don't assume the AWS CLI can read EC2: an IAM user scoped to other
  services gets `UnauthorizedOperation`, so ask rather than burn time.
- **SSH key path** and **security group**: 22 open to them, **80 and 443 open**. Without
  443 Cloudflare cannot reach the origin.
- **Domains**: which host serves the site, which serves the CMS. Read the zone first —
  if the apex already points somewhere (an API Gateway, a CloudFront), say so and let
  them choose to replace it or use a subdomain.
- **Cloudflare API token** with DNS edit on the zone (`Zone:DNS:Edit`). A DNS-only token
  cannot read SSL mode, WAF or bot settings — that is fine for this flow; just say what
  you couldn't verify.

## 1. Look at the box before planning anything

```bash
ssh -i <key> ec2-user@<ip> 'cat /etc/os-release | grep PRETTY; nproc; free -m; df -h /; swapon --show'
```

Try `ec2-user` (Amazon Linux) then `ubuntu`. Report the sizing honestly:

| RAM | Verdict |
|---|---|
| ~1 GB (t3.micro) | Runs Next (~40 MB) + Strapi (~200–450 MB) + Nginx **only** with 2 GB swap and no builds on the box. Say it is tight. |
| 2 GB+ | Comfortable. |

| Disk | Verdict |
|---|---|
| 8 GB | Tight — a Strapi image is ~750 MB. Prune old images on every deploy. Suggest 16–20 GB. |

## 2. Server baseline

Swap (2 GB, `vm.swappiness=10`), Docker, the Compose plugin (not in the AL2023 repos —
install the binary), Nginx, `ec2-user` in the `docker` group. Exact commands in
`references/server.md`.

## 2.5 Fix the repo before CI sees it

- **Pin `packageManager`** (`"pnpm@<version>"`) in **every** app's `package.json`.
  Without it, `corepack enable` in the image downloads the newest pnpm, which can fail
  to read the lockfile/workspace written by the older one.
- Strapi behind a proxy: `proxy: { koa: env.bool('IS_PROXIED', false) }` in
  `config/server.ts`, `IS_PROXIED=true` in production. Without it the admin's secure
  cookies are refused over the proxied HTTPS hop.
- Next: `output: "standalone"`, the CMS host in `images.remotePatterns`, and the CMS
  origin passed as a **build arg** (it is baked into the CSP).
- Backend Dockerfile: `pnpm prune --prod` after `pnpm build` — saves hundreds of MB on
  a small disk.

## 3. TLS: certbot with DNS-01, in Docker

Use the `certbot/dns-cloudflare` image and the DNS challenge. It needs no open port 80,
works while the hostnames still point elsewhere, and works with Cloudflare's proxy on.
One cert covers both hosts. Pass the token to the server over **stdin** into a
root-only `cloudflare.ini` — never on a command line. Renewal is a systemd timer that
reloads Nginx. See `references/server.md`.

## 4. Nginx in front of 127.0.0.1-only containers

- `:80` → `301 https://$host$request_uri` (Cloudflare forwards `http://` visitors on 80).
- `:443` default server → `return 444` for unknown hosts.
- One server block per host, `proxy_pass http://127.0.0.1:<port>`, `X-Forwarded-Proto`,
  `client_max_body_size 50m` on the CMS.
- **Origin allowlist: only Cloudflare may connect.** Otherwise anyone with the IP and a
  `Host:` header bypasses every Cloudflare protection. Do it with
  `geo $realip_remote_addr $from_cloudflare` + `if ($from_cloudflare = 0) { return 403; }`.
  **Never** put `allow/deny` next to `set_real_ip_from` + `real_ip_header` — the realip
  module rewrites `$remote_addr` to the visitor *before* the access check, so allow/deny
  then tests the visitor's IP and 403s every real user. (This shipped once; test from a
  real browser through Cloudflare, not only the bypass.)
- Refresh the Cloudflare ranges weekly with a timer.

## 5. Server directory and secrets

`/opt/<slug>/` owned by the SSH user, mode 750:

| File | Holds |
|---|---|
| `docker-compose.yml` | copied by the workflow on every deploy |
| `backend.env` | freshly generated Strapi secrets, `PUBLIC_URL`, `IS_PROXIED=true`, `CORS_ALLOWED_ORIGINS=https://<domain>` |
| `frontend.env` | `STRAPI_API_TOKEN` (filled in step 8) |
| `.env` | `TAG=<sha>` written by the workflow — so a manual `docker compose up` uses the deployed images |

Env files mode 600. Generate secrets locally, `scp` them, delete the local copies.

## 6. CI/CD

`references/pipeline.md` has the workflow. The decisions in it:

- **Dedicated deploy key.** Generate an ed25519 pair, append the public half to the
  server's `authorized_keys`, store the private half as `EC2_SSH_KEY`, delete it
  locally. Never upload the user's own key.
- **`EC2_KNOWN_HOSTS`** from `ssh-keyscan` — no `StrictHostKeyChecking=no`.
- **GHCR auth with the job's `GITHUB_TOKEN` over stdin**, `docker logout` after. No
  long-lived registry credential on the server.
- **No `environment:` block** on a private repo on the free plan.
- **Smoke test on the server**, through Nginx with `--resolve <host>:443:127.0.0.1`.
  A runner's `curl` through Cloudflare gets a bot-challenge 403 that says nothing about
  the app.
- `docker image prune -af` after `up -d`.

## 7. DNS — last

Create the CMS record whenever (it is new, nothing breaks). Switch the **apex last**,
after the first deploy is healthy, so whatever lived there is not down while the box is
empty. Proxied A records to the IP, TTL auto.

## 8. First admin and the frontend's token

On the server, after the first deploy:

```bash
docker compose exec -T backend node node_modules/@strapi/strapi/bin/strapi.js \
  admin:create-user --firstname=<f> --lastname=<l> --email=<email> --password="$PW"
```

Then, still on the server: `POST /admin/login` and `POST /admin/api-tokens`
(`"type":"full-access","lifespan":null`) via `curl --resolve <cms>:443:127.0.0.1`,
write the `accessKey` into `frontend.env`, `docker compose up -d frontend`. Prove it from
inside the frontend container: a CMS call with the token → 200, without → 403. Send the
password over stdin; report it to the user and tell them to change it.

## 9. Verify — and how to see a site behind a Cloudflare challenge

| Check | How |
|---|---|
| Containers healthy | `docker compose ps`, `docker stats --no-stream` |
| Origin cert | `openssl s_client -connect <ip>:443 -servername <domain>` — both SANs, expiry |
| Edge HTTPS | `curl -sD - https://<domain>` — a `cf-mitigated: challenge` 403 is Cloudflare, not the app |
| Bypass blocked | `curl -k --resolve <domain>:443:<ip> https://<domain>` → 403 |
| Real path works | ask the user to load it, or watch `/var/log/nginx/access.log` for a 200 from their IP |
| Survives reboot | `systemctl is-enabled docker nginx *.timer`, `restart: unless-stopped`, swap in fstab |

To drive a browser against production when Cloudflare challenges headless browsers,
tunnel to the origin: `ssh -L 8443:127.0.0.1:443 ...`, launch Edge/Chrome with
`--host-resolver-rules="MAP <domain> 127.0.0.1"` **and the target URL on the command
line** (`https://<domain>:8443/`), then attach DevTools. Navigating an existing tab
from `about:blank` swaps renderer processes and detaches the session. Time animations
against `performance.now()` in the page, not the launcher's clock — the tunnel adds
over a second before the HTML arrives.

## Mistakes made on the first run (quannh.xyz) — don't repeat them

Every row below actually happened. Read this before starting, not after.

| Symptom | Cause | Do this instead |
|---|---|---|
| **Every real visitor got 403** right after "securing" the origin; the bypass test still looked fine | `allow <cloudflare ranges>; deny all;` sat next to `set_real_ip_from` + `real_ip_header CF-Connecting-IP`. The realip module rewrites `$remote_addr` to the *visitor* before the access phase, so the allowlist tested the visitor's IP | `geo $realip_remote_addr $from_cloudflare` + `if ($from_cloudflare = 0) { return 403; }` (step 4). After any origin-lock change, test the **real path through Cloudflare** (user's browser or the Nginx access log), not only the direct-IP bypass |
| Backend image build failed at `pnpm install`: *Failed to read pnpm-workspace.yaml* | No `packageManager` field, so `corepack` in the image fetched the newest pnpm (12) against files written by pnpm 11 | Pin `"packageManager": "pnpm@<version>"` in **every** app before the first CI run |
| Recreating one container on the server: `manifests/latest: unauthorized`, and the new token never reached the app (still 403) | `docker compose up -d frontend` with no `TAG` falls back to `:latest`, which the server cannot pull without the job's token | The workflow writes `TAG=<sha>` to `/opt/<slug>/.env`; on a hand-made box, write it first |
| Local `docker build` of Strapi crawled 15+ minutes (npm `error (23)` retries) and blocked the session | Building a heavy image on a Windows dev machine to "pre-check" CI | Push and let Actions build; read the Actions log if it fails |
| A runner-side smoke test would always fail | Cloudflare's bot challenge answers the runner's `curl` with `403 cf-mitigated: challenge` | Smoke-test on the server with `curl --resolve <host>:443:127.0.0.1` |
| Couldn't find the instance or open ports | The local AWS CLI identity had no `ec2:*` permissions | Ask the user for the IP and to open 80/443 up front |
| Couldn't confirm SSL mode, WAF or bot settings | The Cloudflare token was DNS-only | Say what was not verified; ask for `Zone Settings:Read` + `Zone WAF:Read` if it matters |
| `ssh` refused the `.pem` on Windows / login failed as `ubuntu` | Key file inherited broad ACLs; Amazon Linux uses `ec2-user` | `icacls <key> /inheritance:r /grant:r "%USERNAME%:R"`; try `ec2-user` then `ubuntu` |
| The "remote" username printed was the *local* Windows user | PowerShell expanded `$(whoami)` inside a double-quoted ssh command before sending it | Run remote commands from bash with single quotes, or escape for PowerShell with a backtick |
| Production test looked like "the intro never ends — page locked forever" | Timed from the browser launch, but the SSH tunnel delayed the HTML ~1.2 s; the page's own clock showed it finished on time | Time against `performance.now()` / the moment `data-intro` flips, not the launcher |
| Headless browser test against prod: `Not attached to an active page` | Navigating an `about:blank` tab to a new HTTPS site swaps the renderer process and detaches the DevTools session | Put the target URL on the browser's command line, then attach |
| Visitors saw "Verify you are human" before the site's own intro | Zone-wide challenge (Under Attack mode or a challenge-all rule) | Recommend Bot Fight Mode + a managed challenge scoped to `/admin` |

## Reminders

- Cloudflare challenge-all rules also block link previews (LinkedIn, Facebook) and can
  hurt indexing — worth raising even when the user only asked about spam.
- The Cloudflare token file and the SSH key are secrets: never echo them, pass over
  stdin, `install -m 600`.
- A Strapi admin that "already exists" (re-running setup on a kept database) gets a new
  password with `strapi admin:reset-user-password`, not a second `create-user`.
