---
name: nextjs-seo
description: Technical SEO for a Next.js App Router site, CMS-backed or not — metadataBase and title template, a self-referencing canonical on every page, CMS-editable meta title/description with fallbacks, Open Graph and Twitter images (generated with next/og), robots.txt and noindex gated on the environment, a sitemap built from the same list as generateStaticParams, JSON-LD structured data, the web manifest, and GTM/GA4. Use when adding SEO to a site, building a new page or route, reviewing a branch that touches metadata, robots, the sitemap or a layout, or before a launch.
---

# Next.js SEO

```
/nextjs-seo [audit | build] [scope]
```

`build` wires everything below into a project; `audit` checks an existing one against it
and reports (it does not fix). With no argument, audit the working tree's changes.

Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`
and `.../03-file-conventions/01-metadata/` before writing code — the Metadata API moves
between majors. The code for each piece is in `references/recipes.md`.

## The model

Every page's `<head>` is generated on the server from one helper. The CMS (when there is
one) supplies an optional `seo` block per page; the helper fills whatever is empty from
the page's own content, so an editor never has to fill SEO for a page to be correct.

```
CMS seo block (optional) ─┐
page content (fallback) ──┼─► pageMetadata(path, …) ─► generateMetadata ─► <head>
site defaults (layout) ───┘
```

## What every site needs

| # | Piece | Where | The rule |
|---|---|---|---|
| 1 | `metadataBase` + title template + default description | root `layout.tsx` | From `NEXT_PUBLIC_SITE_URL`. Never guess a domain in code: a localhost URL in a sitemap is obviously broken, a plausible-but-wrong one is not |
| 2 | Canonical | every page, through the helper | **Required argument**, not optional. The failure mode of an optional canonical is being quietly left off |
| 3 | Title + description | every page | Unique per page. Title ≤ ~60 chars before the template suffix, description ~120–160. CMS value first, page content second |
| 4 | Open Graph + Twitter | every page | `og:image` and `twitter:image` on **every** page — "no image" is not neutral, platforms scrape something. 1200×630 |
| 5 | robots.txt | `app/robots.ts` | Disallow everything unless `NEXT_PUBLIC_SITE_ENV === "production"`; always disallow `/api/` |
| 6 | noindex outside production | root layout `robots` **and** an `X-Robots-Tag` header | robots.txt alone stops crawling, not indexing of a URL linked from elsewhere |
| 7 | Sitemap | `app/sitemap.ts` | Built from the same function as `generateStaticParams`, so it can't advertise a 404 |
| 8 | Structured data | JSON-LD `<script>` in the page | `Person`/`Organization` + `WebSite` on home; the matching type on detail pages. Escape `<` |
| 9 | Icons + manifest | `app/icon.*`, `apple-icon.*`, `app/manifest.ts` | File conventions, not hand-written `<link>`s |
| 10 | Semantics | the page itself | One `<h1>`, headings in order, `alt` on every content image, `lang` on `<html>`, real `<a href>` links |

## Traps — each one shipped somewhere once

- ⛔ `NEXT_PUBLIC_SITE_ENV` not passed as a Docker build arg — it is baked in at build,
  so production ships `Disallow: /`. Check the built `robots.txt`, not the code.
- ⛔ `lastModified: new Date()` on every sitemap entry — tells every crawler the whole
  site changed on every build. Give `lastModified` only where there is a real date
  (a CMS `updatedAt`), leave it off static pages.
- ⛔ A sitemap that swallows a CMS error and returns 200 with the CMS URLs missing. Either
  fail the request (500, the crawler retries) or build from the same fallback content
  the pages render from — never a silently shorter list.
- ⛔ A `[slug]` sitemap and `generateStaticParams` reading different lists.
- ⛔ Setting `openGraph` in a nested page's metadata and expecting the root
  `opengraph-image` to still apply. Put an `opengraph-image` in that segment too, or pass
  `images` explicitly. Check the rendered `<head>` of a nested page.
- ⛔ `noIndex` ticked in the CMS but the page still in the sitemap — filter it out.
- ⛔ A canonical pointing at the staging host, or built from the request host.
- ⛔ GA4 tag on the page *and* inside GTM — double counting. One GTM container; GA4 is a
  tag inside it.
- ⛔ Third-party tags (GTM) added without updating the CSP `script-src`/`connect-src`/
  `img-src` — the tag silently never loads. Only a real browser shows it.
- ⛔ A manifest sold as an SEO feature. It is for install/PWA; it does not rank anything.
  Add it because it is cheap, not because of SEO.

## CMS-driven SEO (Strapi)

One shared component, `shared.seo`, added to every page-like content type:

| Field | Type | Notes |
|---|---|---|
| `metaTitle` | string | Empty → the page's own title |
| `metaDescription` | text | Empty → the page's summary |
| `noIndex` | boolean | Excluded from the sitemap and gets `robots: noindex` |

Keep it small. `ogTitle`/`ogDescription` duplicate the meta fields on almost every page
(a field whose only honest value repeats another is dead weight); `ogImage` is only worth
a field when editors really pick share images — otherwise generate them with `next/og`.
Label the fields clearly in the admin, since component field descriptions never render.

## Verifying

Do not trust reading the code. Build, start, and check the output:

```bash
curl -s localhost:3000/robots.txt
curl -s localhost:3000/sitemap.xml
curl -s localhost:3000/<page> | grep -oE '<(title|meta|link)[^>]*(title|description|canonical|og:|twitter:|robots)[^>]*>'
curl -s localhost:3000/<page> | grep -o '<script type="application/ld+json">[^<]*'
curl -sI localhost:3000/<page> | grep -i x-robots-tag
```

Check one nested page as well as home — that is where inheritance breaks. Open the
`og:image` URL itself. After launch: Search Console (submit the sitemap, URL inspection),
the Rich Results Test for the JSON-LD, and a share preview (LinkedIn Post Inspector).

## Reporting an audit

Each finding: `file:line`, which row or trap, one sentence on what is wrong, one on the
fix. Then what was checked and clean, and what could not be checked (a live Search
Console, a real share preview). Rank: deindexed or blocked site > page missing from the
index or showing the wrong title > missing images or structured data > cleanups.
