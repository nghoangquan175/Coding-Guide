# Coding-Guide

All the skills, patterns and rules I have put together while working as a Fullstack Developer.

## Structure

```
skills/                                   Claude Code skills (one folder per skill)
├── ec2-docker-ghcr-deploy/                Deploy to EC2: Actions → GHCR → docker compose over SSH
│   ├── SKILL.md
│   └── references/                       server (Nginx, certbot, Cloudflare), pipeline (workflow, compose)
├── ec2-pm2-deploy/                       Deploy to EC2 with PM2: release dirs, build on the server
│   ├── SKILL.md
│   └── references/                       server (Node, PM2, certbot), pipeline (ecosystem, deploy.sh, workflow)
├── frontend-guide/                       General UI/UX rules for any frontend
│   └── SKILL.md
├── moworks-next-strapi-set-up/           Set up a new Next.js + Strapi project
│   ├── SKILL.md
│   └── references/                       backend, frontend, shared, criteria
├── moworks-next-strapi-bugs-lesson-learnt/  Check a project against known bugs
│   ├── SKILL.md
│   ├── references/                       checklist, rich text (CKEditor), marquee
│   └── templates/                        copy-ready code (rich-text/, marquee/)
└── moworks-workflow-fixbug/              Fix open ClickUp bug tickets end to end
    └── SKILL.md
```

## Skills

| Skill | What it does |
|---|---|
| `ec2-docker-ghcr-deploy` | Take a Next.js + Strapi repo to production on one EC2 box behind Cloudflare: GitHub Actions builds images to GHCR and deploys with docker compose over SSH. Swap, Nginx, certbot DNS-01, Cloudflare-only origin, first Strapi admin + API token, and every mistake made on the first run. |
| `ec2-pm2-deploy` | Same production setup without Docker: Actions ships the source over SSH, the server builds a release directory and PM2 reloads it, with one-command rollback. Not run end to end yet — verify on first use. |
| `frontend-guide` | General UI/UX rules for building and reviewing screens: hierarchy, spacing, color, typography, forms, buttons, loading/error states, data display. Ends with a review checklist. |
| `moworks-next-strapi-set-up` | Start a new Next.js + Strapi project from two empty repos: scaffold both apps, boot Postgres, create the Strapi admin, check both apps run, push the first commit. |
| `moworks-next-strapi-bugs-lesson-learnt` | Review a change or a whole repo against bugs the team has hit before (forms, CMS, responsive, Tailwind, SEO, security...). Also has recipes for CKEditor rich text and an infinite marquee. |
| `moworks-workflow-fixbug` | Work through the bug tickets in ClickUp: sort, fix, review against the checklist, ship to staging and report on the tickets. |
| `nextjs-seo` | Build or audit technical SEO on a Next.js App Router site: metadataBase and canonicals, CMS-editable titles with fallbacks, generated Open Graph images, robots and noindex per environment, a sitemap that matches the real pages, JSON-LD, manifest and GTM. |

## How to use

Copy a skill folder into your Claude Code skills folder:

```
~/.claude/skills/<skill-name>/SKILL.md
```

Then Claude Code picks it up in the next session.
