# EC2 server — file bodies (options C and D)

Placeholders: `<domain>` (site), `<cms>` (CMS host), `<email>` (Let's Encrypt contact),
`<slug>`. Written for Amazon Linux 2023 (`dnf`); on Ubuntu swap `dnf` for `apt-get` and
Docker's own apt repo. Sections marked **Docker** or **PM2** apply to that runtime only;
everything else is shared.

## Swap (both)

```bash
set -e
if ! swapon --show | grep -q swapfile; then
  sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo "/swapfile swap swap defaults 0 0" | sudo tee -a /etc/fstab >/dev/null
fi
echo "vm.swappiness=10" | sudo tee /etc/sysctl.d/99-swappiness.conf >/dev/null
sudo sysctl -q -p /etc/sysctl.d/99-swappiness.conf
```

On a 1 GB box running PM2, the build on the server **will** use it.

## Docker, Compose, Nginx (Docker)

```bash
sudo dnf install -y -q docker nginx
# The Compose plugin is not packaged on AL2023 — install the release binary.
sudo mkdir -p /usr/libexec/docker/cli-plugins
sudo curl -fsSL https://github.com/docker/compose/releases/download/v2.40.3/docker-compose-linux-x86_64 \
  -o /usr/libexec/docker/cli-plugins/docker-compose
sudo chmod +x /usr/libexec/docker/cli-plugins/docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user        # takes effect on the next SSH session
```

## Node, pnpm, PM2, Nginx (PM2)

```bash
sudo dnf install -y -q nodejs22 nodejs22-npm git nginx
sudo alternatives --set node /usr/bin/node-22 2>/dev/null || true
node -v                                   # expect v22.x
sudo corepack enable                      # pnpm comes from each repo's packageManager pin
sudo npm install -g pm2
pm2 startup systemd -u ec2-user --hp /home/ec2-user   # prints a sudo line — run it
```

`pm2 save` after the first successful start (the deploy script does it every time).

First-time layout:

```bash
sudo install -d -o ec2-user -g ec2-user -m 750 /opt/<slug> /opt/<slug>/releases /opt/<slug>/shared
mkdir -p /opt/<slug>/shared/db /opt/<slug>/shared/uploads
# env files into /opt/<slug>/shared (scp, or rendered from SSM — ssm-parameters.md), chmod 600
```

## Certificates — certbot DNS-01

Pass the Cloudflare token over stdin into a root-only file (both runtimes):

```bash
printf 'dns_cloudflare_api_token = %s\n' "$CF_TOKEN" | ssh <host> \
  'sudo mkdir -p /etc/letsencrypt && sudo install -m 600 -o root -g root /dev/stdin /etc/letsencrypt/cloudflare.ini'
```

### PM2 box: certbot in a venv (no Docker)

```bash
sudo dnf install -y -q python3 augeas-libs
sudo python3 -m venv /opt/certbot
sudo /opt/certbot/bin/pip install -q --upgrade pip certbot certbot-dns-cloudflare
sudo ln -sf /opt/certbot/bin/certbot /usr/local/bin/certbot

sudo certbot certonly --non-interactive --agree-tos -m <email> \
  --dns-cloudflare --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 30 -d <domain> -d <cms>
```

Renewal service: `ExecStart=/usr/local/bin/certbot renew --quiet`,
`ExecStartPost=/usr/bin/systemctl reload nginx`; timer as below.

### Docker box: certbot in Docker

Issue one cert for both hosts:

```bash
sudo docker run --rm -v /etc/letsencrypt:/etc/letsencrypt certbot/dns-cloudflare:latest \
  certonly --non-interactive --agree-tos -m <email> \
  --dns-cloudflare --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 30 -d <domain> -d <cms>
```

`/etc/systemd/system/certbot-renew.service`:

```ini
[Unit]
Description=Renew Let's Encrypt certificates (certbot dns-cloudflare in Docker)
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/docker run --rm -v /etc/letsencrypt:/etc/letsencrypt certbot/dns-cloudflare:latest renew --quiet --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini
ExecStartPost=/usr/bin/systemctl reload nginx
```

`/etc/systemd/system/certbot-renew.timer`:

```ini
[Unit]
Description=Run certbot renew twice a day

[Timer]
OnCalendar=*-*-* 03,15:17:00
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
```

## Cloudflare-only origin

`/usr/local/bin/update-cloudflare-ips` (mode 755). Run it once before the first
`nginx -t` — the site config references both files it writes.

```sh
#!/bin/sh
# Regenerates the Cloudflare allowlist. Two files, because the order matters:
#  - 00-cloudflare-geo.conf (http context) classifies $realip_remote_addr, the address of
#    the TCP peer BEFORE real_ip rewriting — that must be a Cloudflare edge.
#  - cloudflare-realip.conf then rewrites $remote_addr to the visitor (CF-Connecting-IP),
#    for logs only. Checking allow/deny after that rewrite would test the visitor IP.
set -e
v4=$(curl -fsS https://www.cloudflare.com/ips-v4); v6=$(curl -fsS https://www.cloudflare.com/ips-v6)
echo "$v4" | grep -q "^173.245.48.0/20$" || { echo "Cloudflare list looks wrong, keeping the old one"; exit 1; }
geo=$(mktemp); rip=$(mktemp)
{ echo "# generated by /usr/local/bin/update-cloudflare-ips"
  echo "geo \$realip_remote_addr \$from_cloudflare {"; echo "    default 0;"; echo "    127.0.0.1 1;"; echo "    ::1 1;"
  for ip in $v4 $v6; do echo "    $ip 1;"; done; echo "}"; } > "$geo"
{ echo "# generated by /usr/local/bin/update-cloudflare-ips"
  for ip in $v4 $v6; do echo "set_real_ip_from $ip;"; done; echo "real_ip_header CF-Connecting-IP;"; } > "$rip"
install -m 644 "$geo" /etc/nginx/conf.d/00-cloudflare-geo.conf
install -m 644 "$rip" /etc/nginx/cloudflare-realip.conf
rm -f "$geo" "$rip"
nginx -t && systemctl reload nginx
```

`localhost` stays allowed so the deploy smoke test can go through Nginx.

`cloudflare-ips.service` / `.timer` — same shape as the certbot pair, `ExecStart=/usr/local/bin/update-cloudflare-ips`, `OnCalendar=weekly`.

## Nginx site — `/etc/nginx/conf.d/<slug>.conf`

```nginx
# Plain HTTP: redirect to HTTPS (Cloudflare forwards http:// visitors here on port 80).
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 301 https://$host$request_uri;
}

# Anything on 443 that is not one of our hosts: drop the connection.
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _;
    ssl_certificate     /etc/letsencrypt/live/<domain>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<domain>/privkey.pem;
    return 444;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name <domain>;

    ssl_certificate     /etc/letsencrypt/live/<domain>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<domain>/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        if ($from_cloudflare = 0) { return 403; }
        include /etc/nginx/cloudflare-realip.conf;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

# <cms>: same block with server_name <cms>, proxy_pass http://127.0.0.1:1337 and
#     client_max_body_size 50m;   # matches Strapi's upload cap
```

Then:

```bash
sudo nginx -t && sudo systemctl daemon-reload
sudo systemctl enable --now nginx certbot-renew.timer cloudflare-ips.timer
```
