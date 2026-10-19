# The checklist

⛔ must not exist · ✓ must exist · ⚠️ destructive, confirm first

Hashes are the fix. `READY.QUIT.SOLID`, `galambila-frontend` and
`galambila-backend` between them hold all of them.

**Load one section at a time** — SKILL.md's routing table says which. Reading
this file whole is four times the tokens of a routed review and finds nothing
extra.

| | Section | Checks | Fires on |
|---|---|---|---|
| **A** | Forms and validation | 1–33 | a form, a field, a schema in `lib/forms`, a submit route |
| **B** | Components and data flow | 34–49 | a new or moved component, a page's fetch/props |
| **C** | CMS schema and the editor | 50–73 | a `schema.json`, a component, anything an editor types into |
| **D** | Strapi behaviour | 74–80 | admin config, bootstrap, a plugin, `backend/config` |
| **E** | CMS reads — populate and mapping | 81–93 | `lib/api/**`, any populate list, any mapper |
| **F** | Fallbacks and failure states | 94–109 | a fallback, a guard, an empty state, an error boundary |
| **G** | Responsive layout | 110–132 | a breakpoint, a width, spacing, a carousel or grid |
| **H** | Tailwind and CSS — silent failures | 133–150 | **any** class string, `cn()`, a z-index, an overflow |
| **I** | Figma fidelity and motion | 151–167 | a transcription, a hover, an animation, an export |
| **J** | Media — images and video | 168–182 | an image, a film, an upload path, a CSP media rule |
| **K** | SEO and routing | 183–190 | metadata, sitemap, robots, canonicals, a new route |
| **L** | Security and access | 191–199 | headers, CORS, tokens, a gate, a route handler, draft access |

---

## A. Forms and validation

