import { useState } from "react";
import { PocketRemoteError, type AgentRef } from "@pakka/client/pocket";
import {
  contentRefKey,
  decodeNotebookRequest,
  type NotebookAction,
  type NotebookRequest,
} from "@pakka/protocol/webui";
import {
  claimPending,
  clearPending,
  readPending,
} from "../../../integrations/pakka/pending.js";
import {
  describeFailure,
  type PakkaConnection,
} from "../../../integrations/pakka/connection.js";
function slot(a: NotebookAction) {
  return a.kind === "pin"
    ? contentRefKey(a.target)
    : JSON.stringify([
        a.kind === "save" || a.kind === "delete" ? "note" : "pin",
        a.id,
      ]);
}
export function useNotebookRequests(
  connection: PakkaConnection,
  target: AgentRef,
  signal: AbortSignal,
  refresh: () => void,
) {
  const prefix =
    JSON.stringify([
      "pakka-notebook",
      connection.origin,
      connection.person.id,
      target.sessionId,
      target.conversationId,
    ]).slice(0, -1) + ",";
  const key = (scope: string) => prefix + JSON.stringify(scope) + "]";
  const decode = (scope: string) => (v: unknown) => {
    const req = decodeNotebookRequest(v);
    if (
      slot(req.action) !== scope ||
      req.target.sessionId !== target.sessionId ||
      req.target.conversationId !== target.conversationId
    )
      throw Error("笔记原请求绑定不符");
    return req;
  };
  const [error, setError] = useState("");
  const [, changed] = useState(0);
  const pending = new Map<string, NotebookRequest | "unreadable">();
  let readable = true;
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k?.startsWith(prefix)) continue;
      const scope = JSON.parse(k).at(-1);
      if (typeof scope !== "string" || k !== key(scope)) throw Error();
      const r = readPending(k, decode(scope));
      if (r) pending.set(scope, r);
    }
  } catch {
    readable = false;
  }
  async function perform(a: NotebookAction | null, scope: string) {
    let original: NotebookRequest | undefined;
    try {
      if (!readable) throw Error("原请求存储不可读");
      const candidate = a
        ? decodeNotebookRequest({
            target,
            requestId: crypto.randomUUID(),
            action: a,
          })
        : null;
      const r = candidate
        ? claimPending(key(scope), candidate, decode(scope))
        : readPending(key(scope), decode(scope));
      if (
        !r ||
        r === "unreadable" ||
        (candidate && r.requestId !== candidate.requestId)
      )
        throw Error("此对象已有未确认请求，请查询原回执。");
      original = r;
      setError("");
      changed((n) => n + 1);
      const result = candidate
        ? await connection.services.request(
            { op: "notebook.write", change: r },
            { signal },
          )
        : await connection.services.request(
            { op: "notebook.lookup", original: r },
            { signal },
          );
      signal.throwIfAborted();
      if (!result.receipt) throw Error("尚未找到回执，保留原请求，不会重发。");
      clearPending(key(scope), r.requestId, decode(scope));
      refresh();
      return result.receipt;
    } catch (e) {
      if (
        a &&
        original &&
        e instanceof PocketRemoteError &&
        e.outcome === "denied"
      )
        clearPending(key(scope), original.requestId, decode(scope));
      if (!signal.aborted) {
        setError(describeFailure(e));
        refresh();
      }
      return null;
    } finally {
      if (!signal.aborted) changed((n) => n + 1);
    }
  }
  return {
    error: readable ? error : "原请求存储不可读，已暂停提交。",
    pending,
    locked: (a: NotebookAction) => !readable || pending.has(slot(a)),
    write: (a: NotebookAction) => perform(a, slot(a)),
    lookup: (scope: string) => perform(null, scope),
  };
}
