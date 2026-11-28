import { useEffect, useState } from "react";
import type { AgentRef } from "@pakka/protocol/pocket";
import type { ContentRef, ConversationNote } from "@pakka/protocol/webui";
import type { PakkaConnection } from "../../../integrations/pakka/connection.js";
export type NotebookBindings = {
  connection: PakkaConnection;
  target: AgentRef;
  signal: AbortSignal;
};
export function noteTitle(n: { title: string; body: string }) {
  return (
    n.title.trim() || n.body.trim().split("\n")[0]?.slice(0, 64) || "未命名笔记"
  );
}
export function ContentRefPreview({
  source,
  bindings,
  revision,
  open,
}: {
  source: ContentRef;
  bindings: NotebookBindings;
  revision: number;
  open: (source: ContentRef) => void;
}) {
  const [preview, setPreview] = useState<{
    title: string;
    text: string;
  } | null>();
  const { connection, target, signal } = bindings;
  useEffect(() => {
    const c = new AbortController(),
      s = AbortSignal.any([signal, c.signal]);
    setPreview(undefined);
    async function read() {
      if (source.kind === "note") {
        const { note } = await connection.services.request(
          { op: "notebook.note", id: source.noteId, target },
          { signal: s },
        );
        return note
          ? { title: noteTitle(note), text: note.body.slice(0, 220) }
          : null;
      }
      const { chunk } = await connection.services.request(
        {
          op: "resource.content",
          reference: {
            kind: "conversation",
            sessionId: source.sessionId,
            conversationId: source.conversationId,
          },
          content: source.content,
          range: { offset: 0, length: 1024 },
        },
        { signal: s },
      );
      return {
        title:
          source.kind === "tool-result"
            ? `工具结果 · ${source.content.callId}`
            : `消息 · Entry ${source.content.entryId}`,
        text: chunk.text.slice(0, 220),
      };
    }
    void read().then(
      (p) => {
        if (!s.aborted) setPreview(p);
      },
      () => {
        if (!s.aborted) setPreview(null);
      },
    );
    return () => c.abort();
  }, [source, revision, connection, target, signal]);
  return preview ? (
    <>
      <strong>{preview.title}</strong>
      <p className="notebook-excerpt">{preview.text}</p>
      <button className="notebook-link" onClick={() => open(source)}>
        {source.kind === "note" ? "打开笔记" : "定位原内容"}
      </button>
    </>
  ) : (
    <p role="status">
      {preview === null ? "原内容暂不可用" : "正在读取原内容…"}
    </p>
  );
}
export type NoteDraft = {
  id: string;
  title: string;
  body: string;
  sources: ContentRef[];
  base: ConversationNote | null;
};
export const dirty = (d: NoteDraft) =>
  !d.base || d.title !== d.base.title || d.body !== d.base.body;
