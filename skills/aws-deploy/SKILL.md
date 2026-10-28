---
name: aws-deploy
description: Deploy a project to AWS and pick the right shape for it — static site on S3 + CloudFront, an API on Lambda (API Gateway HTTP API or a function URL behind CloudFront), or a Node app (Next.js + Strapi) on one EC2 box with Docker/GHCR or PM2 behind Cloudflare. Covers GitHub Actions to AWS with OIDC (no access keys), config and secrets in SSM Parameter Store, Terraform, ACM certificates, Cloudflare DNS, Nginx + certbot DNS-01 + Cloudflare-only origin on EC2, smoke tests, and the mistakes made on real deploys (quannh.xyz, saa.quannh.xyz). Use when asked to deploy, host, or set up CI/CD for a project on AWS, EC2, S3, CloudFront, Lambda or API Gateway.
---

# AWS deploy

Pick the option from what the project **is**, then read only the references it needs.

| Option | Fits | Runs | Proven on | Read |
|---|---|---|---|---|
| **A. S3 + CloudFront** | Static site, SPA, Next.js `output: "export"`, docs | Nothing to run — files on S3 | saa.quannh.xyz | `s3-cloudfront.md` |
| **B. Lambda API** | Small JSON API, spiky or low traffic, no server to look after | Lambda behind API Gateway HTTP API (B1) or a function URL behind CloudFront (B2) | B2: saa.quannh.xyz. B1: not yet | `lambda-api.md` |
| **C. EC2 + Docker + GHCR** | Next.js SSR + Strapi (or any long-running Node app), SQLite or local uploads, WebSockets | Containers on one box, images built in Actions | quannh.xyz | `ec2-server.md`, `ec2-docker.md` |
| **D. EC2 + PM2** | Same as C when the client requires PM2 / no Docker | PM2 release dirs, built on the box | Not run end to end yet | `ec2-server.md`, `ec2-pm2.md` |

Cross-cutting, read when the option uses them:

| Reference | Used by |
|---|---|
| `github-oidc.md` — Actions assumes an IAM role, no access keys | A, B always. C/D when CI talks to AWS (SSM Run Command, ECR, parameters) |
| `ssm-parameters.md` — config and secrets in Parameter Store | B (Lambda secrets), C/D (render env files on the box), any build-time values |

Combinations are normal: **A + B2** is one CloudFront serving the static site and
`/api/*` (saa.quannh.xyz). **A + B1** is a static frontend plus `api.<domain>`.
A Next.js app that needs SSR, ISR, route handlers or `next/image` optimisation is **C**,
not A.

How to choose when it's not obvious — say the trade-off to the user, don't decide alone:

- Needs a process running all the time (SSR, a CMS, a queue worker, WebSockets, a SQLite
  file) → C/D. Otherwise prefer A/B: nothing to patch, scales to zero, cents a month.
- A t3.micro box is ~$8–10/month whether anyone visits or not. A + B for a small site
  is usually under $1.
- Lambda limits to mention: 15 min max, 6 MB request/response payload (sync), cold
  starts (~200–500 ms Node), no local disk that persists.

## What you need from the user — ask once, up front

All options:
- **AWS account + profile** to run Terraform/CLI with, and what that identity may do.
  Check with `aws sts get-caller-identity --profile <p>`; don't assume it can read EC2,
  IAM or ACM — a scoped user gets `UnauthorizedOperation`/`AccessDenied`. Ask rather
  than burn time.
- **Domain(s)** and **Cloudflare API token** (`Zone:DNS:Edit`). Read the zone first —
  if the host already points somewhere, say so and let them choose.
- **GitHub repo** (`owner/name`) — for the OIDC trust and the secrets.

A/B also: an **ACM certificate** (us-east-1 for CloudFront; the API's Region for an
API Gateway custom domain), or permission to request one.

C/D also: the instance's **Elastic IP**, **SSH key path**, **security group** with 22
(their IP), 80 and 443 open, and an **instance profile** if the box reads SSM.

