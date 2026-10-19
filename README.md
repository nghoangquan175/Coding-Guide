# Coding-Guide

All the skills, patterns and rules I have put together while working as a Fullstack Developer.

## Structure

```
skills/                                   Claude Code skills (one folder per skill)
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
| `moworks-next-strapi-set-up` | Start a new Next.js + Strapi project from two empty repos: scaffold both apps, boot Postgres, create the Strapi admin, check both apps run, push the first commit. |
| `moworks-next-strapi-bugs-lesson-learnt` | Review a change or a whole repo against bugs the team has hit before (forms, CMS, responsive, Tailwind, SEO, security...). Also has recipes for CKEditor rich text and an infinite marquee. |
| `moworks-workflow-fixbug` | Work through the bug tickets in ClickUp: sort, fix, review against the checklist, ship to staging and report on the tickets. |

## How to use

Copy a skill folder into your Claude Code skills folder:

```
~/.claude/skills/<skill-name>/SKILL.md
```

Then Claude Code picks it up in the next session.
