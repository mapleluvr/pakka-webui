import { useEffect, useRef } from "react";
import { UiIcon } from "@pakka/webui-sdk/icons";
import type { ContentRef, ConversationPin } from "@pakka/protocol/webui";
import {
  ContentRefPreview,
  type NotebookBindings,
} from "./ContentRefPreview.js";
export function PinsPanel({
  pins,
  highlight,
  bindings,
  revision,
  open,
  canEdit,
  move,
  unpin,
}: {
  pins: ConversationPin[];
  highlight: string | null;
  bindings: NotebookBindings;
  revision: number;
  open: (r: ContentRef) => void;
  canEdit: boolean;
  move: (p: ConversationPin) => void;
  unpin: (p: ConversationPin) => void;
}) {
  const active = useRef<HTMLElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({ block: "nearest" });
  }, [highlight, pins]);
  return (
    <>
      <p className="muted">常用的笔记、消息与工具结果，都可以留在这里。</p>
      {pins.map((p) => (
        <article
          className="pin-card"
          key={p.id}
          ref={p.id === highlight ? active : null}
          data-selected={p.id === highlight || undefined}
        >
          <header>
            <UiIcon
              name={
                p.target.kind === "note"
                  ? "file"
                  : p.target.kind === "tool-result"
                    ? "terminal"
                    : "link"
              }
            />
            <small>
              {p.target.kind === "note"
                ? "笔记"
                : p.target.kind === "message"
                  ? "消息"
                  : "工具结果"}
            </small>
            {canEdit && (
              <button
                className="reader-action"
                title="取消置顶"
                aria-label="取消置顶"
                onClick={() => unpin(p)}
              >
                <UiIcon name="pin" />
              </button>
            )}
          </header>
          <ContentRefPreview
            source={p.target}
            bindings={bindings}
            revision={revision}
            open={open}
          />
          {canEdit && <button onClick={() => move(p)}>移至首位</button>}
        </article>
      ))}
      {!pins.length && (
        <p className="notebook-empty">
          还没有置顶内容。从消息菜单或笔记条目选择「置顶」。
        </p>
      )}
    </>
  );
}
