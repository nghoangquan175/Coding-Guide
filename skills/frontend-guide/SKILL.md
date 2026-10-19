---
name: frontend-guide
description: General UI/UX rules for building and reviewing frontend screens — visual hierarchy, spacing and alignment, color and contrast, typography, forms and inputs, buttons and actions, loading/error/empty states, data display, and honest patterns. Use when building a page, component or form, when reviewing UI code or a design before a PR, or when asked "does this UI look right / feel right". Framework-agnostic; the project's own design system and tokens always win over these defaults.
---

# Frontend guide

House rules for building UI that is clear, calm and easy to use. They are
**principles, not numbers**: take every concrete value (spacing, radius, font size,
color, touch size) from the project's design tokens or the platform guideline,
never invent one here.

How to use:
- **Building** — read the section for what you are making before you write it.
- **Reviewing** — run the [checklist](#review-checklist) at the end against the
  screen or the diff and report each miss with the rule it breaks.

---

## 1. Hierarchy and layout

- **One primary action per view.** Only one button gets the strongest style.
  Secondary actions step down (outline, ghost, plain text). If everything is
  filled and colored, nothing stands out.
- **The most important information gets the most weight.** A value is bigger and
  stronger than its label (the number, not the word "Earnings"). Put the key fact
  where the eye lands first, e.g. price next to the product title, not buried under
  the description.
- **Group long forms and pages with section headings.** A flat wall of fields is
  hard to scan; "Personal information" / "Change password" headings make the
  structure obvious.
- **Spacing shows grouping.** Use smaller gaps *inside* a group and larger gaps
  *between* groups (content vs. its action). Consistent does not mean every gap is
  equal.
- **Don't stack padding in nested containers.** If the card already has padding, the
  wrapper around its button should not add more. Content and actions inside one
  container share the same edge.
- **Nested corners: inner radius = outer radius − gap.** Equal radii on an inner
  element and its frame make the corner look uneven.
- **Make text scannable.** In icon + title + body rows, body text starts at the
  title's text edge, not under the icon, so the eye runs down one clean line.
- **Align to one edge.** Labels, fields and the submit button in a form line up on
  one vertical axis (labels above fields), not labels left / fields right with a
  zig-zag path.
- **Logo sits in the nav line, at the start edge**, not floating centered above
  the menu.
- **Keep repeated actions in the same place.** In onboarding, wizards and
  multi-step flows the "Continue" button never moves between steps.

## 2. Color and contrast

- **Avoid pure black and pure white** for large surfaces and text. Use the
  project's near-black / off-white tokens (slightly tinted), which are softer on
  the eye.
- **Tune accent colors per theme.** On dark backgrounds desaturate / soften
  bright colors; on light backgrounds colors can be richer and deeper. Define
  theme-specific tokens instead of reusing one value for both modes.
- **Never trade contrast for a "minimal" look.** Body text, labels, meta info and
  navigation must stay readable and meet WCAG contrast. Light grey on white is a
  bug, not a style.
- **Color carries meaning.** Destructive actions use the danger color, not the
  brand primary. Success, warning and error colors are not decoration.

## 3. Typography

- **Don't add letter-spacing to body text.** It hurts readability. Keep tracking
  changes for rare cases like small uppercase labels.
- **Line height must fit multi-line text and diacritics.** A title that looks fine
  on one line can collide on two, especially with accented scripts like
  Vietnamese. Test with long, accented real content before locking a text style.
- Keep a clear type scale (title / section / body / caption / meta) from the design
  system and use it consistently.

## 4. Forms and inputs

- **Always show a visible label.** Never use the placeholder as the label — it
  disappears once the user types.
- **Use the placeholder for an example or the format**, e.g. an example email,
  `dd/mm/yyyy`, a card-number pattern — not "Enter email" or "Your ID...".
- **Use input masks for structured data** (date, phone, card number) so the user
  sees and follows the format while typing.
- **Match the control to the data:**
  - one-time codes → separate boxes per digit;
  - email → one field, never split into name `@` domain;
  - single yes/no consent ("I accept the terms") → **checkbox**, not a radio button;
  - one choice among a few visual options (plans, storage sizes) → **selectable
    cards**, not a bare radio list;
  - many options → **searchable** select / combobox, with groups (and icons) when it
    helps; let users both **type to filter and scroll**;
  - an instant on/off setting → toggle.
- **Show errors inline, next to the field they belong to**, not as a list at the
  bottom of the form.
- **Validate at the right time.** Don't flag an error while the user is still
  typing; show a hint while typing, validate on blur or submit.

## 5. Buttons and actions

- **Label buttons with the action, not "Yes / No".** "Yes, delete" / "No, keep it"
  tells the user exactly what happens.
- **Separate destructive actions.** Put delete / remove away from the normal
  actions (divider, its own "danger zone" area), use the danger color, and confirm
  or offer undo.
- **Offer undo for reversible actions** right inside the success message
  ("Deleted 1 task · Undo").
- **A disabled button must explain itself:** say why it is disabled and how to
  unlock it (e.g. missing permission + "Request access").
- **Respond to every tap instantly.** Show a pressed / loading / "added" state
  immediately; for slow work (upload, delete, processing) update the UI first when
  safe and finish in the background. Never leave the user wondering if it worked.
- **Touch target ≠ icon size.** The clickable area must meet the platform's
  minimum touch size even when the icon is small; add padding to the hit area.
- **Don't overuse popups and modals.** Non-critical asks (feedback, ratings, tips)
  go inline in the page, not in a modal that blocks the content.

## 6. Loading, errors and other states

- **Prefer skeleton loaders over a lone spinner** when you know the layout that is
  coming. Match the skeleton to the real layout; the wait feels shorter.
- **Design every state of a flow, not just the input.** Search, for example, is
  idle → typing (suggestions, clear button) → loading → results (and no results).
- **Never show the backend to users.** No raw 404/500 pages, stack traces, error
  codes or request IDs. Catch it, log it internally, and show a short message with
  a clear next step ("We couldn't load your feed · Try again").
- **Keep state visible where it acts.** Applied filters show as removable chips
  next to the list, not only as a count hidden inside the filter menu.

## 7. Data display

- **Right-align numeric columns** (and their headers) in tables so digits line up
  and amounts compare at a glance. Align by what the data means, not by habit.
- **Infinite scroll is not always right.** For data people search, compare or come
  back to (orders, tables, admin lists) use pagination or "Load more". Keep
  infinite scroll for feeds.
- **Disambiguate look-alike options.** When two options share a name, add a second
  line of context (city, owner, date).
- **Show the real amount charged.** If the price is shown per month but billed
  yearly, show the yearly total right next to it.

## 8. Honest patterns

- **No dark patterns.** Cancelling, unsubscribing or deleting must be as easy as
  signing up — no multi-step guilt flows, hidden links or fake urgency. Short-term
  revenue is not worth losing user trust.

---

## Review checklist

Hierarchy and layout
- [ ] Exactly one primary action per view; others visibly secondary
- [ ] Key value/fact is the most prominent thing in its block
- [ ] Gaps smaller inside groups than between groups
- [ ] No doubled padding in nested containers; content shares one edge
- [ ] Inner radius = outer radius − gap
- [ ] Text in icon rows aligns to the title edge; forms on one vertical axis
- [ ] Repeated actions (Continue, Save) keep the same position across steps

Color and type
- [ ] No pure black/white surfaces or text; theme-specific accent tokens
- [ ] All text passes WCAG contrast, including meta and captions
- [ ] Destructive = danger color
- [ ] No letter-spacing on body text
- [ ] Multi-line and accented titles tested; line height doesn't collide

Forms
- [ ] Every field has a visible label; placeholders show examples/format
- [ ] Masks for date/phone/card; control type matches the data
- [ ] Errors inline at the field; validation on blur/submit, not mid-typing

Actions and states
- [ ] Buttons say the action ("Yes, delete"), not Yes/No
- [ ] Destructive actions separated, confirmed or undoable
- [ ] Disabled buttons explain why and how to unlock
- [ ] Every tap gives instant feedback; touch targets meet platform minimum
- [ ] No blocking modal for non-critical asks
- [ ] Skeletons for known layouts; all flow states designed
- [ ] No raw errors or stack traces shown to users
- [ ] Active filters visible and removable

Data and trust
- [ ] Numeric columns right-aligned
- [ ] Pagination / load more for lookup data; infinite scroll only for feeds
- [ ] Same-name options have context
- [ ] Real billed amount shown
- [ ] No dark patterns; cancel is as easy as sign up
