import { useEffect, useMemo, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import type { UiViewProps } from "@pakka/webui-sdk";
import type {
  ConversationHistory,
  ConversationResolution,
} from "@pakka/protocol/webui";
import { conversationReference } from "../../integrations/pakka/resources.js";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";
import { HistoryBody } from "./HistoryBody.js";
import { Composer } from "./Composer.js";

const resolutionLabels = {
  loaded: "已加载",
  unloaded: "未加载 · 保存历史",
  unavailable: "原来源不可得",
  forbidden: "无权读取原资源",
  "identity-mismatch": "原 Session 身份不符",
};
export function ConversationView({
  ui,
  bindings,
}: UiViewProps<PakkaConnection>) {
  const reference = useMemo(() => conversationReference(ui.resource), [ui]);
  const [resolution, setResolution] = useState<ConversationResolution | null>(
    null,
  );
  const [history, setHistory] = useState<ConversationHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [before, setBefore] = useState<string | undefined>();
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      requestSignal(ui.signal, bindings),
    ]);
    setLoading(true);
    setResolution(null);
    setError(null);
    void (async () => {
      const result = await bindings.services.request(
        { op: "resource.resolve", reference },
        { signal },
      );
      if (signal.aborted) return;
      setResolution(result.resolution);
      if (
        result.resolution.status !== "loaded" &&
        result.resolution.status !== "unloaded"
      ) {
        setHistory(null);
        return;
      }
      const content = await bindings.services.request(
        {
          op: "resource.history",
          reference,
          options: {
            limit: 32,
            maxBytes: 32768,
            ...(before ? { beforeEntryId: before } : {}),
          },
        },
        { signal },
      );
      if (!signal.aborted) setHistory(content.history);
    })()
      .catch((reason) => {
        if (!signal.aborted) {
          setHistory(null);
          setError(describeFailure(reason));
        }
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [bindings, ui, reference, before, refresh]);
  const page = history?.status === "loaded" ? history.snapshot : history?.page;
  return (
    <section className="flow">
      <header className="feature-heading">
        <div className="flow compact">
          <p className="eyebrow">Conversation</p>
          <h1>{reference.conversationId}</h1>
        </div>
        <Button
          label="刷新原历史"
          variant="ghost"
          onClick={() => setRefresh((value) => value + 1)}
        />
      </header>
      <div className="resource-meta">
        <span className="identifier">Session {reference.sessionId}</span>
        <span>
          {history
            ? resolutionLabels[history.status]
            : resolution
              ? resolutionLabels[resolution.status]
              : "正在核对原资源…"}
        </span>
      </div>
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
      {page && (
        <>
          <HistoryBody
            key={`${reference.sessionId}/${reference.conversationId}/${before ?? "latest"}`}
            entries={page.entries}
            ui={ui}
            connection={bindings}
            conversation={reference}
          />
          <div className="history-footer">
            <span className="muted">
              {before ? "较早历史" : "最近保存的历史"} · {page.entries.length}{" "}
              条
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
      {history?.status === "loaded" && (
        <Composer
          ui={ui}
          connection={bindings}
          target={history.snapshot.ref}
          disabled={loading}
          changed={() => {
            setBefore(undefined);
            setRefresh((value) => value + 1);
          }}
        />
      )}
    </section>
  );
}
