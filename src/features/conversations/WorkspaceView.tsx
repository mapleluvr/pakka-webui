import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { UiViewProps } from "@pakka/webui-sdk";
import type { PocketClientResult } from "@pakka/client/pocket";
import { viewHref } from "../../host/links.js";
import { conversationResource } from "../../integrations/pakka/resources.js";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";

type Listing = Extract<PocketClientResult, { kind: "list" }>;
export function WorkspaceView({ ui, bindings }: UiViewProps<PakkaConnection>) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sessionId, setSessionId] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [resolving, setResolving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      requestSignal(ui.signal, bindings),
    ]);
    setError(null);
    void bindings.workbench
      .request({ op: "list" }, { signal })
      .then((result) => {
        if (signal.aborted) return;
        if (result.kind !== "list")
          throw new Error("未收到 Conversation 列表。");
        setListing(result);
        setOffset(0);
      })
      .catch((reason) => {
        if (!signal.aborted) setError(describeFailure(reason));
      });
    return () => controller.abort();
  }, [bindings, ui, refresh]);
  return (
    <section className="flow">
      <header className="feature-heading">
        <div className="flow compact">
          <p className="eyebrow">Workspace</p>
          <h1>Conversations</h1>
        </div>
        <Button
          label="刷新"
          variant="ghost"
          onClick={() => setRefresh((value) => value + 1)}
        />
      </header>
      <p className="muted">
        已加载且获准访问的 Conversations。也可以通过已知引用读取原 Session
        的保存历史。
      </p>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {!listing && !error && <p role="status">正在读取…</p>}
      {listing && (
        <div className="surface flow">
          {!listing.conversations.length && (
            <p>
              当前没有可见的已加载 Conversation。可以在下方打开已知的原历史。
            </p>
          )}
          <ul className="resource-list">
            {listing.conversations.slice(offset, offset + 50).map((ref) => {
              const navigation = listing.navigation?.find(
                (value) =>
                  value.ref.sessionId === ref.sessionId &&
                  value.ref.conversationId === ref.conversationId,
              );
              const title =
                navigation?.name ??
                listing.titles?.[ref.key] ??
                ref.conversationId;
              return (
                <li key={JSON.stringify([ref.sessionId, ref.conversationId])}>
                  <a
                    className="resource-link"
                    href={viewHref({
                      plugin: "conversations",
                      view: "history",
                      resource: conversationResource(ref),
                    })}
                  >
                    <strong>{title}</strong>
                    <span className="muted identifier">
                      Session {ref.sessionId}
                    </span>
                    <span className="muted identifier">
                      Conversation {ref.conversationId}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
          {listing.conversations.length > 50 && (
            <div className="actions">
              <Button
                label="上一页"
                variant="ghost"
                isDisabled={offset === 0}
                onClick={() => setOffset((value) => Math.max(0, value - 50))}
              />
              <Button
                label="下一页"
                variant="ghost"
                isDisabled={offset + 50 >= listing.conversations.length}
                onClick={() => setOffset((value) => value + 50)}
              />
            </div>
          )}
        </div>
      )}
      <form
        className="surface flow"
        onSubmit={(event) => {
          event.preventDefault();
          if (resolving || !sessionId.trim() || !conversationId.trim()) return;
          setResolving(true);
          setError(null);
          void ui
            .navigate(
              conversationResource({
                sessionId: sessionId.trim(),
                conversationId: conversationId.trim(),
              }),
            )
            .then((result) => {
              if (ui.signal.aborted) return;
              if (result.status !== "ready" && result.status !== "unloaded")
                setError(result.message ?? `原资源不可读：${result.status}`);
            })
            .catch((reason) => {
              if (!ui.signal.aborted) setError(describeFailure(reason));
            })
            .finally(() => {
              if (!ui.signal.aborted) setResolving(false);
            });
        }}
      >
        <h2>打开已知原历史</h2>
        <div className="form-grid">
          <TextInput
            label="Session ID"
            value={sessionId}
            onChange={setSessionId}
            controlClassName="touch-control"
            autoComplete="off"
          />
          <TextInput
            label="Conversation ID"
            value={conversationId}
            onChange={setConversationId}
            controlClassName="touch-control"
            autoComplete="off"
          />
        </div>
        <div>
          <Button
            label={resolving ? "正在核对…" : "读取原历史"}
            type="submit"
            isDisabled={
              resolving || !sessionId.trim() || !conversationId.trim()
            }
          />
        </div>
      </form>
    </section>
  );
}
