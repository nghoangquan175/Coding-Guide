# Frontend — Next.js file bodies

## After the scaffolder

`create-next-app` at Next 16 installs **Tailwind v4** (CSS-first config, no
`tailwind.config.ts`). That is why step 5 passes `--no-tailwind`. Add v3 by hand:

```bash
pnpm add -D tailwindcss@^3 postcss autoprefixer @tailwindcss/forms sass
```

Then add `"typecheck": "tsc --noEmit"` to scripts — the scaffolder has no such script
and CI needs it. Add `"packageManager": "pnpm@<installed version>"` so local dev and CI
resolve identically. Commit `pnpm-lock.yaml` only; if a `package-lock.json` appears,
delete it — two lockfiles drift and CI resolves differently from local.

Delete the create-next-app boilerplate before writing anything else: the
`--background`/`--foreground` variables, the `prefers-color-scheme: dark` block, and
`body { font-family: Arial, … }`. They fight the design system that lands later.

## `pnpm-workspace.yaml` — approve the build scripts

pnpm 10+ refuses to run a dependency's install scripts unless it is listed here. Without
it `sharp` never builds, and image optimisation degrades quietly — no error, just slower
and heavier images than the criteria allow.

```yaml
packages: []

onlyBuiltDependencies:
  - '@parcel/watcher'
  - sharp
  - unrs-resolver
```

## Source layout (house)

```
src/
  app/
    _components/          # route-private components
    api/                  # route handlers
    layout.tsx  page.tsx  not-found.tsx
    sitemap.ts  robots.ts  manifest.ts     # SEO as code, not static files
  assets/{fonts,icons,images}
  components/{layout,sections,ui,dev}
  data/
  lib/
    api/                  # one file per CMS content type
    cn.ts  seo.ts  utils.ts
    mock/                 # mock data so the FE runs before the CMS exists
  styles/globals.scss  styles/includes/
  types/
```

`.gitkeep` the empty ones so the structure survives the first commit.

## `lib/cn.ts`

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Needs `clsx` and `tailwind-merge` as dependencies.

## `next.config.ts` — the five security headers (TECH13)

Static `headers()`, **not** the nonce-based CSP Next's docs lead with: nonces force
every page dynamic — no static generation, no ISR — which undoes the whole SEO setup.
Next's docs bless this alternative explicitly. `'unsafe-inline'` on script-src and
style-src is the trade: Next's own RSC bootstrap script and inline `style={{...}}` props
need it without a nonce. securityheaders.com still grades the combination **A** — it
scores that the header exists and isn't wide open, not nonce-purity.

```ts
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// The one real cross-origin resource the browser loads directly: uploaded media.
// Every CMS read and write happens server-side, so img-src and media-src are the only
// directives that need the CMS origin.
//
// `??` is NOT enough here: an unpassed Docker ARG becomes an EMPTY STRING, not
// undefined, so `??` keeps it and the header ships as `img-src 'self' ;` with no CMS
// origin at all — every uploaded image blocked in the browser while curl fetches them
// happily, because curl does not enforce CSP.
//
// This must also be passed as a BUILD ARG: the header is baked in at `next build`, so a
// correct value in the server's .env arrives far too late.
const rawCmsOrigin = process.env.STRAPI_API_URL?.trim();
const cmsOrigin = (rawCmsOrigin && rawCmsOrigin !== "" ? rawCmsOrigin : "http://127.0.0.1:1337")
  .replace(/\/$/, "");

// Both names for the loopback machine, dev only — they are different origins to a
// browser however identical the server.
const devCmsOrigins = !isDev
  ? ""
  : cmsOrigin.includes("://127.0.0.1")
    ? ` ${cmsOrigin.replace("://127.0.0.1", "://localhost")}`
    : cmsOrigin.includes("://localhost")
      ? ` ${cmsOrigin.replace("://localhost", "://127.0.0.1")}`
      : "";

// media-src is NOT covered by img-src: a <video> falls back to default-src ('self'), so
// a CMS-uploaded film is blocked while bundled ones keep working — which makes the
// failure look selective rather than like a CSP problem.
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: ${cmsOrigin}${devCmsOrigins};
  media-src 'self' blob: ${cmsOrigin}${devCmsOrigins};
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  ${isDev ? "" : "upgrade-insecure-requests;"}
`.replace(/\s{2,}/g, " ").trim();

