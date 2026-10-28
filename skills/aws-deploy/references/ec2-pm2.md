# Option D — EC2 + PM2: pipeline file bodies

Placeholders: `<slug>`, `<domain>`, `<cms>`. Repo layout: `frontend/`, `backend/`,
`ecosystem.config.js` and `deploy/deploy.sh` at the root.

## `ecosystem.config.js`

```js
/**
 * PM2 process definitions for production. cwd goes through the `current` symlink, so a
 * reload after the symlink moves starts the new release. Each app reads its own .env
 * (a symlink into /opt/<slug>/shared) via Node's --env-file.
 */
const ROOT = '/opt/<slug>/current';

module.exports = {
  apps: [
    {
      name: '<slug>-backend',
      cwd: `${ROOT}/backend`,
      script: 'node_modules/@strapi/strapi/bin/strapi.js',
      args: 'start',
      node_args: '--env-file=.env',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '600M',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
    {
      name: '<slug>-frontend',
      cwd: `${ROOT}/frontend`,
      // `next start` refuses a standalone build; run its server directly.
      script: '.next/standalone/server.js',
      node_args: '--env-file=.env',
      env: { NODE_ENV: 'production', PORT: '3000', HOSTNAME: '127.0.0.1' },
      max_memory_restart: '300M',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
```

## `deploy/deploy.sh` — runs on the server

```bash
#!/usr/bin/env bash
# Usage: deploy.sh <sha>       — install, build and switch to releases/<sha>
#        deploy.sh rollback    — point current at the previous release and reload
set -euo pipefail
APP=/opt/<slug>
KEEP=3
cd "$APP"

reload() {
  pm2 startOrReload "$APP/current/ecosystem.config.js" --update-env
  pm2 save
}

if [ "${1:-}" = rollback ]; then
  prev=$(ls -1t releases | sed -n 2p)
  [ -n "$prev" ] || { echo "no previous release"; exit 1; }
  ln -sfn "releases/$prev" current && reload && echo "rolled back to $prev"
  exit 0
fi

sha=$1
rel="releases/$sha"
mkdir -p "$rel" && tar -xzf "releases/$sha.tgz" -C "$rel" && rm -f "releases/$sha.tgz"

# Shared state lives outside the release so it survives every deploy.
ln -sfn "$APP/shared/backend.env"  "$rel/backend/.env"
ln -sfn "$APP/shared/frontend.env" "$rel/frontend/.env"
rm -rf "$rel/backend/.tmp" "$rel/backend/public/uploads"
ln -sfn "$APP/shared/db"      "$rel/backend/.tmp"
ln -sfn "$APP/shared/uploads" "$rel/backend/public/uploads"

export NODE_OPTIONS=--max-old-space-size=1536   # a 1 GB box builds on swap

(cd "$rel/backend"  && CI=true pnpm install --frozen-lockfile && NODE_ENV=production pnpm build)
(cd "$rel/frontend" && CI=true pnpm install --frozen-lockfile && pnpm build \
   && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/)

# Only now does the new release go live.
ln -sfn "$rel" current
reload

# Keep the newest $KEEP releases.
ls -1t releases | tail -n +$((KEEP + 1)) | xargs -r -I{} rm -rf "releases/{}"
```

`set -e` means a failed install or build exits before `ln -sfn ... current`, so the live
release is untouched. The half-built directory stays for inspection and is pruned later.

## `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]
    paths: ["frontend/**", "backend/**", "deploy/**", "ecosystem.config.js", ".github/workflows/deploy.yml"]
  workflow_dispatch:

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    # No `environment:` — not available on private repos on the free plan.
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Configure SSH
        run: |
          install -m 700 -d ~/.ssh
          echo "${{ secrets.EC2_SSH_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          echo "${{ secrets.EC2_KNOWN_HOSTS }}" > ~/.ssh/known_hosts

      - name: Ship release
        # Source only — the server installs and builds against its own glibc.
        run: |
          git archive --format=tar.gz -o release.tgz HEAD frontend backend ecosystem.config.js
          scp -i ~/.ssh/deploy_key release.tgz "${{ secrets.EC2_USER }}@${{ secrets.EC2_HOST }}:/opt/<slug>/releases/${{ github.sha }}.tgz"
          scp -i ~/.ssh/deploy_key deploy/deploy.sh "${{ secrets.EC2_USER }}@${{ secrets.EC2_HOST }}:/opt/<slug>/deploy.sh"

      - name: Install, build, switch
        run: ssh -i ~/.ssh/deploy_key "${{ secrets.EC2_USER }}@${{ secrets.EC2_HOST }}" "bash /opt/<slug>/deploy.sh ${{ github.sha }}"

      - name: Smoke test
        # On the server, through Nginx: Cloudflare's bot challenge 403s a runner's curl.
        run: |
          ssh -i ~/.ssh/deploy_key "${{ secrets.EC2_USER }}@${{ secrets.EC2_HOST }}" '
            for host in <domain> <cms>; do
              path=/; [ "$host" = <cms> ] && path=/_health
              for i in $(seq 1 30); do
                code=$(curl -s -o /dev/null -w "%{http_code}" --resolve "$host:443:127.0.0.1" "https://$host$path" || true)
                case "$code" in 200|204) echo "$host$path -> $code"; continue 2;; esac
                sleep 5
              done
              echo "$host$path never became healthy (last status $code)"; exit 1
            done
          '
```

A build on a small box can outlast the default SSH idle timeout — add
`-o ServerAliveInterval=30` to the `ssh` in "Install, build, switch" if runs drop.

## Secrets

Same four as option C (`ec2-docker.md`) — `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY` (a dedicated
ed25519 deploy key), `EC2_KNOWN_HOSTS` (from `ssh-keyscan`). No registry token: nothing
is pulled from GHCR.

First-time server layout (`/opt/<slug>/releases`, `shared/`) is in `ec2-server.md`.
