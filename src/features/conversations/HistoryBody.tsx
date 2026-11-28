import { LocatedContent } from "./notebook/LocatedContent.js";
import {
  sourceActions,
  type EntryRef,
  type SourceAction,
} from "./notebook/source-actions.js";
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  ConversationPanel,
  useConversationPanelTrigger,
} from "./ConversationPanel.js";
import { createPortal } from "react-dom";
import { ComposerIcon } from "./ComposerIcons.js";
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
  onSource,
  located,
  clearLocated,
  entries,
  inputs,
  processingLive,
  live,
  onFork,
  scroll,
  controls,
  searchTarget,
  followRevision,
  ...bindings
}: ContentBindings & {
  followRevision: number;
  scroll: RefObject<HTMLElement | null>;
  controls?: HTMLElement | null;
  searchTarget?: HTMLElement | null;
  onSource?: SourceAction;
  located: EntryRef | null;
  clearLocated: () => void;
  entries: PocketSnapshot["entries"];
  inputs: ConversationInputHistory | null;
  processingLive: boolean;
  live?: PocketSnapshot["live"];
  onFork?(entryId: string): void;
}) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const panelId = useId();
  const searchButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  function closeSearch() {
    setSearchOpen(false);
    setQuery("");
  }
  const searchTrigger = useConversationPanelTrigger(
    "search",
    searchOpen,
    () => setSearchOpen(true),
    closeSearch,
  );
  const searchLabel = query ? "搜索本页预览（筛选中）" : "搜索本页预览";
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
  const destination = useMemo(
    () =>
      located
        ? rows.find((row) =>
            row.kind === "message"
              ? typeof row.message.content === "string"
                ? row.message.contentReference?.id === located.content.id
                : row.message.content.some(
                    (p) => p.contentReference?.id === located.content.id,
                  )
              : row.kind === "activity" &&
                row.items.some(
                  (item) =>
                    item.kind === "tool" &&
                    item.tool.callId === located.content.callId &&
                    item.tool.result &&
                    (typeof item.tool.result.content === "string"
                      ? item.tool.result.contentReference?.id ===
                        located.content.id
                      : item.tool.result.content.some(
                          (p) => p.contentReference?.id === located.content.id,
                        )),
                ),
          )?.key
        : null,
    [located, rows],
  );
  useLayoutEffect(() => {
    if (located) setQuery("");
  }, [located]);
  let searchStatus = "等待输入关键词";
  if (query)
    searchStatus = selected.length
      ? `匹配 ${selected.length} 段`
      : "没有匹配的段落";
  return (
    <div className="transcript">
      {searchTarget &&
        createPortal(
          <button
            type="button"
            className="reader-action"
            aria-label={searchLabel}
            title={searchLabel}
            ref={searchButton}
            data-filtered={!!query || undefined}
            aria-controls={searchOpen ? panelId : undefined}
            {...searchTrigger}
          >
            <ComposerIcon name="search" />
            {query && <small>筛选中</small>}
          </button>,
          searchTarget,
        )}
      {searchOpen && (
        <ConversationPanel
          kind="search"
          id={panelId}
          title="搜索本页预览"
          trigger={searchButton}
          initialFocus={searchInput}
          onClose={closeSearch}
        >
          <div className="preview-search-field">
            <TextInput
              ref={searchInput}
              label="搜索本页预览"
              isLabelHidden
              placeholder="输入关键词"
              value={query}
              onChange={setQuery}
              autoComplete="off"
              controlClassName="touch-control"
            />
            <button
              type="button"
              className="reader-action"
              disabled={!query}
              onClick={() => {
                setQuery("");
                searchInput.current?.focus();
              }}
            >
              清空
            </button>
          </div>
          <p role="status" className="preview-search-count">
            {searchStatus} · 本页 {rows.length} 段预览
          </p>
          <details className="panel-details">
            <summary>搜索范围</summary>
            <p>
              仅搜索当前页已载入的预览，不区分大小写；未载入的历史与截断正文不在此范围。单条完整内容请使用“原文与搜索”。
            </p>
          </details>
        </ConversationPanel>
      )}
      {!rows.length && <p className="muted">此页还没有保存的内容。</p>}
      <TranscriptWindow
        locateKey={destination}
        searchQuery={searchOpen ? query : null}
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
          const forkMenu = (
            entryId?: string,
            sourceItems: ReturnType<typeof sourceActions> = [],
          ) =>
            (onFork && entryId) || sourceItems.length ? (
              <MoreMenu
                label="消息操作"
                icon={<MoreIcon />}
                alignment="end"
                items={[
                  ...sourceItems,
                  ...(onFork && entryId
                    ? [{ label: "从这里分叉", onClick: () => onFork(entryId) }]
                    : []),
                ]}
              />
            ) : undefined;
          const menu = forkMenu(
            row.entryId,
            row.kind === "message"
              ? sourceActions(row.message, bindings.conversation, onSource)
              : [],
          );
          return (
            <section
              className="history-entry"
              data-live={row.isLive || undefined}
            >
              {located && destination === row.key && (
                <LocatedContent
                  key={located.content.id}
                  source={located}
                  bindings={bindings}
                  back={clearLocated}
                />
              )}
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
                  onSource={onSource}
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