const nextConfig: NextConfig = {
  output: "standalone",           // the Dockerfile copies .next/standalone

  images: {
    // An unlisted host is a 400 from /_next/image, not a fallback to the original URL —
    // this list is the difference between images and none.
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "1337" },
      { protocol: "http", hostname: "127.0.0.1", port: "1337" },
      // TODO: staging and production CMS hostnames when those environments exist.
    ],
    dangerouslyAllowSVG: false,   // an uploaded SVG could carry script
    dangerouslyAllowLocalIP: isDev, // dev only; Next refuses to optimize a private IP
  },

  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: cspHeader },
        // Belt and braces alongside frame-ancestors, and what pre-CSP3 browsers use.
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // Non-production builds: the header form of noindex, for what has no <head> —
        // robots.txt, sitemap.xml, files under /public. An unpassed ARG is "" and lands
        // on the safe side.
        ...(process.env.NEXT_PUBLIC_SITE_ENV === "production"
          ? []
          : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]),
      ],
    }];
  },
};

export default nextConfig;
```

HSTS means TLS at the reverse proxy is mandatory, not optional. Note that in
`DEPLOYMENT.md`.

## `tailwind.config.ts`

v3, with the design system left empty for Figma to fill:

- `content`: `["./src/**/*.{ts,tsx,mdx}"]`
- Breakpoints go in `theme.extend.screens` as **numeric** aliases (`"768"`, `"1024"`),
  not at `theme.screens` — extending keeps Tailwind's own `sm`/`md` at their documented
  values, so copied snippets behave as advertised. House style writes `768:pl-[20px]`.
- `plugins: [require("@tailwindcss/forms")]`
- No font families until the real ones exist. A `fontFamily` entry with no matching
  `@font-face` is dead config that outlives the person who added it.

House class rules, worth putting in `AGENTS.md` on day one: arbitrary px (`pl-[20px]`)
over scale tokens, so the number in the code is the number in Figma; colours stay named
tokens; never build a class name by string concatenation — Tailwind's scanner is static
and the class silently won't exist.

## `styles/globals.scss`

```scss
@use "includes/family-fonts";
@use "includes/typos-fonts";

@tailwind base;
@tailwind components;
@tailwind utilities;
```

`@use`, not `@import` — Dart Sass 3 removes `@import` and the build already warns. `@use`
must precede the `@tailwind` directives; the layer blocks still hoist correctly.

## `.gitignore`

```gitignore
node_modules/
.next/
out/
.env*
!.env.sample
.DS_Store
*.tsbuildinfo
next-env.d.ts
```

The un-ignore line matters: both scaffolders ship a bare `.env*` rule that swallows the
sample file the whole team works from.

## `.env.sample`

```dotenv
# Reachable at BUILD time too — pages prerender against it, and it is baked into the
# CSP img-src. Must be passed as a Docker build arg, not just a runtime env var.
STRAPI_API_URL=http://127.0.0.1:1337
NEXT_PUBLIC_STRAPI_API_URL=http://127.0.0.1:1337

# Canonicals, OG tags and the sitemap all build from this. Falls back to localhost with
# a warning — never guess a domain: a localhost URL in a sitemap is obviously broken, a
# plausible-but-wrong one is not.
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# robots.txt blocks by default; only the literal value `production` opens indexing.
# An indexed staging site is slow to undo; an unindexed production site shows up in
# Search Console immediately. Fail in the cheap direction.
NEXT_PUBLIC_SITE_ENV=development

# Server-only. Never prefix with NEXT_PUBLIC_ — the browser never writes to the CMS.
STRAPI_API_TOKEN=

# Empty unless the client supplies them; render nothing when unset.
NEXT_PUBLIC_GTM_ID=
```

Every `NEXT_PUBLIC_*` is baked in at build time, so **staging and production need
separate image builds** — an image can never be promoted between environments. Say this
in `DEPLOYMENT.md`; it is the single most expensive thing to learn late.

Guard every server-side API module with `import "server-only"`: a Client Component that
imports one then fails the build, naming the import chain, instead of leaking a token.
