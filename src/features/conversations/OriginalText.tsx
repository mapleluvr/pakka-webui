import { useLayoutEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ReadingAnchor } from "./ReadingState.js";

/** One already bounded range; a huge single line is also split into bounded visual rows. */
export function OriginalText({
  text,
  initialScroll,
  initialAnchor,
  onScroll,
}: {
  text: string;
  initialScroll: number;
  initialAnchor: ReadingAnchor | null;
  onScroll(value: number, anchor: ReadingAnchor | null): void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const anchor = useRef(initialAnchor).current;
  const rows = useMemo(
    () =>
      text.split("\n").flatMap((line) => {
        const segments: string[] = [];
        for (let start = 0; start < line.length; ) {
          let end = Math.min(line.length, start + 256);
          const previous = line.charCodeAt(end - 1);
          if (end < line.length && previous >= 0xd800 && previous <= 0xdbff)
            end--;
          segments.push(line.slice(start, end));
          start = end;
        }
        return segments.length ? segments : ["\u00a0"];
      }),
    [text],
  );
  const virtual = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: rows.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 24,
    overscan: 8,
    initialOffset: initialScroll,
    useAnimationFrameWithResizeObserver: true,
    // Align the retained line at its prior in-row offset while native measurement settles.
    scrollPaddingStart: -(anchor?.offset ?? 0),
  });
  useLayoutEffect(() => {
    if (anchor) virtual.scrollToIndex(anchor.index, { align: "start" });
  }, [anchor, virtual]);
  return (
    <div
      ref={scroll}
      className="original-text"
      tabIndex={0}
      role="region"
      aria-label="原文当前段"
      onScroll={(event) => {
        const offset = event.currentTarget.scrollTop;
        const row = virtual.getVirtualItemForOffset(offset);
        onScroll(
          offset,
          row ? { index: row.index, offset: offset - row.start } : null,
        );
      }}
    >
      <div className="virtual-space" style={{ height: virtual.getTotalSize() }}>
        {virtual.getVirtualItems().map((row) => (
          <div
            className="original-line"
            key={row.key}
            data-index={row.index}
            ref={virtual.measureElement}
            style={{ transform: `translateY(${row.start}px)` }}
          >
            {rows[row.index]}
          </div>
        ))}
      </div>
    </div>
  );
}
