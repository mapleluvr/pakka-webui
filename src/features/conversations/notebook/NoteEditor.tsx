import { ContentPreview } from "../TextContent.js";
import { UiIcon } from "@pakka/webui-sdk/icons";
import { useState } from "react";
import type { ContentRef, ConversationNote } from "@pakka/protocol/webui";
import {
  ContentRefPreview,
  dirty,
  noteTitle,
  type NoteDraft,
  type NotebookBindings,
} from "./ContentRefPreview.js";
export function NoteEditor({
  draft,
  server,
  edit,
  change,
  back,
  pin,
  remove,
  save,
  locked,
  bindings,
  revision,
  open,
}: {
  draft: NoteDraft;
  server: ConversationNote | null | undefined;
  edit: boolean;
  change: (d: NoteDraft) => void;
  back: () => void;
  pin: () => void;
  remove: () => void;
  save: () => void;
  locked: boolean;
  bindings: NotebookBindings;
  revision: number;
  open: (r: ContentRef) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [reading, setReading] = useState(false);
  const conflict =
    !!draft.base &&
    server !== undefined &&
    draft.base.version !== server?.version;
  return (
    <div className="note-editor">
      <nav>
        <button onClick={back}>全部笔记</button>
        <button onClick={() => setReading((v) => !v)}>
          {reading ? "编辑正文" : "预览"}
        </button>
        {server && edit && (
          <button onClick={pin}>
            <UiIcon name="pin" />
            置顶
          </button>
        )}
      </nav>
      <input
        className="note-title"
        aria-label="笔记标题"
        placeholder="标题（可选）"
        maxLength={240}
        readOnly={!edit || locked}
        value={draft.title}
        onChange={(e) => change({ ...draft, title: e.target.value })}
      />
      {reading ? (
        <ContentPreview text={draft.body} format="markdown" />
      ) : (
        <textarea
          aria-label="笔记正文"
          placeholder="写下值得留下的想法…"
          maxLength={32768}
          value={draft.body}
          readOnly={!edit || locked}
          onChange={(e) => change({ ...draft, body: e.target.value })}
        />
      )}
      {draft.sources.map((r, i) => (
        <aside className="note-source" key={i}>
          <small>来源 · 可见片段摘录</small>
          <ContentRefPreview
            source={r}
            bindings={bindings}
            open={open}
            revision={revision}
          />
        </aside>
      ))}
      {conflict && (
        <section role="status">
          <strong>笔记已变化，本机草稿仍保留</strong>
          <details>
            <summary>原版本 · {draft.base!.version}</summary>
            <b>{draft.base!.title}</b>
            <pre>{draft.base!.body}</pre>
          </details>
          <details open>
            <summary>服务器当前版本</summary>
            <b>{server?.title}</b>
            <pre>{server?.body ?? "原笔记已删除"}</pre>
          </details>
          {server && (
            <button onClick={() => change({ ...draft, base: server })}>
              以当前版本继续编辑
            </button>
          )}
        </section>
      )}
      <footer>
        <small>{dirty(draft) ? "未保存" : "已保存"}</small>
        {edit && (
          <>
            <button
              disabled={locked}
              onClick={() => (draft.base ? setConfirm(true) : remove())}
            >
              {draft.base ? "删除" : "丢弃草稿"}
            </button>
            <button
              className="note-primary"
              disabled={
                locked ||
                conflict ||
                !dirty(draft) ||
                !draft.body.trim() ||
                server === undefined
              }
              onClick={save}
            >
              保存笔记
            </button>
          </>
        )}
      </footer>
      {confirm && (
        <section role="alert">
          <strong>删除「{noteTitle(draft)}」？</strong>
          <p>本对话中这条笔记的置顶入口也将一并移除。</p>
          <button onClick={() => setConfirm(false)}>保留</button>
          <button
            disabled={locked || conflict}
            onClick={() => {
              setConfirm(false);
              remove();
            }}
          >
            确认删除笔记
          </button>
        </section>
      )}
    </div>
  );
}
