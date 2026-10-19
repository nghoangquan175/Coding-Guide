/**
 * The sanitizer behind every rich-text field, and the only DOMPurify caller in
 * the app.
 *
 * It lives here rather than in a component because there are two of those now:
 * `Prose`, which styles a document, and `InlineProse`, which styles nothing and
 * lets a line of rich text inherit whatever surrounds it. What may be written
 * is the same question either way, and the hooks below register at module scope
 * — DOMPurify's are global and stack, so a second copy of this file would mean
 * a second copy of every hook, each undoing the last.
 */
import DOMPurify from "isomorphic-dompurify";
import { isExternalHref } from "@/lib/site";

/**
 * CKEditor's data model is HTML, so rich text is the one thing in the app
 * rendered as markup rather than as `{text}`. It is sanitized regardless of
 * where it came from — a compromised editor account or a paste-from-Word
 * `<script>` should not turn into one, and there is no upside to skipping it.
 */

/**
 * Off-site links in rich text open in a new tab, like every other link in the
 * app.
 *
 * This is the one place a link's destination is not known until runtime — an
 * editor pastes whatever URL they have — so the rule is applied here rather
 * than at the call site. `isExternalHref` is what keeps `mailto:`, `tel:` and
 * a pasted full URL back to THIS site out of it.
 *
 * An editor's own "open in new tab" toggle is left alone: the hook only ever
 * adds, never strips a `target` that CKEditor wrote. The rule is "off-site
 * links always open away", not "on-site links never do".
 *
 * Registered at module scope because DOMPurify's hooks are global and stack —
 * inside the component it would attach another copy on every render. Prose is
 * the only DOMPurify caller in the app, so nothing else sees it.
 */
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  // Duck-typed, not `instanceof Element`: this runs server-side too, where the
  // nodes come from isomorphic-dompurify's own jsdom and Node has no global
  // `Element` to compare against — the instanceof would throw during SSR.
  const el = node as Partial<Element>;
  if (typeof el.getAttribute !== "function") return;

  // Body images are always below the fold, so there is no case for a
  // per-image control here.
  if (el.tagName === "IMG") {
    el.setAttribute?.("loading", "lazy");
    el.setAttribute?.("decoding", "async");
    return;
  }

  if (el.tagName !== "A") return;
  if (!isExternalHref(el.getAttribute("href"))) return;

  el.setAttribute?.("target", "_blank");
  el.setAttribute?.("rel", "noreferrer noopener");
});

/**
 * Two declarations survive an inline style. Everything else goes.
 *
 * The editor expresses an image's size and an element's alignment as inline
 * CSS: a width percentage on the `img` when the image is inline and on the
 * `figure` when it is a block, and a `text-align` on whatever holds it. Both
 * are the editor's decisions about layout and belong on the page; nothing else
 * in that attribute does.
 *
 * So the attribute is rebuilt here rather than filtered — read the two values,
 * write back only them, drop the attribute entirely if neither is there. The
 * width has to be a percentage between 0 and 100 and the alignment one of
 * three words, so what reaches the sanitizer is drawn from a fixed set.
 *
 * That is what makes `style` safe to allow below. It is not the sanitizer being
 * trusted with arbitrary CSS: by the time it looks, there is none.
 */
/**
 * A width survives on these. Images and their figures as before, and now the
 * parts of a table that carry one: the editor's column-resize handles write a
 * percentage onto `col`, and a table narrowed on the page writes one onto the
 * `table` itself. That is the whole point of allowing tables in — ClickUp
 * 86d4akmr0 asks for them so an editor can set how wide a picture sits beside
 * its text, and a column with no width is a table that cannot do it.
 */
/**
 * The classes CKEditor writes to say where a picture sits, rebuilt the same way
 * the style attribute is: read what is there, keep only what is on this list,
 * drop the attribute if nothing survives.
 *
 * They have to survive, because they ARE the editor's alignment. Resize a
 * picture in a table cell and reach for the align buttons and the result is a
 * class — with `class` off the allow-list the buttons did nothing, and the
 * picture stayed where it had been put.
 *
 * A fixed list rather than the attribute wholesale: an editor pasting from
 * elsewhere should not be able to bring arbitrary classes into the page.
 */
const KEEPABLE_CLASSES = new Set([
  "image",
  "image_resized",
  "image-style-side",
  "image-style-align-left",
  "image-style-align-center",
  "image-style-align-right",
  "image-style-block-align-left",
  "image-style-block-align-right",
]);

const CLASSABLE = new Set(["FIGURE", "IMG"]);

