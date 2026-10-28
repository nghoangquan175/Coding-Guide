---
name: cloudflare-security
description: Audit and harden a Cloudflare zone (Free plan) through the API — security level, Bot Fight Mode, AI-bot blocking, Under Attack Mode, WAF custom rules, rate limiting, HTTPS/TLS — and read the traffic analytics to tell scanners from real users and Googlebot. Covers the token to ask for, the baseline to apply, what each setting does to search engines and share previews, and the API traps that silently reset settings. Use when asked to check or tighten Cloudflare security, explain "lots of strange IPs" or 403s in Security Analytics, block bots or spam, decide whether to turn on Under Attack Mode, or when Search Console cannot fetch a site behind Cloudflare.
---

# Cloudflare security

```
/cloudflare-security [audit | harden | traffic] <zone>
```

`audit` reads the settings and reports; `traffic` reads the analytics and explains who is
hitting the site; `harden` applies the baseline below. With no argument, do `audit` +
`traffic` and propose the changes — apply only after the user says so.

Proven on quannh.xyz (Next.js + Strapi on EC2, origin locked to Cloudflare IPs).

## Token — ask once, keep it out of the chat

Create an empty file and open it for the user (`notepad <path>` on Windows) so the token
never goes through the conversation. Custom token, **Specific zone**, short TTL:

| Need | Permissions |
|---|---|
| audit + traffic | Zone: `Zone`, `Zone Settings`, `DNS`, `Firewall Services`, `Zone WAF`, `Bot Management`, `SSL and Certificates`, `Analytics`, `Logs` → **Read**; Account: `Account Settings` → Read (audit log) |
| harden | `Zone Settings`, `Bot Management`, `Zone WAF`, `Firewall Services` → **Edit** |

Verify with `GET /user/tokens/verify`. A token's name says nothing about its rights — one
named "read" turned out to have Edit. Don't assume either way; a harmless real change you
were going to make anyway (e.g. `always_use_https` → on) is a fine probe once approved.

A DNS-only token (the one certbot uses) cannot read any of this. Say what you couldn't see.

## Audit — what to read

```bash
A=https://api.cloudflare.com/client/v4; H="Authorization: Bearer $(tr -d '\r\n ' < token.txt)"
Z=$(curl -s -H "$H" "$A/zones?name=<zone>" | jq -r '.result[0].id')   # also .plan.name, .account.id
for s in security_level browser_check ssl always_use_https min_tls_version; do
  curl -s -H "$H" "$A/zones/$Z/settings/$s" | jq -c '{id:.result.id, v:.result.value}'; done
curl -s -H "$H" "$A/zones/$Z/bot_management" | jq .result
curl -s -H "$H" "$A/zones/$Z/rulesets" | jq -r '.result[] | [.phase,.kind,.name,.id] | @tsv'
curl -s -H "$H" "$A/zones/$Z/rulesets/phases/http_request_firewall_custom/entrypoint" | jq '.result.rules'
curl -s -H "$H" "$A/zones/$Z/rulesets/phases/http_ratelimit/entrypoint" | jq '.result.rules'
curl -s -H "$H" "$A/accounts/<account>/audit_logs?since=<iso>&per_page=50"   # who changed what, when
```

The **audit log** is the first stop when something "stopped working yesterday" — it shows
the old and new value of every setting (that is how an Under Attack Mode left on was found).

## Baseline (Free plan)

| Setting | Value | Why / effect on Google |
|---|---|---|
| Security Level | `medium` | Challenges IPs with a bad reputation only. Verified bots pass |
| Bot Fight Mode | on (`fight_mode`, `enable_js`) | Challenges unverified bots. Googlebot, Bingbot, link-preview bots are verified and pass. Cannot be skipped by a rule on Free — anything server-to-server must not go through Cloudflare (below) |
| Block AI bots | `ai_bots_protection: block` + managed robots.txt | Blocks training crawlers (GPTBot, ClaudeBot, Google-Extended…). Not Googlebot |
| Browser Integrity Check | on | |
| SSL | `strict` | Needs a valid origin cert |
| Always Use HTTPS | on | Even if Nginx redirects — scanners hammer port 80 otherwise |
| Min TLS | `1.2` | |
| Custom rule: block scanners | block | See the expression below |
| Rate limit (Free: 1 rule) | CMS login | 10 s period, 10 s block, `ip.src` + `cf.colo.id` are the only allowed values |
| **Under Attack Mode** | **off** | See below |

Scanner rule — only for paths the stack never serves (no PHP, no WordPress):

```
(lower(http.request.uri.path) contains "/.env") or (lower(http.request.uri.path) contains "/.git")
or (lower(http.request.uri.path) contains "/.aws") or (lower(http.request.uri.path) contains "/wp-")
or (lower(http.request.uri.path) contains "xmlrpc") or (ends_with(lower(http.request.uri.path), ".php"))
```

Rate limit for a Strapi admin:
`(http.host eq "cms.<domain>" and http.request.uri.path eq "/admin/login" and http.request.method eq "POST")`, 5 requests / 10 s.

