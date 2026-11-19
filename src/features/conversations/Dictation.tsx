import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { MicrophoneIcon } from "./ComposerIcons.js";

/** The browser owns capture, permission and its speech provider. */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;
function browserRecognizer(): RecognitionConstructor | undefined {
  const browser = window as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}
const errors: Record<string, string> = {
  "not-allowed": "麦克风权限未获允许。可在浏览器的网站设置中检查。",
  "service-not-allowed": "当前浏览器未允许使用语音服务。",
  "audio-capture": "浏览器没有找到可用的麦克风。",
  "no-speech": "没有听到语音，可以重新开始。",
  network: "浏览器语音服务连接失败。已输入的草稿仍然保留。",
  "language-not-supported": "浏览器语音服务不支持当前语言。",
};
let activeRecognition: { recognition: Recognition; cancel(): void } | undefined;

export function Dictation({
  box,
  signal,
  enabled,
  onText,
  compact = false,
}: {
  compact?: boolean;
  box: RefObject<HTMLTextAreaElement | null>;
  signal: AbortSignal;
  enabled: boolean;
  onText(value: string): void;
}) {
  const [phase, setPhase] = useState<"idle" | "listening" | "stopping">("idle");
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const live = useRef({ enabled, onText });
  live.current = { enabled, onText };
  const session = useRef<{
    recognition: Recognition;
    final: string;
    timer?: ReturnType<typeof setTimeout>;
  } | null>(null);
  const visible = () =>
    !!box.current?.isConnected &&
    box.current.getClientRects().length > 0 &&
    !document.hidden;
  function dispose() {
    const current = session.current;
    session.current = null;
    if (!current) return;
    clearTimeout(current.timer);
    current.recognition.onresult =
      current.recognition.onerror =
      current.recognition.onend =
        null;
    if (activeRecognition?.recognition === current.recognition)
      activeRecognition = undefined;
    try {
      current.recognition.abort();
    } catch {
      /* The native session may already have ended. */
    }
  }
  function cancel() {
    dispose();
    setPhase("idle");
    setText("");
    setInterim("");
  }
  function start() {
    const Constructor = browserRecognizer();
    if (
      !Constructor ||
      !isSecureContext ||
      !live.current.enabled ||
      signal.aborted ||
      !visible()
    )
      return;
    activeRecognition?.cancel();
    setError(null);
    setText("");
    setInterim("");
    let recognition: Recognition;
    try {
      recognition = new Constructor();
    } catch {
      setError("浏览器语音识别未能启动。");
      return;
    }
    const current = {
      recognition,
      final: "",
      timer: undefined as ReturnType<typeof setTimeout> | undefined,
    };
    session.current = current;
    activeRecognition = { recognition, cancel };
    const valid = () =>
      session.current === current &&
      !signal.aborted &&
      live.current.enabled &&
      visible();
    function finish() {
      if (session.current !== current) return;
      const keep = valid();
      const final = current.final;
      dispose();
      setPhase("idle");
      setInterim("");
      setText(keep ? final : "");
    }
    recognition.lang = navigator.language || "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      if (session.current !== current) return;
      if (!valid()) {
        cancel();
        return;
      }
      const final: string[] = [],
        pending: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        const row = event.results[i];
        if (row) (row.isFinal ? final : pending).push(row[0].transcript.trim());
      }
      current.final = final.filter(Boolean).join(" ");
      const coming = pending.filter(Boolean).join(" ");
      if (current.final.length + coming.length > 8192) {
        cancel();
        setError("识别文本已达到输入上限，请缩短后再听写。");
        return;
      }
      setText(current.final);
      setInterim(coming);
    };
    recognition.onerror = (event) => {
      if (session.current !== current) return;
      finish();
      if (event.error !== "aborted")
        setError(errors[event.error] ?? "语音识别已停止，可以重新开始。");
    };
    recognition.onend = finish;
    try {
      recognition.start();
      if (session.current === current) setPhase("listening");
    } catch {
      cancel();
      setError("语音识别未启动，请检查此网站的麦克风权限。");
    }
  }
  function stop() {
    const current = session.current;
    if (!current || phase === "stopping") return;
    setPhase("stopping");
    try {
      current.recognition.stop();
    } catch {
      cancel();
      setError("语音识别停止未得到确认，请重新开始。");
      return;
    }
    if (session.current === current)
      current.timer = setTimeout(() => {
        const final = current.final;
        dispose();
        setPhase("idle");
        setInterim("");
        setText(final);
        setError("浏览器结束识别超时；这里只保留已确认的文本。");
      }, 5000);
  }
  function insert() {
    const element = box.current;
    if (
      !enabled ||
      signal.aborted ||
      phase !== "idle" ||
      !text ||
      !element ||
      !visible()
    )
      return;
    const at = element.selectionStart,
      end = element.selectionEnd;
    const value = element.value.slice(0, at) + text + element.value.slice(end);
    if (value.length > 8192) {
      setError("插入后超过消息上限，请先缩短草稿。");
      return;
    }
    live.current.onText(value);
    const caret = at + text.length;
    cancel();
    requestAnimationFrame(() => {
      if (signal.aborted || !element.isConnected || element.value !== value)
        return;
      element.focus();
      element.setSelectionRange(caret, caret);
    });
  }
  useLayoutEffect(() => {
    if (!enabled) cancel();
    const hidden = () => {
      if (!visible()) cancel();
    };
    const observer = new ResizeObserver(hidden);
    if (box.current) observer.observe(box.current);
    document.addEventListener("visibilitychange", hidden);
    signal.addEventListener("abort", cancel, { once: true });
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", hidden);
      signal.removeEventListener("abort", cancel);
      dispose();
    };
  }, [enabled, signal, box]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.code !== "KeyV" ||
        document.activeElement !== box.current
      )
        return;
      event.preventDefault();
      if (session.current) stop();
      else start();
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });
  const available = isSecureContext && !!browserRecognizer();
  return (
    <div
      className="dictation flow compact"
      data-phase={phase}
      data-available={available || undefined}
      aria-label="语音草稿"
    >
      <div className="actions">
        {compact && phase === "idle" && !text ? (
          <IconButton
            label="浏览器听写"
            icon={<MicrophoneIcon />}
            variant="ghost"
            type="button"
            isDisabled={!available || !enabled}
            onClick={start}
          />
        ) : (
          <Button
            label={
              phase === "listening"
                ? "结束听写"
                : phase === "stopping"
                  ? "正在结束…"
                  : "浏览器听写"
            }
            variant="ghost"
            type="button"
            isDisabled={!available || !enabled || phase === "stopping"}
            onClick={() => {
              if (phase === "listening") stop();
              else start();
            }}
          />
        )}
        {(phase !== "idle" || text) && (
          <Button
            label="取消听写"
            variant="ghost"
            type="button"
            onClick={cancel}
          />
        )}
        <span className="dictation-help muted" id={id}>
          {available
            ? "Alt+V · 语音由浏览器识别，插入草稿后再发送。"
            : "当前浏览器未提供安全的语音识别入口，可直接输入。"}
        </span>
      </div>
      {(text || interim || phase !== "idle") && (
        <div className="surface flow compact" aria-describedby={id}>
          <p role="status">
            {phase === "idle" ? "识别结果" : "正在听写"}：{text}
            <span className="muted">{interim ? " " + interim : ""}</span>
          </p>
          {phase === "idle" && text && (
            <div>
              <Button
                label="插入草稿"
                type="button"
                isDisabled={!enabled}
                onClick={insert}
              />
            </div>
          )}
        </div>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
