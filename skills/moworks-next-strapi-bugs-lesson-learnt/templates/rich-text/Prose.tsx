import { cn } from "@/lib/cn";
import { sanitizeRichText } from "@/lib/rich-text";

/**
 * A document of CKEditor 5 output — the whole page for `legal-content.body`,
 * the whole write-up for `article.body`/`event.body`. See those fields in the
 * backend schema, and `styles/includes/prose.scss` for how the tags inside are
 * styled. Subheads and inline images are the editor's own H2/H3 and
 * media-library-insert buttons now, not separate block types.
 *
 * `.Prose` sets a type and a colour on every tag it can reach, which is what a
 * body of prose wants and what a line of copy sitting inside somebody else's
 * component does not. For that, see `InlineProse`.
 *
 * The sanitizing lives in `lib/rich-text`, shared with that component.
 */
export function Prose({
  html,
  className,
}: {
  /** Optional because several CMS paragraph fields are, and the sanitizer
   *  already treats a missing value as empty rather than making every caller
   *  guard. */
  html: string | null | undefined;
  className?: string;
}) {
  return (
    <div
      className={cn("Prose", className)}
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }}
    />
  );
}

export default Prose;
