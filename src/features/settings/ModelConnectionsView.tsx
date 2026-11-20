import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import type { UiViewProps } from "@pakka/webui-sdk";
import type {
  ModelConfigurationEdit,
  ModelConfigurationPath,
  ModelConfigurationView,
} from "@pakka/protocol/webui";
import type { PakkaConnection } from "../../integrations/pakka/connection.js";
import { useModelConnections } from "./useModelConnections.js";
import {
  displayValue,
  editPath,
  fieldEdit,
  jsonValue,
  record,
  valueAt,
} from "./modelFields.js";

function ConnectionEditor({
  view,
  locked,
  save,
}: {
  view: ModelConfigurationView;
  locked: boolean;
  save(
    edits: readonly ModelConfigurationEdit[],
    validateOnly?: boolean,
  ): Promise<void>;
}) {
  const providers = record(view.document.providers);
  const [provider, setProvider] = useState(Object.keys(providers)[0] ?? "");
  const [model, setModel] = useState("");
  const [edits, setEdits] = useState<
    ReadonlyMap<string, ModelConfigurationEdit>
  >(new Map());
  const [error, setError] = useState<string | null>(null);
  const [pathText, setPathText] = useState('["providers", "", "compat"]');
  const [valueText, setValueText] = useState("{}");
  const [newId, setNewId] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newApi, setNewApi] = useState("openai-completions");
  const [newModel, setNewModel] = useState("");
  const [override, setOverride] = useState("definition");
  const config = record(providers[provider]);
  const models = Array.isArray(config.models) ? config.models : [];
  const overrides = record(config.modelOverrides);
  const modelChoices = [
    ...models.map((value, index) => ({
      value: `model:${index}`,
      label: String(record(value).id ?? index),
    })),
    ...Object.keys(overrides).map((id) => ({
      value: `override:${id}`,
      label: `${id} · 覆盖`,
    })),
  ];
  const prefix = ["providers", provider] as const;
  const modelPath: ModelConfigurationPath | null = model.startsWith("model:")
    ? [...prefix, "models", Number(model.slice(6))]
    : model.startsWith("override:")
      ? [...prefix, "modelOverrides", model.slice(9)]
      : null;
  const protectedPath = (path: ModelConfigurationPath) =>
    view.protectedPaths.some(
      (secret) =>
        path.every((part, i) => secret[i] === part) ||
        secret.every((part, i) => path[i] === part),
    );
  const current = (path: ModelConfigurationPath) => {
    const changed = edits.get(JSON.stringify(path));
    return changed
      ? "value" in changed
        ? changed.value
        : undefined
      : valueAt(view.document, path);
  };
  function stage(edit: ModelConfigurationEdit) {
    if (protectedPath(edit.path)) {
      setError("此字段包含受保护配置，请由后端维护凭据；未修改该字段。");
      return;
    }
    setEdits((previous) =>
      new Map(previous).set(JSON.stringify(edit.path), edit),
    );
    setError(null);
  }
  function field(label: string, path: ModelConfigurationPath, numeric = false) {
    const protectedValue = protectedPath(path);
    return (
      <TextInput
        key={JSON.stringify(path)}
        label={label}
        type="text"
        inputMode={numeric ? "decimal" : undefined}
        value={displayValue(current(path))}
        placeholder={
          protectedValue ? "由后端保护" : "未覆盖 · 使用原生继承或默认"
        }
        isDisabled={locked || protectedValue}
        controlClassName="touch-control"
        onChange={(value) => {
          try {
            stage(fieldEdit(path, value, numeric));
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "字段无效。");
          }
        }}
      />
    );
  }
  function addProvider() {
    const id = newId.trim();
    if (!id || Object.hasOwn(providers, id)) {
      setError("请输入一个尚未配置的完整 provider ID。");
      return;
    }
    const value = {
      ...(newUrl.trim() ? { baseUrl: newUrl.trim() } : {}),
      ...(newApi.trim() ? { api: newApi.trim() } : {}),
      ...(newModel.trim()
        ? { models: [{ id: newModel.trim(), name: newModel.trim() }] }
        : {}),
    };
    void save([{ path: ["providers", id], value }]);
  }
  function addModel() {
    const id = newModel.trim();
    if (!id) {
      setError("请输入 model ID。");
      return;
    }
    if (override === "override") {
      if (Object.hasOwn(overrides, id)) {
        setError("此模型覆盖已存在。");
        return;
      }
      void save([
        { path: [...prefix, "modelOverrides", id], value: { name: id } },
      ]);
    } else {
      if (models.some((value) => record(value).id === id)) {
        setError("此模型定义已存在。");
        return;
      }
      void save([
        { path: [...prefix, "models", models.length], value: { id, name: id } },
      ]);
    }
  }
  return (
    <div className="flow">
      {!!Object.keys(providers).length && (
        <section className="surface flow">
          <Selector
            label="提供商连接"
            options={Object.keys(providers)}
            value={provider}
            presentation="adaptive"
            controlClassName="touch-control"
            onChange={(value) => {
              setProvider(value);
              setModel("");
            }}
          />
          <div className="form-grid">
            {field("显示名称", [...prefix, "name"])}
            {field("API 协议", [...prefix, "api"])}
            {field("端点 baseUrl", [...prefix, "baseUrl"])}
          </div>
          <p className="muted">
            这里的 localhost 指 Pakka 所在机器。内置 provider
            可仅覆盖端点，继续使用原目录与认证。
          </p>
          <h2>模型参数</h2>
          <Selector
            label="模型定义或覆盖"
            options={modelChoices}
            value={model || undefined}
            placeholder="选择一个模型"
            presentation="adaptive"
            controlClassName="touch-control"
            onChange={setModel}
          />
          {modelPath && (
            <>
              <div className="form-grid">
                {field("模型名称", [...modelPath, "name"])}
                {model.startsWith("model:") &&
                  field("模型级 API", [...modelPath, "api"])}
                {model.startsWith("model:") &&
                  field("模型级端点", [...modelPath, "baseUrl"])}
                {field("上下文窗口", [...modelPath, "contextWindow"], true)}
                {field("最大输出 token", [...modelPath, "maxTokens"], true)}
                <Selector
                  label="支持 Thinking"
                  value={
                    current([...modelPath, "reasoning"]) === undefined
                      ? "inherit"
                      : current([...modelPath, "reasoning"])
                        ? "yes"
                        : "no"
                  }
                  options={[
                    { value: "inherit", label: "使用原生继承或默认" },
                    { value: "yes", label: "支持" },
                    { value: "no", label: "不支持" },
                  ]}
                  isDisabled={locked}
                  presentation="adaptive"
                  onChange={(value) =>
                    stage(
                      value === "inherit"
                        ? { path: [...modelPath, "reasoning"], remove: true }
                        : {
                            path: [...modelPath, "reasoning"],
                            value: value === "yes",
                          },
                    )
                  }
                />
                <Selector
                  label="输入能力"
                  value={
                    current([...modelPath, "input"]) === undefined
                      ? "inherit"
                      : (
                            current([
                              ...modelPath,
                              "input",
                            ]) as readonly string[]
                          )?.includes("image")
                        ? "image"
                        : "text"
                  }
                  options={[
                    { value: "inherit", label: "使用原生继承或默认" },
                    { value: "text", label: "文本" },
                    { value: "image", label: "文本与图片" },
                  ]}
                  isDisabled={locked}
                  presentation="adaptive"
                  onChange={(value) =>
                    stage(
                      value === "inherit"
                        ? { path: [...modelPath, "input"], remove: true }
                        : {
                            path: [...modelPath, "input"],
                            value:
                              value === "image" ? ["text", "image"] : ["text"],
                          },
                    )
                  }
                />
              </div>
              <h3>价格 · USD / 百万 token</h3>
              <div className="form-grid">
                {field("输入", [...modelPath, "cost", "input"], true)}
                {field("输出", [...modelPath, "cost", "output"], true)}
                {field("缓存读取", [...modelPath, "cost", "cacheRead"], true)}
                {field("缓存写入", [...modelPath, "cost", "cacheWrite"], true)}
              </div>
            </>
          )}
          <details className="flow">
            <summary>添加模型定义或覆盖</summary>
            <div className="flow compact">
              <TextInput
                label="新增 model ID"
                value={newModel}
                onChange={setNewModel}
                controlClassName="touch-control"
              />
              <Selector
                label="配置方式"
                value={override}
                onChange={setOverride}
                options={[
                  { value: "definition", label: "新增模型定义" },
                  { value: "override", label: "覆盖已有内置或扩展模型" },
                ]}
                presentation="adaptive"
              />
              <p className="muted">
                覆盖只作用于目录中已存在的完整 model
                ID；新定义使用原生默认参数，保存后可在上方编辑。
              </p>
              <Button
                label="添加模型并保存"
                isDisabled={locked || !newModel.trim() || edits.size > 0}
                onClick={addModel}
              />
            </div>
          </details>
        </section>
      )}
      <details className="surface">
        <summary>添加提供商覆盖或连接</summary>
        <div className="flow">
          <div className="form-grid">
            <TextInput
              label="Provider ID"
              value={newId}
              onChange={setNewId}
              controlClassName="touch-control"
            />
            <TextInput
              label="新连接端点"
              value={newUrl}
              onChange={setNewUrl}
              controlClassName="touch-control"
              placeholder="http://localhost:PORT/v1"
            />
            <TextInput
              label="新连接 API"
              value={newApi}
              onChange={setNewApi}
              controlClassName="touch-control"
            />
            <TextInput
              label="首个 model ID（可选）"
              value={newModel}
              onChange={setNewModel}
              controlClassName="touch-control"
            />
          </div>
          <p className="muted">
            内置 provider ID 表示覆盖；自定义连接需填写
            API、端点和模型。密钥与认证由受信任的后端配置维护。
          </p>
          <Button
            label="添加连接并保存"
            isDisabled={locked || !newId.trim() || edits.size > 0}
            onClick={addProvider}
          />
        </div>
      </details>
      <details className="surface">
        <summary>高级原生字段</summary>
        <div className="flow">
          <p className="muted">
            按原生路径编辑 compat、thinkingLevelMap、samplingParams
            或其他非秘密参数。未编辑字段原样保留。
          </p>
          <TextInput
            label="字段路径 JSON"
            value={pathText}
            onChange={setPathText}
            controlClassName="touch-control"
          />
          <TextArea
            label="字段值 JSON"
            value={valueText}
            onChange={setValueText}
            rows={5}
          />
          <div className="actions">
            <Button
              label="加入待保存修改"
              isDisabled={locked}
              onClick={() => {
                try {
                  stage({
                    path: editPath(pathText),
                    value: jsonValue(valueText),
                  });
                } catch (reason) {
                  setError(
                    reason instanceof Error ? reason.message : "字段无效。",
                  );
                }
              }}
            />
            <Button
              label="移除此覆盖"
              variant="ghost"
              isDisabled={locked}
              onClick={() => {
                try {
                  stage({ path: editPath(pathText), remove: true });
                } catch (reason) {
                  setError(
                    reason instanceof Error ? reason.message : "路径无效。",
                  );
                }
              }}
            />
          </div>
          <details>
            <summary>查看脱敏原生配置</summary>
            <pre>{JSON.stringify(view.document, null, 2)}</pre>
          </details>
        </div>
      </details>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {edits.size > 0 && (
        <section className="surface flow">
          <h2>待保存修改 · {edits.size}</h2>
          <ul className="change-list">
            {[...edits.entries()].map(([key, edit]) => (
              <li key={key}>
                <code>{JSON.stringify(edit.path)}</code>
                <span>{"remove" in edit ? "恢复继承" : "设置"}</span>
                <Button
                  label="撤下修改"
                  variant="ghost"
                  isDisabled={locked}
                  onClick={() =>
                    setEdits((previous) => {
                      const next = new Map(previous);
                      next.delete(key);
                      return next;
                    })
                  }
                />
              </li>
            ))}
          </ul>
          <div className="actions">
            <Button
              label="校验配置"
              variant="ghost"
              isDisabled={locked}
              onClick={() => {
                void save([...edits.values()], true);
              }}
            />
            <Button
              label="保存并重载"
              isDisabled={locked}
              onClick={() => {
                void save([...edits.values()]);
              }}
            />
          </div>
        </section>
      )}
    </div>
  );
}

