import type {
  PocketContentReference,
  PocketContentChunk,
} from "@pakka/protocol/pocket";
import {
  decodeWebUiRequest,
  WEBUI_CONTENT_DOWNLOAD_PATH,
  WEBUI_SERVICE_API,
  type ConversationReference,
} from "@pakka/protocol/webui";
import type { PakkaConnection } from "./connection.js";

export type ContentSource = {
  connection: PakkaConnection;
  conversation: ConversationReference;
  reference: PocketContentReference;
};

export async function readContent(
  source: ContentSource,
  offset: number,
  signal: AbortSignal,
): Promise<PocketContentChunk> {
  signal.throwIfAborted();
  const { chunk } = await source.connection.services.request(
    {
      op: "resource.content",
      reference: source.conversation,
      content: source.reference,
      // The native range minimum is eight bytes, including a shorter final remainder.
      range: { offset, length: 65536 },
    },
    { signal },
  );
  signal.throwIfAborted();
  if (
    chunk.nextOffset > source.reference.byteLength ||
    (!chunk.complete && chunk.nextOffset <= offset) ||
    chunk.complete !== (chunk.nextOffset === source.reference.byteLength)
  )
    throw new Error("原文范围未得到确认。");
  return chunk;
}

export function originalDownloadUrl(source: ContentSource): string {
  const request = decodeWebUiRequest({
    api: WEBUI_SERVICE_API,
    requestId: "original-download",
    binding: {
      personId: source.connection.person.id,
      serverId: source.connection.serverId,
    },
    command: {
      op: "resource.content",
      reference: source.conversation,
      content: source.reference,
      range: { offset: 0, length: 65536 },
    },
  });
  return `${source.connection.origin}${WEBUI_CONTENT_DOWNLOAD_PATH}?${new URLSearchParams({ request: JSON.stringify(request) })}`;
}

export async function readTextOriginal(
  source: ContentSource,
  signal: AbortSignal,
  maxBytes: number,
): Promise<string> {
  if (
    source.reference.encoding === "base64" ||
    source.reference.byteLength > maxBytes
  )
    throw new Error("此原文超过复制上限，请下载完整原文。");
  const parts: string[] = [];
  let offset = 0;
  do {
    const chunk = await readContent(source, offset, signal);
    parts.push(chunk.text);
    offset = chunk.nextOffset;
    if (chunk.complete) break;
  } while (offset < source.reference.byteLength);
  signal.throwIfAborted();
  return parts.join("");
}

export type SearchCursor = { offset: number; index: number };
export type OriginalMatch = {
  rangeOffset: number;
  rangeEnd: number;
  excerpt: string;
  next: SearchCursor;
};

/** Literal, case-sensitive search; one range and a needle-sized overlap stay in memory.
 * Entry offsets address escaped archive bytes, not the decoded string. The cursor therefore
 * keeps both the source range and decoded character index. Adapted from Pakka original-search.
 */
export async function findOriginal(
  source: ContentSource,
  query: string,
  start: SearchCursor,
  signal: AbortSignal,
  progress: (offset: number) => void,
): Promise<OriginalMatch | null> {
  if (!query.length || query.length > 512)
    throw new Error("请输入 1–512 个字符，按原样区分大小写搜索。");
  const archive = source.reference.source === "entry",
    encoder = new TextEncoder();
  let offset = start.offset,
    carry = "",
    carryOffset = offset,
    first = true;
  while (offset < source.reference.byteLength) {
    const range = await readContent(source, offset, signal);
    const bytes = encoder.encode(range.text).byteLength;
    if (
      archive
        ? bytes > range.nextOffset - offset
        : bytes !== range.nextOffset - offset
    )
      throw new Error("原文编码范围未得到确认。");
    const skip = first ? start.index : 0;
    first = false;
    if (skip > range.text.length) throw new Error("原文字符游标已失效。");
    const combined = carry + range.text.slice(skip),
      found = combined.indexOf(query);
    if (found >= 0) {
      return {
        rangeOffset: found < carry.length ? carryOffset : offset,
        rangeEnd: range.nextOffset,
        excerpt: combined.slice(
          Math.max(0, found - 256),
          found + query.length + 512,
        ),
        next: archive
          ? { offset, index: skip + found - carry.length + query.length }
          : {
              offset:
                offset -
                encoder.encode(carry).byteLength +
                encoder.encode(range.text.slice(0, skip)).byteLength +
                encoder.encode(combined.slice(0, found + query.length))
                  .byteLength,
              index: 0,
            },
      };
    }
    let from = Math.max(0, combined.length - query.length + 1);
    if (
      from > 0 &&
      combined.charCodeAt(from) >= 0xdc00 &&
      combined.charCodeAt(from) <= 0xdfff &&
      combined.charCodeAt(from - 1) >= 0xd800 &&
      combined.charCodeAt(from - 1) <= 0xdbff
    )
      from--;
    if (from >= carry.length) carryOffset = offset;
    carry = combined.slice(from);
    offset = range.nextOffset;
    progress(offset);
  }
  signal.throwIfAborted();
  return null;
}
