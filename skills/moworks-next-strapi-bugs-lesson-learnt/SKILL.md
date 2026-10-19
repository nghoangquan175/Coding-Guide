---
name: moworks-next-strapi-bugs-lesson-learnt
description: Audit a Mo Works Next.js + Strapi project against every bug this team has already paid for once — forms, componentisation, CMS modelling, the CMS-to-frontend contract, resilience, responsive layout, Tailwind's silent failures, Figma fidelity, media, SEO and security. Use when reviewing a change, before opening a PR, when a ticket's symptom sounds familiar, or when asked to check a page, a section or the whole repo for known problems. Also holds the house recipes, with copy-ready code, for CKEditor rich text end to end (Strapi preset → sanitize → image size, alignment and tables on the page) and the smooth infinite marquee — use them when building either on a new landing page project.
---

# Mo Works — lessons learnt

```
/moworks-next-strapi-bugs-lesson-learnt [scope]
```

Scope is a diff, a file, a page, a section, or nothing for the whole repo. With
no scope, audit the working tree's changes; if the tree is clean, ask what to
look at rather than sweeping 200 checks over a finished codebase.

`references/checklist.md` is the list — 199 numbered checks in twelve sections,
drawn from 578 commits and 84 tickets across READY.QUIT.SOLID and Galambila.
Every one is something that actually shipped and had to be fixed.

## Recipes — how we build it, with the code

Some things are not a check but a whole way of doing it, the same on every
landing page project. Each recipe says what to copy, what to change, why every
rule is there, and how to test it. Read the recipe when **building** one of
these, and when **reviewing** a diff that touches it.

| Building or touching | Read | Copy from |
|---|---|---|
| Rich text: CKEditor preset, `richtext` field, `Prose`, `rich-text.ts`, `prose.scss`, image size / position in a body, a picture beside text | `references/rich-text-ckeditor.md` | `templates/rich-text/` |
| A row that drifts sideways forever: marquee, logo strip, location chips | `references/marquee.md` | `templates/marquee/` |

The templates are the working Galambila files. Copy them whole — each recipe
lists the few lines that are project-specific (type classes, colours, gaps).

## How to read a check

| | |
|---|---|
| ⛔ | must not exist in the code |
| ✓ | must exist |
| ⚠️ | destructive — stop and confirm before acting |

The commit hash on each line is the fix. Read it when a check fires and you
need the reasoning: `git log -1 <hash>` in whichever repo has it.

## House rules these are written against

**Breakpoints have names now.** `< 768` mobile · `768–1023` tablet · `≥ 1024`
desktop. A section that holds its mobile shape past 1024, or reaches desktop at
1280, is a finding — not a judgement call. This is where the codebase actually
landed after the pass that moved ~20 sections down from 1280.

**No browser video chrome.** Never pass `controls`. The card or frame is the hit
area: click to start, click to stop. Keep the focus ring — without `controls`
that is the only thing a keyboard user has.

**Comments earn their place.** One short line for what a reader cannot get from
the code — the Figma node, the trap, why a number is that number. No
walkthroughs, no restating the JSX.

## The thing that makes this list worth running

**Most of these fail silently.** No error, no warning, no red build — a class
that emits no CSS, a populate key Strapi ignores, a fallback that looks exactly
like the content it is standing in for. Reading the code is not enough to find
them, which is why each of the checks below names how to see it.

Nine that cannot be caught by reading:

| Check | How to see it |
|---|---|
| A Tailwind class that emits no rule | grep the built CSS in `.next/static/css` |
| A populate key Strapi ignores | probe the running API; it answers 400 or a null field |
| A fallback masking a broken read | put content in the CMS the fallback cannot produce |
| CSP blocking a resource | a real browser — curl does not enforce CSP |
| An unpassed Docker ARG | it is `""`, not undefined; check the built output |
| Mobile layout | an iframe harness at 375 — Chrome's `--window-size` clamps near 500 |
| Horizontal overflow | measure `scrollWidth` at each width, then hide elements to find it |
| Section spacing | render either side of a change and sum the facing edges |
| A dead CMS field | read the section's own component, not the whole app |

## Reviewing a branch before a PR

The usual job. `git diff main...HEAD` is the scope — every file the branch
touches, and the checks are chosen by what it touched, not walked end to end.

**Report only. Do not fix anything.** Not the obvious one-liners, not the typos,
not while you are in the file anyway. The report is read before anything is
changed, and a branch that has been quietly edited cannot be reviewed. If a fix
is a single character, say which character.

1. **`git diff main...HEAD --stat`** — the file list first, before any content.
   Say in one line what the branch does.
2. **Route the file list through the table below** to get a set of section
   letters. This is the whole point of the step: a typical branch selects three
   or four of twelve.
3. **Load only those sections.** One command each:

   ```bash
   awk '/^## C\./,/^## D\./' references/checklist.md   # any section, by its letter
   awk '/^## L\./,0'         references/checklist.md   # L, having no section after it
   ```

   Never read `checklist.md` whole. It is 198 checks and roughly 8k tokens; a
   routed review reads a quarter of that and misses nothing, because a check
   that cannot fire on the files you changed is not a check you skipped.