export function ModelConnectionsView({
  ui,
  bindings,
}: UiViewProps<PakkaConnection>) {
  const state = useModelConnections(ui, bindings);
  return (
    <section className="flow">
      <header className="feature-heading">
        <div className="flow compact">
          <p className="eyebrow">Settings</p>
          <h1>提供商与模型</h1>
        </div>
        <div className="actions">
          <Button
            label="重新读取配置"
            variant="ghost"
            isDisabled={state.busy}
            onClick={() => {
              void state.refresh(false);
            }}
          />
          <Button
            label="重载已保存配置"
            variant="ghost"
            isDisabled={state.busy}
            onClick={() => {
              void state.refresh(true);
            }}
          />
        </div>
      </header>
      <p className="muted">
        实例级连接定义。当前 Conversation 的选择与个人默认分别保存。
      </p>
      {state.error && (
        <p role="alert" className="error-text">
          {state.error}
        </p>
      )}
      {state.message && <p role="status">{state.message}</p>}
      {state.pending && (
        <div className="surface flow">
          <p>
            {state.pending === "unreadable"
              ? "原请求记录不可读，请保留本地记录。"
              : `原请求 ${state.pending.requestId} 的结果尚未确认。`}
          </p>
          <Button
            label="核对原配置请求"
            isDisabled={state.busy || state.pending === "unreadable"}
            onClick={() => {
              void state.lookup();
            }}
          />
        </div>
      )}
      {!state.view && !state.error && <p role="status">正在读取配置…</p>}
      {state.view && (
        <>
          <p className="muted">
            配置加载：{state.view.load === "ready" ? "已加载" : "尚未确认"} ·
            受保护字段 {state.view.protectedPaths.length} 个
          </p>
          <ConnectionEditor
            key={state.view.version}
            view={state.view}
            locked={state.busy || !!state.pending}
            save={state.save}
          />
        </>
      )}
    </section>
  );
}
