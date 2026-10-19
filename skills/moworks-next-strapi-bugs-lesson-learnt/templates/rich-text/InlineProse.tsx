import { cn } from "@/lib/cn";
import { sanitizeRichText } from "@/lib/rich-text";

/**
 * A line of rich text that looks exactly like the text around it.
 *
 * The footer's copyright, its credit line, its acknowledgement and the sign-up
 * card's thank-you are all one sentence written by an editor, and all of them
 * live inside a component that has already decided what a sentence there looks
 * like. They became rich text so a link could go in one (ClickUp 86d4akxuv) —
 * not so they could be restyled.
 *
 * `Prose` is the wrong tool for that. It is for a document: it sets a type on
 * every tag it can reach and paints links `text-teal-blue-700` with a standing
 * underline, which is right in a story body and wrong on a dark footer.
 *
 * So this one styles nothing. No type, no colour, no spacing — the paragraph
 * inherits whatever the surrounding component set, exactly as the plain `<p>`
 * it replaces did.
 *
 * That includes links. A link inside one of these should behave like the links
 * beside it, and only the component around it knows what those do — the footer
 * hands its own treatment in, the same string its Terms and Privacy row uses.
 *
 * Same sanitizer as `Prose`, from `lib/rich-text` — what an editor may write
 * does not change with where it is shown.
 */
export function InlineProse({
  html,
  className,
}: {
  html: string | null | undefined;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // A paragraph is the whole of one of these, so the margin a run of them
        // would want is a gap above nothing. Only a second one gets it.
        // "[&_p+p]:mt-[16px]",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }}
    />
  );
}

export default InlineProse;
