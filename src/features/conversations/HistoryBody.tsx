import { useLayoutEffect, useMemo, useState, type RefObject } from "react";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { MoreIcon } from "./ReadingIcons.js";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { PocketSnapshot } from "@pakka/protocol/pocket";
import { TextContent, type ContentBindings } from "./TextContent.js";
import { MessageBody, ToolCard } from "./ToolCard.js";
import { rowPreview, transcriptRows } from "./transcript.js";
import { TranscriptWindow } from "./TranscriptWindow.js";

export function HistoryBody({
  entries,
  live,
  onFork,
  scroll,
  controls,
  followRevision,
  ...bindings
}: ContentBindings & {
  followRevision: number;
  scroll: RefObject<HTMLDivElement | null>;
  controls?: HTMLElement | null;
  entries: PocketSnapshot["entries"];
  live?: PocketSnapshot["live"];
  onFork?(entryId: string): void;
}) {
  const [query, setQuery] = useState("");
  useLayoutEffect(() => {
    if (followRevision > 0) setQuery("");
  }, [followRevision]);
  const rows = useMemo(
    () => transcriptRows(entries, live, bindings.conversation),
    [entries, live, bindings.conversation],
  );
  const selected = useMemo(() => {
    const needle = query.toLocaleLowerCase();
    return needle
      ? rows.filter((row) =>
          rowPreview(row).toLocaleLowerCase().includes(needle),
        )
      : rows;
  }, [rows, query]);
  return (
    <div className="transcript">
      {rows.length > 0 && (
        <div className="history-search">
          <TextInput
            label="搜索本页预览"
            isLabelHidden
            placeholder="搜索本页预览"
            value={query}
            onChange={setQuery}
            autoComplete="off"
            controlClassName="touch-control"
          />
          <details className="history-search-scope">
            <summary>搜索范围</summary>
            <p className="muted">
              仅搜索当前页已载入的预览，不区分大小写；未载入的历史与截断正文不在此范围。单条完整内容请使用“原文与搜索”。
            </p>
          </details>
          {query && (
            <p role="status">
              {selected.length} / {rows.length} 条内容匹配。
            </p>
          )}
        </div>
      )}
      {!rows.length && <p className="muted">此页还没有保存的内容。</p>}
      <TranscriptWindow
        followRevision={followRevision}
        scroll={scroll}
        controls={controls}
        rows={selected}
        render={(row) => {
          const menu =
            onFork && row.entryId ? (
              <MoreMenu
                label="消息操作"
                icon={<MoreIcon />}
                alignment="end"
                items={[
                  {
                    label: "从这里分叉",
                    onClick: () => {
                      if (row.entryId) onFork(row.entryId);
                    },
                  },
                ]}
              />
            ) : undefined;
          return (
            <section
              className="history-entry"
              data-live={row.isLive || undefined}
            >
              {row.source !== bindings.conversation.conversationId && (
                <p className="muted identifier">
                  来自分叉源 Conversation {row.source}
                </p>
              )}
              {row.kind === "tool" ? (
                <ToolCard
                  tool={row.tool}
                  identity={row.key}
                  source={row.source}
                  {...bindings}
                />
              ) : row.kind === "display" ? (
                <div className="message display">
                  <TextContent
                    text={row.display.text}
                    reference={row.display.contentReference}
                    {...bindings}
                  />
                </div>
              ) : (
                <div className={`message message-${row.message.role}`}>
                  <MessageBody
                    heading={
                      <>
                        {row.message.role === "user" ? "User" : "Assistant"}
                        {row.isLive && live?.busy && " · 正在生成"}
                      </>
                    }
                    extraActions={menu}
                    message={row.message}
                    identity={row.key}
                    {...bindings}
                  />
                </div>
              )}
              {row.kind !== "message" && menu && (
                <div className="entry-actions">{menu}</div>
              )}
            </section>
          );
        }}
      />
      {live && (
        <p role="status" className="muted">
          {live.busy ? "正在执行" : "当前空闲"}
        </p>
      )}
    </div>
  );
}
