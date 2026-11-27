import { useMemo, useRef, useState } from "react";
import { Dictation } from "./Dictation.js";
import { IconButton } from "@astryxdesign/core/IconButton";
import { CloseIcon } from "../../host/InstanceView.js";
import { Button } from "@astryxdesign/core/Button";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Dialog } from "@astryxdesign/core/Dialog";
import type { UiContext } from "@pakka/webui-sdk";
import type { AgentRef, PocketThinkingLevel } from "@pakka/client/pocket";
import type { ModelCatalogItem } from "@pakka/protocol/webui";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";
import { exactModel, modelKey, modelSelectionProblem } from "./modelCatalog.js";
import { ConversationModelPicker } from "./ConversationModelPicker.js";
import { dispatchExtensionCommand } from "../../integrations/pakka/extensions.js";
import { useConversationConfiguration } from "./useConversationConfiguration.js";
import { useExtensionCommand } from "./useExtensionCommand.js";
import { ConversationSettings } from "./ConversationSettings.js";
import {
  useConversationInput,
  type InputMode,
} from "./useConversationInput.js";

import {
  inputModeLabel,
  inputModeDescription,
  sendLabel,
} from "./input-labels.js";

export function Composer({
  ui,
  connection,
  target,
  changed,
  onSubmitted,
  disabled,
  running,
}: {
  ui: UiContext;
  connection: PakkaConnection;
  target: AgentRef;
  changed(): void;
  onSubmitted?(): void;
  disabled: boolean;
  running: boolean;
}) {
  const config = useConversationConfiguration(ui, connection, target, changed);
  const delivery = useConversationInput(ui, connection, target, changed);
  const extensionCommand = useExtensionCommand(ui, connection, target, changed);
  const [draft, setDraft] = useState(() => {
    for (const pending of [delivery.pending, extensionCommand.pending]) {
      if (pending && pending !== "unreadable") return pending.text;
    }
    return "";
  });
  const [mode, setMode] = useState<InputMode>(() =>
    delivery.pending && delivery.pending !== "unreadable"
      ? delivery.pending.mode
      : "prompt",
  );
  const [picker, setPicker] = useState<"model" | "thinking" | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commandPending = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const dictationSignal = useMemo(
    () => AbortSignal.any([ui.signal, connection.signal]),
    [ui.signal, connection.signal],
  );
  const busy =
    disabled ||
    config.busy ||
    delivery.busy ||
    extensionCommand.busy ||
    resolving;
  const configurable =
    !!config.configuration?.canConfigure &&
    config.supportsRequests &&
    !config.unconfirmed &&
    !busy &&
    !running;
  const alive = () => !ui.signal.aborted && !connection.signal.aborted;
  function closePicker() {
    setPicker(null);
    input.current?.focus();
  }
  async function choose(item: ModelCatalogItem, command = false) {
    const problem = modelSelectionProblem(item);
    if (problem) {
      setError(problem);
      return;
    }
    if (await config.configure({ model: modelKey(item) })) {
      if (command) setDraft("");
      closePicker();
    }
  }
  async function thinking(level: string, command = false) {
    if (!config.model?.thinkingLevels.includes(level as PocketThinkingLevel)) {
      setError("当前模型不支持该 Thinking 级别。");
      return;
    }
    if (
      await config.configure({ thinkingLevel: level as PocketThinkingLevel })
    ) {
      if (command) setDraft("");
      closePicker();
    }
  }
  async function submit() {
    if (
      draft.trim() === "/model" &&
      !delivery.pending &&
      !extensionCommand.pending
    ) {
      setPicker("model");
      return;
    }
    if (
      busy ||
      config.unconfirmed ||
      commandPending.current ||
      !draft.trim() ||
      delivery.pending ||
      extensionCommand.pending
    )
      return;
    const text = draft.trim();
    setError(null);
    if (text === "/thinking") {
      if (!configurable) {
        setError(
          "当前 Conversation 不能修改模型设置，请先读取配置并核对权限。",
        );
        return;
      }
      setPicker("thinking");
      return;
    }
    if (text.startsWith("/model ")) {
      commandPending.current = true;
      setResolving(true);
      try {
        const item = await exactModel(
          connection,
          text.slice(7).trim(),
          requestSignal(ui.signal, connection),
        );
        if (alive()) await choose(item, true);
      } catch (reason) {
        if (alive()) setError(describeFailure(reason));
      } finally {
        commandPending.current = false;
        if (alive()) setResolving(false);
      }
      return;
    }
    if (text.startsWith("/thinking ")) {
      await thinking(text.slice(10).trim(), true);
      return;
    }
    if (text.startsWith("/")) {
      commandPending.current = true;
      setResolving(true);
      try {
        const handled = await dispatchExtensionCommand(
          connection,
          ui,
          text,
          config.currentTarget(),
          (call, title, effect) =>
            extensionCommand.run(call, draft, title, effect),
        );
        if (!alive()) return;
        if (handled) {
          setDraft((current) => (current === draft ? "" : current));
          return;
        }
      } catch (reason) {
        if (alive()) setError(describeFailure(reason));
        return;
      } finally {
        commandPending.current = false;
        if (alive()) setResolving(false);
      }
    }
    if (await delivery.submit(config.currentTarget(), draft, mode)) {
      setDraft((current) => (current === draft ? "" : current));
      onSubmitted?.();
    }
  }
  const modelLabel = config.configuration?.current?.model ?? "选择模型";
  const levelLabel = config.model?.thinkingLevels.length
    ? (config.configuration?.current?.thinkingLevel ?? "默认")
    : "不支持";
  return (
    <section className="composer surface flow" aria-label="Conversation 输入">
      {config.unconfirmed && (
        <div role="status" className="flow compact">
          <p className="identifier">
            {config.pending === "unreadable"
              ? "本地配置原请求不可读，请保留记录；当前已阻止继续提交。"
              : `配置原请求 ${config.pending?.requestId} 的结果尚未确认，当前已阻止重复保存。`}
          </p>
          <Button
            label="核对配置原请求"
            variant="ghost"
            isDisabled={config.busy || config.pending === "unreadable"}
            onClick={() => {
              void config.reconcile();
            }}
          />
        </div>
      )}
      <form
        className="flow compact"
        onSubmit={(event) => {
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          void submit();
        }}
      >
        <TextArea
          ref={input}
          label="消息或命令"
          isLabelHidden
          value={draft}
          onChange={setDraft}
          rows={2}
          placeholder="Where all miracles begin."
          autoComplete="off"
          controlClassName="composer-input"
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey &&
              !event.repeat &&
              !event.nativeEvent.isComposing &&
              event.nativeEvent.keyCode !== 229
            ) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="composer-actions">
          <div className="actions model-controls">
            <button
              type="button"
              className="toolbar-choice composer-model-control"
              onClick={() => setPicker("model")}
              aria-label={modelLabel}
              title={modelLabel}
            >
              <span className="choice-wide">{modelLabel}</span>
              <span className="choice-short">
                {modelLabel.slice(modelLabel.indexOf("/") + 1)}
              </span>
            </button>
            <button
              type="button"
              className="toolbar-choice thinking-control"
              disabled={!configurable || !config.model?.thinkingLevels.length}
              onClick={() => setPicker("thinking")}
              aria-label={`Thinking · ${levelLabel}`}
              title={`Thinking · ${levelLabel}`}
            >
              <span className="choice-wide">Thinking · </span>
              {levelLabel}
            </button>
            <ConversationSettings
              compact
              ui={ui}
              connection={connection}
              config={config}
              disabled={busy}
              running={running}
            />
            <Dictation
              compact
              key={JSON.stringify(config.currentTarget())}
              box={input}
              signal={dictationSignal}
              enabled={
                !busy &&
                !config.unconfirmed &&
                !delivery.pending &&
                !extensionCommand.pending
              }
              onText={setDraft}
            />
          </div>
          <div className="send-cluster">
            <MoreMenu
              label={`输入方式：${inputModeLabel[mode]}`}
              alignment="end"
              placement="above"
              icon={
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  aria-hidden="true"
                >
                  <path d="m7 10 5 5 5-5" />
                </svg>
              }
              items={(["prompt", "steer", "followUp"] as const).map(
                (value) => ({
                  label: inputModeLabel[value],
                  description: inputModeDescription[value],
                  onClick: () => setMode(value),
                }),
              )}
            />
            <Button
              label={busy ? "正在处理…" : sendLabel[mode]}
              type="submit"
              isDisabled={
                busy ||
                config.unconfirmed ||
                !draft.trim() ||
                !!delivery.pending ||
                !!extensionCommand.pending
              }
            />
          </div>
        </div>
      </form>
      {(error ?? config.error ?? delivery.error ?? extensionCommand.error) && (
        <p role="alert" className="error-text">
          {error ?? config.error ?? delivery.error ?? extensionCommand.error}
        </p>
      )}
      {extensionCommand.result && (
        <details className="pending-input-original command-result">
          <summary>
            命令已返回 · {extensionCommand.result.original.title}
          </summary>
          <p className="muted">
            这里只确认命令返回；后续工作的状态请在所属页面核对。
          </p>
          <pre>
            {JSON.stringify(extensionCommand.result.operation.value, null, 2)}
          </pre>
          <p className="identifier">
            原请求 {extensionCommand.result.original.requestId}
          </p>
        </details>
      )}
      {extensionCommand.pending && (
        <div
          role="status"
          className="input-pending flow compact command-pending"
        >
          {extensionCommand.pending === "unreadable" ? (
            <p>本地命令原请求不可读。请保留记录，当前已阻止重复提交。</p>
          ) : (
            <>
              <p>命令结果尚未确认，已保留原请求并阻止重复提交。</p>
              <details className="pending-input-original">
                <summary>原命令 · {extensionCommand.pending.title}</summary>
                <pre>{extensionCommand.pending.text}</pre>
                <p className="identifier">
                  原请求 {extensionCommand.pending.requestId}
                </p>
              </details>
              <Button
                label="核对命令原请求"
                variant="ghost"
                isDisabled={extensionCommand.busy}
                onClick={() => {
                  setError(null);
                  void extensionCommand.check().then((acceptedText) => {
                    if (alive() && acceptedText !== undefined)
                      setDraft((current) =>
                        current === acceptedText ? "" : current,
                      );
                  });
                }}
              />
            </>
          )}
        </div>
      )}
      {delivery.pending && (!delivery.busy || delivery.checking) && (
        <section
          aria-label="待确认的消息"
          className="input-pending flow compact"
        >
          {delivery.pending === "unreadable" ? (
            <p>本地待核对记录不可读。请保留原记录，当前已阻止重复提交。</p>
          ) : (
            <>
              <p>还不能确认这条消息是否已送达。</p>
              <details className="pending-input-original">
                <summary>
                  {inputModeLabel[delivery.pending.mode]} · 「
                  {delivery.pending.text.slice(0, 32)}
                  {delivery.pending.text.length > 32 ? "…" : ""}」
                </summary>
                <pre>{delivery.pending.text}</pre>
                <p className="identifier">
                  原请求 {delivery.pending.requestId}
                </p>
              </details>
              {delivery.pending.receiptId || delivery.pending.target ? (
                <Button
                  label={
                    delivery.checking ? "正在查看发送状态…" : "查看发送状态"
                  }
                  variant="ghost"
                  isDisabled={busy}
                  onClick={() => {
                    void delivery.check().then((acceptedText) => {
                      if (alive() && acceptedText !== undefined)
                        setDraft((current) =>
                          current === acceptedText ? "" : current,
                        );
                    });
                  }}
                />
              ) : (
                <p className="muted">
                  原记录缺少提交时的运行绑定，请保留原请求记录。
                </p>
              )}
            </>
          )}
        </section>
      )}
      {picker === "model" && (
        <ConversationModelPicker
          key={JSON.stringify(target)}
          currentModel={config.configuration?.current?.model}
          connection={connection}
          ui={ui}
          close={closePicker}
          choose={(item) => choose(item, draft.trim() === "/model")}
          disabled={!configurable}
        />
      )}
      {picker === "thinking" && (
        <Dialog
          isOpen
          onOpenChange={(open) => {
            if (!open) closePicker();
          }}
          aria-label="选择 Thinking"
        >
          <div className="dialog-content flow">
            <header className="pane-heading">
              <h2>Thinking</h2>
              <IconButton
                label="关闭 Thinking 选择"
                icon={<CloseIcon />}
                variant="ghost"
                onClick={closePicker}
              />
            </header>
            <p>
              当前设置：
              {config.configuration?.current?.thinkingLevel ?? "模型默认"}
            </p>
            <div className="actions">
              {config.model?.thinkingLevels.map((level) => (
                <Button
                  key={level}
                  label={level}
                  isDisabled={busy}
                  onClick={() => {
                    void thinking(level, draft.trim() === "/thinking");
                  }}
                />
              ))}
            </div>
            {!config.model?.thinkingLevels.length && (
              <p>当前模型没有可配置的 Thinking 级别。</p>
            )}
          </div>
        </Dialog>
      )}
    </section>
  );
}
