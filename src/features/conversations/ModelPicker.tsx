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

import {
  modelKey,
  modelSelectionProblem,
  modelIdentityKey,
} from "./modelCatalog.js";
import {
  sameModel,
  type PersonalModelDefaults,
} from "../settings/usePersonalModelDefaults.js";
import { PickerDefaultAction } from "./PickerDefaultAction.js";
import { useModelHold } from "./useModelHold.js";
function handlePickerShortcut(
  event: React.KeyboardEvent,
  input: HTMLInputElement | null,
  remember: (() => void) | undefined,
) {
  if (event.key !== "Enter" && event.key !== " ") return;
  const modified =
    event.ctrlKey || event.metaKey || event.altKey || event.shiftKey;
  if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
    event.stopPropagation();
    if (event.target !== input) event.preventDefault();
    return;
  }
  if (
    (event.key === "Enter" || event.target !== input) &&
    (event.repeat || modified)
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (
      event.key === "Enter" &&
      !event.repeat &&
      event.ctrlKey !== event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      remember
    )
      remember();
  }
}

export function ModelPicker({
  connection,
  ui,
  close,
  choose,
  disabled,
  personal,
  currentModel,
}: {
  connection: PakkaConnection;
  ui: UiContext;
  close(): void;
  choose(model: ModelCatalogItem): Promise<void>;
  disabled: boolean;
  personal?: PersonalModelDefaults;
  currentModel?: string;
}) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState<string | undefined>();
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState<ModelCatalogPage | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const active = Math.max(
      0,
      page?.models.findIndex((item) => modelIdentityKey(item) === highlight) ??
        0,
    ),
    model = page?.models[active];
  const [confirmation, setConfirmation] = useState<{
    item: ModelCatalogItem;
    version: number;
  } | null>(null);
  const list = useRef<HTMLUListElement>(null),
    owner = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // A workspace may keep the page mounted while hiding it. Its portal must not outlive that page's visibility.
    const marker = owner.current?.parentElement;
    if (!marker) return;
    if (marker.closest("[hidden]")) {
      close();
      return;
    }
    const observer = new MutationObserver(() => {
      if (marker.closest("[hidden]")) close();
    });
    for (let node: HTMLElement | null = marker; node; node = node.parentElement)
      observer.observe(node, { attributes: true, attributeFilter: ["hidden"] });
    return () => observer.disconnect();
  }, [close]);
  const confirm =
    !!confirmation &&
    confirmation.item === model &&
    confirmation.version === personal?.defaults?.version;
  function remember(item: ModelCatalogItem, agreed = false) {
    if (
      !personal ||
      !personal.defaults ||
      personal.busy ||
      personal.pending ||
      page?.status !== "ready"
    )
      return;
    setHighlight(modelIdentityKey(item));
    setError(null);
    if (sameModel(personal.defaults.model, item)) return;
    const problem = modelSelectionProblem(item);
    if (problem) {
      setError(problem);
      return;
    }
    const { thinkingLevel, version } = personal.defaults;
    const compatible =
      thinkingLevel === null || item.thinkingLevels.includes(thinkingLevel);
    if (!compatible && !(agreed && confirm)) {
      setConfirmation({ item, version });
      return;
    }
    setConfirmation(null);
    void personal.save({
      model: { provider: item.provider, id: item.id },
      thinkingLevel: compatible ? thinkingLevel : null,
    });
  }
  const suppressClick = useModelHold(
    list,
    page,
    personal ? remember : undefined,
  );
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
    setHighlight(null);
    setConfirmation(null);
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
  return (
    <>
      <span hidden ref={owner} />
      <Dialog
        width="min(600px, calc(100vw - 32px))"
        padding={0}
        isOpen
        onOpenChange={(open) => {
          if (!open) close();
        }}
        aria-label="选择模型"
      >
        <div
          onClickCapture={suppressClick}
          onKeyDownCapture={(e) =>
            handlePickerShortcut(
              e,
              input.current,
              model && personal ? () => remember(model) : undefined,
            )
          }
        >
          <Layout
            className={
              personal
                ? "model-picker conversation-model-picker"
                : "model-picker"
            }
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
                      setPage(null);
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
                      if (
                        event.nativeEvent.isComposing ||
                        event.nativeEvent.keyCode === 229 ||
                        event.ctrlKey ||
                        event.metaKey ||
                        event.altKey ||
                        event.shiftKey
                      )
                        return;
                      if (
                        event.key === "ArrowDown" ||
                        event.key === "ArrowUp"
                      ) {
                        event.preventDefault();
                        const n = Math.max(
                          0,
                          Math.min(
                            (page?.models.length ?? 1) - 1,
                            active + (event.key === "ArrowDown" ? 1 : -1),
                          ),
                        );
                        if (page?.models[n]) {
                          setHighlight(modelIdentityKey(page.models[n]));
                          setConfirmation(null);
                          document
                            .getElementById(`${listId}-${n}`)
                            ?.scrollIntoView({ block: "nearest" });
                        }
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
                  ref={list}
                  id={listId}
                  className="model-options"
                  role="listbox"
                  aria-label="模型"
                >
                  {page?.models.map((model, index) => (
                    <li key={modelIdentityKey(model)} role="presentation">
                      <button
                        id={`${listId}-${index}`}
                        role="option"
                        aria-selected={index === active}
                        tabIndex={-1}
                        data-model={modelIdentityKey(model)}
                        disabled={disabled && !personal}
                        onFocus={() => {
                          if (index !== active) {
                            setHighlight(modelIdentityKey(model));
                            setConfirmation(null);
                          }
                        }}
                        onClick={() => {
                          void select(model);
                        }}
                      >
                        <strong>{model.name}</strong>
                        <span className="identifier">{modelKey(model)}</span>
                        <span className="muted">
                          {model.api}
                          {personal && currentModel === modelKey(model)
                            ? " · 当前对话"
                            : ""}
                          {personal?.defaults &&
                          sameModel(model, personal.defaults.model)
                            ? " · 我的默认"
                            : ""}
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
                {personal && (
                  <PickerDefaultAction
                    personal={personal}
                    choices={page?.models ?? []}
                    canSet={page?.status === "ready"}
                    highlight={(m) => {
                      setHighlight(modelIdentityKey(m));
                      setConfirmation(null);
                      document
                        .getElementById(`${listId}-${page?.models.indexOf(m)}`)
                        ?.scrollIntoView({ block: "nearest" });
                    }}
                    model={model}
                    confirm={confirm}
                    onChoose={() => model && remember(model)}
                    onConfirm={() => model && remember(model, true)}
                    onCancel={() => setConfirmation(null)}
                    currentDisabled={disabled}
                  />
                )}
                <div className="actions">
                  <Button
                    label="上一页"
                    variant="ghost"
                    isDisabled={offset === 0}
                    onClick={() => {
                      setPage(null);
                      setOffset((value) => Math.max(0, value - 40));
                      setRevision(page?.revision);
                    }}
                  />
                  <Button
                    label="下一页"
                    variant="ghost"
                    isDisabled={!page || page.nextOffset === null}
                    onClick={() => {
                      setPage(null);
                      setOffset(page?.nextOffset ?? 0);
                      setRevision(page?.revision);
                    }}
                  />
                  <Button label="取消" variant="ghost" onClick={close} />
                </div>
              </LayoutFooter>
            }
          />
        </div>
      </Dialog>
    </>
  );
}
