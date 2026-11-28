import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";

const desktop = "(min-width: 761px) and (pointer: fine)";
const settings = {
  sidebar: {
    initial: 240,
    min: 168,
    max: 400,
    property: "--desk-sidebar",
    label: "导航栏宽度",
  },
  draft: {
    initial: 50,
    min: 44,
    max: 380,
    property: "--desk-draft",
    label: "输入区高度",
  },
} as const;
type Kind = keyof typeof settings;

function limit(kind: Kind, n: number) {
  const s = settings[kind];
  const max = Math.max(
    s.min,
    Math.min(
      s.max,
      Math.floor(
        kind === "draft" ? window.innerHeight * 0.37 : window.innerWidth * 0.36,
      ),
    ),
  );
  return Math.min(max, Math.max(s.min, Math.round(n)));
}
function saved(kind: Kind) {
  try {
    const raw = localStorage.getItem("pakka.layout.desktop." + kind);
    if (raw && Number.isFinite(Number(raw))) return limit(kind, Number(raw));
  } catch {
    /* Optional device preference. */
  }
  return settings[kind].initial;
}
export function DeskDivider({
  kind,
  controls,
}: {
  kind: Kind;
  controls: string;
}) {
  const cfg = settings[kind];
  const node = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; start: number; value: number } | null>(
    null,
  );
  const [value, setValue] = useState<number>(cfg.initial);
  const current = useRef<number>(cfg.initial);
  const [maximum, setMaximum] = useState<number>(cfg.max);
  const point = (e: PointerEvent) =>
    kind === "sidebar" ? e.clientX : -e.clientY;
  // The visual value belongs to this view; only a completed gesture writes a desktop preference.
  function apply(n: number) {
    const v = limit(kind, n);
    current.current = v;
    setValue(v);
    node.current?.parentElement?.style.setProperty(cfg.property, v + "px");
    if (kind === "sidebar")
      node.current
        ?.closest<HTMLElement>(".workspace")
        ?.style.setProperty(cfg.property, v + "px");
  }
  function save() {
    try {
      localStorage.setItem(
        "pakka.layout.desktop." + kind,
        String(current.current),
      );
    } catch {
      /* Optional. */
    }
    window.dispatchEvent(new Event("pakka-desk-resized"));
  }
  useEffect(() => {
    const media = matchMedia(desktop);
    const update = () => {
      if (!media.matches) {
        drag.current = null;
        return;
      }
      if (!drag.current) apply(saved(kind));
      setMaximum(limit(kind, Number.MAX_SAFE_INTEGER));
    };
    update();
    media.addEventListener("change", update);
    window.addEventListener("resize", update);
    window.addEventListener("pakka-desk-resized", update);
    window.addEventListener("storage", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("pakka-desk-resized", update);
      window.removeEventListener("storage", update);
    };
  }, [kind]);
  function cancel() {
    const d = drag.current;
    if (d) apply(d.value);
    drag.current = null;
  }
  return (
    <div
      ref={node}
      className={`desk-divider divider-${kind}`}
      role="separator"
      tabIndex={0}
      aria-label={cfg.label}
      aria-orientation={kind === "sidebar" ? "vertical" : "horizontal"}
      aria-controls={controls}
      aria-valuemin={cfg.min}
      aria-valuemax={maximum}
      aria-valuenow={value}
      aria-valuetext={value + " 像素"}
      title={cfg.label + " · 拖动或用方向键调整，双击恢复默认"}
      onPointerDown={(e) => {
        if (
          !matchMedia(desktop).matches ||
          !e.isPrimary ||
          e.button !== 0 ||
          e.pointerType === "touch"
        )
          return;
        e.preventDefault();
        e.currentTarget.focus({ preventScroll: true });
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = {
          id: e.pointerId,
          start: point(e),
          value: current.current,
        };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d?.id === e.pointerId) apply(d.value + point(e) - d.start);
      }}
      onPointerUp={(e) => {
        if (drag.current?.id === e.pointerId) {
          drag.current = null;
          save();
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
      onLostPointerCapture={cancel}
      onPointerCancel={cancel}
      onDoubleClick={() => {
        apply(cfg.initial);
        save();
      }}
      onKeyDown={(e) => {
        const dir =
          kind === "sidebar"
            ? ["ArrowLeft", "ArrowRight"]
            : ["ArrowDown", "ArrowUp"];
        const keys: Record<string, number> = {
          [dir[0]!]: value - 8,
          [dir[1]!]: value + 8,
          Home: cfg.min,
          End: maximum,
          Enter: cfg.initial,
        };
        const next = keys[e.key];
        if (next !== undefined) {
          e.preventDefault();
          apply(next);
          save();
        }
      }}
    />
  );
}
