import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { PocketRemoteError } from "@pakka/client/pocket";
import type { PocketThinkingLevel } from "@pakka/protocol/pocket";
import {
  decodeModelDefaultsChange,
  type ModelCatalogItem,
  type ModelDefaults,
  type ModelDefaultsChange,
  type ModelIdentity,
} from "@pakka/protocol/webui";
import type { UiViewProps } from "@pakka/webui-sdk";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";
import {
  readPending,
  claimPending,
  clearPending,
} from "../../integrations/pakka/pending.js";
import {
  ModelPicker,
  modelKey,
  exactModel,
} from "../conversations/ModelPicker.js";

export function ModelDefaultsView({
  ui,
  bindings: connection,
}: UiViewProps<PakkaConnection>) {
  const key = JSON.stringify([
    location.origin,
    connection.person.id,
    "model-defaults",
  ]);
  const restore = () => readPending(key, decodeModelDefaultsChange);
  const [pending, setPending] = useState(restore);
  const [defaults, setDefaults] = useState<ModelDefaults | null>(null);
  const [model, setModel] = useState<ModelIdentity | null>(null);
  const [levels, setLevels] = useState<readonly PocketThinkingLevel[]>([]);
  const [thinking, setThinking] = useState<PocketThinkingLevel | null>(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const admission = useRef(false);
  const alive = () => !ui.signal.aborted && !connection.signal.aborted;
  const signal = () => requestSignal(ui.signal, connection);
  function apply(value: ModelDefaults) {
    if (alive()) {
      setDefaults(value);
      setModel(value.model);
      setThinking(value.thinkingLevel);
    }
  }
  async function read(readSignal = signal()) {
    const result = await connection.services.request(
      { op: "model-defaults.read" },
      { signal: readSignal },
    );
    if (!readSignal.aborted) apply(result.defaults);
  }
  useEffect(() => {
    const controller = new AbortController();
    void read(AbortSignal.any([signal(), controller.signal])).catch(
      (reason) => {
        if (!controller.signal.aborted && alive())
          setError(describeFailure(reason));
      },
    );
    return () => controller.abort();
  }, [ui, connection]);
  useEffect(() => {
    if (!model) {
      setLevels([]);
      return;
    }
    const controller = new AbortController();
    setLevels([]);
    void exactModel(
      connection,
      modelKey(model),
      AbortSignal.any([signal(), controller.signal]),
    )
      .then((item) => {
        if (!controller.signal.aborted && alive())
          setLevels(item.thinkingLevels);
      })
      .catch((reason) => {
        if (!controller.signal.aborted && alive())
          setError(describeFailure(reason));
      });
    return () => controller.abort();
  }, [model, ui, connection]);
  function release(requestId: string) {
    const remaining = clearPending(key, requestId, decodeModelDefaultsChange);
    if (alive()) setPending(remaining);
  }
  async function save() {
    if (!defaults || admission.current || !alive()) return;
    const existing = restore();
    if (existing) {
      setPending(existing);
      return;
    }
    admission.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    let sent: ModelDefaultsChange | null = null;
    try {
      const change = decodeModelDefaultsChange({
        requestId: crypto.randomUUID(),
        expectedVersion: defaults.version,
        model,
        thinkingLevel: thinking,
      });
      const reserved = claimPending(key, change, decodeModelDefaultsChange);
      if (alive()) setPending(reserved);
      if (reserved === "unreadable" || reserved.requestId !== change.requestId)
        return;
      sent = change;
      const result = await connection.services.request(
        { op: "model-defaults.write", change },
        { signal: signal() },
      );
      release(change.requestId);
      apply(result.receipt.defaults);
      if (alive()) setMessage("个人默认已保存。已有 Conversation 保持原设置。");
    } catch (reason) {
      if (
        sent &&
        reason instanceof PocketRemoteError &&
        reason.outcome === "denied"
      ) {
        try {
          release(sent.requestId);
        } catch {
          /* Keep pending if storage is unavailable. */
        }
      }
      if (alive()) setError(describeFailure(reason));
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  async function lookup() {
    if (admission.current || !alive()) return;
    const original = restore();
    setPending(original);
    if (!original || original === "unreadable") return;
    admission.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await connection.services.request(
        { op: "model-defaults.lookup", original },
        { signal: signal() },
      );
      if (result.receipt) {
        release(original.requestId);
        apply(result.receipt.defaults);
        if (alive()) setMessage("已核对原请求，个人默认保存成功。");
      } else if (alive())
        setMessage("尚未找到原请求的回执，结果仍未知；未重新提交。");
    } catch (reason) {
      if (alive()) setError(describeFailure(reason));
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  const choose = (item: ModelCatalogItem) => {
    setModel({ provider: item.provider, id: item.id });
    setLevels(item.thinkingLevels);
    if (thinking && !item.thinkingLevels.includes(thinking)) setThinking(null);
    setPicker(false);
  };
  return (
    <section className="flow">
      <header className="feature-heading">
        <div className="flow compact">
          <p className="eyebrow">Settings</p>
          <h1>个人模型默认</h1>
        </div>
        <Button
          label="重新读取默认"
          variant="ghost"
          isDisabled={busy}
          onClick={() => {
            setError(null);
            void read().catch((reason) => {
              if (alive()) setError(describeFailure(reason));
            });
          }}
        />
      </header>
      <p className="muted">
        按 Person 在后端保存并跨设备使用；仅为本人新建且未指定配置的
        Conversation 提供默认值。
      </p>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {pending && (
        <div className="surface flow">
          <p>
            {pending === "unreadable"
              ? "原请求记录不可读，请保留本地记录。"
              : `原请求 ${pending.requestId} 尚未确认。`}
          </p>
          <Button
            label="核对原默认请求"
            isDisabled={busy || pending === "unreadable"}
            onClick={() => {
              void lookup();
            }}
          />
        </div>
      )}
      {defaults && (
        <div className="surface flow">
          <h2>启动选择</h2>
          <div className="actions">
            <Button
              label={model ? `默认模型 · ${modelKey(model)}` : "选择默认模型"}
              isDisabled={busy || !!pending}
              onClick={() => setPicker(true)}
            />
            <Button
              label="使用实例缺省模型"
              variant="ghost"
              isDisabled={busy || !!pending}
              onClick={() => {
                setModel(null);
                setThinking(null);
              }}
            />
          </div>
          <Selector
            label="默认 Thinking"
            value={thinking ?? "inherit"}
            options={[
              { value: "inherit", label: "使用原生默认" },
              ...levels.map((level) => ({ value: level, label: level })),
            ]}
            isDisabled={busy || !!pending || !model}
            presentation="adaptive"
            controlClassName="touch-control"
            onChange={(value) =>
              setThinking(
                value === "inherit"
                  ? null
                  : (levels.find((level) => level === value) ?? null),
              )
            }
          />
          <p className="muted">
            保存值：{defaults.thinkingLevel ?? "使用原生默认"}
            。模型支持范围以当前目录为准。
          </p>
          <Button
            label="保存个人默认"
            isDisabled={busy || !!pending}
            onClick={() => {
              void save();
            }}
          />
        </div>
      )}
      {picker && (
        <ModelPicker
          ui={ui}
          connection={connection}
          close={() => setPicker(false)}
          choose={async (item) => {
            choose(item);
          }}
          disabled={busy || !!pending}
        />
      )}
    </section>
  );
}