DOMPurify.addHook("beforeSanitizeAttributes", (node) => {
  const el = node as Partial<Element>;
  if (typeof el.getAttribute !== "function") return;

  const tag = el.tagName;
  const value = el.getAttribute("class");
  if (!tag || !value || !CLASSABLE.has(tag)) return;

  const keep = value.split(/\s+/).filter((name) => KEEPABLE_CLASSES.has(name));
  if (keep.length) el.setAttribute?.("class", keep.join(" "));
  else el.removeAttribute?.("class");
});

const SIZEABLE = new Set(["FIGURE", "IMG", "TABLE", "COL", "TD", "TH"]);
const ALIGNABLE = new Set([
  "P",
  "FIGURE",
  "FIGCAPTION",
  "H2",
  "H3",
  "LI",
  "TD",
  "TH",
]);

DOMPurify.addHook("beforeSanitizeAttributes", (node) => {
  const el = node as Partial<Element>;
  if (typeof el.getAttribute !== "function") return;

  const style = el.getAttribute("style");
  const tag = el.tagName;
  if (!style || !tag) return;

  const keep: string[] = [];

  if (SIZEABLE.has(tag)) {
    const width = Number(/(?:^|;)\s*width:\s*([\d.]+)%/.exec(style)?.[1]);
    if (Number.isFinite(width) && width > 0 && width <= 100) {
      keep.push(`width:${width}%`);
    }
  }

  if (ALIGNABLE.has(tag)) {
    const align = /(?:^|;)\s*text-align:\s*(left|right|center)\b/.exec(style);
    if (align) keep.push(`text-align:${align[1]}`);
  }

  if (keep.length) el.setAttribute?.("style", keep.join(";"));
  else el.removeAttribute?.("style");
});

/** An opening block tag at the start, or any closing tag: already markup. */
const LOOKS_LIKE_HTML = /^\s*<(p|h[1-6]|ul|ol|li|figure|blockquote|div)\b|<\/[a-z][^>]*>/i;

/**
 * Wraps plain text so it reaches the sanitizer as the markup everything below
 * assumes.
 *
 * The paragraph fields are CKEditor now and their stored values were migrated
 * to HTML, but two sources are still plain: `lib/mock`, which every fetch
 * helper falls back to when the CMS is unreachable, and anything written
 * before the migration. Handed straight to `dangerouslySetInnerHTML` those
 * render as one unwrapped run of text — no `<p>`, so none of the type from
 * `prose.scss`, and every deliberate line break collapsed.
 *
 * The rule matches the migration's: a blank line starts a paragraph, a single
 * newline is a `<br>`, and the angle brackets are escaped so plain text that
 * happens to contain one is not read as a tag. Sanitizing still runs after
 * this, so nothing skips that gate.
 */
function asHtml(value: string) {
  if (LOOKS_LIKE_HTML.test(value)) return value;

  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => "<p>" + block + "</p>")
    .join("");
}

/**
 * CMS rich text, made safe to hand to `dangerouslySetInnerHTML`.
 *
 * Plain text is wrapped into markup first, so a value that predates the
 * CKEditor migration or comes from `lib/mock` arrives as the paragraphs the
 * stylesheets assume rather than one unwrapped run.
 */
export function sanitizeRichText(html: string | null | undefined): string {
  return DOMPurify.sanitize(asHtml(html ?? ""), {
    ALLOWED_TAGS: [
      "p",
      "h2",
      "h3",
      "strong",
      "b",
      "em",
      "i",
      "a",
      "ul",
      "ol",
      "li",
      "br",
      "img",
      "figure",
      "figcaption",
      // A table is a layout tool here as much as a data one: it is how an
      // editor puts a picture beside its text and decides the split. CKEditor
      // wraps one in a `figure`, which is already allowed above.
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "th",
      "td",
      "caption",
      "colgroup",
      "col",
    ],
    // `loading`/`decoding` for the same reason as `target`/`rel`: the hook
    // above sets them, and the allow-list should name what this emits.
    ALLOWED_ATTR: [
      // An image's width and an element's alignment, and only those — see the
      // hook above, which has already reduced every style attribute in the
      // document to those two or nothing.
      "style",
      "href",
      "target",
      "rel",
      "src",
      "alt",
      "width",
      "height",
      "loading",
      "decoding",
      // Merged cells. Nothing else about a table's shape is an attribute —
      // the widths arrive as the `style` the hook above has already reduced.
      "colspan",
      "rowspan",
      // Where a picture sits, which CKEditor says with a class. Reduced to a
      // fixed set by the hook above, the same way `style` is.
      "class",
    ],
  });
}
