import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ComposerIcon } from "./ComposerIcons.js";

const key = "pakka.layout.desktop.reading-width";
const eventName = "pakka-reading-width-changed";
type Width = { mode: "fixed" | "full"; pixels: number };
const initial: Width = { mode: "fixed", pixels: 820 };
function read(): Width {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      value &&
      (value.mode === "fixed" || value.mode === "full") &&
      Number.isInteger(value.pixels) &&
      value.pixels >= 560 &&
      value.pixels <= 1440 &&
      value.pixels % 20 === 0
    )
      return { mode: value.mode, pixels: value.pixels };
  } catch {
    /* The preference is optional. */
  }
  return initial;
}
export function useReadingWidth() {
  const [value, setValue] = useState(read);
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    const sync = () => setValue(read());
    window.addEventListener("storage", sync);
    window.addEventListener(eventName, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(eventName, sync);
    };
  }, []);
  function change(next: Width) {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setSaved(true);
      window.dispatchEvent(new Event(eventName));
    } catch {
      setSaved(false);
    }
  }
  return {
    value,
    saved,
    change,
    style: {
      "--conversation-reading-width":
        value.mode === "full" ? "none" : `${value.pixels}px`,
    } as CSSProperties,
  };
}
export function ReadingWidth({
  preference,
}: {
  preference: ReturnType<typeof useReadingWidth>;
}) {
  const { value, saved, change } = preference;
  const node = useRef<HTMLDetailsElement>(null);
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width: 760px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(max-width: 760px)");
    const resize = () => setMobile(media.matches);
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !node.current?.contains(event.target) &&
        node.current
      )
        node.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && node.current?.open) {
        node.current.open = false;
        node.current.querySelector("summary")?.focus();
      }
    };
    media.addEventListener("change", resize);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      media.removeEventListener("change", resize);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details className="reading-width" ref={node}>
      <summary className="reader-action" aria-label="阅读宽度" title="阅读宽度">
        <ComposerIcon name="width" />
      </summary>
      <div className="reading-width-panel flow">
        <h2>阅读宽度</h2>
        <p className="muted">调整消息正文的宽度</p>
        {mobile && <p>手机按屏幕宽度排版；桌面偏好会保留。</p>}
        <fieldset disabled={mobile}>
          <legend className="visually-hidden">桌面阅读宽度</legend>
          <div className="reading-width-presets">
            {([640, 820, 1040, "full"] as const).map((preset, index) => (
              <button
                key={preset}
                type="button"
                aria-pressed={
                  preset === "full"
                    ? value.mode === "full"
                    : value.mode === "fixed" && value.pixels === preset
                }
                onClick={() =>
                  change(
                    preset === "full"
                      ? { ...value, mode: "full" }
                      : { mode: "fixed", pixels: preset },
                  )
                }
              >
                <span
                  className="reading-width-glyph"
                  data-width={preset}
                  aria-hidden="true"
                >
                  <i />
                  <i />
                  <i />
                </span>
                {["窄", "适中", "宽", "全宽"][index]}
              </button>
            ))}
          </div>
          <label className="reading-width-range">
            <span>
              自定义宽度{" "}
              <output>
                {value.mode === "full" ? "全宽" : `${value.pixels} px`}
              </output>
            </span>
            <input
              aria-label="自定义阅读宽度"
              type="range"
              min="560"
              max="1440"
              step="20"
              disabled={value.mode === "full"}
              value={value.pixels}
              onChange={(event) =>
                change({ mode: "fixed", pixels: Number(event.target.value) })
              }
            />
          </label>
          <div className="reading-width-limits">
            <span>560 px</span>
            <span>1440 px</span>
          </div>
        </fieldset>
        <p className="muted">
          {value.mode === "full"
            ? "使用正文区的可用宽度，保留两侧留白。"
            : "窗口较窄时自动适应，放大后恢复设定宽度。"}
        </p>
        <footer>
          <span className="muted">
            {saved ? "已保存在此浏览器" : "仅在当前页面生效"}
          </span>
          <button
            className="reader-action"
            type="button"
            disabled={mobile}
            onClick={() => change(initial)}
          >
            恢复默认
          </button>
        </footer>
      </div>
    </details>
  );
}
