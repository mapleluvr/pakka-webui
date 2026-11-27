import { useLayoutEffect, useRef, useState } from "react";
import { TreeList, type TreeListItemData } from "@astryxdesign/core/TreeList";
import { modelLayer, type Draft } from "./connectionDraft.js";
import {
  publicEdit,
  record,
  replaceField,
  starts,
  valueAt,
  type FieldChange,
  type Json,
  type NativeValueType,
  type Path,
} from "./modelFields.js";
import {
  checkNativeKey,
  checkNativeText,
  nativeText,
  nativeValue,
} from "./nativeFieldValues.js";
import { managedFields, ModelOwnersGroup } from "./ManagedModelFields.js";
import {
  nativeRows,
  nativeSummary,
  regularLeaf,
  type NativeRow,
} from "./nativeRows.js";
import {
  NativeCreate,
  NativeValueEditor,
  initialText,
  type CreateType,
  type CreationInput,
} from "./NativeValueEditor.js";

const icons = {
  group: "M3 6h6l2 2h10v11H3z",
  value: "M6 3h9l3 3v15H6z M14 3v5h4",
  locked: "M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3",
  add: "M12 5v14 M5 12h14",
  close: "M5 5l14 14 M19 5L5 19",
};
function Icon({ kind }: { kind: keyof typeof icons }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d={icons[kind]} />
    </svg>
  );
}
const same = (a: Path, b: Path) => a.length === b.length && starts(a, b);
type Panel = { kind: "edit" | "create"; path: string[] };
export function AdvancedModelFields({
  draft,
  path: prefix,
  readBase,
  data,
  api,
  nonChat,
  update,
  onChange,
}: {
  draft: Draft;
  path: Path;
  readBase: Json | undefined;
  data: Record<string, Json>;
  api: string;
  nonChat: boolean;
  update(d: Draft | null): void;
  onChange(): void;
}) {
  const { base, target, changes } = draft,
    provider = !modelLayer(target.layer),
    override = target.layer === "override" || target.layer === "new-override",
    regular = { provider, nonChat, compatApi: api };
  const [groups, setGroups] = useState<string[][]>([]),
    [unchangedText, setUnchangedText] = useState(new Map<string, string>()),
    [creationInputs, setCreationInputs] = useState(
      new Map<string, CreationInput>(),
    ),
    [selected, setSelected] = useState<string[]>([]),
    [panel, setPanel] = useState<Panel | null>(null),
    [error, setError] = useState(""),
    [narrow, setNarrow] = useState(true),
    [open, setOpen] = useState(changes.some((c) => c.nativeType));
  const root = useRef<HTMLDetailsElement>(null),
    addRoot = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    returnTo = useRef<string[]>([]);
  const identity = (path: Path) =>
    JSON.stringify([target.layer, target.provider, target.model, ...path]);
  const owner = provider
    ? target.provider
    : `${target.provider} / ${target.model || "新增模型"}`;
  const managed = managedFields(base, prefix, provider),
    rows = nativeRows({
      view: base,
      prefix,
      original: readBase,
      data,
      changes,
      groups,
      own: managed.own,
      override,
      regular,
    });
  const byId = new Map<string, NativeRow>();
  const rowNodes = (rows: NativeRow[]): TreeListItemData[] =>
    rows.map((row) => {
      const { path, kind, change } = row,
        id = identity(path),
        key = path.at(-1)!;
      byId.set(id, row);
      const removed = !!change && change.value === undefined && !change.error;
      const state = change?.error
        ? "待修正"
        : removed
          ? "待移除"
          : change
            ? row.original === undefined
              ? "新增"
              : "已改"
            : "";
      const empty = kind === "group" && !row.children?.length;
      return {
        id,
        label: (
          <code data-native-key={id}>
            {key}
            <span className="sr-only">
              {state && ` · ${state}`}
              {kind === "locked" && " · 宿主管理"}
              {kind === "value" &&
                !change?.error &&
                !removed &&
                ` · ${nativeSummary(row.value)}`}
            </span>
          </code>
        ),
        startContent: <Icon kind={kind} />,
        isDisabled: kind === "locked",
        isSelected: same(path, selected),
        isExpanded:
          groups.some((g) => same(path, g)) ||
          changes.some(
            (c) => c.path.length > path.length && starts(c.path, path),
          ),
        onClick:
          kind === "locked"
            ? undefined
            : () => {
                setError("");
                setSelected(path);
                returnTo.current = path;
                setPanel(kind === "value" ? { kind: "edit", path } : null);
              },
        endContent:
          kind === "group" ? (
            <span className="native-branch-actions">
              {empty && groups.some((g) => same(g, path)) && (
                <button
                  type="button"
                  onKeyDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setGroups(groups.filter((g) => !same(g, path)));
                    focusPath(path.slice(0, -1));
                  }}
                >
                  撤销分组
                </button>
              )}
              <button
                type="button"
                className="native-add-child"
                aria-label={`在 ${key} 中添加参数`}
                onKeyDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  createAt(path);
                }}
              >
                <Icon kind="add" />
              </button>
            </span>
          ) : (
            <span className="native-row-value">
              {kind === "locked"
                ? "宿主管理"
                : [
                    state,
                    !change?.error && !removed ? nativeSummary(row.value) : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </span>
          ),
        ...(kind === "group"
          ? {
              children: empty
                ? [
                    {
                      id: JSON.stringify([id, "empty"]),
                      label: "暂无其他原生参数",
                      isDisabled: true,
                    },
                  ]
                : rowNodes(row.children!),
            }
          : {}),
      };
    });
  const items = rowNodes(rows),
    active =
      panel?.kind === "edit" ? byId.get(identity(panel.path)) : undefined;
  const visible =
    !!panel && (panel.kind === "create" || active?.kind === "value");
  function focusPath(path: string[]) {
    requestAnimationFrame(() => {
      const anchor = root.current
        ?.querySelector(`[data-native-key="${CSS.escape(identity(path))}"]`)
        ?.closest<HTMLElement>('[role="treeitem"]');
      (anchor ?? addRoot.current)?.focus();
    });
  }
  function close() {
    dialog.current?.close();
    setPanel(null);
    setError("");
    focusPath(returnTo.current);
  }
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    function measure() {
      const width = el!.getBoundingClientRect().width;
      setNarrow(width < 700);
      if (!width) setPanel(null);
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const sheet = dialog.current;
    if (narrow && visible && sheet && !sheet.open) {
      sheet.showModal();
      sheet
        .querySelector<HTMLElement>("[data-native-input]")
        ?.focus({ preventScroll: true });
    }
  }, [narrow, visible]);
  function createAt(path: string[]) {
    returnTo.current = path;
    setSelected(path);
    setError("");
    setPanel({ kind: "create", path });
  }
  function commit(entries: FieldChange[]) {
    onChange();
    update(
      entries.length || target.layer.startsWith("new-")
        ? { ...draft, changes: entries }
        : null,
    );
    setError("");
  }
  function attempt(fn: () => void) {
    try {
      fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "请检查参数。");
      return false;
    }
  }
  function setValue(path: string[], type: NativeValueType, text: string) {
    const absolute = [...prefix, ...path],
      original = valueAt(readBase, path);
    checkNativeText(absolute, type, text);
    let value = valueAt(data, path),
      problem: string | undefined;
    try {
      value = nativeValue(type, text);
    } catch (e) {
      problem = e instanceof Error ? e.message : "请修正参数值。";
    }
    // Security checks are never recoverable parse errors. Reject before retaining any input.
    publicEdit(
      base,
      value === undefined
        ? { path: absolute, remove: true }
        : { path: absolute, value },
    );
    // An equivalent spelling (4.0 at a baseline of 4) is not a change, but
    // normalizing it mid-keystroke would turn the next digit into another value.
    const spellingKey = JSON.stringify([base.version, identity(path)]);
    setUnchangedText((previous) => {
      const next = new Map(previous);
      if (
        !problem &&
        JSON.stringify(value) === JSON.stringify(original) &&
        text !== nativeText(original)
      )
        next.set(spellingKey, text);
      else next.delete(spellingKey);
      return next;
    });
    commit(
      replaceField(
        changes,
        { path, nativeType: type, value, text, error: problem },
        original,
      ),
    );
  }
  function add(key: string, type: CreateType) {
    if (panel?.kind !== "create") return;
    const parent = panel.path,
      path = [...parent, key],
      absolute = [...prefix, ...path];
    attempt(() => {
      checkNativeKey(key, parent, override);
      if (absolute.length > 16) throw Error("参数层级过深。");
      publicEdit(base, { path: absolute, remove: true });
      if (
        valueAt(readBase, path) !== undefined ||
        valueAt(data, path) !== undefined ||
        byId.has(identity(path))
      )
        throw Error("此位置已有同名参数。");
      if (regularLeaf(regular, path, type === "group" ? {} : undefined))
        throw Error("请在对应的常规表单中添加此参数。");
      if (type === "group") {
        setGroups([...groups, path]);
        close();
        setSelected(path);
        focusPath(path);
      } else {
        setValue(path, type, initialText[type]);
        returnTo.current = path;
        setSelected(path);
        setPanel({ kind: "edit", path });
      }
      setCreationInputs((previous) => {
        const next = new Map(previous);
        next.delete(identity(parent));
        return next;
      });
    });
  }
  function undo(row: NativeRow) {
    commit(changes.filter((c) => !same(c.path, row.path)));
    if (row.original === undefined) {
      returnTo.current = row.path.slice(0, -1);
      close();
    }
  }
  const pane = visible && panel && (
    <>
      <div className="native-editor-heading">
        <p className="native-path">
          {panel.kind === "create" && "添加到："}
          {[
            owner,
            ...(panel.kind === "create" ? panel.path : panel.path.slice(0, -1)),
          ].join(" › ")}
        </p>
        <button
          className="native-close"
          type="button"
          aria-label="返回参数树"
          title="返回参数树"
          onClick={close}
        >
          <Icon kind="close" />
        </button>
      </div>
      {panel.kind === "create" ? (
        <NativeCreate
          key={identity(panel.path)}
          entry={
            creationInputs.get(identity(panel.path)) ?? {
              name: "",
              type: "text",
            }
          }
          add={add}
          change={(entry) =>
            attempt(() => {
              checkNativeText([...prefix, ...panel.path], "text", entry.name);
              setError("");
              setCreationInputs(
                new Map(creationInputs).set(identity(panel.path), entry),
              );
            })
          }
        />
      ) : (
        active && (
          <NativeValueEditor
            key={identity(active.path)}
            row={active}
            unchangedText={unchangedText.get(
              JSON.stringify([base.version, identity(active.path)]),
            )}
            input={(type, text) =>
              attempt(() => setValue(active.path, type, text))
            }
            undo={() => undo(active)}
            remove={() =>
              attempt(() => {
                publicEdit(base, {
                  path: [...prefix, ...active.path],
                  remove: true,
                });
                commit(
                  replaceField(
                    changes,
                    {
                      path: active.path,
                      removal: "local",
                      nativeType: active.change?.nativeType ?? "text",
                    },
                    active.original,
                  ),
                );
              })
            }
          />
        )
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </>
  );
  const headerId = JSON.stringify(["headers"]),
    headerGroup = managed.groups.get(headerId),
    hasHeaders =
      managed.own.some((p) => same(p, ["headers"])) ||
      Object.hasOwn(record(readBase), "headers");
  return (
    <details
      ref={root}
      className="native-explorer"
      open={open}
      onToggle={(e) => {
        setOpen(e.currentTarget.open);
        if (!e.currentTarget.open) setPanel(null);
      }}
    >
      <summary>原生参数</summary>
      <div className="native-toolbar">
        <button ref={addRoot} type="button" onClick={() => createAt([])}>
          <Icon kind="add" />
          添加参数
        </button>
      </div>
      <div
        className={
          visible && !narrow ? "native-columns editing" : "native-columns"
        }
      >
        <div className="native-tree">
          <div className="native-columns-head">
            <span>参数</span>
            <span>本层值</span>
          </div>
          {items.length ? (
            <TreeList
              items={items}
              variant="lineGuides"
              aria-label="原生参数树"
            />
          ) : (
            <p className="muted">本对象没有额外的原生参数。</p>
          )}
          {headerGroup && (
            <ModelOwnersGroup
              group={headerGroup}
              hasProviderHeaders={hasHeaders}
            />
          )}
          {Array.from(
            managed.groups,
            ([key, group]) =>
              key !== headerId && (
                <ModelOwnersGroup
                  key={key}
                  group={group}
                  hasProviderHeaders={false}
                />
              ),
          )}
        </div>
        {visible && !narrow && (
          <aside
            aria-label="参数编辑器"
            className="native-inspector flow compact"
          >
            {pane}
          </aside>
        )}
      </div>
      {visible && narrow && (
        <dialog
          ref={dialog}
          className="native-sheet"
          aria-label="编辑原生参数"
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
        >
          <div className="flow compact">{pane}</div>
        </dialog>
      )}
    </details>
  );
}
