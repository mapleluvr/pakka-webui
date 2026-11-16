import { useRef, useState } from "react";
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
import {
  useConversationInput,
  type InputMode,
} from "./useConversationInput.js";

export function Composer({
  ui,
  connection,
  target,
  changed,
  disabled,
}: {
  ui: UiContext;
  connection: PakkaConnection;
  target: AgentRef;
  changed(): void;
  disabled: boolean;
}) {
  const config = useConversationConfiguration(ui, connection, target);
  const delivery = useConversationInput(ui, connection, target, changed);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<InputMode>("prompt");
  const [picker, setPicker] = useState<"model" | "thinking" | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commandPending = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const busy = disabled || config.busy || delivery.busy || resolving;
  const configurable =
    !!config.configuration?.canConfigure && !config.unconfirmed && !busy;
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
    if (busy || commandPending.current || !draft.trim() || delivery.pending)
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
    if (await delivery.submit(config.currentTarget(), draft, mode))
      setDraft("");
  }
  return (
    <section className="composer surface flow" aria-label="Conversation 输入">
      <div className="actions model-controls">
        <Button
          label={config.configuration?.current?.model ?? "选择模型"}
          variant="ghost"
          isDisabled={!configurable}
          onClick={() => setPicker("model")}
        />
        <Selector
          label="Thinking"
          options={[...(config.model?.thinkingLevels ?? [])]}
          value={config.configuration?.current?.thinkingLevel}
          placeholder="默认"
          presentation="adaptive"
          controlClassName="touch-control"
          isDisabled={!configurable || !config.model?.thinkingLevels.length}
          onChange={(level) => {
            void thinking(level);
          }}
        />
      </div>
      {config.unconfirmed && (
        <div role="status" className="flow compact">
          <p>
            需要读取当前配置后才能继续修改；读取当前值不确认此前请求的结果。
          </p>
          <Button
            label="读取当前配置"
            variant="ghost"
            isDisabled={config.busy}
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
          value={draft}
          onChange={setDraft}
          rows={4}
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
              { value: "prompt", label: "新请求" },
              { value: "steer", label: "Steer" },
              { value: "followUp", label: "Follow-up" },
            ]}
            value={mode}
            onChange={(value) => setMode(value as InputMode)}
            presentation="adaptive"
            controlClassName="touch-control"
          />
          <span className="muted">Enter 提交 · Shift+Enter 换行</span>
          <Button
            label={busy ? "正在处理…" : "提交"}
            type="submit"
            isDisabled={busy || !draft.trim() || !!delivery.pending}
          />
        </div>
      </form>
      {(error ?? config.error ?? delivery.error) && (
        <p role="alert" className="error-text">
          {error ?? config.error ?? delivery.error}
        </p>
      )}
      {delivery.receipt && (
        <p role="status" className="muted">
          输入回执：{delivery.receipt.status}
        </p>
      )}
      {delivery.pending && (
        <div role="status" className="flow compact">
          {delivery.pending === "unreadable" ? (
            <p>本地待核对记录不可读。请保留原记录，当前已阻止重复提交。</p>
          ) : (
            <>
              <p>
                原请求 {delivery.pending.requestId}{" "}
                的结果尚未确认，已阻止重复提交。
              </p>
              {delivery.pending.receiptId ? (
                <Button
                  label="核对原回执"
                  variant="ghost"
                  isDisabled={busy}
                  onClick={() => {
                    void delivery.check();
                  }}
                />
              ) : (
                <p className="muted">
                  尚未取得可查询的回执身份。请保留原请求记录，勿以新请求重发。
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
            <h2>Thinking</h2>
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
