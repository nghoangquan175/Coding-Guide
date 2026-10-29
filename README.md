# Coding-Guide

All the skills, patterns and rules I have put together while working as a Fullstack Developer.

## Structure

```
skills/                                   Claude Code skills (one folder per skill)
├── aws-deploy/                           Deploy to AWS: S3+CloudFront, Lambda API, EC2 (Docker or PM2)
│   ├── SKILL.md                          pick the option, shared rules, mistakes from real deploys
│   └── references/                       s3-cloudfront, lambda-api, ec2-server/docker/pm2, github-oidc, ssm-parameters
├── cloudflare-security/                  Audit and harden a Cloudflare zone, read its traffic
│   └── SKILL.md
├── expo-testflight/                      Ship an Expo iOS app to TestFlight from CI, no Mac needed
│   ├── SKILL.md                          setup, credentials, App Store Connect, testers, mistakes
│   └── references/                       workflows: A. EAS, B. eas build --local, C. fastlane
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
| `aws-deploy` | Deploy a project to AWS and pick the shape that fits it: static site on S3 + CloudFront, a Lambda API (API Gateway HTTP API or a function URL behind CloudFront), or a Next.js + Strapi app on one EC2 box with Docker/GHCR or PM2 behind Cloudflare. GitHub Actions to AWS over OIDC with no access keys, config and secrets in SSM Parameter Store, Terraform, ACM, Cloudflare DNS, Nginx + certbot + Cloudflare-only origin, smoke tests, and every mistake made on the real deploys. |
| `cloudflare-security` | Audit and harden a Cloudflare zone (Free plan) over the API: security level, Bot Fight Mode, AI-bot blocking, scanner rule, login rate limit, HTTPS/TLS, when (not) to use Under Attack Mode. Reads the analytics to tell scanners from users and Googlebot, and lists the API calls that silently reset settings. |
| `expo-testflight` | Ship an Expo (React Native) iOS app to TestFlight from Windows with no Mac: `app.json`/`eas.json`, signing with `eas credentials` (Bundle ID, distribution certificate, provisioning profile, App Store Connect API key), the App Store Connect app, and a GitHub Actions workflow in one of three shapes — A. Actions triggers EAS Build, B. `eas build --local` on a GitHub macOS runner (proven), C. fully on the runner with fastlane. Ends with internal testers on TestFlight, plus a note on Android APKs and the mistakes from the first run. |
| `frontend-guide` | General UI/UX rules for building and reviewing screens: hierarchy, spacing, color, typography, forms, buttons, loading/error states, data display. Ends with a review checklist. |
| `moworks-next-strapi-set-up` | Start a new Next.js + Strapi project from two empty repos: scaffold both apps, boot Postgres, create the Strapi admin, check both apps run, push the first commit. |
| `moworks-next-strapi-bugs-lesson-learnt` | Review a change or a whole repo against bugs the team has hit before (forms, CMS, responsive, Tailwind, SEO, security...). Also has recipes for CKEditor rich text and an infinite marquee. |
| `moworks-workflow-fixbug` | Work through the bug tickets in ClickUp: sort, fix, review against the checklist, ship to staging and report on the tickets. |
| `nextjs-seo` | Build or audit technical SEO on a Next.js App Router site: metadataBase and canonicals, CMS-editable titles with fallbacks, generated Open Graph images, robots and noindex per environment, a sitemap that matches the real pages, JSON-LD, manifest and GTM. Also how to read Search Console after launch: sitemap vs request indexing, "Couldn't fetch", the lagging Pages report. |

## How to use

Copy a skill folder into your Claude Code skills folder:

```
~/.claude/skills/<skill-name>/SKILL.md
```

Then Claude Code picks it up in the next session.
