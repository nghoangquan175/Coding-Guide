# Recipes — Next.js App Router (16)

Copy, then change the names. Each block says which file it lives in.

## `lib/site.ts` — one place for the origin and the environment

```ts
const raw = process.env.NEXT_PUBLIC_SITE_URL;
if (!raw) console.warn("NEXT_PUBLIC_SITE_URL is not set; URLs fall back to localhost.");

/** Absolute origin, no trailing slash. Baked in at build (Docker build arg). */
export const SITE_URL = (raw || "http://localhost:3000").replace(/\/$/, "");

/** Only the literal value `production` opens indexing. Fail in the cheap direction. */
export const IS_INDEXABLE = process.env.NEXT_PUBLIC_SITE_ENV === "production";
```

## `lib/seo.ts` — the helper every page calls

```ts
import type { Metadata } from "next";

export type Seo = { metaTitle?: string | null; metaDescription?: string | null; noIndex?: boolean | null };

/**
 * Metadata for one page. `path` is required: a canonical that can be left off will be.
 * CMS values win; the page's own title and summary fill anything left empty.
 */
export function pageMetadata(path: string, fallback: { title: string; description: string }, seo?: Seo | null): Metadata {
  const title = seo?.metaTitle?.trim() || fallback.title;
  const description = seo?.metaDescription?.trim() || fallback.description;
  return {
    title,
    description,
    alternates: { canonical: path },
    ...(seo?.noIndex ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description, url: path, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}
```

Titles go through the layout's template, so pass the bare page title. For the home page
pass `title: { absolute: "…" }` if it should not get the suffix.

## Root `app/layout.tsx`

```ts
import { IS_INDEXABLE, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Name — Role", template: "%s · Name" },
  description: "One sentence on what the site is.",
  applicationName: "Name",
  authors: [{ name: "Name", url: SITE_URL }],
  openGraph: { type: "website", siteName: "Name", locale: "en_US" },
  twitter: { card: "summary_large_image" },
  // robots.txt stops crawling, not indexing — this and the X-Robots-Tag header do that.
  ...(IS_INDEXABLE ? {} : { robots: { index: false, follow: false } }),
};
```

`metadataBase` must be a `URL` here; inside a `"use cache"` `generateMetadata`, return it
as a string (URLs aren't serialisable).

## `app/robots.ts`

```ts
import type { MetadataRoute } from "next";
import { IS_INDEXABLE, SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  if (!IS_INDEXABLE) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
```

## `app/sitemap.ts`

```ts
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { listDetailPages } from "@/lib/api/pages"; // the SAME function generateStaticParams uses

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await listDetailPages(); // throws on a CMS outage → 500, crawler retries
  return [
    { url: SITE_URL, changeFrequency: "monthly", priority: 1 },
    ...pages
      .filter((page) => !page.seo?.noIndex)
      .map((page) => ({
        url: `${SITE_URL}/work/${page.slug}`,
        ...(page.updatedAt ? { lastModified: page.updatedAt } : {}),
        changeFrequency: "yearly" as const,
        priority: 0.7,
      })),
  ];
}
```

If the pages themselves fall back to bundled content on an outage, the sitemap may use
the same fallback — the list then matches what is actually served.

## `app/opengraph-image.tsx` (and one per nested segment that sets `openGraph`)

```tsx
import { ImageResponse } from "next/og";

export const alt = "Name — Role";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 72, background: "#07080b", color: "#e9ecf3" }}>
        <div style={{ fontSize: 28, color: "#7cf5c4" }}>example.com</div>
        <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2 }}>Name</div>
      </div>
    ),
    size,
  );
}
```

For `[slug]`, the default export receives `{ params }` (a promise) — look the page up and
render its title. Generated at build when it reads nothing request-time.

## JSON-LD, in the page

```tsx
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Name",
  jobTitle: "Role",
  url: SITE_URL,
  sameAs: ["https://www.linkedin.com/in/…", "https://github.com/…"],
};

<script
  type="application/ld+json"
  // JSON.stringify does not escape </script>; replacing < keeps CMS text from breaking out.
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
/>
```

Common types: `Person`, `Organization`, `WebSite` (home); `Article`/`BlogPosting`
(posts: `headline`, `datePublished`, `author`); `CreativeWork` (portfolio pieces);
`BreadcrumbList` (deep pages). Validate with the Rich Results Test.

## `app/manifest.ts`

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Name — Role",
    short_name: "Name",
    start_url: "/",
    display: "browser",
    background_color: "#07080b",
    theme_color: "#07080b",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
```

## GTM (only when the site needs analytics)

`pnpm add @next/third-parties`, then in the root layout's `<body>`:
`<GoogleTagManager gtmId={process.env.NEXT_PUBLIC_GTM_ID!} />`, rendered only when the ID
is set and only in production. Add `https://www.googletagmanager.com` to the CSP
`script-src` and `img-src`, and the GA4 collect host to `connect-src`. GA4 goes in as a
tag inside the GTM container, never as a second script on the page.

## Strapi `shared.seo` component

```json
{
  "collectionName": "components_shared_seos",
  "info": { "displayName": "SEO", "icon": "search" },
  "attributes": {
    "metaTitle": { "type": "string", "maxLength": 70 },
    "metaDescription": { "type": "text", "maxLength": 200 },
    "noIndex": { "type": "boolean", "default": false }
  }
}
```

Add `"seo": { "type": "component", "component": "shared.seo" }` to each page-like type and
`seo: true` to its populate. Map it field by field into the `Seo` type above.