### Under Attack Mode

It puts a JS challenge in front of **every** request. Use it only during a real attack
and turn it off after. Left on, it:
- breaks Search Console — the sitemap shows **"Couldn't fetch"** while URL Inspection's
  live test (run later) looks fine;
- breaks share previews (LinkedIn, Slack, Facebook) and uptime checks;
- slows the first page view for every visitor.

It shows up as `security_level: under_attack`, and its challenges are logged with
`securitySource: securitylevel` — the same source as normal Security Level challenges, so
a big "Security Level" number in analytics is a hint to check the audit log.

## Traps — each one happened

- ⛔ `PUT /zones/:id/bot_management` **replaces the whole object**. Sending only
  `fight_mode` reset `ai_bots_protection` to `disabled`. Read first, send every field back
  (`ai_bots_protection`, `is_robots_txt_managed`, …), read again after.
- ⛔ `PUT …/phases/http_request_firewall_custom/entrypoint` replaces **all** custom rules.
  To add one, `POST …/rulesets/<id>/rules`. Same care for the rate-limit entrypoint.
- ⛔ Deleting or "fixing" a disabled custom rule. The user may keep it as a standby
  switch for an emergency. Leave disabled rules alone unless asked.
- ⛔ Turning on Bot Fight Mode while the frontend fetches the CMS through its public
  hostname — the server's datacenter IP gets challenged and the site falls back or breaks.
  Server-side calls must go container-to-container (`http://backend:1337`), revalidate
  hooks to `http://frontend:3000`, CI smoke tests through `127.0.0.1` with `--resolve`.
  Check this **before** hardening.
- ⛔ Reading a `200` on `/.env` in analytics as a leak. An SPA or catch-all route answers
  every path with `index.html`. Fetch it and look at the body and size before raising
  the alarm — and before dismissing it.
- ⛔ Testing "can Googlebot get in" with `curl -A Googlebot` — it proves nothing, Cloudflare
  judges the IP. The real test is Search Console → URL Inspection → Test live URL.

## Traffic — reading the analytics (GraphQL)

```bash
q(){ curl -s -H "$H" -H "Content-Type: application/json" $A/graphql \
  --data "$(jq -n --arg q "$1" '{query:$q}')"; }
# Daily totals
q "{viewer{zones(filter:{zoneTag:\"$Z\"}){httpRequests1dGroups(limit:7,filter:{date_geq:\"<date>\"},orderBy:[date_ASC]){dimensions{date} sum{requests pageViews threats} uniq{uniques}}}}}"
# Top IPs (last 24 h on Free), then drill into one
q "{viewer{zones(filter:{zoneTag:\"$Z\"}){httpRequestsAdaptiveGroups(limit:25,filter:{datetime_geq:\"<iso>\"},orderBy:[count_DESC]){count dimensions{clientIP clientCountryName clientRequestHTTPHost}}}}}"
#   …dimensions{clientRequestPath edgeResponseStatus userAgent}  with filter clientIP:"<ip>"
#   …dimensions{securityAction securitySource clientRequestHTTPHost}  with filter edgeResponseStatus:403
#   …filter edgeResponseStatus:200 — then drop /_next/static and real pages: what is left is worth a look
```

Free plan limits: no `clientASN`/`clientASNDescription`, no `firewallEventsAdaptiveGroups`,
adaptive data only ~24 h back. Use `securityAction`/`securitySource` instead of firewall events.

How to read it:
- `66.249.x.x` with Googlebot/Nexus 5X UAs fetching JS/CSS/`_next/image` = Googlebot
  rendering. Good.
- Paths like `/.env`, `/.git/config`, `/.aws/credentials`, `/wp-json/`, `/actuator/*`,
  `phpinfo.php` = automated scanners. Normal for any public domain; what matters is the
  status (403/404 fine, 200 → check the body).
- Fake UAs (`GrokBot`, `Claude-SearchBot` asking for `gcp-credentials.json`) are scanners.
- `securitySource`: `securitylevel` = challenged by reputation or Under Attack,
  `firewallManaged` = WAF managed ruleset, `firewallCustom` = a custom rule, `botFight`.

## Verifying after a change

```bash
for u in / /sitemap.xml /robots.txt /<a-subpage> ; do curl -s -o /dev/null -w "%{http_code} $u\n" -A "<real browser UA>" https://<domain>$u; done
curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/.env            # 403
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://<domain>/ # 301 → https
curl -s --tls-max 1.1 https://<domain>/ || echo refused                     # refused
curl -s https://<domain>/robots.txt | grep -c "Cloudflare Managed"        # still managed
```

Plus: the CMS admin loads and logs in, the containers are healthy, and the user re-runs
Search Console's live test.

## Reporting

Audit: a table of setting → current → recommended → effect on Google/visitors. Traffic:
daily totals, then the top IPs as "who / what they asked for / what they got", then what
blocked them, then whether anything got through. Always end with whether search engines
are affected.
