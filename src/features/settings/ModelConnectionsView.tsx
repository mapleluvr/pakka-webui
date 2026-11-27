import { useEffect, useRef, useState } from "react";
import type { UiViewProps } from "@pakka/webui-sdk";
import type { ModelConfigurationView } from "@pakka/protocol/webui";
import type { PakkaConnection } from "../../integrations/pakka/connection.js";
import { useModelConnections } from "./useModelConnections.js";
import { useConnectionCatalog } from "./useConnectionCatalog.js";
import {
  Compatibility,
  ModelParameters,
  TextField,
  type ModelForm,
} from "./ModelParameters.js";
import { ProtocolField, protocolLabel } from "./ProtocolField.js";
import {
  applyFields,
  managed,
  publicEdit,
  record,
  replaceField,
  valueAt,
  type Json,
} from "./modelFields.js";
import {
  labels,
  locate,
  modelLayer,
  newProvider,
  prepareDraft,
  savedTarget,
  type Draft,
  type Target,
} from "./connectionDraft.js";
import { regularLeaf } from "./nativeRows.js";
import { checkNativeText } from "./nativeFieldValues.js";
import { AdvancedModelFields } from "./AdvancedModelFields.js";
import "./model-connections.css";

const retained = new WeakMap<PakkaConnection, Draft>();
const describe = (e: unknown) =>
  e instanceof Error ? e.message : "请检查输入。";
