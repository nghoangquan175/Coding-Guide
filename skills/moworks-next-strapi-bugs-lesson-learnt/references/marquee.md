# Recipe — the smooth infinite marquee (carousel that drifts forever)

A row of chips, logos or cards that slides sideways forever, with no jump, no
gap at the end, and the same speed on every row. Built on Galambila's About Us
"Where we work" section (`9e6a4c2`). Copy `templates/marquee/Marquee.tsx` and
`templates/marquee/marquee.scss` — the component is generic, nothing to change.

## Use it

```tsx
<Marquee direction={i % 2 === 0 ? "left" : "right"}>   {/* speed defaults to 40 px/s */}
  {row.map((label) => <Chip key={label} label={label} />)}
</Marquee>
```

Pass **one** set of items. The component repeats them itself.

## Why it is smooth — the ten things that matter

1. **Only `transform` animates.** A CSS `@keyframes` on `translateX`, `linear`,
   `infinite`, `will-change: transform`. It runs on the compositor, so a busy
   main thread (hydration, a video, scrolling) can't make it stutter. ⛔ No
   JS `requestAnimationFrame` loop, no animating `left` / `margin` / `scrollLeft`.
2. **Two identical halves.** The track holds the run twice. Moving it by
   exactly one half puts the second half where the first began, so when the
   animation restarts the picture is identical — no jump.
3. **The period includes the gap.** The keyframe ends at
   `translateX(calc(-50% - (var(--marquee-gap) / 2)))`. The flex `gap` puts one
   gap between the halves too; without the half-gap the loop jumps 8px every pass.
4. **Every gap is the same.** Items and repeats all use `--marquee-gap`
   (16px) — no `justify-between`, no margins on the last item. `GAP` in the
   component must equal `--marquee-gap` in the CSS.
5. **The run repeats until it fills the frame.**
   `repeats = ceil(frameWidth / (copyWidth + GAP))`, then rendered
   `repeats × 2`. A short row with 4 chips on a 1440 screen still has no empty
   space sliding in at the end.
6. **Speed is pixels per second, not seconds per pass.**
   `duration = repeats × (copyWidth + GAP) / speed`. A fixed `35s` made the row
   with fewer chips crawl, because it covered less ground in the same time.
   Now every row moves at the same 40 px/s whatever its length.
7. **Duration is written to the DOM node, not React state.**
   `track.style.animationDuration = …`. React never reads it, so a re-render
   can't restart the drift mid-pass.
8. **Re-measured when anything changes size.** One `ResizeObserver` on the
   frame and on the first copy (it fires once on observe — no initial call
   needed), plus `document.fonts.ready`: the web font swapping in changes the
   chip widths.
9. **Hidden until measured, then faded in.** The server can't know widths, so
   its HTML is one short run at a placeholder pace. `.marquee-frame` starts at
   `opacity:0` and fades to 1 over 200ms once `data-ready` is set — the first
   thing a visitor sees is already the correct row, not a jump from wrong to
   right. `repeats` and `ready` are one state object so they land in the same
   commit.
10. **Direction is `animation-direction: reverse`** — same keyframes, same
    maths, so a right-moving row is exactly as smooth as a left one. Alternate
    per row with `i % 2`.

## Also built in

- **Accessibility.** Only the first copy is read out; every other copy is
  `aria-hidden`. `prefers-reduced-motion`: no animation and shown immediately
  (a still, readable row). `<noscript>` forces `opacity:1`, because without JS
  the measure never runs.
- **Edge fades.** Put them in the section, not the component: two
  `pointer-events-none absolute inset-y-0` divs with
  `bg-gradient-to-r from-<section-bg> to-transparent` (and `-to-l` on the
  right), 64px on phone, ~206px on desktop, `aria-hidden`. Use the section's
  own background colour or the fade shows as a band.
- **Every CMS row renders.** If rows come from a repeatable field, `map` over
  all of them and `filter(row => row.length > 0)`. ⛔ Destructuring
  `const [top, bottom] = rows` — a third row vanishes, and one row makes
  `bottom.map` crash the server render. (`9e6a4c2`)

## Layout traps around it

- **Pulled over artwork?** If the rows are pulled up over an image with a
  negative margin, the row count now sets the section height. Give the section
  a `min-h` down to the artwork's bottom edge, or with few rows
  `overflow-hidden` cuts the artwork off. Put the marquee wrapper on a higher
  `z-index` than the artwork (`relative z-[20]` over `z-[10]`).
- **Chips are see-through by design** (`bg-…/50 backdrop-blur`). Artwork behind
  shows through — that is not a stacking bug. Check with `elementFromPoint`
  before "fixing" z-index.
- The section needs `overflow-hidden` (or the page `overflow-x: clip`), or the
  doubled track makes the page scroll sideways. Measure `scrollWidth` at
  375 / 768 / 1440.

## Test it

1. Watch one row for a full pass at 1440 — no jump when it loops.
2. Two rows of different lengths — same speed.
3. Resize the window from 1440 to 375 — rows refill, no empty end.
4. Hard reload — no flash of a short row before it fills.
5. DevTools → Rendering → `prefers-reduced-motion: reduce` — still, visible row.
6. `document.documentElement.scrollWidth === innerWidth` at 375.
