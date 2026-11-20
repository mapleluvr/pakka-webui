import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentRef } from "@pakka/protocol/pocket";
import { Button } from "@astryxdesign/core/Button";
import type { UiViewProps } from "@pakka/webui-sdk";
import { conversationReference } from "../../integrations/pakka/resources.js";
import type { PakkaConnection } from "../../integrations/pakka/connection.js";
import { HistoryBody } from "./HistoryBody.js";
import { ReadingState } from "./ReadingState.js";
import { useConversationHistory } from "./useConversationHistory.js";
import { useConversationName } from "./useConversationName.js";
import { Composer } from "./Composer.js";
import { InputActivity } from "./InputActivity.js";
import { ForkConversation } from "./ForkConversation.js";
import { Collaboration } from "./Collaboration.js";
import "./conversation.css";

const resolutionLabels = {
  loaded: "已加载",
  unloaded: "未加载 · 保存历史",
  unavailable: "原来源不可得",
  forbidden: "无权读取原资源",
  "identity-mismatch": "原 Session 身份不符",
};
const observationLabels = {
  reading: "正在连接观察…",
  live: "实时观察",
  recovering: "正在恢复观察…",
  stopped: "观察已暂停",
  saved: "保存记录",
};
export function ConversationView({
  ui,
  bindings,
  contributions,
  onTitle,
}: UiViewProps<PakkaConnection> & {
  contributions?: (target: AgentRef) => ReactNode;
  onTitle?(name: string): void;
}) {
  const reference = useMemo(() => conversationReference(ui.resource), [ui]);
  const [before, setBefore] = useState<string | undefined>();
  const [refresh, setRefresh] = useState(0);
  const [followRevision, setFollowRevision] = useState(0);
  const [forkEntry, setForkEntry] = useState<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const [readingControls, setReadingControls] = useState<HTMLDivElement | null>(
    null,
  );
  const { resolution, history, error, loading, observation } =
    useConversationHistory(ui, bindings, reference, before, refresh);
  const name = useConversationName(
    ui,
    bindings,
    reference,
    resolution?.status === "loaded",
    refresh,
  );
  const title =
    resolution?.status === "loaded" && name
      ? name
      : `Conversation ${reference.conversationId}`;
  useEffect(() => {
    if (!ui.signal.aborted && !bindings.signal.aborted) onTitle?.(title);
  }, [title, onTitle, ui.signal, bindings.signal]);
  const page = history?.status === "loaded" ? history.snapshot : history?.page;
  const running = history?.status === "loaded" && history.snapshot.live.busy;
  return (
    <section className="conversation-view">
      <header className="conversation-heading">
        <div className="conversation-title">
          <h1>{title}</h1>
          <div className="conversation-state">
            <span>
              {history
                ? resolutionLabels[history.status]
                : resolution
                  ? resolutionLabels[resolution.status]
                  : "正在核对原资源…"}
            </span>
            <span role="status" data-observation={observation}>
              {observationLabels[observation]}
              {running ? " · 正在执行" : ""}
            </span>
          </div>
        </div>
        <div className="actions">
          <details className="conversation-reference">
            <summary>原引用</summary>
            <div className="reference-content">
              <p className="identifier">Session {reference.sessionId}</p>
              <p className="identifier">
                Conversation {reference.conversationId}
              </p>
              <p className="muted">
                当前页面读取这个原对象；模型、目录和 preset 变更仍走原配置请求。
              </p>
            </div>
          </details>
          <Button
            label="刷新原历史"
            variant="ghost"
            onClick={() => setRefresh((value) => value + 1)}
          />
        </div>
      </header>
      <div
        ref={scroll}
        className="conversation-reading"
        tabIndex={0}
        role="region"
        aria-label="Conversation 阅读区"
      >
        {resolution?.status === "loaded" && (
          <div className="conversation-tools">
            <Collaboration
              ui={ui}
              connection={bindings}
              target={resolution.target}
            />
            {contributions?.(resolution.target)}
          </div>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        {resolution &&
          resolution.status !== "loaded" &&
          resolution.status !== "unloaded" && (
            <div className="surface flow">
              <h2>{resolutionLabels[resolution.status]}</h2>
              <p>请核对原引用、来源登记与当前身份的权限，然后重新读取。</p>
            </div>
          )}
        {!error &&
          resolution &&
          !history &&
          (resolution.status === "loaded" ||
            resolution.status === "unloaded") && (
            <p role="status">正在读取原历史…</p>
          )}
        {history?.status === "unloaded" && (
          <p className="saved-banner">
            这里显示原 Session 最后保存的内容。保存状态为
            {history.page.saved.busy ? "处理中" : "空闲"}；浏览不会恢复执行。
          </p>
        )}
        {resolution?.status === "loaded" &&
          bindings.person.role === "admin" && (
            <ForkConversation
              ui={ui}
              connection={bindings}
              target={resolution.target}
              entryId={forkEntry}
              close={() => setForkEntry(null)}
            />
          )}
        <ReadingState
          followRevision={followRevision}
          controls={readingControls}
          key={`${reference.sessionId}/${reference.conversationId}`}
        >
          {page && (
            <>
              <HistoryBody
                key={before ?? "latest"}
                followRevision={before ? 0 : followRevision}
                scroll={scroll}
                controls={readingControls}
                entries={page.entries}
                live={
                  history?.status === "loaded" && !before
                    ? history.snapshot.live
                    : undefined
                }
                onFork={
                  resolution?.status === "loaded" &&
                  bindings.person.role === "admin"
                    ? setForkEntry
                    : undefined
                }
                ui={ui}
                connection={bindings}
                conversation={reference}
              />
              <div className="history-footer">
                <span className="muted">
                  {before ? "较早历史" : "最近保存的历史"} ·{" "}
                  {page.entries.length} 条
                </span>
                <div className="actions">
                  <Button
                    label="返回最新"
                    variant="ghost"
                    isDisabled={!before}
                    onClick={() => {
                      setBefore(undefined);
                      setRefresh((value) => value + 1);
                    }}
                  />
                  <Button
                    label="更早历史"
                    variant="ghost"
                    isDisabled={!page.entriesTruncated || !page.olderBeforeId}
                    onClick={() => setBefore(page.olderBeforeId)}
                  />
                </div>
              </div>
            </>
          )}
        </ReadingState>
      </div>
      <div className="conversation-reading-controls">
        {resolution?.status === "loaded" && (
          <InputActivity
            ui={ui}
            connection={bindings}
            target={resolution.target}
            revision={refresh}
            running={running}
            disabled={loading || !!error}
          />
        )}
        <div
          ref={setReadingControls}
          className="conversation-follow-controls"
          role="navigation"
          aria-label="本页阅读导航"
        />
      </div>
      {resolution?.status === "loaded" && (
        <footer className="conversation-compose">
          <Composer
            ui={ui}
            connection={bindings}
            target={resolution.target}
            disabled={loading || !!error}
            running={running}
            onSubmitted={() => setFollowRevision((value) => value + 1)}
            changed={() => {
              setBefore(undefined);
              setRefresh((value) => value + 1);
            }}
          />
        </footer>
      )}
    </section>
  );
}
