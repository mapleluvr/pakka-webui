import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import type { PocketThinkingLevel } from "@pakka/protocol/pocket";
import type { ModelCatalogItem } from "@pakka/protocol/webui";
import {
  sameModel,
  usePersonalModelDefaults,
  type DefaultSelection,
} from "./usePersonalModelDefaults.js";
import type { UiViewProps } from "@pakka/webui-sdk";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";
import { ModelPicker } from "../conversations/ModelPicker.js";
import { modelKey, exactModel } from "../conversations/modelCatalog.js";

export function ModelDefaultsView({
  ui,
  bindings: connection,
}: UiViewProps<PakkaConnection>) {
  const [draft, setDraft] = useState<DefaultSelection | null>(null),
    [catalogError, setCatalogError] = useState("");
  const personal = usePersonalModelDefaults(ui, connection, draft === null);
  const { defaults, busy, pending, message } = personal;
  const model = (draft ?? defaults)?.model ?? null,
    thinking = (draft ?? defaults)?.thinkingLevel ?? null;
  const [levels, setLevels] = useState<readonly PocketThinkingLevel[]>([]),
    [picker, setPicker] = useState(false);
  const dirty =
    !!defaults &&
    (!sameModel(model, defaults.model) || thinking !== defaults.thinkingLevel);
  const error = personal.error || catalogError;
  useEffect(() => {
    setCatalogError("");
    if (!model) {
      setLevels([]);
      return;
    }
    const controller = new AbortController();
    setLevels([]);
    void exactModel(
      connection,
      modelKey(model),
      AbortSignal.any([
        requestSignal(ui.signal, connection),
        controller.signal,
      ]),
    )
      .then((item) => {
        if (
          !controller.signal.aborted &&
          !ui.signal.aborted &&
          !connection.signal.aborted
        )
          setLevels(item.thinkingLevels);
      })
      .catch((reason) => {
        if (
          !controller.signal.aborted &&
          !ui.signal.aborted &&
          !connection.signal.aborted
        )
          setCatalogError(describeFailure(reason));
      });
    return () => controller.abort();
  }, [model, ui, connection]);
  const choose = (item: ModelCatalogItem) => {
    setDraft({
      model: { provider: item.provider, id: item.id },
      thinkingLevel:
        thinking && item.thinkingLevels.includes(thinking) ? thinking : null,
    });
    setPicker(false);
  };
  return (
    <section className="flow">
      <header className="feature-heading">
        <div className="flow compact">
          <p className="eyebrow">Settings</p>
          <h1>新对话默认模型</h1>
        </div>
        <Button
          label="刷新默认设置"
          variant="ghost"
          isDisabled={busy}
          onClick={() => {
            void personal.read().then((ok) => {
              if (ok) setDraft(null);
            });
          }}
        />
      </header>
      <p className="muted">
        你在各台设备新建对话时使用这组默认设置。已有对话保留各自的模型与
        Thinking。
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
            label="查看保存结果"
            isDisabled={busy || pending === "unreadable"}
            onClick={() => {
              void personal.lookup().then((ok) => {
                if (ok) setDraft(null);
              });
            }}
          />
        </div>
      )}
      {defaults && (
        <div className="surface flow">
          <h2>模型与 Thinking</h2>
          <div className="actions">
            <Button
              label={model ? `默认模型 · ${modelKey(model)}` : "选择默认模型"}
              isDisabled={busy || !!pending}
              onClick={() => setPicker(true)}
            />
            <Button
              label="恢复跟随实例"
              variant="ghost"
              isDisabled={busy || !!pending || (!model && !thinking)}
              onClick={() => {
                setDraft({ model: null, thinkingLevel: null });
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
              setDraft({
                model,
                thinkingLevel:
                  value === "inherit"
                    ? null
                    : (levels.find((level) => level === value) ?? null),
              })
            }
          />
          <p className="muted">
            {dirty && !model && !thinking
              ? "尚未保存：保存后，我的新对话将使用实例的模型和 Thinking 设置。"
              : `已保存：${defaults.model ? modelKey(defaults.model) : "跟随实例"} · Thinking：${defaults.thinkingLevel ?? "使用原生默认"}`}
          </p>
          <Button
            label="保存默认设置"
            isDisabled={busy || !!pending || !dirty}
            onClick={() => {
              void personal
                .save({ model, thinkingLevel: thinking })
                .then((ok) => {
                  if (ok) setDraft(null);
                });
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