4. **Read the diff** and walk the loaded sections. Each check is: does not
   apply, passes, or is a finding.
5. **Verify before reporting.** A pattern match is a suspicion. Prove it the way
   the table further up proves it, or label it unverified.
6. Report, grouped by severity. Name the sections you did not load and why.

### Routing — what the branch touched → what to load

Match every path in the diff; take the union of the letters. When a path matches
nothing here, load by judgement and say so.

| The diff touches | Load |
|---|---|
| `*Form*.tsx`, `lib/forms/**`, `app/api/contact|newsletter/**` | **A** F H |
| `components/sections/**`, `components/layout/**` | **B G H** C I |
| `components/ui/**` | **B H** A G I |
| `app/**/page.tsx`, `app/**/layout.tsx` | **B F** G K |
| `app/sitemap.ts`, `robots.ts`, `lib/site.ts`, `lib/routes.ts` | **K** F |
| `lib/api/**` | **E F** C |
| `lib/mock/**`, `*.json` fallback data | **F** E |
| `backend/src/api/**/schema.json`, `backend/src/components/**` | **C E** D B |
| `backend/src/admin/**`, `backend/src/bootstrap/**` | **C D** |
| `backend/config/**`, `backend/src/middlewares/**`, `backend/src/policies/**` | **D L** J |
| `*.scss`, `tailwind.config.ts`, `styles/**` | **H I** G |
| `assets/**`, `public/**`, any image or video | **J** I |
| `next.config.ts` | **L K** J H |
| `proxy.ts`, `middleware.ts`, `app/api/**` (other) | **L** F |
| `rich-text.ts`, `Prose*.tsx`, `prose.scss`, a `richtext` field or CKEditor preset | **C E** H + recipe `rich-text-ckeditor.md` |
| `Marquee*.tsx`, a `marquee` keyframe | **G I** + recipe `marquee.md` |
| `Dockerfile`, `compose*.yml`, `.github/workflows/**`, `.env*` | the twelve below — and ask why a feature branch is in here |

Bold is the section that usually carries the finding; the rest are the ones that
have caught something on this kind of change before and are cheap to scan.

Two that are worth loading on almost any branch, because they are the ones that
fail with no error at all: **H** when a diff contains a single Tailwind class,
and **F** when it contains a single CMS read or a fallback.

### Twelve checks only fire if the branch touched a file it should not have

Skip these unless the diff includes them — and if it does, that is itself the
finding, because none of them belongs in a feature branch:

- **Deploy and CI**: 59, 170, 183, 194 live in the Dockerfile, the deploy script
  and the workflow. `deploy.yml` belongs to the tech leader.
- **Settled at setup**: 78, 80, 162, 165, 169, 174, 191, 193 are decisions the
  repo already made — the CI database client, the CKEditor plugin, the font
  metric overrides, the colour ramps, the WebP encode, the upload cap, the five
  headers, the CORS allowlist. A branch changing one needs to say why.

### Sixteen cannot be confirmed from a diff — raise them as questions

The code reads identically whether these are right or wrong, so reporting one as
a defect is a guess. Report it as a question naming what would settle it.

- **Needs the Figma file**: 151, 152, 153, 157, 158, 159, 160, 166. You cannot
  see from a diff whether someone read the component set or only the instance,
  or whether a committed PNG is the whole artwork or the clipped sliver.
- **Needs a running CMS or a browser**: 88, 89, 94, 101, 104, 108, 111, 133. A
  populate key Strapi ignores, a fallback identical to the content it is
  masking, an overflow that is a measurement, a class that emits no CSS.

If the branch is worth it, run the app and settle them. If not, the question in
the report is the deliverable — an unasked question is how **108** survived for
weeks across three separate bugs.

Do not scaffold a temporary page or probe route to check something. Typecheck,
lint, build, curl, and read the built CSS.

## Reporting

Each finding: `file:line`, the check number, one sentence on what is wrong, one
on the fix — described, never applied. Then, separately, what you checked and
found clean, and what you could not check. An audit that only lists problems
does not say how far it looked, and one that hides its blind spots reads as
more thorough than it was.

Rank by what it costs a visitor, not by how interesting it is:

1. **Silent data loss or a dropped submission** — a form that says thank you and
   saved nothing, a renderer that rewrites an editor's content.
2. **A page that 500s or 404s** — an unrecognised enum, a missing fallback guard.
3. **Something an editor cannot fix** — a field that does nothing, hardcoded copy.
4. **Wrong on the page** — layout, spacing, the wrong crop.
5. **Cleanups.**

If a check fires and the code is right anyway, say so and why. The list is
evidence of what went wrong once, not an authority on what is wrong now — and a
finding you cannot defend in one sentence is not a finding.

## Adding to it

When a bug is fixed that is not on this list, add it: the rule, the symptom, and
the commit. A lesson that stays in a commit message is one the next project pays
for again — which is exactly how the 69 KB of this that lived only in the old
monorepo's AGENTS.md failed to survive the repo split.
