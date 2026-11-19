import { useMemo, useRef, useState } from "react";
import { Dictation } from "./Dictation.js";
import { IconButton } from "@astryxdesign/core/IconButton";
import { CloseIcon } from "../../host/InstanceView.js";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
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
import {
  ModelPicker,
  exactModel,
  modelKey,
  modelSelectionProblem,
} from "./ModelPicker.js";
import { dispatchExtensionCommand } from "../../integrations/pakka/extensions.js";
import { useConversationConfiguration } from "./useConversationConfiguration.js";
import { ConversationSettings } from "./ConversationSettings.js";
import {
  useConversationInput,
  type InputMode,
} from "./useConversationInput.js";

import { inputModeLabel, inputStatus } from "./input-labels.js";

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
  const [draft, setDraft] = useState(() =>
    delivery.pending && delivery.pending !== "unreadable"
      ? delivery.pending.text
      : "",
  );
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
  const busy = disabled || config.busy || delivery.busy || resolving;
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
      busy ||
      config.unconfirmed ||
      commandPending.current ||
      !draft.trim() ||
      delivery.pending
    )
      return;
    const text = draft.trim();
    setError(null);
    if (text === "/model" || text === "/thinking") {
      if (!configurable) {
        setError(
          "当前 Conversation 不能修改模型设置，请先读取配置并核对权限。",
        );
        return;
      }
      setPicker(text === "/model" ? "model" : "thinking");
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
        const handled = await dispatchExtensionCommand(connection, ui, text);
        if (alive()) {
          if (handled) setDraft("");
          else setError("此命令尚未注册，不会作为消息发给模型。");
        }
      } catch (reason) {
        if (alive()) setError(describeFailure(reason));
      } finally {
        commandPending.current = false;
        if (alive()) setResolving(false);
      }
      return;
    }
    if (await delivery.submit(config.currentTarget(), draft, mode)) {
      setDraft((current) => (current === draft ? "" : current));
      onSubmitted?.();
    }
  }
  return (
    <section className="composer surface flow" aria-label="Conversation 输入">
      <div className="actions model-controls">
        <Button
          label={config.configuration?.current?.model ?? "选择模型"}
          className="composer-model-control"
          size="sm"
          variant="ghost"
          isDisabled={!configurable}
          onClick={() => setPicker("model")}
        />
        <Button
          label={
            config.model?.thinkingLevels.length
              ? `Thinking · ${config.configuration?.current?.thinkingLevel ?? "默认"}`
              : "Thinking · 不支持"
          }
          size="sm"
          variant="ghost"
          isDisabled={!configurable || !config.model?.thinkingLevels.length}
          onClick={() => setPicker("thinking")}
        />
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
          enabled={!busy && !config.unconfirmed && !delivery.pending}
          onText={setDraft}
        />
      </div>
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
          rows={3}
          placeholder="输入消息，或使用 /model、/thinking"
          autoComplete="off"
          controlClassName="composer-input"
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="composer-actions">
          <Selector
            label="输入方式"
            isLabelHidden
            options={[
              { value: "prompt", label: inputModeLabel.prompt },
              { value: "steer", label: inputModeLabel.steer },
              { value: "followUp", label: inputModeLabel.followUp },
            ]}
            value={mode}
            onChange={(value) => setMode(value as InputMode)}
            presentation="adaptive"
            controlClassName="touch-control"
          />
          <span className="muted">Enter 发送 · Shift+Enter 换行</span>
          <Button
            label={busy ? "正在处理…" : inputModeLabel[mode]}
            type="submit"
            isDisabled={
              busy || config.unconfirmed || !draft.trim() || !!delivery.pending
            }
          />
        </div>
      </form>
      {running && (
        <p className="muted">
          调整消息会在下一次可介入时送达。后续消息在本轮工作结束后执行。
        </p>
      )}
      {(error ?? config.error ?? delivery.error) && (
        <p role="alert" className="error-text">
          {error ?? config.error ?? delivery.error}
        </p>
      )}
      {delivery.receipt && (
        <p role="status" className="muted">
          本次提交：{inputStatus[delivery.receipt.status]}
        </p>
      )}
      {delivery.pending && (
        <div role="status" className="input-pending flow compact">
          {delivery.pending === "unreadable" ? (
            <p>本地待核对记录不可读。请保留原记录，当前已阻止重复提交。</p>
          ) : (
            <>
              <p>这条消息的结果尚未确认，已阻止重复提交。</p>
              <details className="pending-input-original">
                <summary>
                  原消息 · {inputModeLabel[delivery.pending.mode]}
                </summary>
                <pre>{delivery.pending.text}</pre>
                <p className="identifier">
                  原请求 {delivery.pending.requestId}
                </p>
              </details>
              {delivery.pending.receiptId || delivery.pending.target ? (
                <Button
                  label="核对原请求"
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
        </div>
      )}
      {picker === "model" && (
        <ModelPicker
          connection={connection}
          ui={ui}
          close={closePicker}
          choose={(item) => choose(item, draft.trim() === "/model")}
          disabled={busy}
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
