# Option C — EC2 + Docker + GHCR: pipeline file bodies

Placeholders: `<owner>` (GitHub user/org, lowercase), `<slug>`, `<domain>`, `<cms>`.
Repo layout assumed: `frontend/` and `backend/`, each with its own Dockerfile, plus
`deploy/docker-compose.prod.yml`.

## Dockerfile rules (both apps)

- `ARG NODE_VERSION=22`, `node:${NODE_VERSION}-bookworm-slim`, `corepack enable`.
- Copy `package.json pnpm-lock.yaml pnpm-workspace.yaml` first, install with a cache
  mount, then copy the rest. `pnpm-workspace.yaml` carries the approved build scripts
  (`sharp`, `better-sqlite3`, `@swc/core`, `esbuild`) — without it native modules are
  never built inside the image.
- `package.json` **must** pin `"packageManager": "pnpm@<version>"`.
- Frontend: every `NEXT_PUBLIC_*` and the CMS origin are `ARG`s (baked at build). The
  CMS token is **not** an ARG — build args land in image metadata; it is read at runtime.
  Runner stage copies `.next/standalone`, `.next/static`, `public`; non-root user.
- Backend: toolchain (`python3 make g++`) in the deps stage for native modules; throwaway
  build-time secrets (`APP_KEYS=build,...`) so `strapi build` runs; `pnpm prune --prod`
  after the build; SQLite file and uploads on volumes (`/app/.tmp`, `/app/public/uploads`).

## `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]
    paths: ["frontend/**", "backend/**", "deploy/**", ".github/workflows/deploy.yml"]
  workflow_dispatch:

# One deploy at a time; a newer push waits rather than racing the server.
concurrency:
  group: deploy-production
  cancel-in-progress: false

env:
  REGISTRY: ghcr.io
  IMAGE_PREFIX: ghcr.io/<owner>/<slug>

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    strategy:
      matrix:
        app: [frontend, backend]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: ./${{ matrix.app }}
          push: true
          tags: |
            ${{ env.IMAGE_PREFIX }}-${{ matrix.app }}:${{ github.sha }}
            ${{ env.IMAGE_PREFIX }}-${{ matrix.app }}:latest
          # Ignored by the backend Dockerfile, which declares no ARGs.
          build-args: |
            NEXT_PUBLIC_SITE_URL=https://<domain>
            NEXT_PUBLIC_SITE_ENV=production
            NEXT_PUBLIC_STRAPI_API_URL=https://<cms>
            STRAPI_API_URL=https://<cms>
          cache-from: type=gha,scope=${{ matrix.app }}
          cache-to: type=gha,mode=max,scope=${{ matrix.app }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    # No `environment:` — not available on private repos on the free plan.
    permissions:
      contents: read
      packages: read
    steps:
      - uses: actions/checkout@v4

      - name: Configure SSH
        run: |
          install -m 700 -d ~/.ssh
          echo "${{ secrets.EC2_SSH_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          echo "${{ secrets.EC2_KNOWN_HOSTS }}" > ~/.ssh/known_hosts

      - name: Upload compose file
        run: scp -i ~/.ssh/deploy_key deploy/docker-compose.prod.yml "${{ secrets.EC2_USER }}@${{ secrets.EC2_HOST }}:/opt/<slug>/docker-compose.yml"

      - name: Pull and restart
        # GITHUB_TOKEN goes over stdin and only lives for this job — no registry
        # credential is ever stored on the server.
        run: |
          echo "${{ secrets.GITHUB_TOKEN }}" | ssh -i ~/.ssh/deploy_key "${{ secrets.EC2_USER }}@${{ secrets.EC2_HOST }}" "
            set -e
            cd /opt/<slug>
            docker login ghcr.io -u '${{ github.actor }}' --password-stdin
            # Persisted so a manual docker compose up keeps the same images.
            echo 'TAG=${{ github.sha }}' > .env
            docker compose pull
            docker compose up -d --remove-orphans
            docker logout ghcr.io
            docker image prune -af
          "

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

## `deploy/docker-compose.prod.yml`

```yaml
# Copied to /opt/<slug>/docker-compose.yml by the workflow, which also writes TAG to
# /opt/<slug>/.env. Images come from GHCR; the server never builds. Both apps bind to
# 127.0.0.1 only — Nginx on the host terminates TLS in front of them.
services:
  backend:
    image: ghcr.io/<owner>/<slug>-backend:${TAG:-latest}
    container_name: <slug>-backend
    restart: unless-stopped
    env_file: ./backend.env
    ports:
      - "127.0.0.1:1337:1337"
    volumes:
      - <slug>-db:/app/.tmp
      - <slug>-uploads:/app/public/uploads
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:1337/_health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  frontend:
    image: ghcr.io/<owner>/<slug>-frontend:${TAG:-latest}
    container_name: <slug>-frontend
    restart: unless-stopped
    env_file: ./frontend.env
    environment:
      # Server-side CMS calls go container-to-container, not out through Cloudflare.
      STRAPI_API_URL: http://backend:1337
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      - backend
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s

volumes:
  <slug>-db:
  <slug>-uploads:
```

## Secrets — set from the local machine

```bash
ssh-keygen -q -t ed25519 -N "" -C "github-actions-deploy@<slug>" -f ./deploy_key
cat deploy_key.pub | ssh -i <user-key> <user>@<ip> 'cat >> ~/.ssh/authorized_keys'
ssh-keyscan -t ed25519,ecdsa,rsa <ip> > known_hosts

gh secret set EC2_HOST        -R <owner>/<repo> -b "<ip>"
gh secret set EC2_USER        -R <owner>/<repo> -b "ec2-user"
gh secret set EC2_SSH_KEY     -R <owner>/<repo> < deploy_key
gh secret set EC2_KNOWN_HOSTS -R <owner>/<repo> < known_hosts
rm -f deploy_key deploy_key.pub known_hosts
```

Prove the deploy key before the first run: `ssh -i deploy_key <user>@<ip> 'docker ps'`
must work without sudo (the user is in the `docker` group).
