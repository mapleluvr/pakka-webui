import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { AgentRef, PocketDirectoryView } from "@pakka/protocol/pocket";
import type { UiContext } from "@pakka/webui-sdk";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../integrations/pakka/connection.js";

/** Only lists directories returned by the authorized Pakka service. */
export function DirectoryField({
  ui,
  connection,
  target,
  value,
  onChange,
  disabled,
}: {
  ui: UiContext;
  connection: PakkaConnection;
  target?: AgentRef;
  value: string;
  onChange(path: string): void;
  disabled: boolean;
}) {
  const [view, setView] = useState<PocketDirectoryView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function browse(path: string) {
    if (busy || disabled) return;
    setBusy(true);
    setError(null);
    const signal = requestSignal(ui.signal, connection);
    try {
      const result = await connection.workbench.request(
        target
          ? { op: "directory.list", target, ...(path ? { path } : {}) }
          : { op: "creation.directories", ...(path ? { path } : {}) },
        { signal },
      );
      if (
        result.kind !== "directories" &&
        result.kind !== "creation.directories"
      )
        throw new Error("未收到目录列表。");
      if (!signal.aborted) setView(result.view);
    } catch (reason) {
      if (!signal.aborted) setError(describeFailure(reason));
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="flow compact">
      <TextInput
        label="工作目录（Pakka 主机）"
        value={value}
        onChange={onChange}
        isDisabled={disabled}
        autoComplete="off"
        controlClassName="touch-control"
      />
      <Button
        label={busy ? "正在读取目录…" : "浏览获准目录"}
        variant="ghost"
        isDisabled={busy || disabled}
        onClick={() => {
          void browse(value);
        }}
      />
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {view && (
        <div className="surface flow compact" aria-label="目录选择">
          <p className="identifier">{view.path}</p>
          <div className="actions">
            <Button
              label="使用此目录"
              isDisabled={disabled}
              onClick={() => {
                onChange(view.path);
                setView(null);
              }}
            />
            <Button
              label="上级目录"
              variant="ghost"
              isDisabled={busy || disabled || !view.parent}
              onClick={() => {
                if (view.parent) void browse(view.parent);
              }}
            />
            <Button
              label="收起目录"
              variant="ghost"
              onClick={() => setView(null)}
            />
          </div>
          <ul className="resource-list">
            {[...new Set([...view.roots, ...view.directories])]
              .filter((path) => path !== view.path)
              .map((path) => (
                <li key={path}>
                  <Button
                    label={`打开目录 ${path}`}
                    variant="ghost"
                    width="100%"
                    className="directory-choice"
                    isDisabled={busy || disabled}
                    onClick={() => {
                      void browse(path);
                    }}
                  >
                    <span className="directory-name">
                      {path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path}
                    </span>
                  </Button>
                </li>
              ))}
          </ul>
          {view.truncated && (
            <p className="muted">
              列表已达服务容量；可输入更具体的目录继续浏览。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
