import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "../host/InstanceView.js";
import type { UiRegistry, VisibleNotice } from "../host/registry.js";
import "./notices.css";

const narrow = "(max-width: 760px)";
const reduced = "(prefers-reduced-motion: reduce)";
const glyph = {
  success: "m4 12 5 5L20 6",
  info: "M12 10v8m0-13v1",
  warning: "M12 5v9m0 3v1",
  error: "m6 6 12 12M18 6 6 18",
};

function NoticeCard({
  item,
  dismiss,
}: {
  item: VisibleNotice;
  dismiss(event: string): void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const pointer = useRef<{
    id: number;
    x: number;
    y: number;
    event: string;
  } | null>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [drag, setDrag] = useState(false);
  const [lift, setLift] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [exit, setExit] = useState<string | null>(null);
  const paused = hover || focus || drag || hidden;
  const leaving = exit === item.event;
  const clock = useRef({ event: "", remaining: 0 });
  useLayoutEffect(() => {
    const el = card.current!;
    const text = el.querySelector("p")!;
    // Ordinary text is a swipe target; genuinely overflowing text needs native scrolling.
    const size = () => {
      const scrollable = text.scrollHeight > text.clientHeight + 1;
      text.toggleAttribute("data-scrollable", scrollable);
      if (scrollable) text.tabIndex = 0;
      else text.removeAttribute("tabindex");
    };
    const observer = new ResizeObserver(size);
    size();
    observer.observe(text);
    return () => {
      observer.disconnect();
      if (!el.contains(document.activeElement)) return;
      const dialog = el.closest("dialog");
      const prior = previousFocus.current;
      if (
        prior?.isConnected &&
        (!dialog || dialog.contains(prior)) &&
        !prior.closest(".notice-row, [hidden]")
      )
        prior.focus({ preventScroll: true });
      if (el.contains(document.activeElement))
        (
          dialog?.querySelector<HTMLElement>("button:not(.notice-close)") ??
          document.getElementById("main")
        )?.focus({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => {
    const visibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useLayoutEffect(() => {
    const event = item.event;
    if (clock.current.event !== event)
      clock.current = {
        event,
        remaining:
          item.tone === "success" || item.tone === "info" ? 5000 : 8000,
      };
    if (leaving) {
      const timer = setTimeout(
        () => dismiss(event),
        matchMedia(reduced).matches ? 0 : 160,
      );
      return () => clearTimeout(timer);
    }
    if (paused) return;
    const started = performance.now();
    const timer = setTimeout(() => setExit(event), clock.current.remaining);
    return () => {
      clearTimeout(timer);
      clock.current.remaining = Math.max(
        0,
        clock.current.remaining - (performance.now() - started),
      );
    };
  }, [item.event, item.tone, paused, leaving, dismiss]);
  function finishPointer(
    event: PointerEvent<HTMLDivElement>,
    canceled: boolean,
  ) {
    const start = pointer.current;
    if (!start || event.pointerId !== start.id) return;
    pointer.current = null;
    setDrag(false);
    setLift(false);
    const up = start.y - event.clientY;
    if (!canceled && up > 40 && up > Math.abs(event.clientX - start.x) * 1.35)
      setExit(start.event);
  }
  return (
    <div className="notice-row" data-leaving={leaving || undefined}>
      <div className="notice-clip">
        <div
          className={`notice notice-${item.tone}`}
          ref={card}
          data-lift={lift || undefined}
          onPointerEnter={(e) => {
            if (e.pointerType !== "touch") setHover(true);
          }}
          onPointerLeave={() => setHover(false)}
          onFocus={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget))
              previousFocus.current =
                e.relatedTarget instanceof HTMLElement ? e.relatedTarget : null;
            setFocus(true);
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false);
          }}
          onPointerDown={(e) => {
            if (
              !matchMedia(narrow).matches ||
              !e.isPrimary ||
              e.button !== 0 ||
              (e.target as Element).closest("button, [data-scrollable]")
            )
              return;
            pointer.current = {
              id: e.pointerId,
              x: e.clientX,
              y: e.clientY,
              event: item.event,
            };
            e.preventDefault();
            setDrag(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const start = pointer.current;
            if (start?.id === e.pointerId)
              setLift(
                start.y - e.clientY > 8 &&
                  start.y - e.clientY > Math.abs(start.x - e.clientX),
              );
          }}
          onPointerUp={(e) => finishPointer(e, false)}
          onPointerCancel={(e) => finishPointer(e, true)}
          onLostPointerCapture={(e) => finishPointer(e, true)}
        >
          <span className="notice-icon">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={glyph[item.tone]} />
            </svg>
          </span>
          <p>{item.message}</p>
          {item.count > 1 && (
            <span className="notice-count" aria-label={`共 ${item.count} 次`}>
              ×{item.count}
            </span>
          )}
          <button
            type="button"
            className="notice-close"
            aria-label="关闭提示"
            onClick={() => setExit(item.event)}
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

export function NoticeViewport({
  registry,
  notices,
  announcement,
}: {
  registry: UiRegistry;
  notices: readonly VisibleNotice[];
  announcement?: VisibleNotice;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const [outlet] = useState(() => document.createElement("div"));
  useLayoutEffect(() => {
    const query = matchMedia(narrow);
    const resize = () => registry.setNoticeCapacity(query.matches ? 1 : 3);
    resize();
    query.addEventListener("change", resize);
    return () => query.removeEventListener("change", resize);
  }, [registry]);
  useLayoutEffect(() => {
    // A native modal makes the rest of the document inert. Move the same outlet,
    // not the React cards, so crossing a dialog boundary does not restart clocks.
    const relocate = () => {
      const dialog =
        document.activeElement?.closest("dialog:modal") ??
        [...document.querySelectorAll("dialog:modal")].at(-1);
      const parent = dialog ?? anchor.current;
      if (parent && outlet.parentElement !== parent) parent.append(outlet);
    };
    relocate();
    document.addEventListener("toggle", relocate, true);
    document.addEventListener("focusin", relocate);
    return () => {
      document.removeEventListener("toggle", relocate, true);
      document.removeEventListener("focusin", relocate);
      outlet.remove();
    };
  }, [outlet]);
  return (
    <>
      <div ref={anchor} className="notice-anchor" />
      {createPortal(
        <section className="notices" aria-label="提示">
          <div className="notice-announcement" role="status" aria-atomic="true">
            {announcement && (
              <span key={announcement.event}>
                {announcement.message}
                {announcement.count > 1 ? `，共 ${announcement.count} 次` : ""}
              </span>
            )}
          </div>
          {notices.map((item) => (
            <NoticeCard key={item.id} item={item} dismiss={registry.dismiss} />
          ))}
        </section>,
        outlet,
      )}
    </>
  );
}