**1.** ⛔ A field constrained only by the schema, explaining itself after submit `903d5db`
**2.** ⛔ `maxLength` without a strip — it does not apply to a clipboard paste `903d5db`
**3.** ⛔ The value rewritten after react-hook-form sees the event — state and screen diverge `903d5db`
**4.** ⛔ Stripping on `keydown` — paste and browser autofill land on `change`, and paste is where the punctuation comes from `6bf8b30`
**5.** ⛔ The caret not restored after a strip — typing mid-number throws the cursor to the end `6bf8b30`
**6.** ⛔ `inputMode="tel"` on a digits-only field — the keypad offers `+ * #` `6bf8b30`
**7.** ⛔ **`.optional()` in a shared base schema excusing a field another tab renders.** RHF keeps the value after unmount and an untouched input holds `""`, so the strict rule runs on the empty string, the form refuses to submit, and the error lands where nobody can see it. Base holds a ceiling; the tab's schema swaps the strict rule in `6bf8b30` `0b0fb67`
**8.** ⛔ Empty strings forwarded to Strapi — it rejects `""` for email and date columns `6bf8b30`
**9.** ⛔ A CSS-only "filled" state on a date input — it shows no placeholder, so `:not(:placeholder-shown)` is always true `03c3451`
**10.** ⛔ A date field that only opens from Chrome's own indicator — `showPicker()` on the whole field, wrapped `e2135cd`
**11.** ✓ Past dates refused, and `todayIso` built from local parts — `toISOString` converts to UTC and answers yesterday for anyone east of Greenwich `e2135cd`
**12.** ⛔ The click target being the `<input>` rather than the wrapper — but the wrapper must not steal focus from a child `8e540b2`
**13.** ⛔ An error message saying "invalid" without showing the shape `aaf59ca`
**14.** ⛔ **A honeypot named `company`** — Chrome maps it to `organization` and ignores `autocomplete="off"`; the first real enquiry after every page load was answered 200 and dropped `6e0a3d9`
**15.** ✓ The honeypot permissive in the schema and swallowed by the handler — a 400 tells the bot which field to skip `3bfc19f`
**16.** ⛔ A write path with a mock fallback — "thank you" over a lost enquiry is the worst outcome available `3bfc19f`
**17.** ✓ The field clears after a successful submit `6d76f88`
**18.** ⛔ A menu an ancestor's overflow can clip — no overflow pair rescues it, portal to `document.body` and let outside-click spare the portal `436e969`
**19.** ✓ Phone capped at ten digits, counted as digits rather than string length `1427dec`
**20.** ✓ One schema shared by the client and the route handler — the route is public and answers curl `3bfc19f`
**21.** ⛔ Writing through `event.target.value` rather than `setValue` — the form keeps its own copy `1427dec`
**22.** ⛔ A submit button that looks identical while the POST is in flight — it gets pressed twice `3bfc19f`
**23.** ⛔ `Number(…)` on free text — `"12.3.4"` is NaN and blanks a result panel with no explanation `3bfc19f`
**24.** ⛔ A failure message claiming to know the cause — a thrown fetch is also CORS, DNS, an aborted navigation or a 502, none of which are the reader's connection `4937baa`
**25.** ⛔ A ref replaced rather than merged — Checkbox's own ref has to survive `register()` or `indeterminate` breaks `3bfc19f`
**26.** ⛔ `watch()` where `useWatch` belongs — it returns a new function each render and the React Compiler skips memoising the component `3bfc19f`
**27.** ⛔ zod's default message reaching a person — "expected string, received undefined" `a55b7d7`
**28.** ⛔ A dialog left mounted — RHF reads `defaultValues` once and keeps the first value it ever saw `d1eee24`
**29.** ✓ A native `<dialog>` with `showModal()` — focus trap, Escape, inert, `::backdrop` for free; only the body scroll lock by hand `d1eee24`
**30.** ⛔ `appearance-none` on a native `<select>` — @tailwindcss/forms paints its own chevron as a *background image*, and a background is not an appearance, so both draw `a55b7d7` `2f7fdc9`
**31.** ⛔ @tailwindcss/forms left to style every textarea and any input without a `type` — reset with `border-0 p-0 focus:ring-0` `06532f1`
**32.** ⛔ A form revealed on hover — unreachable by keyboard, unreachable on a phone, and gone the moment the pointer drifts. If Figma models the open state as a hover variant, use the button the file already draws `4191f37`
**33.** ✓ Field *values* stay at 16px — iOS zooms anything smaller `5da062d`

## B. Components and data flow

**34.** ⛔ Flat prefixed fields where a page section should be one component `e846ba3`
**35.** ⛔ A `json` field holding a repeatable structure — no edges in the admin, no per-field validation `17f49f4`
**36.** ⛔ A near-duplicate component where an existing one covers the need `17f49f4`
**37.** ⛔ Fields that form one panel on the page scattered at page level `8f7d7f8`
**38.** ✓ A section takes the CMS component whole as one prop; presentation stays separate `e846ba3`
**39.** ⛔ Sections fetching for themselves — eighteen did, and one page hit the CMS six times `9e4c9b0`
**40.** ✓ Props typed off the page's return type, so a CMS shape change stops compilation `9e4c9b0`
**41.** ⛔ Two hand-built copies of one control — they drift `21109f7`
**42.** ⛔ One page rendering another page's section, or falling back to it — an edit to one silently changes the other `e846ba3` `d7df035`
**43.** ⛔ Two typography classes on one element — `cn()` cannot dedupe them and emit order decides `21109f7`
**44.** ⛔ A component that fetches — it cannot be reused, cannot take a different record, and hides a request from the route that owns it `eae0ce3`
**45.** ⛔ Layout written inline in `page.tsx` where every other page has a section component `1b759b2` `39338ea`
**46.** ⛔ A prop destructured and never read — the unused-var warning is the symptom `64def07`
**47.** ⛔ A value computed and then thrown away `26d140d` `27cc4eb`
**48.** ✓ A `switch` rather than a lookup object over zone blocks, so a component added without a case fails the build `6aa3fb8`
**49.** ⛔ A server component importing a plain value from a `"use client"` module — it receives a client reference, not the string, and the class silently vanishes `27b6d06`

