import {
  preserveReaderAnchor,
  useNotebookScroll,
} from "./notebook-position.js";
import { LegacyReceiptRecovery } from "./LegacyReceiptRecovery.js";
import {
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import type { UiContext } from "@pakka/webui-sdk";
import { UiIcon } from "@pakka/webui-sdk/icons";
import {
  NOTEBOOK_PAGE_SIZE,
  type ContentRef,
  type ConversationNote,
  type NotebookAction,
  type NotebookResults,
} from "@pakka/protocol/webui";
import { describeFailure } from "../../../integrations/pakka/connection.js";
import {
  ConversationPanel,
  usePanelContext,
  useConversationPanelTrigger,
} from "../ConversationPanel.js";
import {
  dirty,
  type NoteDraft,
  type NotebookBindings,
} from "./ContentRefPreview.js";
import { NoteEditor } from "./NoteEditor.js";
import { NotesPanel } from "./NotesPanel.js";
import { PinsPanel } from "./PinsPanel.js";
import { useNotebookRequests } from "./useNotebookRequests.js";
import type { SourceAction, EntryRef } from "./source-actions.js";
import "./notebook.css";
export function NotebookTool({
  connection,
  target,
  ui,
  ref,
  locate,
  title,
}: {
  title: string;
  ref: Ref<SourceAction>;
  ui: UiContext;
  locate: (r: EntryRef) => void;
} & Omit<NotebookBindings, "signal">) {
  const id = useId(),
    button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [collection, tab] = useState<"notes" | "pins">("notes"),
    [selected, select] = useState<string | null>(null),
    [drafts, setDrafts] = useState(() => new Map<string, NoteDraft>()),
    [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [page, setPage] = useState<NotebookResults["notebook.list"] | null>(null),
    [server, setServer] = useState<ConversationNote | null>(),
    [error, setError] = useState("");
  const { activate } = usePanelContext();
  function toggle(next: boolean) {
    if (next !== open) preserveReaderAnchor(button.current);
    setOpen(next);
  }
  const trigger = useConversationPanelTrigger(
    "notes",
    open,
    () => toggle(true),
    () => toggle(false),
  );
  const visible = trigger["aria-expanded"];
  const lifetime = useMemo(
    () => new AbortController(),
    [ui, connection, target.sessionId, target.conversationId],
  );
  useEffect(() => () => lifetime.abort(), [lifetime]);
  const signal = useMemo(
    () => AbortSignal.any([ui.signal, connection.signal, lifetime.signal]),
    [ui, connection, lifetime],
  );
  const bindings = { target, connection, signal };
  const refresh = () => setRevision((n) => n + 1);
  const ops = useNotebookRequests(connection, target, signal, refresh);
  const change = (d: NoteDraft) =>
    setDrafts((prior) => new Map(prior).set(d.id, d));
  function drop(id: string) {
    setDrafts((prior) => {
      const next = new Map(prior);
      next.delete(id);
      return next;
    });
  }
  function switchTab(t: typeof collection) {
    tab(t);
    setOffset(0);
    if (collection !== t) setPage(null);
    setError("");
  }
  useEffect(() => {
    if (!visible) return;
    window.addEventListener("focus", refresh);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 15000);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [visible]);
  const panelContent = useNotebookScroll(
    JSON.stringify([collection, selected, query, offset]),
    visible && !!page,
  );
  const [highlight, setHighlight] = useState<string | null>(null);
  const noteId = collection === "notes" ? selected : null;
  useEffect(() => {
    if (!visible) {
      setPage(null);
      setServer(undefined);
      return;
    }
    const c = new AbortController(),
      s = AbortSignal.any([signal, c.signal]);
    setError("");
    async function load() {
      const [list, n] = await Promise.all([
        connection.services.request(
          {
            op: "notebook.list",
            target,
            collection,
            query: collection === "notes" ? query : "",
            offset,
          },
          { signal: s },
        ),
        noteId
          ? connection.services.request(
              { op: "notebook.note", target, id: noteId },
              { signal: s },
            )
          : null,
      ]);
      if (s.aborted) return;
      if (offset >= list.total && offset) {
        setOffset(
          Math.max(
            0,
            Math.floor((list.total - 1) / NOTEBOOK_PAGE_SIZE) *
              NOTEBOOK_PAGE_SIZE,
          ),
        );
        return;
      }
      setPage(list);
      setServer(n?.note);
      if (n?.note) {
        const note = n.note;
        setDrafts((prev) => {
          const old = prev.get(note.id);
          if (old && dirty(old)) return prev;
          return new Map(prev).set(note.id, { ...note, base: note });
        });
      }
    }
    void load().catch((e) => {
      if (!s.aborted) {
        setPage(null);
        setServer(undefined);
        setError(describeFailure(e));
      }
    });
    return () => c.abort();
  }, [
    visible,
    signal,
    target,
    noteId,
    collection,
    offset,
    query,
    revision,
    connection,
  ]);
  const noteRef = (id: string): ContentRef => ({
    sessionId: target.sessionId,
    conversationId: target.conversationId,
    kind: "note",
    noteId: id,
  });
  function start(r?: EntryRef, text = "") {
    const d: NoteDraft = {
      id: crypto.randomUUID(),
      title: "",
      body: text,
      sources: r ? [r] : [],
      base: null,
    };
    change(d);
    setServer(null);
    select(d.id);
    switchTab("notes");
  }
  async function pin(r: ContentRef) {
    switchTab("pins");
    const receipt = await ops.write({ kind: "pin", target: r });
    if (receipt) {
      const first = await connection.services.request(
        {
          op: "notebook.list",
          collection: "pins",
          query: "",
          target,
          offset: 0,
        },
        { signal },
      );
      let p = first;
      while (
        !p.pins.some((pin) => pin.id === receipt.id) &&
        p.offset + p.pins.length < p.total &&
        p.pins.length
      )
        p = await connection.services.request(
          {
            op: "notebook.list",
            collection: "pins",
            query: "",
            target,
            offset: p.offset + p.pins.length,
          },
          { signal },
        );
      if (!signal.aborted) {
        setOffset(p.offset);
        setHighlight(receipt.id);
      }
    }
  }
  function tryPin(r: ContentRef) {
    void pin(r).catch((e) => {
      if (!signal.aborted) setError(describeFailure(e));
    });
  }
  useImperativeHandle(ref, () => (mode, r, excerpt) => {
    toggle(true);
    activate("notes");
    if (mode === "draft") start(r, excerpt);
    else tryPin(r);
  });
  function edit(id: string, n?: ConversationNote) {
    if (n && !drafts.has(id)) change({ ...n, base: n });
    setServer(undefined);
    select(id);
    tab("notes");
  }
  function openRef(r: ContentRef) {
    if (r.kind === "note") {
      edit(r.noteId);
      return;
    }
    locate(r);
    setOpen(false);
  }
  const draft = selected ? drafts.get(selected) : undefined;
  const saveAction: NotebookAction | undefined = draft
    ? {
        kind: "save",
        id: draft.id,
        expectedVersion: draft.base?.version ?? 0,
        title: draft.title,
        body: draft.body,
        sources: draft.sources,
      }
    : undefined;
  function accepted(id: string) {
    drop(id);
    select(null);
    refresh();
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        className="reader-action notebook-entry"
        title="笔记与置顶"
        aria-label="笔记与置顶"
        aria-controls={open ? id : undefined}
        {...trigger}
      >
        <UiIcon name="file" />
      </button>
      {open && (
        <ConversationPanel
          id={id}
          kind="notes"
          title="笔记与置顶"
          subtitle={title}
          trigger={button}
          onClose={() => toggle(false)}
        >
          <div className="notebook" ref={panelContent}>
            <LegacyReceiptRecovery connection={connection} target={target} />
            <div className="notebook-tabs" role="tablist">
              {(["notes", "pins"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={t === collection}
                  onClick={() => switchTab(t)}
                >
                  {t === "notes" ? "笔记" : "置顶"}
                  {t === page?.collection && <small>{page.total}</small>}
                </button>
              ))}
            </div>
            {(error || ops.error) && (
              <p role="alert">
                {error || ops.error} <button onClick={refresh}>刷新</button>
              </p>
            )}
            {[...ops.pending].map(([scope, r]) => (
              <div key={scope} role="status">
                {r === "unreadable"
                  ? "原请求不可读"
                  : `待核对 · ${r.requestId}`}
                <button
                  disabled={r === "unreadable"}
                  onClick={async () => {
                    if (
                      r !== "unreadable" &&
                      (await ops.lookup(scope)) &&
                      (r.action.kind === "save" || r.action.kind === "delete")
                    )
                      accepted(r.action.id);
                  }}
                >
                  查询原请求
                </button>
              </div>
            ))}
            {!page && !error && <p role="status">正在读取…</p>}
            {page && collection === "pins" && (
              <PinsPanel
                highlight={highlight}
                pins={page.pins}
                bindings={bindings}
                revision={revision}
                open={openRef}
                canEdit={page.canEdit}
                move={async (p) => {
                  try {
                    const first = await connection.services.request(
                      {
                        op: "notebook.list",
                        target,
                        collection: "pins",
                        offset: 0,
                        query: "",
                      },
                      { signal },
                    );
                    if (first.pins[0] && first.pins[0].id !== p.id)
                      await ops.write({
                        kind: "move",
                        id: p.id,
                        orderVersion: page.orderVersion,
                        beforeId: first.pins[0].id,
                        expectedVersion: p.version,
                      });
                    setOffset(0);
                  } catch (e) {
                    setError(describeFailure(e));
                  }
                }}
                unpin={(p) =>
                  void ops.write({
                    kind: "unpin",
                    id: p.id,
                    expectedVersion: p.version,
                  })
                }
              />
            )}
            {page &&
              collection === "notes" &&
              (selected ? (
                draft && saveAction ? (
                  <NoteEditor
                    key={selected}
                    draft={draft}
                    server={server}
                    bindings={bindings}
                    revision={revision}
                    open={openRef}
                    locked={ops.locked(saveAction)}
                    edit={page.canEdit}
                    change={change}
                    back={() => select(null)}
                    pin={() => tryPin(noteRef(selected))}
                    save={async () => {
                      if (await ops.write(saveAction)) accepted(selected);
                    }}
                    remove={async () => {
                      if (
                        !draft.base ||
                        (await ops.write({
                          kind: "delete",
                          id: selected,
                          expectedVersion: draft.base.version,
                        }))
                      )
                        accepted(selected);
                    }}
                  />
                ) : (
                  <p>
                    {server === null ? "原笔记不可用" : "正在读取笔记…"}{" "}
                    <button onClick={() => select(null)}>返回全部笔记</button>
                  </p>
                )
              ) : (
                <NotesPanel
                  notes={page.notes}
                  drafts={drafts}
                  query={query}
                  canEdit={page.canEdit}
                  setQuery={(q) => {
                    setQuery(q);
                    setOffset(0);
                  }}
                  create={() => start()}
                  select={edit}
                  pin={(id) => tryPin(noteRef(id))}
                />
              ))}
            {page &&
              (collection === "pins" || !selected) &&
              page.total > NOTEBOOK_PAGE_SIZE && (
                <nav>
                  <button
                    disabled={!offset}
                    onClick={() =>
                      setOffset((n) => Math.max(0, n - NOTEBOOK_PAGE_SIZE))
                    }
                  >
                    上一页
                  </button>
                  <button
                    disabled={offset + NOTEBOOK_PAGE_SIZE >= page.total}
                    onClick={() => setOffset((n) => n + NOTEBOOK_PAGE_SIZE)}
                  >
                    下一页
                  </button>
                </nav>
              )}
          </div>
        </ConversationPanel>
      )}
    </>
  );
}
