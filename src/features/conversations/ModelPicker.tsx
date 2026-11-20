import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "@astryxdesign/core/Dialog";
import {
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutFooter,
} from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import type { ModelCatalogPage, ModelCatalogItem } from "@pakka/protocol/webui";
import type { UiContext } from "@pakka/webui-sdk";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";

export const modelKey = (model: Pick<ModelCatalogItem, "provider" | "id">) =>
  `${model.provider}/${model.id}`;
export function modelSelectionProblem(model: ModelCatalogItem): string | null {
  return model.authentication === "unconfigured"
    ? `${modelKey(model)} 尚未配置认证，不能选择；请先由后端配置凭据。本地无鉴权端点也可能需要原生占位 key。`
    : null;
}
export async function exactModel(
  connection: PakkaConnection,
  key: string,
  signal: AbortSignal,
): Promise<ModelCatalogItem> {
  const slash = key.indexOf("/");
  if (slash < 1 || slash === key.length - 1)
    throw new Error("请输入完整模型身份，例如 /model openai/gpt-4o。");
  const provider = key.slice(0, slash),
    id = key.slice(slash + 1);
  let offset = 0,
    revision: string | undefined;
  do {
    const { page } = await connection.services.request(
      {
        op: "model-catalog.read",
        query: {
          type: "chat",
          provider,
          query: id,
          offset,
          limit: 50,
          ...(revision ? { revision } : {}),
        },
      },
      { signal },
    );
    if (page.status !== "ready") throw new Error("模型目录当前不可得。");
    const found = page.models.find(
      (model) => model.provider === provider && model.id === id,
    );
    if (found) return found;
    if (page.nextOffset === null) break;
    offset = page.nextOffset;
    revision = page.revision;
  } while (!signal.aborted);
  signal.throwIfAborted();
  throw new Error(`未找到完整模型身份 ${key}；请检查提供商与 model ID。`);
}

export function ModelPicker({
  connection,
  ui,
  close,
  choose,
  disabled,
}: {
  connection: PakkaConnection;
  ui: UiContext;
  close(): void;
  choose(model: ModelCatalogItem): Promise<void>;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState<string | undefined>();
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState<ModelCatalogPage | null>(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  async function select(model: ModelCatalogItem) {
    const problem = modelSelectionProblem(model);
    if (problem) {
      setError(problem);
      return;
    }
    if (disabled) return;
    setError(null);
    try {
      await choose(model);
    } catch (reason) {
      if (!ui.signal.aborted) setError(describeFailure(reason));
    }
  }
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    const controller = new AbortController(),
      signal = AbortSignal.any([
        controller.signal,
        requestSignal(ui.signal, connection),
      ]);
    setPage(null);
    setError(null);
    setActive(0);
    void connection.services
      .request(
        {
          op: "model-catalog.read",
          query: {
            type: "chat",
            query,
            offset,
            limit: 40,
            ...(revision ? { revision } : {}),
          },
        },
        { signal },
      )
      .then((result) => {
        if (!signal.aborted) setPage(result.page);
      })
      .catch((reason) => {
        if (!signal.aborted) setError(describeFailure(reason));
      });
    return () => controller.abort();
  }, [connection, ui, query, offset, revision, refresh]);
  useEffect(() => {
    document
      .getElementById(`${listId}-${active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);
  return (
    <Dialog
      width="min(600px, calc(100vw - 32px))"
      padding={0}
      isOpen
      onOpenChange={(open) => {
        if (!open) close();
      }}
      aria-label="选择模型"
    >
      <Layout
        className="model-picker"
        padding={3}
        header={
          <LayoutHeader>
            <div className="flow">
              <h2>选择模型</h2>
              <TextInput
                ref={input}
                label="搜索模型"
                type="search"
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  setOffset(0);
                  setRevision(undefined);
                }}
                placeholder="名称、提供商或 model ID"
                controlClassName="touch-control"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={
                  page?.models[active] ? `${listId}-${active}` : undefined
                }
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    setActive((index) =>
                      Math.max(
                        0,
                        Math.min(
                          (page?.models.length ?? 1) - 1,
                          index + (event.key === "ArrowDown" ? 1 : -1),
                        ),
                      ),
                    );
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const model = page?.models[active];
                    if (model && !disabled) void select(model);
                  }
                }}
              />
              {error && (
                <div className="flow compact">
                  <p role="alert" className="error-text">
                    {error}
                  </p>
                  <Button
                    label="重新读取目录"
                    variant="ghost"
                    onClick={() => {
                      setOffset(0);
                      setRevision(undefined);
                      setRefresh((value) => value + 1);
                    }}
                  />
                </div>
              )}
            </div>
          </LayoutHeader>
        }
        content={
          <LayoutContent label="模型列表">
            {!page && !error && <p role="status">正在读取模型目录…</p>}
            {page?.status === "unavailable" && (
              <p role="status">目录加载未完成，当前展示已保存的目录。</p>
            )}
            <ul
              id={listId}
              className="model-options"
              role="listbox"
              aria-label="模型"
            >
              {page?.models.map((model, index) => (
                <li key={modelKey(model)} role="presentation">
                  <button
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    tabIndex={-1}
                    disabled={disabled}
                    onClick={() => {
                      void select(model);
                    }}
                  >
                    <strong>{model.name}</strong>
                    <span className="identifier">{modelKey(model)}</span>
                    <span className="muted">
                      {model.api}
                      {model.authentication === "unconfigured"
                        ? " · 尚未配置认证"
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {page && !page.models.length && (
              <p>没有匹配的模型。可以调整搜索或在设置中检查模型来源。</p>
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <div className="actions">
              <Button
                label="上一页"
                variant="ghost"
                isDisabled={offset === 0}
                onClick={() => {
                  setOffset((value) => Math.max(0, value - 40));
                  setRevision(page?.revision);
                }}
              />
              <Button
                label="下一页"
                variant="ghost"
                isDisabled={!page || page.nextOffset === null}
                onClick={() => {
                  setOffset(page?.nextOffset ?? 0);
                  setRevision(page?.revision);
                }}
              />
              <Button label="取消" variant="ghost" onClick={close} />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