## C. CMS schema and the editor

**50.** ✓ Every text element on the page is CMS-editable — no hardcoded copy. The single most repeated client complaint, four separate tickets `86d4akxjh`
**51.** ⛔ Build concerns in the CMS — position percentages, blur radii, slot coordinates, key→artwork maps `e846ba3` `8c5670c`
**52.** ⛔ A field for artwork the design fixes `8c5670c`
**53.** ⛔ A field whose only honest value repeats another `17f49f4`
**54.** ⛔ **A `string` field rendered `whitespace-pre-line`, or a `text` field without it.** A `string` is a single-line input — a newline cannot be typed into one — and without `pre-line` a typed newline renders as a space. Both changes or neither `34b0773`
**55.** ⛔ A field that could be derived: a story's date (`publishedAt`), reading time, a film's runtime `6529fda` `459e835`
**56.** ⛔ A content type with no `string` attribute — relation chips fall back to the documentId `c418eb9` `e6eda00`
**57.** ⛔ Content-manager configuration set by clicking — it does not survive a fresh database or a transfer; reconcile it in `src/bootstrap/` `admin-layout.ts`
**58.** ⛔ An attribute with no consumer `e846ba3` `78de62b`
**59.** ⛔ The Content-Type Builder reachable on a deployed environment `114b925`
**60.** ⛔ A section forcing curation where an index page should list everything `80fe580`
**61.** ⛔ An editor's link read, mapped, and discarded at the last step `45da2cb`
**62.** ⛔ A separate image component where a rich-text table does the job — the arrangement should be the editor's `64b3217`
**63.** ✓ Rich text reserved for editorial prose; short copy under a fixed type class stays `string` `cf5d3f1`
**64.** ⛔ **Auditing a field against the whole app rather than against the component that renders its section** — a field can be rendered somewhere and dead in its own section, which is exactly how three dead eyebrows survived `78de62b`
**65.** ⛔ An optional field two pages have to learn to ignore — split the component so it cannot be filled by mistake `c29f6e7`
**66.** ⛔ An opaque enum key — `solid` meant the dolphin and nothing said so; name it after what it picks `cac124b` `8c5670c`
**67.** ⛔ A lowercase enum value in a dropdown — a Strapi enumeration has no label separate from its value, so the value is what an editor reads `0eac781`
**68.** ⛔ Help text promising behaviour the code does not have — including a field whose name says "count" and whose sum treats it as a price `cb65941` `121c33a`
**69.** ⛔ Field descriptions carrying node ids, paths, function names or rationale — 405 were rewritten, the worst 469 characters. Say what to put in the field and what happens if it is left empty `6529fda`
**70.** ⛔ **Relying on a `description` on a COMPONENT field — it never renders.** `ComponentInput` draws a label and the nested block with no `Field.Hint`. The label is the only surface, so put it there `466c11f` `1c1a3d7`
**71.** ⛔ Relying on schema descriptions at all without the reconcile — the content manager ignores them and never displays `info.description` anywhere `61f09a5`
**72.** ⛔ Two single types each picking a document by relation — an editor can write a third page and it reaches nobody `e19c279`
**73.** ⛔ A CMS field nothing ever edits independently of the mock `963c58d`

## D. Strapi behaviour