## Shared rules — every option

- **Infrastructure in Terraform, applied by hand** with a project-scoped IAM user
  (`<slug>-terraform`, policies limited to `<slug>-*` names; examples in
  `C:\PROJECT\Personal\AWS\infras\iam\`). CI only deploys code/files; it never runs
  `terraform apply`. Commit the state only if it holds no secrets — that's why secret
  **values** never go through Terraform (KVS hash by script, SSM values by CLI).
- **No long-lived AWS keys in GitHub.** OIDC role per repo, trust pinned to
  `repo + branch`, permissions scoped to this project's ARNs. `github-oidc.md`.
- **Secrets**: generated locally, sent over stdin or `file://`, stored in SSM
  `SecureString` (or a mode-600 file on the box), local copies deleted. Never on a
  command line on a shared machine, never echoed, never as a Docker build arg.
- **Workflow shape**: `concurrency` with `cancel-in-progress: false` (deploys queue,
  never race), `paths`/`paths-ignore` so infra-only or docs-only commits don't deploy,
  `workflow_dispatch` for a manual run, a **smoke test as the last step**.
- **No `environment:` block** on a private repo on the free plan — and with OIDC it also
  changes the token's `sub`, which breaks a branch-pinned trust policy.
- **DNS last.** Point the real hostname only after the new target answers correctly,
  so whatever lived there isn't down while the new one is empty.
- Tag everything (`default_tags { Project = "<slug>" }`) — the bill and cleanup depend on it.

## Option A — S3 + CloudFront, in short

Private bucket (OAC, `AWS:SourceArn` = the distribution), CloudFront with the ACM cert,
a viewer-request CloudFront Function that blocks the `*.cloudfront.net` host and rewrites
directory paths (or a login gate with a KeyValueStore). CI: build → OIDC →
`aws s3 sync --delete` (hashed assets `immutable`, the rest `no-cache`) →
`create-invalidation /*`. Cloudflare CNAME **DNS only**. Full Terraform, function,
workflow and the routing table per build type: `references/s3-cloudfront.md`.

## Option B — Lambda API, in short

One handler on payload format 2.0, runtime `nodejs22.x` on arm64, own log group with
retention, role limited to its table and parameter path. B1: HTTP API, `$default` route,
stage throttling, CORS configured on the API (not in the handler), regional custom
domain. B2: function URL `AWS_IAM` behind CloudFront OAC — two Lambda permissions, and
the browser sends `x-amz-content-sha256` on POST/PUT. Code ships by Terraform, or by CI
with `ignore_changes` on the code. `references/lambda-api.md`.

## Options C and D — one EC2 box behind Cloudflare

```
C:  push ──▶ Actions: build 2 images ──▶ GHCR ──▶ ssh EC2: compose pull + up ──▶ smoke test
D:  push ──▶ Actions: git archive ──scp──▶ EC2: releases/<sha> install + build ──▶ switch current ──▶ pm2 reload ──▶ smoke test
```

C: the server **never builds** — a small EC2 cannot build a Strapi admin (it wants 2–3 GB
RAM), and a build on the box competes with the running site. D: the server **must**
build — `better-sqlite3`, `sharp`, `@swc/core` binaries built on `ubuntu-latest`
(glibc 2.39) die on Amazon Linux 2023 (glibc 2.34) with `GLIBC_2.38 not found`. So D
needs ≥ 2 GB RAM or 1 GB + 2 GB swap and patience; if the box can't build at all,
build in Actions inside an `amazonlinux:2023` container and ship the result (say it's a
deviation). Default to **C** unless PM2 is required.

### 1. Look at the box before planning anything

```bash
ssh -i <key> ec2-user@<ip> 'cat /etc/os-release | grep PRETTY; nproc; free -m; df -h /; swapon --show'
```

Try `ec2-user` (Amazon Linux) then `ubuntu`. Report the sizing honestly:

| RAM | Verdict |
|---|---|
| ~1 GB (t3.micro) | C: Next (~40 MB) + Strapi (~200–450 MB) + Nginx **only** with 2 GB swap and no builds on the box — tight. D: builds on swap, minutes per deploy |
| 2 GB+ | Comfortable |

| Disk | Verdict |
|---|---|
| 8 GB | Tight — a Strapi image is ~750 MB (C: prune images every deploy); D keeps node_modules per release (keep 3). Suggest 16–20 GB |

### 2. Server baseline

Swap (2 GB, `vm.swappiness=10`), then C: Docker + the Compose plugin (not in the AL2023
repos — install the binary), `ec2-user` in the `docker` group; D: Node 22 + corepack +
PM2 with its systemd unit. Nginx on both. `references/ec2-server.md`.

### 3. Fix the repo before CI sees it

- **Pin `packageManager`** (`"pnpm@<version>"`) in **every** app's `package.json` —
  otherwise corepack fetches the newest pnpm, which can fail to read the lockfile.
- Strapi behind a proxy: `proxy: { koa: env.bool('IS_PROXIED', false) }` in
  `config/server.ts`, `IS_PROXIED=true` in production — or the admin's secure cookies
  are refused. D also `HOST=127.0.0.1` (no container boundary).
- Next: `output: "standalone"`, the CMS host in `images.remotePatterns`. C passes the
  CMS origin as a **build arg** (baked into the CSP); D runs
  `.next/standalone/server.js` (`next start` refuses a standalone build).
- C: backend Dockerfile runs `pnpm prune --prod` after `pnpm build`. D:
  `ecosystem.config.js` at the root (`references/ec2-pm2.md`).

### 4. TLS, Nginx, Cloudflare-only origin

- certbot with **DNS-01** via the Cloudflare plugin (Docker image on C, venv on D): no
  open port 80 needed, works before DNS moves and with the proxy on. One cert for both
  hosts; token over stdin into a root-only `cloudflare.ini`; renewal timer reloads Nginx.
- `:80` → `301 https://`; `:443` default server → `444`; one server block per host to
  `127.0.0.1:<port>`; `client_max_body_size 50m` on the CMS.
- **Only Cloudflare may connect**, or anyone with the IP and a `Host:` header bypasses
  every Cloudflare protection: `geo $realip_remote_addr $from_cloudflare` +
  `if ($from_cloudflare = 0) { return 403; }`. **Never** `allow/deny` next to
  `set_real_ip_from` + `real_ip_header` — realip rewrites `$remote_addr` to the visitor
  first, so the allowlist tests the visitor and 403s everyone. Refresh the ranges weekly.
- Bodies: `references/ec2-server.md`.

### 5. Server directory and secrets

C — `/opt/<slug>/` (owner the SSH user, 750): `docker-compose.yml` (copied by CI),
`backend.env`, `frontend.env`, `.env` with `TAG=<sha>` (written by CI, so a manual
`docker compose up` uses the deployed images).
D — `/opt/<slug>/releases/<sha>/`, `current ->` symlink, `shared/{backend.env,
frontend.env,db/,uploads/}` symlinked into each release.

Env files mode 600. Either `scp` them once from freshly generated local values (then
delete local copies), or keep the values in SSM and render them on every deploy with
`render-env` (`references/ssm-parameters.md`) — preferred when more than one person
deploys or the box may be rebuilt.

### 6. CI/CD

Default transport is **SSH** (proven):
- **Dedicated ed25519 deploy key** — public half in `authorized_keys`, private half as
  `EC2_SSH_KEY`, deleted locally. Never upload the user's own key.
- **`EC2_KNOWN_HOSTS`** from `ssh-keyscan` — no `StrictHostKeyChecking=no`.
- C: GHCR login with the job's `GITHUB_TOKEN` **over stdin**, `docker logout` after —
  no registry credential stays on the server. `docker image prune -af` after `up -d`.
- D: the server's `deploy.sh` switches `current` only after install + build succeed,
  then `pm2 startOrReload` + `pm2 save`; `deploy.sh rollback` goes back one release.
- **Smoke test on the server**, through Nginx: `curl --resolve <host>:443:127.0.0.1`.
  A runner's `curl` through Cloudflare gets a bot-challenge 403 that says nothing.

Alternative — **OIDC + SSM Run Command, no SSH** (not run yet): close port 22, give the
instance `AmazonSSMManagedInstanceCore`, and let the OIDC role
`aws ssm send-command --document-name AWS-RunShellScript --instance-ids <id>`, then
`aws ssm wait command-executed` and read the output. Commands run as root and their
parameters are stored in SSM history — so **no tokens in commands**: pull images from
**ECR** with the instance role (not GHCR with `GITHUB_TOKEN`), and read secrets from
SSM on the box. Worth it for a client account that forbids open SSH.

Workflow bodies: `references/ec2-docker.md` (C), `references/ec2-pm2.md` (D).

### 7. DNS

CMS record whenever (it's new). Switch the **apex last**, after the first deploy is
healthy. Proxied (orange) A records to the Elastic IP, TTL auto — unlike A/B, where
CloudFront/API Gateway get **DNS only** CNAMEs.

### 8. First Strapi admin and the frontend's token

On the server after the first deploy (C shown; D: `cd /opt/<slug>/current/backend &&
node --env-file=.env node_modules/@strapi/strapi/bin/strapi.js ...`):

```bash
docker compose exec -T backend node node_modules/@strapi/strapi/bin/strapi.js \
  admin:create-user --firstname=<f> --lastname=<l> --email=<email> --password="$PW"
```

Then on the server: `POST /admin/login` → `POST /admin/api-tokens`
(`"type":"full-access","lifespan":null`) via `curl --resolve <cms>:443:127.0.0.1`, put the
`accessKey` in `frontend.env` (or SSM), restart the frontend (C: `docker compose up -d
frontend`; D: `pm2 reload <slug>-frontend --update-env`). Prove it from the server: CMS
call with the token → 200, without → 403. Password over stdin; report it and tell the
user to change it. An admin that already exists gets `admin:reset-user-password`, not a
second `create-user`.

### 9. Verify — and seeing a site behind a Cloudflare challenge

| Check | How |
|---|---|
| Running | C: `docker compose ps`, `docker stats --no-stream`. D: `pm2 list`, `pm2 logs --lines 50 --nostream` |
| Origin cert | `openssl s_client -connect <ip>:443 -servername <domain>` — both SANs, expiry |
| Edge HTTPS | `curl -sD - https://<domain>` — a `cf-mitigated: challenge` 403 is Cloudflare, not the app |
| Bypass blocked | `curl -k --resolve <domain>:443:<ip> https://<domain>` → 403 |
| Real path works | the user loads it, or a 200 from their IP in `/var/log/nginx/access.log` |
| Survives reboot | `systemctl is-enabled docker nginx *.timer` (D: `pm2-ec2-user`, `pm2 save` done), swap in fstab |
| Rollback (D) | `deploy.sh rollback` once, then deploy forward again |

Driving a browser against production when Cloudflare challenges headless browsers:
`ssh -L 8443:127.0.0.1:443 ...`, launch Edge/Chrome with
`--host-resolver-rules="MAP <domain> 127.0.0.1"` **and the target URL on the command
line** (`https://<domain>:8443/`), then attach DevTools. Navigating an `about:blank` tab
swaps renderer processes and detaches the session. Time animations against
`performance.now()` in the page — the tunnel adds over a second before the HTML arrives.

## Mistakes that actually happened — read before starting

| Option | Symptom | Cause | Do this instead |
|---|---|---|---|
| C | **Every real visitor got 403** after "securing" the origin; the bypass test looked fine | `allow/deny` beside `real_ip_header CF-Connecting-IP` tested the visitor's IP | `geo $realip_remote_addr` (step 4); test the real path through Cloudflare, not only the bypass |
| C | Backend image build failed: *Failed to read pnpm-workspace.yaml* | No `packageManager`, corepack fetched pnpm 12 for pnpm 11 files | Pin `pnpm@<version>` in every app first |
| C | Recreating one container: `manifests/latest: unauthorized`, new token never reached the app | `docker compose up` without `TAG` fell back to `:latest` | CI writes `TAG=<sha>` to `/opt/<slug>/.env` |
| C | Local `docker build` of Strapi crawled 15+ min and blocked the session | Building a heavy image on a Windows dev box to "pre-check" CI | Push; read the Actions log if it fails |
| C | Runner-side smoke test always failed | Cloudflare bot challenge → `403 cf-mitigated` | Smoke-test on the server with `--resolve` |
| C | Couldn't find the instance or open ports | Local AWS identity had no `ec2:*` | Ask for IP and open ports up front |
| C | Couldn't confirm SSL mode, WAF, bot settings | Cloudflare token was DNS-only | Say what wasn't verified; ask for read scopes if it matters |
| C | `.pem` refused on Windows / login failed as `ubuntu` | Inherited ACLs; Amazon Linux uses `ec2-user` | `icacls <key> /inheritance:r /grant:r "%USERNAME%:R"`; try `ec2-user` first |
| C | The "remote" user printed was the *local* Windows user | PowerShell expanded `$(whoami)` before ssh sent it | Remote commands from bash in single quotes |
| C | "Intro never ends" in a prod browser test | Timed from launch; the tunnel delayed HTML ~1.2 s | Time against `performance.now()` |
| C | `Not attached to an active page` | Navigated an `about:blank` tab to a new HTTPS site | Target URL on the browser's command line |
| C | Visitors saw "Verify you are human" before the site | Zone-wide challenge (Under Attack / challenge-all) | Bot Fight Mode + managed challenge on `/admin` only |
| A | Actions: `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Trust policy used `repo:owner/repo:...`; the repo's OIDC `sub` is the immutable `repo:owner@id/repo@id:...` | `gh api repos/<o>/<r>/actions/oidc/customization/sub` before writing the trust policy |
| A | The site was reachable on `dxxxx.cloudfront.net`, outside the domain's rules | CloudFront serves its default hostname too | Host check in the viewer-request function → 403 |

## Known traps not hit yet — confirm, then move them up

- **D**: `node_modules` built on the runner shipped to AL2023 → `GLIBC_* not found`;
  build OOM on 1 GB (`JavaScript heap out of memory`) → swap +
  `NODE_OPTIONS=--max-old-space-size=1536`; forgot `pm2 save` / the `pm2 startup` sudo
  line → nothing after reboot; long build drops SSH → `-o ServerAliveInterval=30`.
- **A**: history-routed SPA deep links 403 (S3 says 403 for missing keys without
  ListBucket) → custom error response to `/index.html`; CloudFront alias ≠ hostname → 403
  "request could not be satisfied"; ACM cert outside us-east-1 not selectable.
- **B**: CI-deployed Lambda code reverted by the next `terraform apply` → `ignore_changes`;
  duplicate CORS headers when both API Gateway and the handler set them; B2 POST/PUT
  failing signature without `x-amz-content-sha256`.
- **OIDC**: adding `environment:` to the job silently changes `sub` → AssumeRole denied.
- **SSM**: a typo'd path rendering an empty env file → the `render-env` guard; a
  multi-line value (PEM key) breaks the `NAME=value` render → store it base64.

## Reminders

- Cloudflare challenge-all rules also block link previews (LinkedIn, Facebook) and can
  hurt indexing — raise it even when the user only asked about spam.
- The Cloudflare token, SSH keys and SSM values are secrets: never echo them, pass over
  stdin, `install -m 600`.
- Every `NEXT_PUBLIC_*` is baked at build time: changing one needs a rebuild/redeploy,
  not a restart. Strapi schema/admin changes need a rebuild too.
- PM2 on Windows dev machines: `pm2 kill` with apps running orphans a child that keeps
  the port — `pm2 delete all` first.
- When a deploy option is first run end to end, update its "Proven on" cell and promote
  the traps it confirmed.
