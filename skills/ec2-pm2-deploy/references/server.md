# Server — file bodies (PM2)

Placeholders: `<domain>`, `<cms>`, `<email>`, `<slug>`. Amazon Linux 2023 (`dnf`).

## Swap

Same as the Docker skill — 2 GB `/swapfile`, in `/etc/fstab`, `vm.swappiness=10`.
On a 1 GB box the build **will** use it.

## Node, pnpm, PM2

```bash
sudo dnf install -y -q nodejs22 nodejs22-npm git nginx
sudo alternatives --set node /usr/bin/node-22 2>/dev/null || true
node -v                                   # expect v22.x
sudo corepack enable                      # pnpm comes from each repo's packageManager pin
sudo npm install -g pm2
pm2 startup systemd -u ec2-user --hp /home/ec2-user   # prints a sudo line — run it
```

`pm2 save` after the first successful start (the deploy script does it every time).

## Certbot in a venv (no Docker on this box)

```bash
sudo dnf install -y -q python3 augeas-libs
sudo python3 -m venv /opt/certbot
sudo /opt/certbot/bin/pip install -q --upgrade pip certbot certbot-dns-cloudflare
sudo ln -sf /opt/certbot/bin/certbot /usr/local/bin/certbot
```

Token over stdin into a root-only file, then issue:

```bash
printf 'dns_cloudflare_api_token = %s\n' "$CF_TOKEN" | ssh <host> \
  'sudo mkdir -p /etc/letsencrypt && sudo install -m 600 -o root -g root /dev/stdin /etc/letsencrypt/cloudflare.ini'

sudo certbot certonly --non-interactive --agree-tos -m <email> \
  --dns-cloudflare --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 30 -d <domain> -d <cms>
```

`/etc/systemd/system/certbot-renew.service`:

```ini
[Unit]
Description=Renew Let's Encrypt certificates

[Service]
Type=oneshot
ExecStart=/usr/local/bin/certbot renew --quiet
ExecStartPost=/usr/bin/systemctl reload nginx
```

`certbot-renew.timer`: `OnCalendar=*-*-* 03,15:17:00`, `RandomizedDelaySec=1h`,
`Persistent=true`, `WantedBy=timers.target`.

## Cloudflare-only origin

`/usr/local/bin/update-cloudflare-ips` — run once before the first `nginx -t`, then
weekly from `cloudflare-ips.timer`:

```sh
#!/bin/sh
# Two files because order matters: the geo map classifies $realip_remote_addr (the TCP
# peer BEFORE real_ip rewriting — must be a Cloudflare edge); realip then rewrites
# $remote_addr to the visitor for logs only. allow/deny after the rewrite would test the
# visitor's IP and block everyone.
set -e
v4=$(curl -fsS https://www.cloudflare.com/ips-v4); v6=$(curl -fsS https://www.cloudflare.com/ips-v6)
echo "$v4" | grep -q "^173.245.48.0/20$" || { echo "Cloudflare list looks wrong, keeping the old one"; exit 1; }
geo=$(mktemp); rip=$(mktemp)
{ echo "geo \$realip_remote_addr \$from_cloudflare {"; echo "    default 0;"; echo "    127.0.0.1 1;"; echo "    ::1 1;"
  for ip in $v4 $v6; do echo "    $ip 1;"; done; echo "}"; } > "$geo"
{ for ip in $v4 $v6; do echo "set_real_ip_from $ip;"; done; echo "real_ip_header CF-Connecting-IP;"; } > "$rip"
install -m 644 "$geo" /etc/nginx/conf.d/00-cloudflare-geo.conf
install -m 644 "$rip" /etc/nginx/cloudflare-realip.conf
rm -f "$geo" "$rip"
nginx -t && systemctl reload nginx
```

## Nginx — `/etc/nginx/conf.d/<slug>.conf`

```nginx
server {                                  # http:// visitors (Cloudflare uses port 80)
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 301 https://$host$request_uri;
}

server {                                  # unknown hosts on 443
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

# <cms>: same block, server_name <cms>, proxy_pass http://127.0.0.1:1337,
#        client_max_body_size 50m;
```

```bash
sudo nginx -t && sudo systemctl daemon-reload
sudo systemctl enable --now nginx certbot-renew.timer cloudflare-ips.timer
```