**74.** ⛔ Assuming Strapi's default sort — it is the first string attribute *ascending*, so a new entry lands wherever the alphabet puts it `4ac4cd2`
**75.** ⛔ A boolean in a populate list — scalars are an HTTP 400 `9b830fb`
**76.** ✓ Schema order is what a fresh install derives its edit layout from; an existing database only ever *appends*, so the reconcile is what keeps them equal `9b830fb` `bb4a255`
**77.** ⛔ Renaming a component uid or a `pluralName` — that is a live table and the REST path. Change `displayName` `3702d6b` `6e7363f`
**78.** ⛔ Assuming `strapi build` ignores the database config — it evaluates it even though it never connects, so a CI build with the wrong client fails `6e7363f`
**79.** ⛔ A lazy-loaded custom field's dependency graph left outside Vite's cold-start scan — it gets served raw and the admin dies on "does not provide an export named 'default'". `optimizeDeps.include` the whole graph `a6c3a8d`
**80.** ⛔ The official CKEditor plugin — it loads the editor from CKEditor's CDN and has demanded a signed-up licence key since v44. The community build bundles via npm with a GPL key `a6c3a8d`

## E. CMS reads — populate and mapping

**81.** ⛔ A media field nested in a component populated without the `.*` suffix — it returns `{alt, image: null}` with no error. A *direct* media field does not need it `466c11f`
**82.** ⛔ A `populate()` helper that mishandles a trailing `.*` — it emits a key Strapi silently ignores `e846ba3`
**83.** ⛔ A collection read that does not walk `meta.pagination` past the 100-row cap `4010f51`
**84.** ⛔ A renderer turning a raw newline into `<br>` — CKEditor does not read it that way, so the editor shows one line and the page four, and the next save destroys the difference `424cf6b`
**85.** ✓ Rich text sanitised, and inline `/uploads/` absolutized — deliberately not `href`, which is often a path on this site `5e2210c`
**86.** ⛔ A CMS read reachable from a Client Component — `import "server-only"` turns that into a build failure naming the chain `33b76c6`
**87.** ⛔ **A populate list shared between content types** — naming a field a type does not have is a 400, not a degrade `a3f5d24`
**88.** ⛔ **A dynamic zone's `[on]` list treated as additive — it FILTERS.** Every component must be named or its blocks vanish from the page with no error `a3f5d24` `9faf712`
**89.** ⛔ A field not named in populate — it arrives `undefined` however carefully an editor filled it `8274e65`
**90.** ⛔ Reading a block off a top-level field the schema does not have — always undefined, always silently the fallback `1ed55fa` `e903556`
**91.** ⛔ Mapping with a spread — an unfilled optional hands a component `null` where it expects a string. Map field by field so a half-filled record degrades one field at a time `779f30d`
**92.** ⛔ Removing a field without removing its populate key — every read 400s and renders the mock without saying so `2e15364`
**93.** ✓ `status: "published"` stated rather than assumed, and sorts stated explicitly — `publishedAt` tracks the *last* publish `80fe580`

## F. Fallbacks and failure states

**94.** ⛔ **An unrecognised enum rendered as a component** — the lookup returns undefined, rendering it throws, and it was in the footer, so every page answered 500 `c75dc4a` `cac124b`
**95.** ✓ A key matched however it is spelled, so old data and new both work without a migration `c75dc4a`
**96.** ⛔ A fallback that quietly draws the wrong artwork — it does not throw, which is its own kind of broken `c75dc4a`
**97.** ⛔ `fb!` or any non-null assertion on a fallback — it erases the check that would have caught the miss `010c5d9`
**98.** ⛔ `dynamicParams: false` on CMS-driven routes — anything added after a deploy 404s until the next one, so the fix holds in dev and the page stays unreachable in production `010c5d9` `1888f06`
**99.** ✓ An empty grid says so and drops its pager — `Math.max(1, …)` drew a full pager over nothing `bd510dc`
**100.** ✓ Branded error boundaries, and `global-error.tsx` imports **nothing** and hardcodes its copy — a CMS outage bad enough to break the layout is exactly what lands there `b11b305`
**101.** ⛔ **A fetch helper collapsing "the CMS says there is no such row" into "the CMS did not answer"** — an outage served seeded lorem ipsum under the heading "Privacy Policy" `7e18d22`
**102.** ⛔ Placeholder rows for a collection in the fallback — six identical articles that could have shipped as real content `1888f06`
**103.** ⛔ A fallback read with no fallback after it `39a6793`
**104.** ⛔ Gating a picture on truthiness — `{alt, image: null}` is truthy, so a half-filled row shadows a good fallback. Gate on `.src`, and pair lists with their fallback by index `fa5b56a`
**105.** ⛔ A logo or wordmark slot falling back to the grey placeholder — there is no state where the site's own mark should look unfinished `bb9378a`
**106.** ✓ Only one video plays at a time `e907ad5`
**107.** ⛔ A stand-in link to `#`, or share tiles derived from an unrelated address — a wrong link is worse than no link, and worse still when wrong by construction `27cc4eb` `f1fa29b`
**108.** ⛔ **A fallback identical to the CMS content, masking a read that never worked.** Three separate bugs hid this way for weeks. The only way to see it is to put something in the CMS the fallback cannot produce `1ed55fa` `e903556` `7a260cb`
**109.** ⛔ Seed and fallback drifting apart — they are the same content by construction, and when they are not, only a build with no CMS renders the right thing `7a260cb`

