import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { TranscriptRow } from "./transcript.js";
import { ReadingIcon } from "./ReadingIcons.js";
import { createPortal } from "react-dom";

type Anchor = { key: string; offset: number };
/** TanStack owns the reader geometry; visible rows and the focused row retain DOM. */
export function TranscriptWindow({
  rows,
  render,
  scroll,
  controls,
  followRevision,
  searchQuery,
  locateKey,
}: {
  locateKey?: string | null;
  searchQuery: string | null;
  controls?: HTMLElement | null;
  followRevision: number;
  rows: readonly TranscriptRow[];
  render(row: TranscriptRow): ReactNode;
  scroll: RefObject<HTMLElement | null>;
}) {
  const node = useRef<HTMLElement>(null);
  const [margin, setMargin] = useState(0);
  const [visible, setVisible] = useState(true);
  const [focused, setFocused] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [restoration, setRestoration] = useState<Anchor | null>(null);
  const anchor = useRef<Anchor | null>(null);
  const offset = useRef(0);
  const shown = useRef(true);
  const restore = useRef(false);
  const keys = useMemo(() => rows.map((row) => row.key), [rows]);
  const virtual = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: rows.length,
    getScrollElement: () => scroll.current,
    getItemKey: (index) => keys[index] ?? index,
    estimateSize: () => 180,
    initialOffset: () => offset.current,
    scrollMargin: margin,
    scrollPaddingStart: -(restoration?.offset ?? 0),
    overscan: 3,
    gap: 20,
    enabled: visible,
    useAnimationFrameWithResizeObserver: true,
    onChange: (instance) => {
      if (restore.current || !node.current?.getClientRects().length) return;
      offset.current = instance.scrollOffset ?? 0;
      const item = instance.getVirtualItemForOffset(offset.current);
      anchor.current =
        item && offset.current >= item.start
          ? { key: String(item.key), offset: offset.current - item.start }
          : null;
    },
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range),
        pinned = focused ? keys.indexOf(focused) : -1;
      if (pinned >= 0 && !indexes.includes(pinned)) indexes.push(pinned);
      return indexes.sort((a, b) => a - b);
    },
  });
  useLayoutEffect(() => {
    if (locateKey) {
      setFollowing(false);
      const index = keys.indexOf(locateKey);
      if (index >= 0) virtual.scrollToIndex(index, { align: "start" });
    }
  }, [locateKey, virtual, keys]);
  // Growth inside the visible message keeps its current reading point. Rows
  // entirely above the viewport still compensate for their revised heights.
  virtual.shouldAdjustScrollPositionOnItemSizeChange = (
    item,
    _delta,
    instance,
  ) => item.end <= (instance.scrollOffset ?? 0);
  useLayoutEffect(() => {
    const element = node.current,
      viewport = scroll.current;
    if (!element || !viewport) return;
    const update = () => {
      const next = element.getClientRects().length > 0;
      if (next && !shown.current) {
        restore.current = true;
        setRestoration(anchor.current);
      }
      shown.current = next;
      setVisible(next);
      if (next)
        setMargin(
          element.getBoundingClientRect().top -
            viewport.getBoundingClientRect().top +
            viewport.scrollTop,
        );
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(viewport);
    if (element.parentElement) observer.observe(element.parentElement);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [scroll]);
  useLayoutEffect(() => {
    const element = node.current,
      viewport = scroll.current;
    if (element?.getClientRects().length && viewport)
      setMargin(
        element.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top +
          viewport.scrollTop,
      );
  });
  useLayoutEffect(() => {
    if (!visible || !restore.current) return;
    restore.current = false;
    const index = restoration ? keys.indexOf(restoration.key) : -1;
    if (index >= 0) virtual.scrollToIndex(index, { align: "start" });
    else virtual.scrollToOffset(offset.current);
  }, [visible, restoration, keys, virtual]);
  const total = virtual.getTotalSize(),
    viewportHeight = virtual.scrollRect?.height ?? 0;
  useLayoutEffect(() => {
    if (followRevision > 0) setFollowing(true);
  }, [followRevision]);
  useLayoutEffect(() => {
    if (searchQuery !== null) setFollowing(false);
  }, [searchQuery]);
  useLayoutEffect(() => {
    if (following && visible && rows.length)
      virtual.scrollToIndex(rows.length - 1, { align: "end" });
  }, [following, visible, rows, total, viewportHeight, margin, virtual]);
  useLayoutEffect(() => {
    const viewport = scroll.current;
    if (!viewport) return;
    const pause = () => setFollowing(false);
    const pointer = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".transcript-row")
      )
        pause();
    };
    const editable = (event: FocusEvent) => {
      if (
        event.target instanceof Element &&
        event.target.matches("input, textarea, [contenteditable=true]")
      )
        pause();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (
        ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(
          event.key,
        ) ||
        (event.target instanceof Element &&
          event.target.closest(".transcript-row"))
      )
        pause();
    };
    viewport.addEventListener("wheel", pause, { passive: true });
    viewport.addEventListener("touchmove", pause, { passive: true });
    viewport.addEventListener("pointerdown", pointer, { passive: true });
    viewport.addEventListener("focusin", editable);
    viewport.addEventListener("keydown", keyboard);
    return () => {
      viewport.removeEventListener("wheel", pause);
      viewport.removeEventListener("touchmove", pause);
      viewport.removeEventListener("pointerdown", pointer);
      viewport.removeEventListener("focusin", editable);
      viewport.removeEventListener("keydown", keyboard);
    };
  }, [scroll]);
  function focus() {
    const row = document.activeElement?.closest<HTMLElement>(
      "[data-transcript-key]",
    );
    setFocused(
      row && node.current?.contains(row)
        ? (row.dataset.transcriptKey ?? null)
        : null,
    );
  }
  const navigation =
    rows.length > 0 ? (
      <div className="transcript-tail-controls">
        <button
          className="reader-action"
          type="button"
          onClick={() => setFollowing((value) => !value)}
        >
          <ReadingIcon name={following ? "pause" : "latest"} />
          {following ? "暂停跟随" : "到本页最新消息"}
        </button>
      </div>
    ) : null;
  return (
    <>
      <section
        className="transcript-window virtual-space"
        ref={node}
        aria-label="消息历史"
        style={{ height: virtual.getTotalSize() }}
        onFocusCapture={focus}
        onBlurCapture={() => queueMicrotask(focus)}
      >
        {virtual.getVirtualItems().map((item) => {
          const row = rows[item.index];
          return (
            row && (
              <div
                className="transcript-row"
                key={item.key}
                ref={virtual.measureElement}
                data-index={item.index}
                data-transcript-key={row.key}
                style={{ transform: `translateY(${item.start - margin}px)` }}
              >
                {render(row)}
              </div>
            )
          );
        })}
      </section>
      {controls ? createPortal(navigation, controls) : navigation}
    </>
  );
}
