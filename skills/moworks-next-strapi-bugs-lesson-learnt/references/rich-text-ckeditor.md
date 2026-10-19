# Recipe — rich text with CKEditor 5 (Strapi → Next.js)

The house way to do rich text on every Mo Works landing page project. Built and
fixed on Galambila (`galambila-backend`, `galambila-frontend`); the working code
is in `templates/rich-text/`. Copy it, then change only what this page says to.

## The goal in one line

**What the editor sees in CKEditor is what the page shows** — text, links,
headings, and above all an image's **size** and **position**. Every bug below
was a place where the page quietly threw away something the editor chose.

## The pipeline

```
CKEditor (Strapi admin)                 HTML string saved in the DB
   │  width %  → inline style          <figure class="image image_resized image-style-align-right"
   │  alignment → class / text-align           style="width:35.37%"><img src="/uploads/x.webp"></figure>
   ▼
lib/api  absolutizeInlineMedia()        src="/uploads/…" → src="https://cms/uploads/…"
   ▼
lib/rich-text  sanitizeRichText()       DOMPurify + 3 hooks: rebuild style, filter class, add lazy/target
   ▼
<Prose> or <InlineProse>                dangerouslySetInnerHTML
   ▼
styles/includes/prose.scss              per-tag CSS under .Prose — sizes, alignment, tables, phone rules
```

## Files

| Template | Goes to | Change on a new project |
|---|---|---|
| `strapi-admin-app.tsx` | `backend/src/admin/app.tsx` | Merge into the existing file — keep only one `register` |
| `strapi-admin-vite.config.ts` | `backend/src/admin/vite.config.ts` | Nothing |
| `rich-text.ts` | `frontend/src/lib/rich-text.ts` | The `isExternalHref` import — point at the project's own |
| `Prose.tsx`, `InlineProse.tsx` | `frontend/src/components/ui/` | Nothing |
| `prose.scss` | `frontend/src/styles/includes/prose.scss` | The `@apply` type classes (`HeadingXSBold`, `ContentSBook`…), link colour, the table gaps from Figma |

Also needed, not templated (small, project-shaped):
- `absolutizeInlineMedia()` in `lib/api/shared.ts` — see step 4.
- CSP `img-src` that allows the CMS origin **and** its loopback twin in dev — step 4.

## Backend

### 1. The plugin

```bash
pnpm add @_sh/strapi-plugin-ckeditor
```

```ts
// config/plugins.ts
ckeditor5: { enabled: true },
```