## G. Responsive layout

Breakpoints: `< 768` mobile · `768–1023` tablet · `≥ 1024` desktop.

**110.** ✓ The page gutter held consistently on a phone — three separate tickets `02cc50b`
**111.** ⛔ Horizontal overflow at any width. `body { overflow-x: hidden }` hides the scrollbar and does not narrow the page; find it by measuring `scrollWidth` and hiding elements until it shrinks `54df998` `911ae8b`
**112.** ⛔ A section holding its mobile shape past 1024, or reaching desktop at 1280 — roughly twenty commits moving the site down to 1024 `411848d`
**113.** ✓ Carousels pan by mouse drag: a pointer press selects text rather than panning, Chrome starts its own image drag from a photo, and the click after a real drag is swallowed on the capture phase past a 5px threshold `2d170f4`
**114.** ✓ A row that fits stops scrolling but keeps its arrows — a section must not change shape with the number of items an editor published `f084313` `20d4e64`
**115.** ✓ Arrow presses queue rather than colliding. `scrollBy({behavior:"smooth"})` is fought by `scroll-snap-type: mandatory`, and snapping must be suspended by writing to the element — `setState` does not apply until the next render and the first frames run before it `d8f91b3` `73056c3`
**116.** ✓ Paging returns to the top of the results `38faa72`
**117.** ✓ Real page numbers on a phone, as many as the width holds `7df6b7b`
**118.** ⛔ **CSS hiding overflow while JS counts a different number** — items existed in the markup and were reachable from no page at all `5920c5c`
**119.** ⛔ `order` used to rearrange for mobile — it moves boxes, not reading order, so a screen reader hears the details last on the one layout built to put them first `d327d5a`
**120.** ⛔ Percentage-placed artwork against a full-bleed section — the composition comes apart on a wide display. Give it a centred `max-w-[1440px]` frame: a percentage needs a box to be a percentage *of* `7d2be65` `985de5d` `1bb9806` `2abcfbd`
**121.** ⛔ A fixed height on a growing width — `object-cover` crops harder the wider the display, until the subject is gone `f4334da` `679b077`
**122.** ⛔ Padding written on a full-bleed coloured box — it means "as wide as the window"; contents belong in `Container` `478ff44`
**123.** ⛔ `flex-1` in a column — flex-basis lands on the *height* and collapses the box `bd5a1d5` `2359d04`
**124.** ⛔ `h-full` against an auto-height parent — that is 0px `3286775`
**125.** ⛔ A flex item that cannot shrink — its automatic minimum is clamped to its own specified width, so it needs `min-w-0` `6869646`
**126.** ⛔ `mx-auto` on a stretch item — auto cross-axis margins cancel `align-self: stretch` `2359d04`
**127.** ⛔ A typed height on a grid card — it cuts the copy and stops the row equalising. `h-auto` with a `min-h` floor `154c28f`
**128.** ⛔ A grid turned on before its columns arrive — `grid-template-columns` is unset and every card is full width `688e1f1`
**129.** ⛔ `w-full` cards in a scroller — they grow with the screen and the peek that makes a row read as scrollable never grows `688e1f1`
**130.** ⛔ A plain block collapsing its top margin with its first child — use flex `d3a9e2b`
**131.** ⛔ A `sizes` hint left at the old breakpoint — the browser fetches the phone crop for a desktop slot and upscales it `9c990b5`
**132.** ⛔ A `style` prop for anything responsive — it carries no media query and outranks the rule that would supply one. Ship custom properties and let utilities choose `6537bd7` `7a0744e`

