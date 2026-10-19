# Criteria traceability

Walk this before writing the final report. Four outcomes, and the honest one is often
not ✅:

- **✅ code** — this skill satisfies it, verifiable in the repo right now.
- **🖥 server** — cannot be done from a dev machine; goes into `DEPLOYMENT.md` unticked.
- **👤 leader** — the tech leader's to wire (pipeline, cloud, secrets).
- **⏳ later** — needs app code, Figma, content or a live URL that does not exist at setup.

Never report an ⏳ or 🖥 as done. A checklist that lies is worse than one with gaps.

## Stack and code

| # | Requirement | | Where |
|---|---|---|---|
| TECH1 | Node ≥ 20 LTS | ✅ | preflight aborts below 20; `.nvmrc` pins the major |
| TECH2 | NVM, `.nvmrc` in repo root | ✅ | both repos |
| TECH3 | All TS, `strict` on, no `.js` in `src/` | ✅ | both `tsconfig.json`; Strapi's generated config needs `strict: true` set by hand |
| TECH4 | Strapi ≥ 5 | ✅ | floor enforced after scaffold |
| TECH5 | CKEditor 5 for rich text | ✅ | `ckeditor5` plugin installed; fields use it as content types are built |
| TECH6 | dev mode acceptable on staging, production mode on prod | ✅/🖥 | `NODE_ENV` contract documented; the servers enforce it |
| TECH7 | Local assets by default, S3 + CDN if asset-heavy | ✅ | local provider is the default; the decision is recorded in `DEPLOYMENT.md` |
| TECH8 | 50 MB upload cap, clear error | ✅ | `config/plugins.ts`, `upload.config.sizeLimit` |
| TECH9 | CORS allowlist, no wildcard | ✅ | `config/middlewares.ts`, `CORS_ALLOWED_ORIGINS` |
| TECH10 | GitHub Actions deploy over SSH | 👤 | `deploy.yml` is the tech leader's; Docker + PM2 files are shipped for it to call |
| TECH11 | Next ≥ 15 | ✅ | floor enforced after scaffold |
| TECH12 | Server Actions / Route Handlers only; no keys in the client bundle | ✅/⏳ | `import "server-only"` guard convention + `AGENTS.md` rule; re-check when API code exists |
| TECH13 | CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy | ✅ | `next.config.ts` `headers()`, verified by curl in step 8 |
| TECH14 | Lightsail/EC2, or Vercel for frontend-only | 🖥 | documented, not provisioned |
| TECH15 | Relational DB, never SQLite | ✅ | `config/database.ts` throws on anything but postgres/mysql |
| TECH16 | Local DB service by default, managed for high traffic | ✅ | Postgres in compose locally; strategy recorded |
| TECH17 | ≥ 2 vCPU / 2 GB RAM | 🖥 | |
| TECH18 | AWS Lightsail or EC2 | 🖥 | |
| TECH19 | Ubuntu LTS 22.04 / 24.04 | 🖥 | |
| TECH20 | Caddy or Nginx reverse proxy | 🖥 | Caddy recommended — it automates certificates |
| TECH21 | Let's Encrypt SSL, auto-renew | 🖥 | HSTS is already sent, so TLS is mandatory, not optional |
| TECH22 | Only ports 80 and 443 open | 🖥 | |
| TECH23 | CI/CD on push to main | ✅/👤 | CI shipped; CD is the tech leader's |
| TECH24 | SMTP — client credentials first, then SES | ✅/🖥 | nodemailer provider wired, Mailpit locally; real credentials per server |
| TECH25 | SES domain verified, least-privilege IAM user | 🖥 | only if SES is chosen |
| TECH26 | PM2 manages both processes | ✅/🖥 | `ecosystem.config.js` in both repos; `pm2 list` proves it on the server |
| TECH27 | `pm2 save` after configuring | 🖥 | plus `pm2 startup` once per box |
| TECH28 | `ecosystem.config.js` committed at repo root | ✅ | one per repo — two repos, so two files |
| TECH29 | Strapi admin credentials provided | ✅ | created and reported in step 8; rotate before handover |
| TECH30 | Deployment guide / README | ✅ | `DEPLOYMENT.md` + `README.md` |
| TECH31 | `ecosystem.config.js` matches production config | ✅/🖥 | file is committed; "matches production" is only true once production exists |
| TECH32 | securityheaders.com grade A | ⏳ | measured against a live production URL. The headers are in place and shaped to grade A; the report cannot be produced yet |
| TECH33 | PageSpeed 90+ desktop and mobile | ⏳ | there is no page yet. Do not claim a score for an empty scaffold |

## Site quality — mostly ⏳ by construction

These are properties of the finished site, not of a scaffold. What setup can do is make
the right thing the easy thing, and say so.

| Requirement | | Where |
|---|---|---|
| Core Web Vitals — LCP < 2.5s, CLS < 0.1, PageSpeed 90+ | ⏳ | measured on real pages |
| Images served as WebP with fallback | ✅ | `webp-converter` converts at upload; `next/image` serves modern formats |
| Images < 100 KB, resolution no larger than needed | ⏳ | an authoring rule — put it in `AGENTS.md` and the CMS field help text |
| Lazy loading below the fold | ⏳ | `next/image` is lazy by default; keep `priority` for the LCP image only |
| CSS/JS minified in production | ✅ | `next build` |
| SSL site-wide | 🖥 | |
| reCAPTCHA on public forms | ⏳ | added with the first form, not before — it needs client keys |
| Security headers, grade A | ✅ | see TECH13 |
| WCAG 2.1 AA | ⏳ | per-component; `AGENTS.md` carries the rules |
| Full keyboard navigation, visible focus | ⏳ | never remove a focus ring without replacing it |
| Descriptive alt text on every image | ⏳ | make the CMS media field's alt **required** when content types are built — that is the only enforcement that survives a busy week |
| Contrast ≥ 4.5:1 (3:1 large text and UI) | ⏳ | checked when the palette arrives from Figma |

## Deliberate deviations — state these, don't bury them

- **Tailwind held at v3** while v4 is current. v4 removes `tailwind.config.ts` and the
  `@layer utilities` model the house typography system depends on.
- **Both PM2 and Docker** are shipped. Staging deploys a Docker image; the PM2 file is
  there because TECH28/31 name it and because manual deployment is the documented
  fallback. If a project never runs PM2, say so at handover rather than pretending.
- **`production` ships empty** — an orphan commit with no files and no parent history,
  replaced wholesale at the first release. It is a deployment pointer, not a branch.
- **No `deploy.yml`.** See the top of `SKILL.md`.
