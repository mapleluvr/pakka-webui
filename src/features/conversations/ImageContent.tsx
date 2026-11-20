import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import type { PocketContentReference } from "@pakka/protocol/pocket";
import {
  originalDownloadUrl,
  readContent,
} from "../../integrations/pakka/content.js";
import {
  describeFailure,
  requestSignal,
} from "../../integrations/pakka/connection.js";
import type { ContentBindings } from "./TextContent.js";

const imageLimit = 8 * 1024 * 1024;

export function ImageContent({
  data,
  mimeType,
  reference,
  ...bindings
}: ContentBindings & {
  data: string;
  mimeType: string;
  reference?: PocketContentReference;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const retainedUrl = useRef<string | null>(null);
  const supported = /^image\/(?:png|jpeg|gif|webp)$/.test(mimeType);
  const bounded = (reference?.byteLength ?? data.length) <= imageLimit;
  const source = reference
    ? {
        connection: bindings.connection,
        conversation: bindings.conversation,
        reference,
      }
    : null;
  const release = () => {
    pending.current?.abort();
    pending.current = null;
    if (retainedUrl.current) URL.revokeObjectURL(retainedUrl.current);
    retainedUrl.current = null;
  };
  useEffect(() => {
    setUrl(null);
    setBusy(false);
    return release;
  }, [
    bindings.ui,
    bindings.connection,
    reference?.id,
    reference?.revision,
    data,
  ]);
  async function expand() {
    if (!supported || !bounded || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const signal = AbortSignal.any([
      controller.signal,
      requestSignal(bindings.ui.signal, bindings.connection),
    ]);
    setBusy(true);
    setError(null);
    try {
      let encoded = data;
      if (source) {
        const parts: string[] = [];
        let offset = 0;
        do {
          const chunk = await readContent(source, offset, signal);
          parts.push(chunk.text);
          offset = chunk.nextOffset;
          if (chunk.complete) break;
        } while (offset < source.reference.byteLength);
        encoded = parts.join("");
      }
      signal.throwIfAborted();
      if (
        encoded.length > imageLimit ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          encoded,
        )
      )
        throw Error("图片原文不完整或超过展开上限，请下载核对。");
      const bytes = Uint8Array.from(atob(encoded), (character) =>
        character.charCodeAt(0),
      );
      const next = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
      retainedUrl.current = next;
      setUrl(next);
    } catch (reason) {
      if (!signal.aborted) setError(describeFailure(reason));
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="flow compact image-content">
      <p className="muted">图片 · {mimeType}</p>
      {url && (
        <img
          className="message-image"
          src={url}
          alt="Conversation 中的图片"
          onError={() => {
            release();
            setUrl(null);
            setError("浏览器无法显示这张图片，可下载原文核对。");
          }}
        />
      )}
      <div className="actions">
        {url ? (
          <Button
            label="收起图片"
            variant="ghost"
            onClick={() => {
              release();
              setUrl(null);
            }}
          />
        ) : (
          <Button
            label={busy ? "正在读取图片…" : "展开图片"}
            variant="ghost"
            isDisabled={busy || !supported || !bounded}
            onClick={() => {
              void expand();
            }}
          />
        )}
        {busy && (
          <Button
            label="停止读取图片"
            variant="ghost"
            onClick={() => {
              release();
              setBusy(false);
            }}
          />
        )}
        {source && (
          <a
            className="text-action"
            href={originalDownloadUrl(source)}
            download
            rel="noreferrer"
          >
            下载图片原文
          </a>
        )}
      </div>
      {!bounded && (
        <p className="muted">图片超过 8 MiB 编码展开上限，可下载原文。</p>
      )}
      {!supported && <p className="muted">此图片格式可通过下载查看。</p>}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