## H. Tailwind and CSS — silent failures

**133.** ⛔ **`group-hover:` on the group itself** — it compiles to a descendant selector, and an element is never its own descendant. The class is on the element, the rule is emitted, nothing matches `6e39c11`
**134.** ⛔ **`hidden={!open}` against a `flex` utility** — the UA's `[hidden]{display:none}` is one attribute selector and loses. The mobile menu rendered open on every page and every route `55e1cfe`
**135.** ⛔ **A value off Tailwind's scale** — `scale-85` emits no rule at all; the scale has no 85 `7bf20af`
**136.** ⛔ **A misspelt utility** — `white-space-nowrap` is not one, and the wrap it failed to prevent made the footer 19px taller on every page `d5c6682` `be6517c`
**137.** ⛔ **Any assembled class name** — `${bp}:hidden` compiles to nothing; Tailwind's scanner is static `5cfea2a` `64def07`
**138.** ⛔ A newly introduced class trusted without checking the built CSS `e236224`
**139.** ⛔ Betting on variant emit order — a plugin variant's position relative to core `hover` is not guaranteed. Fold the guard into the selector `52ba45d`
**140.** ⛔ Two z-index utilities on one element `83bb0f0`
**141.** ⛔ **Any z-index beating a positioned box without one, however late it comes** — and a `z-[1000]` that jumped the whole app. Keep a documented band `c75283f`
**142.** ⛔ `overflow-hidden` where only one axis should clip — hidden on one axis forces the other to `auto`; `overflow-x-clip` keeps the vertical bleed `54df998` `570cf17` `c373d2b`
**143.** ⛔ `overflow-hidden` on a wrapper that should clip a transform — it becomes a scroll container and cuts card shadows `f084313`
**144.** ⛔ Preflight's `img { max-width: 100% }` silently clamping a deliberate `110%` — `max-w-none` is load-bearing `5be1f6c`
**145.** ⛔ A conditional override written *before* the base string — twMerge lets the later one win, so it silently loses `0fbb53e`
**146.** ⛔ A named spacing keyword plus a `py-*` override — twMerge drops the unprefixed pair and leaves the `768:`/`1024:` ones, so the middle bands keep the keyword's numbers `bad88a0`
**147.** ⛔ A bare `hover:` on something that can be disabled — CSS `:hover` matches a disabled control. `enabled:hover:`, but `:enabled` never matches an `<a>` `c075710`
**148.** ⛔ Relying on source order against a positioned sibling — a positioned element beats in-flow siblings in the same stacking context whatever the order `5be1f6c`
**149.** ⛔ `text-[…]`, `leading-[…]` or `tracking-[…]` with a length — a size never travels alone, and setting it by hand leaves family, weight, leading and tracking to whatever was inherited. Enforce it in CI `e493b5d`
**150.** ✓ Any `lib/*.tsx` that names a class sits where Tailwind's content glob can see it `6869646`

## I. Figma fidelity and motion

