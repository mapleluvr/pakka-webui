import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import type { UiContext } from "@pakka/webui-sdk";
import type {
  PocketContentReference,
  PocketContentChunk,
  PocketMessage,
  PocketSnapshot,
} from "@pakka/protocol/pocket";
import type { ConversationReference } from "@pakka/protocol/webui";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";

type ContentBindings = {
  ui: UiContext;
  connection: PakkaConnection;
  conversation: ConversationReference;
};
function OriginalContent({
  reference,
  ...bindings
}: ContentBindings & { reference?: PocketContentReference }) {
  const [chunk, setChunk] = useState<PocketContentChunk | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!reference || reference.previewComplete) return null;
  if (reference.byteLength === 0) return <p className="muted">原文为空。</p>;
  async function load(offset: number) {
    if (!reference || busy) return;
    setBusy(true);
    setError(null);
    const signal = requestSignal(bindings.ui.signal, bindings.connection);
    try {
      const result = await bindings.connection.services.request(
        {
          op: "resource.content",
          reference: bindings.conversation,
          content: reference,
          range: {
            offset,
            length: Math.min(65536, reference.byteLength - offset),
          },
        },
        { signal },
      );
      if (!signal.aborted) setChunk(result.chunk);
    } catch (reason) {
      if (!signal.aborted) setError(describeFailure(reason));
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="original-content flow compact">
      {!chunk && (
        <Button
          label={busy ? "正在读取…" : "读取原文"}
          variant="ghost"
          isDisabled={busy}
          onClick={() => {
            void load(0);
          }}
        />
      )}
      {chunk && (
        <>
          <p className="muted">
            原文 · {reference.encoding} · 字节 {chunk.offset}–{chunk.nextOffset}{" "}
            / {reference.byteLength}
          </p>
          <pre>{chunk.text}</pre>
          <div className="actions">
            <Button
              label="回到开头"
              variant="ghost"
              isDisabled={busy || chunk.offset === 0}
              onClick={() => {
                void load(0);
              }}
            />
            <Button
              label={busy ? "正在读取…" : "下一段"}
              variant="ghost"
              isDisabled={busy || chunk.complete}
              onClick={() => {
                void load(chunk.nextOffset);
              }}
            />
            <Button
              label="收起原文"
              variant="ghost"
              onClick={() => setChunk(null)}
            />
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
function Message({
  message,
  ...bindings
}: ContentBindings & { message: PocketMessage }) {
  return (
    <div className={`message message-${message.role}`}>
      <header className="message-label">
        {message.role === "user"
          ? "你"
          : message.role === "assistant"
            ? "Assistant"
            : `工具 · ${message.toolName ?? "结果"}`}
        {message.isError && " · 失败"}
      </header>
      {typeof message.content === "string" ? (
        <p className="message-text">{message.content}</p>
      ) : (
        message.content.map((part, index) => (
          <div key={index}>
            {part.type === "text" && (
              <p className="message-text">{part.text}</p>
            )}
            {part.type === "thinking" && (
              <details>
                <summary>Thinking</summary>
                <p className="message-text">{part.thinking}</p>
              </details>
            )}
            {part.type === "toolCall" && (
              <details>
                <summary>工具调用 · {part.name}</summary>
                <pre>{JSON.stringify(part.arguments, null, 2)}</pre>
              </details>
            )}
            {part.type === "image" &&
              (!part.contentReference ||
                part.contentReference.previewComplete) &&
              /^image\/(?:png|jpeg|gif|webp)$/.test(part.mimeType) && (
                <img
                  className="message-image"
                  src={`data:${part.mimeType};base64,${part.data}`}
                  alt="Conversation 中的图片"
                  loading="lazy"
                />
              )}
            <OriginalContent {...bindings} reference={part.contentReference} />
          </div>
        ))
      )}
      <OriginalContent {...bindings} reference={message.contentReference} />
      {message.errorMessage && (
        <p className="error-text">{message.errorMessage}</p>
      )}
      <OriginalContent {...bindings} reference={message.errorReference} />
    </div>
  );
}
export function HistoryBody({
  entries,
  ...bindings
}: ContentBindings & { entries: PocketSnapshot["entries"] }) {
  return (
    <div className="transcript">
      {!entries.length && <p className="muted">此页还没有保存的内容。</p>}
      {entries.map((entry) => (
        <section
          key={entry.id}
          className="history-entry"
          aria-label={`历史 ${entry.id}`}
        >
          {entry.sourceConversationId && (
            <p className="muted identifier">
              来自分叉源 Conversation {entry.sourceConversationId}
            </p>
          )}
          {entry.messages.map((message, index) => (
            <Message key={index} {...bindings} message={message} />
          ))}
          {entry.display && (
            <div className="message display">
              <p className="message-text">{entry.display.text}</p>
              <OriginalContent
                {...bindings}
                reference={entry.display.contentReference}
              />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