⛔ Not `@ckeditor/strapi-plugin-ckeditor` (the official one). It loads the
editor from CKEditor's CDN and needs a signed-up licence key since v44. The
community one bundles through npm with `licenseKey: 'GPL'`. (checklist #80)

### 2. Vite pre-bundle

The editor is lazy-loaded, so Vite's cold-start scan misses it and then fails
CJS interop on its deps one by one (`fuzzysort`, `extend`, …: "does not provide
an export named 'default'"). `optimizeDeps.include: ['ckeditor5',
'@ckeditor/ckeditor5-react']` fixes all of them at once. Copy
`strapi-admin-vite.config.ts`.

### 3. Presets

Two presets are used, both HTML:

| Preset | For | Toolbar |
|---|---|---|
| `defaultHtml` (the plugin's own) | documents: article body, legal page, any paragraph field | full — headings, image insert + resize + styles, tables, alignment |
| `inlineHtml` (ours) | one sentence that may hold a link: footer copyright, a thank-you line | bold, italic, link |

Per field in `schema.json`:

```json
"body": {
  "type": "richtext",
  "customField": "plugin::ckeditor5.CKEditor",
  "options": { "preset": "defaultHtml" }
}
```

- `setPluginConfig` goes in `register()`, not `bootstrap()`, and only once — the
  config is frozen after the first call.
- It **replaces** the preset list. Pass `defaultHtmlPreset` and
  `defaultMarkdownPreset` back in, or every existing field loses its editor.
- The one-line box height is the CSS variable `--ck-editor-min-height`. A plain
  `min-height` loses to the plugin's `!important`. (`22efbc5`)
- Don't trim `plugins` to shrink the toolbar — only trim `toolbar`. Trimming
  plugins drops paste handling and autoformat.

What `defaultHtml` gives the editor for images (so you know what markup to
expect on the frontend):

| Editor action | Markup it writes |
|---|---|
| Drag the resize handle / pick 50% / 75% | `style="width:NN.NN%"` — on the `figure` (block image) or the `img` (inline image), plus class `image_resized` |
| "Break text" → centre (the **default** block style) | **no class at all** — a bare `figure.image` |
| Align left / right (wrap text) | `image-style-align-left` / `-align-right` |
| Block align left / right | `image-style-block-align-left` / `-right` |
| Side | `image-style-side` |
| Paragraph alignment around an inline image | `style="text-align:…"` on the `p` |
| Table column drag | `style="width:NN%"` on each `col` |
| Table / cell properties | `style` on `table` / `td` (width, text-align) |

## Frontend

### 4. Map — make image URLs absolute

CKEditor stores inline images as `src="/uploads/…"`. Prefix the CMS host on
`src` **only**. Not `href` — an editor's `<a href="/quit">` is a path on this
site and must stay one. (checklist #85)

Also rewrite loopback: CKEditor saves whatever origin the admin was open at, so
an image inserted at `localhost:1337` is refused by a CSP built from
`127.0.0.1:1337`. Normalise `localhost` / `127.0.0.1` / `[::1]` upload URLs to
the configured host, and in dev let the CSP `img-src` carry both names. Leave
off-site images alone. (`cfa47f4`)

```ts
export function absolutizeInlineMedia(html?: string | null): string {
  if (!html) return "";
  return html
    .replace(/src="\/(?!\/)/g, `src="${BASE}/`)
    .replace(
      /src="https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(\/uploads\/[^"]*)"/g,
      `src="${BASE}$1"`,
    );
}
```

Run it in the `lib/api` mapper for every rich-text field that can hold an image.

### 5. Sanitize — `lib/rich-text.ts`

One file, one DOMPurify caller for the whole app. DOMPurify hooks are
**global and stack**: a second copy of the file, or a hook registered inside a
component, runs every hook twice and the older copy undoes the newer. (In dev,
a hot reload can do this too — restart before you decide a hook "doesn't
work".) (`64b3217`)

The three hooks, and why each exists:

**a. `style` is rebuilt, never filtered.** Read two values, write back only
them, drop the attribute if neither is there:
- `width:N%` — only on `FIGURE IMG TABLE COL TD TH`, only a percentage in
  (0, 100]. Keep the **real number**: the toolbar offers 50/75 but the handle
  drags to anything (the article that found this was at 35.37%).
- `text-align:left|right|center` — only on `P FIGURE FIGCAPTION H2 H3 LI TD TH`.

This is what makes `style` safe on the allow-list: by the time DOMPurify looks,
no arbitrary CSS is left. `position:fixed`, a `javascript:` background and a
900% width are all gone. Without this hook every image renders full width and
hard left, whatever the editor chose. (`cfa47f4`)

**b. `class` is filtered to a fixed list, only on `FIGURE` and `IMG`:**
`image image_resized image-style-side image-style-align-left
image-style-align-center image-style-align-right image-style-block-align-left
image-style-block-align-right`. These classes **are** the editor's alignment —
without them the align buttons do nothing on the page. A pasted class from
anywhere else is dropped.

**c. After sanitize:** `img` gets `loading="lazy" decoding="async"` (body
images are below the fold). Off-site `a` gets `target="_blank"
rel="noreferrer noopener"` — only added, never stripped, so an editor's own
"new tab" toggle survives.

Allow-list: `p h2 h3 strong b em i a ul ol li br img figure figcaption table
thead tbody tfoot tr th td caption colgroup col` · attributes `style href
target rel src alt width height loading decoding colspan rowspan class`.

Plain-text fallback (`asHtml`): mock data and pre-migration values are plain
text. A **blank line** becomes a new `<p>`. A single newline does **not** become
`<br>` — CKEditor doesn't read it that way, so the editor shows one line, the
page shows four, and the next save silently deletes the difference.
(`424cf6b`, checklist #84)

### 6. Render — `Prose` vs `InlineProse`

| | `Prose` | `InlineProse` |
|---|---|---|
| For | a document — body, legal page | one line inside another component — footer, a card's thank-you |
| Styles | `.Prose` sets type, colour, spacing on every tag | **nothing** — inherits from the parent |
| Links | teal + underline | whatever the parent passes in `className` |

Both call the same `sanitizeRichText`. What may be written does not change with
where it is shown. Size the type from the call site with ordinary classes, e.g.
`[&_h2]:ContentSBold 1024:[&_p]:ContentMBook`.

### 7. Style — `prose.scss`: image size and position

This is where most of the bugs were. The rules, in the order they matter:

1. **Default is full column width.** `img, figure { display:block; width:100%;
   max-width:100%; border-radius:16px }`. The inline `width:%` from the editor
   overrides `width`; `max-width` keeps it inside the column.
2. **A resized inline image becomes `inline-block`.** `img[style] {
   display:inline-block; vertical-align:top }`. A block box ignores the
   `text-align` of the `<p>` around it, so without this a narrowed image always
   sits left. `[style]` is exactly the resized set — the hook leaves `style` on
   nothing else.
3. **Centre is the default, and the default writes no class.** "Break text →
   centre" leaves a bare `figure.image`. The editor centres it with its own
   `.ck-content .image { margin:auto }`, so the page must too:
   `figure.image, figure.image-style-align-center { margin-inline:auto }`.
   Only styling `image-style-align-center` (which no button writes) put every
   centred picture on the left. (`574cf86`)
4. **Left / right come after centre** at the same specificity so they win:
   `…align-right, …block-align-right { margin-inline-start:auto;
   margin-inline-end:0 }` and the mirror for left.
5. **Phone: one height for every picture.** `< 768`: `img { height:320px
   !important; object-fit:cover !important }`. A column is ~327px wide, so a
   portrait ran a screen and a half and a wide crop was a strip.

Known gap, on purpose: "wrap text" (`image-style-align-left/right`) aligns the
picture but does **not** float text around it. If a design needs real wrap, add
`float` for those two classes and a clearfix on `.Prose` — and test it on a
phone, where a float in a 327px column is rarely readable.

### 8. Style — a picture beside text = a two-column table

Don't build a component per arrangement ("image left", "image right",
"50/50"). An editor can't move the picture or change the split. Use a CKEditor
table: picture in one cell, words in the other, drag the column edge to set the
split. `defaultHtml` already has the table plugins; the frontend just has to
stop throwing it away. (`64b3217`, `4571a2f`, checklist #62)

1. **`table-layout: fixed`** — or the browser sizes to content and ignores the
   `col` widths the editor dragged.
2. **Gaps are transparent borders, not padding.** `border-collapse:separate;
   border-spacing:0`, then 8px on each facing side (16 across) and 12px on each
   facing row edge (24 down). A border sits outside the padding box, so an
   absolute picture stops at the gap instead of covering it — and splitting 8+8
   keeps 50/50 at 50/50. Outer edges get none, so the table is flush with the
   column. Take the numbers from the Figma row/stack gap. (`c6b7ed2`)
3. **`td, th { position:relative }`** — the cell must be the positioning
   context, or the picture escapes the table.
4. **A lone picture fills its cell, out of flow.** `td > img:only-child`,
   `td > figure.image:only-child` → `position:absolute; inset:0; width:100%;
   height:100%; margin:0`, image `object-fit:cover`. The text cell sets the row
   height; the picture never does. Zero the margin on the **figure** too —
   CKEditor wraps the image in one and the 16px top margin lives there.
5. **Unless the editor resized it.** `td figure.image_resized`, `td img[style]`
   → `height:auto; object-fit:fill` — their width, the picture's own height,
   their alignment.
6. **`figure:has(> table) { overflow-x:auto }`** — a table can't reflow, so it
   scrolls in its own box instead of pushing the page sideways.
7. **Phone: the table stops being a table.** `< 768`: `table, colgroup, thead,
   tbody, tfoot, tr, th, td { display:block; width:100% }`, `colgroup {
   display:none }`, side borders to 0, vertical gaps 8+8, `td + td` gets a top
   border, and the picture goes back to `position:static`. Gaps stay **borders**
   — a stacked cell is a first child, so a top margin would collapse out of the
   row and the table and land above the figure.

## New project checklist

- [ ] `@_sh/strapi-plugin-ckeditor`, `ckeditor5: { enabled: true }`, vite `optimizeDeps`
- [ ] `setPluginConfig` in `register()`, defaults passed back, `inlineHtml` added
- [ ] Every rich field: `customField: plugin::ckeditor5.CKEditor` + a preset; one-sentence fields use `inlineHtml`
- [ ] `absolutizeInlineMedia` on every rich field that can hold an image; CSP `img-src` has the CMS origin (+ loopback twin in dev)
- [ ] `lib/rich-text.ts` copied whole — one DOMPurify caller in the app
- [ ] `Prose` for documents, `InlineProse` for lines inside components
- [ ] `prose.scss` type classes swapped to the project's; table gaps from Figma

## Test it — in the editor, then on the page

Make one test entry and check each on the page at 1440 and 375. Then delete the
entry.

1. Image at 35% (drag, not a preset), centred with "break text" → 35% and centred.
2. Same image aligned left, then right → moves.
3. Inline image in a `<p>`, paragraph aligned right → sits right.
4. Two-column table, picture left, text right, split dragged to ~40/60 → split
   holds, picture fills the text's height, 16px gap between.
5. Swap the cells → picture on the right. At 375 → stacked, picture 320px tall.
6. Link to another site → new tab. Link to `/some-page` → same tab, not rewritten to the CMS host.
7. Open the entry, change one word, save → the page did not change anywhere else.

Grep the rendered HTML (`curl` the page) for `style=` — every one should be only
`width:…%` and/or `text-align:…`.