**151.** ⛔ **Reading a placed instance and concluding there is no hover** — variants live on the component set, and an instance reports only its own. This cost five sections before it was written down `6e39c11`
**152.** ⛔ **Trusting `get_motion_context` returning nothing** — prototype reactions live on `node.reactions` and only `use_figma` reads them `f7259aa` `84eb9c6`
**153.** ⛔ An invented curve — the file's own springs are `SMART_ANIMATE / QUICK / 744ms` and `SLOW / 1250ms` `f7259aa` `47fda28`
**154.** ⛔ `ease-out` over sampled spring keyframes — it eases each of the twenty gaps between them and turns the spring into a stepped travel `f7259aa`
**155.** ⛔ Keyframes hung off `:hover` — they play one direction, so the thing springs open and snaps shut. Drive it from state `7626ce2`
**156.** ⛔ `animation: none` as the reduced-motion guard on a transition — it touches nothing `fd20835`
**157.** ⛔ **A Figma node render trusted as artwork** — Figma clips a render to its parent frame, so the committed file *is* the sliver, and the crop only shows once something moves `899c82d` `116bb1c` `e25d409`
**158.** ⛔ A node render that composited the ancestor frame's fill — re-export the inner group `6e39c11`
**159.** ⛔ Treating Figma's reported size as the artwork — it is the *rotated bounding box* `e25d409`
**160.** ⛔ Flipping a render that already contains the mirror `899c82d`
**161.** ⛔ `preserveAspectRatio="none"` surviving from a Figma export — it stretches rather than scales `1e466b9`
**162.** ⛔ Fighting a font's vertical metrics per component — Figma resolves against typo metrics and Chrome used hhea, which hung every heading ~22px low. Fix once with `ascent-override`/`descent-override` in the `@font-face` `4b08169`
**163.** ⛔ `text-box-trim` where the file does not trim — it removes the descender space Figma expects and closes every heading onto its copy `fb04b2d`
**164.** ⛔ An `@font-face` pointing at files that are not committed — Next resolves `url()` at build time, so it is a hard build failure, not a graceful fallback `1d999e2`
**165.** ⛔ A colour ramp shadowing a Tailwind built-in name, or one with a hard break treated as a smooth progression `0ff4ead`
**166.** ✓ A Figma number that is really "the size at which this string spans the column" expressed as `cqw`, not transcribed as a breakpoint step `f3b8fe5`
**167.** ⛔ A 1px seam between two artworks rasterized by different passes — `transform-gpu` puts both on a composited layer. A per-page nudge pins the coin flip rather than removing it `b3dbfe3`

## J. Media — images and video

**168.** ⛔ `media-src` missing from the CSP — a `<video>` falls back to `default-src`, so CMS films die while bundled ones play and the failure looks selective `466c11f`
**169.** ⛔ **Two lossy encodes on upload** — the WebP plugin at quality 80 and then Strapi's own `optimize()` again. Turn `sizeOptimization` off and encode once at 85 with smart subsampling `42175da`
**170.** ⛔ A bind-mounted uploads directory owned by the wrong uid — the mount keeps the host's ownership, the Dockerfile's chown does nothing, and uploads fail silently `262c927`
**171.** ✓ Raster images shipped as WebP only — except `og-card` and `apple-icon`, which link scrapers and Apple will not take `550ac4d`
**172.** ✓ Images under **300 KB** at their rendered resolution, enforced by `pnpm lint:assets` `fbb27de`
**173.** ✓ Below-fold images lazy, with `priority` and `fetchPriority="high"` on exactly one LCP candidate per page `c5edc00`
**174.** ✓ A 50 MB upload cap using decimal bytes — `@strapi/utils` is decimal end to end, so the binary number makes the error read "52 MB" `c39ee10`
**175.** ⛔ `dangerouslyAllowSVG` — an uploaded SVG can carry script `c5edc00`
**176.** ⛔ `next/image` with `fill` over an unpositioned parent — `fill` is `position: absolute` and the image covers the page `c5edc00`
**177.** ⛔ A `hidden`/`block` pair for two crops — it renders both, so a phone downloads the desktop file too. Use `<picture>` `8274e65`
**178.** ⛔ **An autoplaying video hidden in CSS — it still downloads.** Mount it only after `matchMedia` allows it; SSR cannot ask the question `3702d6b`
**179.** ⛔ **`controls` on a `<video>`.** The browser's own progress bar, volume and overflow menu land across a card that has its own visual language. The frame is the hit area — click to start, click to stop — and the focus ring stays, because without `controls` it is all a keyboard user has. The cost is no seeking and no progress indication: accept it or design a control, never fall back to the browser's `ef4edfb`
**180.** ⛔ An arbitrary upload dropped into a fixed square without `object-contain` `bb9378a`
**181.** ⛔ Remapping renamed assets by number — checksum them. A numeric rename paired every entry but the last with the wrong artwork, and all five still rendered `4992c43`
**182.** ⛔ Assets under `src/` referenced as URL strings — nothing under `src/` is reachable over HTTP; an import is an instruction to the bundler, not a path `2ea35fb`