type Control = ReturnType<typeof useModelConnections>;
export function ModelConnectionsView(props: UiViewProps<PakkaConnection>) {
  const state = useModelConnections(props.ui, props.bindings);
  return (
    <section className="flow model-settings">
      <header className="feature-heading">
        <div className="flow compact">
          <p className="eyebrow">实例设置</p>
          <h1>提供商与模型</h1>
        </div>
        <div className="actions">
          <button
            disabled={state.busy}
            onClick={() => void state.refresh(false)}
          >
            重新读取配置
          </button>
          <button
            disabled={state.busy || !!state.pending}
            onClick={() => void state.refresh(true)}
          >
            重载已保存配置
          </button>
        </div>
      </header>
      <p className="muted">
        管理本实例的提供商与模型。在对话里选用模型，在个人设置里选择新对话的默认模型。
      </p>
      {state.error && (
        <p className="error-text" role="alert">
          {state.error}
        </p>
      )}
      {state.message && <p role="status">{state.message}</p>}
      {state.pending && (
        <section className="surface flow compact">
          <p>
            {state.pending === "unreadable"
              ? "原请求记录不可读，请保留本地记录。"
              : `原保存 ${state.pending.requestId} 尚待核对；不会重新提交。`}
          </p>
          <button
            disabled={state.busy || state.pending === "unreadable"}
            onClick={() => void state.lookup()}
          >
            查看这次保存结果
          </button>
        </section>
      )}
      {state.view ? (
        <ConnectionEditor {...props} view={state.view} state={state} />
      ) : (
        !state.error && <p role="status">正在读取配置…</p>
      )}
    </section>
  );
}
function ConnectionEditor({
  ui,
  bindings,
  view,
  state,
}: UiViewProps<PakkaConnection> & {
  view: ModelConfigurationView;
  state: Control;
}) {
  const providers = record(view.document.providers),
    first = Object.keys(providers)[0];
  const [target, setTarget] = useState<Target>(
    () =>
      retained.get(bindings)?.target ?? {
        layer: first ? "provider" : "new-provider",
        provider: first ?? "",
        model: "",
      },
  );
  const [draft, setDraft] = useState<Draft | null>(
    () => retained.get(bindings) ?? null,
  );
  const [search, setSearch] = useState(""),
    [discovery, setDiscovery] = useState(""),
    [compatFilter, setCompatFilter] = useState(""),
    [mobileList, setMobileList] = useState(!draft),
    [error, setError] = useState(""),
    [next, setNext] = useState<Target | null>(null),
    [reset, setReset] = useState(0);
  const panel = useRef<HTMLHeadingElement>(null),
    nav = useRef<HTMLInputElement>(null);
  // Keep path resolution on the original document until the draft is explicitly discarded.
  const base = draft?.base ?? view,
    changes = draft?.changes ?? [],
    ctx = locate(base, target),
    { layer, provider, model } = target;
  const create = newProvider(layer),
    isModel = modelLayer(layer),
    isOverride = layer === "override" || layer === "new-override";
  const currentDraft: Draft = draft ?? { target, base, changes };
  const readBase =
    layer === "new-definition" || layer === "new-override" || create
      ? undefined
      : ctx.base;
  const data = applyFields(readBase, changes);
  const stale = base.version !== view.version,
    locked = state.busy || !!state.pending,
    missing =
      !create &&
      (!Object.hasOwn(ctx.providers, provider) ||
        (layer === "definition" && ctx.matches.length !== 1) ||
        (layer === "override" && ctx.base === undefined));
  const catalog = useConnectionCatalog(
    bindings,
    ui,
    provider.trim(),
    "",
    state.epoch,
  );
  const suggestions = useConnectionCatalog(
    bindings,
    ui,
    "",
    discovery,
    state.epoch,
  );
  const rows =
      catalog?.models.filter((m) => m.provider === provider.trim()) ?? [],
    matches = rows.filter((m) => m.id === model.trim()),
    item = matches.find((m) => m.type === "chat");
  const nonChat =
    isModel &&
    ((matches.length > 0 && !item) ||
      (data.type !== undefined && data.type !== "chat"));
  const apis = [...rows, ...(suggestions?.models ?? [])]
    .filter((m) => m.type === "chat")
    .map((m) => m.api);
  const api = isOverride
    ? (item?.api ?? "")
    : String(
        data.api ?? (isModel ? ctx.config.api : undefined) ?? item?.api ?? "",
      );
  const overrides = record(ctx.config.modelOverrides);
  function retain(value: Draft | null) {
    setDraft(value);
    if (value) retained.set(bindings, value);
    else retained.delete(bindings);
  }
  function open(t: Target) {
    retain(null);
    setTarget(t);
    setMobileList(false);
    setError("");
    setNext(null);
    setDiscovery("");
    setCompatFilter("");
    setReset((n) => n + 1);
    requestAnimationFrame(() => panel.current?.focus());
  }
  function navigate(t: Target) {
    state.clearFeedback();
    if (draft) {
      setNext(t);
      setMobileList(false);
    } else open(t);
  }
  function changeTarget(key: "model" | "provider", v: string) {
    state.clearFeedback();
    const t = { ...target, [key]: v };
    setTarget(t);
    retain({ ...currentDraft, target: t });
    setError("");
  }
  useEffect(() => {
    if (
      draft &&
      state.receipt?.state === "saved" &&
      state.receipt.requestId === draft.requestId &&
      !state.busy
    ) {
      open(savedTarget(draft.target));
    }
  }, [state.busy, state.receipt, draft]);
  useEffect(() => {
    if (!draft) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [!!draft]);
  const compatApi = !isModel && compatFilter ? compatFilter : api;
  const form: ModelForm = {
    regular: (p) => {
      const c = changes.find(
        (c) => JSON.stringify(c.path) === JSON.stringify(p),
      );
      return regularLeaf(
        { provider: !isModel, nonChat, compatApi },
        p,
        valueAt(data, p),
        c,
      );
    },
    value: (p) => valueAt(data, p),
    change: (p) =>
      changes.find((c) => JSON.stringify(c.path) === JSON.stringify(p)),
    protected: (p) => managed(base, [...ctx.path, ...p]),
    set: (p, v, text, problem) => {
      state.clearFeedback();
      try {
        const full = [...ctx.path, ...p];
        if (text !== undefined)
          checkNativeText(
            full,
            v && typeof v === "object" ? "json" : "text",
            text,
          );
        try {
          publicEdit(
            base,
            v === undefined
              ? { path: full, remove: true }
              : { path: full, value: v },
          );
        } catch (e) {
          if (
            p.at(-1) === "baseUrl" &&
            String(describe(e)).startsWith("请输入")
          )
            problem = describe(e);
          else throw e;
        }
        const entries = replaceField(
          changes,
          { path: p, value: v, text, error: problem },
          valueAt(readBase, p),
        );
        retain(
          entries.length || create || layer.startsWith("new-")
            ? { ...currentDraft, changes: entries }
            : null,
        );
        setError("");
      } catch (e) {
        setError(describe(e));
      }
    },
  };
  let issue = "",
    editCount = 0;
  if (draft)
    try {
      editCount = prepareDraft(currentDraft, catalog).length;
    } catch (e) {
      issue = describe(e);
    }
  const save = (validateOnly: boolean) => {
    try {
      if (stale || !draft) return;
      void state.save(
        base.version,
        prepareDraft(draft, catalog),
        validateOnly,
        (id) => retain({ ...draft, requestId: id }),
      );
    } catch (e) {
      setError(describe(e));
    }
  };
  const collision =
    create && provider.trim() && Object.hasOwn(providers, provider.trim());
  const overrideChoices = rows.filter(
    (m) =>
      m.type === "chat" &&
      !Object.hasOwn(overrides, m.id) &&
      !ctx.models.some((v) => record(v).id === m.id),
  );
  const targetFor = (layer: Target["layer"], id = ""): Target => ({
    provider,
    model: id,
    layer,
  });
  const visibleProviders = Object.keys(providers).filter((id) =>
    `${id} ${record(providers[id]).name ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const protos = (name: string) =>
    !form.regular(["api"]) ? (
      <small>{name}：见原生参数</small>
    ) : (
      <ProtocolField
        label={name}
        value={String(data.api ?? "")}
        apis={apis}
        disabled={form.protected(["api"])}
        onChange={(v) => form.set(["api"], v || undefined)}
      />
    );
  return (
    <div className="connection-layout" data-list={mobileList}>
      <aside
        className="connection-nav surface flow compact"
        aria-label="已配置提供商"
      >
        <h2>提供商</h2>
        {mobileList && draft && (
          <button
            className="resume-mobile"
            onClick={() => {
              setMobileList(false);
              requestAnimationFrame(() => panel.current?.focus());
            }}
          >
            继续编辑草稿 · {provider || "新提供商"}
          </button>
        )}
        <button
          className="primary-action"
          disabled={locked}
          onClick={() =>
            navigate({ layer: "new-provider", provider: "", model: "" })
          }
        >
          新建提供商
        </button>
        <button
          disabled={locked}
          onClick={() =>
            navigate({ layer: "provider-override", provider: "", model: "" })
          }
        >
          覆盖已有提供商
        </button>
        <label className="field">
          搜索已配置提供商
          <input
            ref={nav}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="connection-list">
          {visibleProviders.map((id) => (
            <button
              key={id}
              aria-pressed={!create && provider === id}
              disabled={locked}
              onClick={() =>
                layer === "provider" && provider === id
                  ? (setMobileList(false),
                    requestAnimationFrame(() => panel.current?.focus()))
                  : navigate({ layer: "provider", provider: id, model: "" })
              }
            >
              <strong>{String(record(providers[id]).name ?? id)}</strong>
              {record(providers[id]).name && <small>{id}</small>}
            </button>
          ))}
        </div>
        {!visibleProviders.length && (
          <small className="muted">
            {search ? "未找到匹配的提供商。" : "尚未配置提供商。"}
          </small>
        )}
        {view.load !== "ready" && <small>配置尚未加载。</small>}
      </aside>
      <section className="connection-detail flow">
        <button
          className="back-list"
          disabled={locked}
          onClick={() => {
            setMobileList(true);
            requestAnimationFrame(() => nav.current?.focus());
          }}
        >
          返回提供商列表{draft ? "（保留草稿）" : ""}
        </button>
        <div className="surface flow">
          <header>
            <p className="eyebrow">{create ? "实例提供商" : provider}</p>
            <h2 tabIndex={-1} ref={panel}>
              {labels[layer]}
            </h2>
            {isModel && model && <strong>{model}</strong>}
          </header>
          {next && (
            <div className="draft-guard" role="alert">
              <p>当前对象有未保存草稿。切换前请选择：</p>
              <div className="actions">
                <button onClick={() => setNext(null)}>
                  保留草稿，继续编辑
                </button>
                <button onClick={() => open(next)}>放弃草稿并切换</button>
              </div>
            </div>
          )}
          {stale && (
            <p role="alert">
              配置版本已变化。草稿仍是原版本，不能直接保存；请复核后放弃旧草稿并按完整身份重新编辑。
            </p>
          )}
          {missing && (
            <p role="alert">
              当前文档中目标缺失或身份不唯一，不能按旧位置编辑。
            </p>
          )}
          <fieldset
            className="flow editor-fields"
            disabled={locked || !!next || stale || missing}
            key={`${layer}:${reset}`}
          >
            {create && (
              <>
                <label className="field">
                  提供商 ID
                  <input
                    value={provider}
                    onChange={(e) => changeTarget("provider", e.target.value)}
                  />
                </label>
                {layer === "provider-override" && (
                  <details>
                    <summary>从目录查找提供商</summary>
                    <label className="field">
                      搜索提供商或模型
                      <input
                        type="search"
                        maxLength={256}
                        value={discovery}
                        onChange={(e) => setDiscovery(e.target.value)}
                      />
                    </label>
                    <div className="connection-list">
                      {[
                        ...new Set(suggestions?.models.map((m) => m.provider)),
                      ].map((id) => (
                        <button
                          key={id}
                          onClick={() => changeTarget("provider", id)}
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                    {suggestions && !suggestions.ready && (
                      <small>目录暂不可读，可输入完整的提供商 ID。</small>
                    )}
                    {suggestions?.more && (
                      <small>当前仅显示部分匹配项，请缩小搜索。</small>
                    )}
                  </details>
                )}
                {collision ? (
                  <button
                    onClick={() =>
                      navigate({
                        provider: provider.trim(),
                        model: "",
                        layer: "provider",
                      })
                    }
                  >
                    打开已配置提供商 {provider.trim()}
                  </button>
                ) : layer === "new-provider" && rows.length > 0 ? (
                  <button
                    onClick={() =>
                      navigate({ ...target, layer: "provider-override" })
                    }
                  >
                    此 ID 已在目录中 · 转为提供商覆盖
                  </button>
                ) : (
                  provider.trim() &&
                  catalog &&
                  (!catalog.ready ||
                    (layer === "provider-override" && !rows.length)) && (
                    <small className="muted">
                      {catalog.ready
                        ? "当前目录未找到该提供商。"
                        : "目录暂不可读，请核对提供商 ID。"}
                    </small>
                  )
                )}
              </>
            )}
            {isModel && (
              <button onClick={() => navigate(targetFor("provider"))}>
                返回 {provider} 提供商设置
              </button>
            )}
            {layer === "new-definition" ? (
              <label className="field">
                新增模型 ID
                <input
                  value={model}
                  onChange={(e) => changeTarget("model", e.target.value)}
                />
              </label>
            ) : layer === "new-override" ? (
              <label className="field">
                选择目录模型（完整 ID）
                <select
                  aria-label="选择目录模型（完整 ID）"
                  value={model}
                  onChange={(e) => changeTarget("model", e.target.value)}
                >
                  <option value="">选择 chat 模型</option>
                  {catalog?.ready &&
                    overrideChoices.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id} ({m.api})
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            {isModel && catalog && !catalog.ready && (
              <small className="muted">
                {layer === "new-override"
                  ? "目录暂不可读，请重新读取配置后再选择模型。"
                  : "目录暂不可读，仍可编辑已保存的公开字段。"}
              </small>
            )}
            {catalog?.ready &&
              (layer === "definition" ||
                layer === "override" ||
                (layer === "new-override" && model)) &&
              !matches.length && (
                <small className="muted">当前目录未找到该模型。</small>
              )}
            {layer === "new-override" &&
              catalog?.ready &&
              !overrideChoices.length && (
                <small className="muted">
                  此提供商没有可添加覆盖的聊天模型。
                </small>
              )}
            {isOverride && item && (
              <small className="muted">
                目录模型协议：{protocolLabel(item.api)}
              </small>
            )}
            {nonChat ? (
              <p>非 chat 或未知类型，保留原配置，不使用聊天参数表单。</p>
            ) : (
              <>
                {!create && (
                  <TextField
                    form={form}
                    path={["name"]}
                    label={isModel ? "模型名称" : "提供商名称"}
                  />
                )}
                {!isOverride && (
                  <>
                    {layer !== "provider-override" &&
                      protos(
                        isModel
                          ? "模型级 API"
                          : create
                            ? "聊天协议"
                            : "新增模型的默认协议",
                      )}
                    <TextField
                      form={form}
                      path={["baseUrl"]}
                      label={isModel ? "模型级端点" : "服务端点 baseUrl"}
                    />
                    <small className="muted">
                      localhost 指 Pakka 所在机器。
                      {layer === "provider-override" &&
                        "只覆盖端点，不改变原目录模型协议与认证。"}
                    </small>
                  </>
                )}
                {layer === "new-provider" && (
                  <div className="form-grid">
                    <label className="field">
                      首个聊天模型 ID
                      <input
                        value={model}
                        onChange={(e) => changeTarget("model", e.target.value)}
                      />
                    </label>
                    <TextField form={form} path={["name"]} label="提供商名称" />
                  </div>
                )}
                {(!create || layer === "new-provider") && (
                  <Compatibility
                    form={form}
                    api={compatApi}
                    setFilter={setCompatFilter}
                    provider={!isModel}
                    apis={apis}
                  />
                )}
                {isModel && <ModelParameters form={form} api={api} />}
              </>
            )}
            {!create && !isModel && (
              <section className="flow compact">
                <h3>模型参数配置</h3>
                <ConfiguredModelList
                  models={ctx.models}
                  overrides={overrides}
                  select={(layer, id) => navigate(targetFor(layer, id))}
                />
                <div className="actions">
                  <button onClick={() => navigate(targetFor("new-definition"))}>
                    添加模型定义
                  </button>
                  <button onClick={() => navigate(targetFor("new-override"))}>
                    覆盖目录模型
                  </button>
                </div>
              </section>
            )}
            {!create && !missing && (
              <AdvancedModelFields
                draft={currentDraft}
                api={compatApi}
                nonChat={nonChat}
                path={ctx.path}
                readBase={readBase}
                data={data}
                update={retain}
                onChange={state.clearFeedback}
              />
            )}
          </fieldset>
        </div>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        {draft && (
          <section className="surface flow compact">
            <h3>
              未保存草稿 · {provider || "新提供商"}
              {model && ` / ${model}`}
            </h3>
            {(create || layer.startsWith("new-")) && (
              <p>{labels[layer]} · 新对象将一次添加。</p>
            )}
            <ul className="change-list">
              {changes.map((c) => (
                <li key={JSON.stringify(c.path)}>
                  <code>
                    {JSON.stringify(c.path)} ·{" "}
                    {c.error
                      ? "待修正"
                      : c.value === undefined
                        ? c.removal === "local"
                          ? "移除本层配置"
                          : "恢复继承"
                        : `设置为 ${JSON.stringify(c.value)}`}
                  </code>
                  <button
                    disabled={locked}
                    onClick={() => {
                      const left = changes.filter((e) => e !== c);
                      retain(
                        left.length || create || layer.startsWith("new-")
                          ? { ...draft, changes: left }
                          : null,
                      );
                      setError("");
                    }}
                  >
                    撤下修改
                  </button>
                </li>
              ))}
            </ul>
            {issue && <p role="status">{issue}</p>}
            <div className="actions">
              <button
                disabled={locked || !editCount || stale || missing || !!next}
                onClick={() => save(true)}
              >
                校验配置
              </button>
              <button
                className="primary-action"
                disabled={locked || !editCount || stale || missing || !!next}
                onClick={() => save(false)}
              >
                保存并重载
              </button>
              <button
                disabled={locked}
                onClick={() =>
                  open(
                    create || layer.startsWith("new-")
                      ? {
                          ...target,
                          provider: create ? "" : provider,
                          model: "",
                        }
                      : target,
                  )
                }
              >
                放弃草稿
              </button>
            </div>
          </section>
        )}
      </section>
    </div>
  );
}

function ConfiguredModelList({
  models,
  overrides,
  select,
}: {
  models: readonly Json[];
  overrides: Record<string, Json>;
  select(layer: "definition" | "override", id: string): void;
}) {
  const ids = models.map((model) => record(model).id);
  const sharedId = ids.some(
    (id) => typeof id === "string" && Object.hasOwn(overrides, id),
  );
  const definitions = ids.map((id, index) =>
    typeof id === "string" ? (
      <button key={index} onClick={() => select("definition", id)}>
        {id}
      </button>
    ) : (
      <small key={index}>未识别模型条目（已保留）</small>
    ),
  );
  const entries = Object.keys(overrides).map((id) => (
    <button key={id} onClick={() => select("override", id)}>
      {id}
    </button>
  ));
  return (
    <div className="connection-list">
      {sharedId ? (
        <>
          <fieldset className="editor-fields flow compact">
            <legend>模型定义</legend>
            {definitions}
          </fieldset>
          <fieldset className="editor-fields flow compact">
            <legend>目录模型覆盖</legend>
            {entries}
          </fieldset>
        </>
      ) : (
        <>
          {definitions}
          {entries}
        </>
      )}
    </div>
  );
}
