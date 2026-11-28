import { UiIcon } from "@pakka/webui-sdk/icons";
import {
  createContext,
  useCallback,
  useContext,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ComposerIcon } from "./ComposerIcons.js";
import "./conversation-panels.css";

type Panel = "search" | "history" | "notes";
type Point = { x: number; y: number };
const mobile = "(max-width: 640px)";
const readNarrow = () => window.matchMedia(mobile).matches;
function watchWidth(update: () => void) {
  const query = window.matchMedia(mobile);
  query.addEventListener("change", update);
  return () => query.removeEventListener("change", update);
}
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const PanelContext = createContext<{
  layer: HTMLElement | null;
  front: Panel | undefined;
  narrow: boolean;
  activate(panel: Panel): void;
  remove(panel: Panel): void;
  positions: RefObject<Partial<Record<Panel, Point>>>;
} | null>(null);

export function usePanelContext() {
  const context = useContext(PanelContext);
  if (!context)
    throw new Error("ConversationPanel requires its ConversationPanelHost.");
  return context;
}

export function useConversationPanelTrigger(
  kind: Panel,
  open: boolean,
  onOpen: () => void,
  onClose: () => void,
) {
  const { front, narrow, activate } = usePanelContext();
  const visible = open && (!narrow || front === kind);
  return {
    "aria-expanded": visible,
    onClick(event: MouseEvent<HTMLButtonElement>) {
      if (visible) onClose();
      else {
        event.currentTarget.focus({ preventScroll: true });
        if (open) activate(kind);
        else onOpen();
      }
    },
    onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      if (visible && event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    },
  };
}

/** Keep portals in their own themed, hideable Conversation, outside the scrolling reader. */
export function ConversationPanelHost({
  children,
  style,
}: {
  children: ReactNode;
  style: CSSProperties;
}) {
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const [order, setOrder] = useState<Panel[]>([]);
  const front = order.at(-1);
  const activate = useCallback((panel: Panel) => {
    setOrder((open) =>
      open.at(-1) === panel
        ? open
        : [...open.filter((id) => id !== panel), panel],
    );
  }, []);
  const remove = useCallback((panel: Panel) => {
    setOrder((open) => open.filter((id) => id !== panel));
  }, []);
  const narrow = useSyncExternalStore(watchWidth, readNarrow);
  const positions = useRef<Partial<Record<Panel, Point>>>({});
  return (
    <PanelContext value={{ layer, front, narrow, activate, remove, positions }}>
      <section className="conversation-view" style={style}>
        {children}
        <div className="conversation-panel-layer" ref={setLayer} />
      </section>
    </PanelContext>
  );
}

