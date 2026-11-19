import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { UiContext } from "@pakka/webui-sdk";
import type { PocketContentChunk } from "@pakka/protocol/pocket";
import {
  describeFailure,
  requestSignal,
} from "../../integrations/pakka/connection.js";
import {
  findOriginal,
  originalDownloadUrl,
  readContent,
  readTextOriginal,
  type ContentSource,
  type OriginalMatch,
  type SearchCursor,
} from "../../integrations/pakka/content.js";

import { useOriginalPosition } from "./ReadingState.js";
import { OriginalText } from "./OriginalText.js";

const copyLimit = 1024 * 1024;

export function OriginalContent({
  source,
  ui,
}: {
  source: ContentSource;
  ui: UiContext;
}) {
  const position = useOriginalPosition(
    JSON.stringify([source.conversation, source.reference]),
  );
  const [chunk, setChunk] = useState<PocketContentChunk | null>(null);
  const [back, setBack] = useState<number[]>(position.back);
  const [query, setQuery] = useState(position.query);
  const [match, setMatch] = useState<OriginalMatch | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const task = useRef<AbortController | null>(null);
  const cursor = useRef<{ query: string; value: SearchCursor }>(
    position.cursor,
  );
  const { reference } = source;

  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (task.current) return;
    const controller = new AbortController();
    task.current = controller;
    const signal = AbortSignal.any([
      controller.signal,
      requestSignal(ui.signal, source.connection),
    ]);
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      await action(signal);
    } catch (reason) {
      if (!signal.aborted) {
        setError(describeFailure(reason));
        setMatch(null);
        setChunk(null);
      }
    } finally {
      if (task.current === controller) task.current = null;
      if (!signal.aborted) setBusy(false);
    }
  }
  function load(offset: number, trail: number[] = []) {
    return run(async (signal) => {
      const result = await readContent(source, offset, signal);
      if (!signal.aborted) {
        if (position.offset !== offset) {
          position.scroll = 0;
          position.anchor = null;
        }
        position.offset = offset;
        position.back = trail;
        setChunk(result);
        setBack(trail);
      }
    });
  }
  function cancel() {
    task.current?.abort();
    task.current = null;
    setBusy(false);
    setNotice("读取已停止。");
  }
  useEffect(() => {
    void load(position.offset, position.back);
    return () => {
      task.current?.abort();
      task.current = null;
    };
  }, [ui, source.connection, reference.id, reference.revision]);

  function search() {
    void run(async (signal) => {
      const start =
        cursor.current.query === query
          ? cursor.current.value
          : { offset: 0, index: 0 };
      setProgress(start.offset);
      setMatch(null);
      const found = await findOriginal(
        source,
        query,
        start,
        signal,
        (value) => {
          if (!signal.aborted) setProgress(value);
        },
      );
      if (signal.aborted) return;
      if (found) {
        const result = await readContent(source, found.rangeOffset, signal);
        if (signal.aborted) return;
        position.cursor = cursor.current = { query, value: found.next };
        position.offset = found.rangeOffset;
        position.back = [];
        position.scroll = 0;
        position.anchor = null;
        setMatch(found);
        setChunk(result);
        setBack([]);
      } else {
        position.cursor = cursor.current = {
          query,
          value: { offset: 0, index: 0 },
        };
        setNotice(
          start.offset || start.index
            ? "剩余原文中没有匹配；再次搜索将从头开始。"
            : "此条完整原文中没有匹配。",
        );
      }
    });
  }
  function copyOriginal() {
    void run(async (signal) => {
      const text = await readTextOriginal(source, signal, copyLimit);
      signal.throwIfAborted();
      if (!navigator.clipboard) throw Error("当前浏览器无法复制，请下载原文。");
      await navigator.clipboard.writeText(text);
      if (!signal.aborted) setNotice("已复制完整原文。");
    });
  }
  return (
    <section className="original-content flow compact" aria-label="原文阅读">
      <p className="muted">
        完整原文 · {reference.encoding} · 存档范围{" "}
        {reference.byteLength.toLocaleString()} 字节
      </p>
      <div className="actions">
        <Button
          label="复制完整原文"
          variant="ghost"
          isDisabled={busy || reference.byteLength > copyLimit}
          onClick={copyOriginal}
        />
        <a
          className="text-action"
          href={originalDownloadUrl(source)}
          download
          rel="noreferrer"
        >
          下载完整原文
        </a>
        {busy && <Button label="停止读取" variant="ghost" onClick={cancel} />}
      </div>
      {reference.byteLength > copyLimit && (
        <p className="muted">完整复制上限为 1 MiB；可逐段阅读或直接下载。</p>
      )}
      <form
        className="original-search flow compact"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) search();
        }}
      >
        <div className="original-search-controls">
          <TextInput
            label="搜索此条原文"
            isLabelHidden
            placeholder="搜索此条原文"
            value={query}
            onChange={(value) => {
              position.query = value;
              setQuery(value);
            }}
            isDisabled={busy}
            autoComplete="off"
            controlClassName="touch-control"
          />
          <Button
            type="submit"
            label="查找下一个"
            isDisabled={busy || !query || query.length > 512}
          />
        </div>
        <span className="muted">按原样区分大小写 · 最多 512 个字符</span>
      </form>
      {busy && (
        <p role="status">
          正在读取原文…{" "}
          {progress > 0 && `已扫描到存档字节 ${progress.toLocaleString()}`}
        </p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {match && (
        <div className="original-match flow compact" role="status">
          <p>
            匹配位于存档范围 {match.rangeOffset}–{match.rangeEnd}
            ，以下是相邻摘录：
          </p>
          <pre>{match.excerpt}</pre>
        </div>
      )}
      {chunk && (
        <>
          <p className="muted">
            当前段 · 存档字节 {chunk.offset}–{chunk.nextOffset} /{" "}
            {reference.byteLength}
          </p>
          <OriginalText
            key={chunk.offset}
            text={chunk.text || "（空原文）"}
            initialScroll={position.scroll}
            initialAnchor={position.anchor}
            onScroll={(value, anchor) => {
              position.scroll = value;
              position.anchor = anchor;
            }}
          />
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
              label="上一段"
              variant="ghost"
              isDisabled={busy || !back.length}
              onClick={() => {
                const offset = back.at(-1);
                if (offset !== undefined) void load(offset, back.slice(0, -1));
              }}
            />
            <Button
              label="下一段"
              variant="ghost"
              isDisabled={busy || chunk.complete}
              onClick={() => {
                void load(chunk.nextOffset, [
                  ...back.slice(-255),
                  chunk.offset,
                ]);
              }}
            />
          </div>
        </>
      )}
    </section>
  );
}
