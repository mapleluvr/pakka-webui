import { UiIcon } from "@pakka/webui-sdk/icons";
import type { ConversationNote } from "@pakka/protocol/webui";
import { dirty, noteTitle, type NoteDraft } from "./ContentRefPreview.js";
export function NotesPanel({
  notes,
  drafts,
  query,
  canEdit,
  setQuery,
  create,
  select,
  pin,
}: {
  notes: ConversationNote[];
  drafts: Map<string, NoteDraft>;
  query: string;
  canEdit: boolean;
  setQuery: (q: string) => void;
  create: () => void;
  select: (id: string, n?: ConversationNote) => void;
  pin: (id: string) => void;
}) {
  const local = [...drafts.values()].filter(
    (d) =>
      !d.base &&
      !notes.some((n) => n.id === d.id) &&
      (d.title + " " + d.body).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="notebook-tools">
        <input
          aria-label="搜索笔记"
          placeholder="搜索笔记"
          maxLength={240}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {canEdit && (
          <button className="note-primary" onClick={create}>
            新建笔记
          </button>
        )}
      </div>
      {local.map((d) => (
        <button className="note-row" key={d.id} onClick={() => select(d.id)}>
          <strong>{noteTitle(d)}</strong>
          <small>未保存</small>
        </button>
      ))}
      {notes.map((n) => (
        <article className="note-row" key={n.id}>
          <button className="note-main" onClick={() => select(n.id, n)}>
            <strong>{noteTitle(n)}</strong>
            <p className="notebook-excerpt">{n.body}</p>
            <small>
              {new Date(n.updatedAt).toLocaleString()}
              {n.sources.length ? ` · ${n.sources.length} 条来源` : ""}
              {drafts.has(n.id) && dirty(drafts.get(n.id)!) ? " · 未保存" : ""}
            </small>
          </button>
          {canEdit && (
            <button
              className="reader-action"
              title="置顶笔记"
              aria-label={"置顶 " + noteTitle(n)}
              onClick={() => pin(n.id)}
            >
              <UiIcon name="pin" />
            </button>
          )}
        </article>
      ))}
      {notes.length > 0 && (
        <p className="notebook-tip">
          笔记随这段对话保存。置顶常用的笔记，随时回来接着读。
        </p>
      )}
      {!notes.length && !local.length && (
        <p className="notebook-empty">
          {query
            ? "没有匹配的笔记"
            : "还没有笔记。记录一个想法，或从消息菜单摘录内容。"}
        </p>
      )}
    </>
  );
}
