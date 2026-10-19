"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Matches `--marquee-gap` in animation.scss. */
const GAP = 16;

/**
 * A row that drifts sideways forever — the location chips on About Us
 * (4201:15497, 4201:15908).
 *
 * The caller passes one set of items; this repeats them until they fill the
 * frame, then renders that run twice so the loop is seamless. A short row
 * therefore fills the width like a long one, and every gap is the same 16px,
 * because there is no leftover space anywhere for the rhythm to break on.
 * Everything past the first run is `aria-hidden`, so a screen reader hears each
 * label once.
 *
 * Paced in pixels per second, not seconds per pass: a pass is one run, so a
 * fixed duration made rows of different lengths travel at different speeds.
 *
 * The row is hidden until that measure lands — see `.marquee-frame`. Widths are
 * a browser fact, so the server's markup is necessarily one short run at a
 * placeholder pace, and it is not worth showing anybody.
 *
 * Stops under `prefers-reduced-motion`, leaving a static, readable row.
 */
export type MarqueeProps = {
  children: ReactNode;
  /** Pixels per second. Higher = faster. */
  speed?: number;
  direction?: "left" | "right";
  className?: string;
};

export function Marquee({
  children,
  speed = 40,
  direction = "left",
  className,
}: MarqueeProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  // One object so the repeats and the reveal land in the same commit, rather
  // than painting a full row at the wrong pace in between.
  const [fit, setFit] = useState({ repeats: 1, ready: false });

  useEffect(() => {
    const frame = frameRef.current;
    const track = trackRef.current;
    const copy = track?.firstElementChild;
    if (!frame || !track || !copy) return;

    const measure = () => {
      const copyWidth = copy.getBoundingClientRect().width;
      const frameWidth = frame.getBoundingClientRect().width;
      if (copyWidth <= 0 || frameWidth <= 0) return;

      const repeats = Math.max(1, Math.ceil(frameWidth / (copyWidth + GAP)));
      // Duration follows the run, so repeating never changes the pace. Written
      // to the node: React never reads it, and a re-render would restart the
      // drift mid-pass.
      track.style.animationDuration = `${(repeats * (copyWidth + GAP)) / speed}s`;
      setFit({ repeats, ready: true });
    };

    // No initial call: observing fires one immediately.
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(copy);
    void document.fonts?.ready.then(measure);

    return () => observer.disconnect();
  }, [speed]);

  return (
    <>
      {/* Without scripting the measure never runs, so the placeholder row is
          all there is and hiding it would lose the content outright. */}
      <noscript>
        <style>{".marquee-frame{opacity:1}"}</style>
      </noscript>

      <div
        ref={frameRef}
        data-ready={fit.ready ? "" : undefined}
        className={cn(
          "marquee-frame relative flex w-full overflow-hidden",
          className,
        )}
      >
        <div
          ref={trackRef}
          className="marquee-track flex shrink-0 items-center"
          style={{
            animationDirection: direction === "right" ? "reverse" : "normal",
          }}
        >
          {Array.from({ length: fit.repeats * 2 }, (_, i) => (
            <div
              key={i}
              aria-hidden={i === 0 ? undefined : true}
              className="flex shrink-0 items-center gap-[16px]"
            >
              {children}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default Marquee;