export function ConversationPanel({
  kind,
  id,
  title,
  subtitle,
  trigger,
  initialFocus,
  onClose,
  children,
  actions,
  footer,
}: {
  kind: Panel;
  id: string;
  title: string;
  subtitle?: string;
  trigger: RefObject<HTMLButtonElement | null>;
  initialFocus?: RefObject<HTMLInputElement | null>;
  onClose(): void;
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  const { layer, front, narrow, activate, remove, positions } =
    usePanelContext();
  const visible = !narrow || front === kind;
  const box = useRef<HTMLDialogElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const dismissHidden = useEffectEvent(onClose);
  const place = useCallback(
    (move?: Point) => {
      const node = box.current,
        heading = trigger.current?.closest(".conversation-heading");
      if (!node?.getClientRects().length || !heading?.getClientRects().length)
        return;
      if (kind === "notes" && window.innerWidth >= 1280) {
        node.removeAttribute("style");
        return;
      }
      const viewport = window.visualViewport,
        compact = readNarrow();
      const inset = compact ? 8 : 12;
      const left = (viewport?.offsetLeft ?? 0) + inset,
        top = (viewport?.offsetTop ?? 0) + inset;
      const width =
        (viewport?.width ?? document.documentElement.clientWidth) - 2 * inset;
      const height = (viewport?.height ?? window.innerHeight) - 2 * inset;
      const anchor = heading.getBoundingClientRect();
      if (kind === "notes")
        node.style.setProperty("--notebook-top", `${anchor.bottom + 4}px`);
      node.style.width = `${compact ? width : Math.min(width, kind === "search" ? 380 : 480)}px`;
      // On small screens reserve reading space; keep the header above the scrolling contents.
      node.style.maxHeight = `${Math.min(height, Math.max(96, height * (compact ? 0.66 : 0.76)))}px`;
      const rect = node.getBoundingClientRect();
      const preferred = (!compact && (move ?? positions.current[kind])) || {
        x: compact ? left : anchor.right - inset - rect.width,
        y: anchor.bottom + 6,
      };
      const x = clamp(preferred.x, left, left + width - rect.width),
        y = clamp(preferred.y, top, top + height - rect.height);
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      if (move && !compact) positions.current[kind] = { x, y };
    },
    [kind, positions, trigger],
  );
  useLayoutEffect(() => {
    const node = box.current,
      heading = trigger.current?.closest(".conversation-heading");
    if (!layer || !node || !heading) return;
    const update = () => {
      if (!heading.getClientRects().length) {
        dismissHidden();
        return;
      }
      place();
    };
    update();
    if (!heading.getClientRects().length) return;
    activate(kind);
    const observer = new ResizeObserver(update);
    observer.observe(node);
    observer.observe(heading);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      remove(kind);
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
    };
  }, [activate, kind, layer, place, remove, trigger]);
  useLayoutEffect(() => {
    if (!visible || !layer) return;
    place();
    if (trigger.current === document.activeElement)
      (initialFocus?.current ?? toolbar.current)?.focus({
        preventScroll: true,
      });
  }, [visible, layer, place, initialFocus, trigger]);
  function close() {
    onClose();
    trigger.current?.focus({ preventScroll: true });
  }
  if (!layer) return null;
  return createPortal(
    <dialog
      open
      ref={box}
      id={id}
      aria-labelledby={`${id}-title`}
      className="conversation-panel"
      data-kind={kind}
      hidden={!visible}
      data-front={front === kind || undefined}
      onFocusCapture={() => activate(kind)}
      onPointerDownCapture={() => activate(kind)}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !event.defaultPrevented &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <div
        className="conversation-panel-heading"
        role="toolbar"
        aria-label={`${title}工具栏`}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
        ref={toolbar}
        tabIndex={-1}
        title="方向键移动浮窗；按住 Shift 加大步长"
        onKeyDown={(event) => {
          if (
            !box.current ||
            readNarrow() ||
            event.altKey ||
            event.metaKey ||
            event.ctrlKey
          )
            return;
          const delta = event.shiftKey ? 40 : 10;
          const step = (
            {
              ArrowLeft: [-delta, 0],
              ArrowRight: [delta, 0],
              ArrowUp: [0, -delta],
              ArrowDown: [0, delta],
            } as Record<string, [number, number]>
          )[event.key];
          if (!step) return;
          event.preventDefault();
          const rect = box.current.getBoundingClientRect();
          place({ x: rect.left + step[0], y: rect.top + step[1] });
        }}
      >
        <h2
          id={`${id}-title`}
          className="conversation-panel-handle"
          title="拖动或使用方向键移动浮窗"
          onPointerDown={(event) => {
            if (
              !box.current ||
              !event.isPrimary ||
              event.button !== 0 ||
              readNarrow()
            )
              return;
            event.preventDefault();
            const rect = box.current.getBoundingClientRect();
            toolbar.current?.focus({ preventScroll: true });
            drag.current = {
              id: event.pointerId,
              dx: event.clientX - rect.left,
              dy: event.clientY - rect.top,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (start?.id === event.pointerId)
              place({
                x: event.clientX - start.dx,
                y: event.clientY - start.dy,
              });
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          {kind === "notes" ? (
            <UiIcon name="file" />
          ) : (
            <ComposerIcon name={kind} />
          )}
          <span>
            {subtitle && <small className="panel-subtitle">{subtitle}</small>}
            {title}
          </span>
        </h2>
        {actions}
        <button
          type="button"
          className="reader-action panel-reset"
          aria-label="恢复浮窗位置"
          title="恢复浮窗位置"
          onClick={() => {
            delete positions.current[kind];
            place();
          }}
        >
          <ComposerIcon name="reset" />
        </button>
        <button
          type="button"
          className="reader-action"
          aria-label={`关闭${title}`}
          title={`关闭${title}`}
          onClick={close}
        >
          <ComposerIcon name="close" />
        </button>
      </div>
      <div className="conversation-panel-body" tabIndex={-1}>
        {children}
      </div>
      {footer && (
        <footer className="conversation-panel-footer">{footer}</footer>
      )}
    </dialog>,
    layer,
  );
}