## K. SEO and routing

**183.** ⛔ `NEXT_PUBLIC_SITE_ENV` not passed as a build arg — `IS_INDEXABLE` is false in every build and production ships `Disallow: /` `4010f51`
**184.** ⛔ Relying on robots.txt alone — emit `noindex` from the layout and an `X-Robots-Tag` header `4010f51`
**185.** ⛔ A sitemap that falls back on a CMS outage — it must 500, never 200 with the URLs quietly missing `4010f51`
**186.** ✓ `noIndex`-ticked entries excluded, `lastmod` on detail pages and **absent** on static ones — `new Date()` tells every crawler the whole site changed `4579e81`
**187.** ✓ `og:image` and `twitter:image` on every page. Next's `opengraph-image` file convention does not reach a nested route whose metadata already sets `openGraph`, and "no image" is not neutral — every platform scrapes something `232c5bf`
**188.** ⛔ A canonical as an optional argument — the failure mode of an optional is being quietly left off, and the page reachable at two URLs is the one nobody thought about `4579e81`
**189.** ⛔ A sitemap and `generateStaticParams` that can disagree — with `dynamicParams: false` that is a 404 you are advertising `4579e81`
**190.** ⛔ A root `[slug]` route with no reserved list — a real page is silently shadowed by a CMS row. Check it in CI `e19c279` `1888f06`

## L. Security and access

**191.** ✓ All five headers on a real response, verified with `curl -D -` `3988d05`
**192.** ⛔ A nonce-based CSP — it forces every page dynamic and undoes prerendering `3988d05`
**193.** ⛔ Wildcard CORS — `strapi::cors`'s own default is `origin: '*'` `feac3f0`
**194.** ⛔ `STRAPI_API_TOKEN` as a Docker ARG — build args are recorded in layer metadata, which a `cache-to: mode=max` workflow exports into a shared cache `7f1a752`
**195.** ✓ The public role has no `create` and no `read` on submission types `3bfc19f`
**196.** ⛔ `robots: noindex` mistaken for access control on a dev route — that is a crawler courtesy, not a gate `13f1fb8`
**197.** ⛔ A password gate written in React — the page still renders, its HTML still reaches the browser, and the password ships in the bundle `db7d58c`
**198.** ⛔ `middleware.ts` in this version of Next — the convention is renamed and a file with the old name is ignored **silently**, so it looks finished and protects nothing `db7d58c`
**199.** ⛔ **The Content API serving drafts to the public role.** Strapi 5 does not permission drafts separately: anyone who can `find` a type gets its *unpublished* content by adding `?status=draft` to the URL — no token, no admin login. Editors reasonably treat a draft as private until they publish it. Gate it with a global middleware that answers 403 to a draft read without an API token, and give preview its own **read-only** token, separate from the write token forms use. Verify with `curl <api>/api/<type>?status=draft` and no `Authorization` header: it must not return a row with `publishedAt: null` `4cc0c44`
