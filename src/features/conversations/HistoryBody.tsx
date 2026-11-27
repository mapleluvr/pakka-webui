import { useLayoutEffect, useMemo, useState, type RefObject } from "react";
import type { ConversationInputHistory } from "@pakka/protocol/webui";
import {
  inlineInputStatus,
  inputStatus,
  ownEntryStatuses,
} from "./input-labels.js";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { MoreIcon, ReadingIcon } from "./ReadingIcons.js";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { PocketSnapshot } from "@pakka/protocol/pocket";
import { TextContent, type ContentBindings } from "./TextContent.js";
import { ErrorRun } from "./ErrorRun.js";
import { ReplyIssueCard } from "./ReplyIssueCard.js";
import { ActivityStrip } from "./ActivityStrip.js";
import { MessageBody } from "./ToolCard.js";
import { matchRows, transcriptRows } from "./transcript.js";
import { TranscriptWindow } from "./TranscriptWindow.js";

export function HistoryBody({
  entries,
  inputs,
  processingLive,
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
  inputs: ConversationInputHistory | null;
  processingLive: boolean;
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
  const statusByEntry = useMemo(
    () =>
      ownEntryStatuses(
        entries,
        inputs,
        bindings.connection.person.id,
        bindings.conversation,
      ),
    [inputs, entries, bindings.connection.person.id, bindings.conversation],
  );
  const selected = useMemo(() => matchRows(rows, query), [rows, query]);
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
              {selected.length} / {rows.length} 段内容匹配。
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
          const status =
            row.kind === "message" &&
            row.message.role === "user" &&
            row.source === bindings.conversation.conversationId &&
            row.entryId
              ? statusByEntry.get(row.entryId)
              : null;
          const userLabel = status ? "你" : "用户";
          const signal = inlineInputStatus(status, processingLive);
          const forkMenu = (entryId?: string) =>
            onFork && entryId ? (
              <MoreMenu
                label="消息操作"
                icon={<MoreIcon />}
                alignment="end"
                items={[
                  { label: "从这里分叉", onClick: () => onFork(entryId) },
                ]}
              />
            ) : undefined;
          const menu = forkMenu(row.entryId);
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
              {row.kind === "replyIssue" && (
                <ErrorRun
                  items={row.occurrences}
                  render={(item) =>
                    item.kind === "replyIssue" && (
                      <ReplyIssueCard
                        issue={item.issue}
                        identity={item.key}
                        actions={forkMenu(item.entryId)}
                        {...bindings}
                      />
                    )
                  }
                />
              )}
              {row.kind === "activity" && (
                <ActivityStrip
                  group={row}
                  onFork={onFork}
                  filtering={!!query}
                  {...bindings}
                />
              )}
              {row.kind === "display" && (
                <div className="message display">
                  <TextContent
                    text={row.display.text}
                    reference={row.display.contentReference}
                    {...bindings}
                  />
                </div>
              )}
              {row.kind === "message" && (
                <div className={`message message-${row.message.role}`}>
                  <MessageBody
                    heading={
                      <>
                        {row.message.role === "user" ? userLabel : "Assistant"}
                        {signal && (
                          <span
                            className="message-input-status"
                            data-state={signal}
                          >
                            {signal === "processing" ? (
                              <>
                                <ReadingIcon name="processing" />
                                处理中
                              </>
                            ) : (
                              inputStatus[signal]
                            )}
                          </span>
                        )}
                        {row.message.role === "assistant" &&
                          row.isLive &&
                          live?.busy &&
                          " · 正在生成"}
                      </>
                    }
                    extraActions={menu}
                    message={row.message}
                    identity={row.key}
                    {...bindings}
                  />
                </div>
              )}
              {row.kind === "display" && menu && (
                <div className="entry-actions">{menu}</div>
              )}
            </section>
          );
        }}
      />
    </div>
  );
}
