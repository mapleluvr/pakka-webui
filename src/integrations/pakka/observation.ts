import {
  applyPocketObservation,
  type AgentRef,
  type PocketObservedSnapshot,
} from "@pakka/client/pocket";
import {
  decodePocketEvent,
  POCKET_MAX_BYTES,
  type PocketCollaborationView,
} from "@pakka/protocol/pocket";
import type { PakkaConnection } from "./connection.js";

/** Transport only: each consumer validates its own bounded event and original resource. */
function previewStream(
  connection: PakkaConnection,
  target: AgentRef,
  signal: AbortSignal,
  receive: (value: unknown) => void,
  lost: () => void,
  reset: () => void,
): () => void {
  signal.throwIfAborted();
  const url = new URL("/pakka-webui/events", connection.origin);
  if (url.origin !== location.origin) throw new Error("观察要求同源连接。");
  url.searchParams.set("mode", "preview");
  url.searchParams.set("sessionId", target.sessionId);
  url.searchParams.set("conversationId", target.conversationId);
  url.searchParams.set("expectedPersonId", connection.person.id);
  url.searchParams.set("expectedServerId", connection.serverId);
  const source = new EventSource(url);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    source.close();
    reset();
    signal.removeEventListener("abort", close);
  };
  const gap = () => {
    if (closed || signal.aborted) return;
    close();
    lost();
  };
  source.addEventListener("pocket", (event) => {
    if (closed || signal.aborted) return;
    try {
      const data = (event as MessageEvent<string>).data;
      if (new TextEncoder().encode(data).byteLength > POCKET_MAX_BYTES)
        throw new Error("观察帧超过容量。");
      receive(JSON.parse(data));
    } catch {
      gap();
    }
  });
  source.onerror = gap;
  signal.addEventListener("abort", close, { once: true });
  if (signal.aborted) close();
  return close;
}

/** Lost bases require a new authorization/snapshot cycle. */
export function observeConversation(
  connection: PakkaConnection,
  target: AgentRef,
  signal: AbortSignal,
  changed: (value: PocketObservedSnapshot) => void,
  lost: () => void,
): () => void {
  let previous: PocketObservedSnapshot | undefined;
  return previewStream(
    connection,
    target,
    signal,
    (value) => {
      const next = applyPocketObservation(previous, value, {
        serverId: connection.serverId,
        target,
      });
      if (next && next !== previous) {
        previous = next;
        changed(next);
      }
    },
    lost,
    () => {
      previous = undefined;
    },
  );
}

export function observeCollaboration(
  connection: PakkaConnection,
  target: AgentRef,
  signal: AbortSignal,
  changed: (value: PocketCollaborationView) => void,
  lost: () => void,
): () => void {
  return previewStream(
    connection,
    target,
    signal,
    (value) => {
      const event = decodePocketEvent(value);
      if (event.serverId !== connection.serverId)
        throw new Error("协作观察的服务身份不符。");
      if (event.kind !== "collaboration") return;
      const snapshot = event.snapshot;
      if (
        snapshot.conversationId !== target.conversationId ||
        (snapshot.sessionId ?? connection.sessionId) !== target.sessionId
      )
        throw new Error("协作观察的原资源身份不符。");
      changed(snapshot);
    },
    lost,
    () => {},
  );
}
