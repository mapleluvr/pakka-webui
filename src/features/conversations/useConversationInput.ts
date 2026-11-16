import { useRef, useState } from "react";
import {
  PocketRemoteError,
  type AgentRef,
  type PocketInputReceipt,
} from "@pakka/client/pocket";
import type { UiContext } from "@pakka/webui-sdk";
import {
  readPending,
  claimPending,
  clearPending,
} from "../../integrations/pakka/pending.js";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";

export type InputMode = "prompt" | "steer" | "followUp";
type OriginalInput = {
  requestId: string;
  text: string;
  mode: InputMode;
  receiptId?: string;
};
type Pending = OriginalInput | "unreadable" | null;
function decodeOriginalInput(value: unknown): OriginalInput {
  if (
    !value ||
    typeof value !== "object" ||
    !("requestId" in value) ||
    typeof value.requestId !== "string" ||
    !value.requestId ||
    !("text" in value) ||
    typeof value.text !== "string" ||
    !("mode" in value) ||
    !["prompt", "steer", "followUp"].includes(String(value.mode)) ||
    ("receiptId" in value &&
      (typeof value.receiptId !== "string" || !value.receiptId))
  )
    throw new Error("原输入记录不可读。");
  return value as OriginalInput;
}
function restore(key: string): Pending {
  return readPending(key, decodeOriginalInput);
}
/** Transport abort or view cleanup never reissues a message. Unresolved requests remain blocked. */
export function useConversationInput(
  ui: UiContext,
  connection: PakkaConnection,
  target: AgentRef,
  changed: () => void,
) {
  const key = JSON.stringify([
    "pakka-input",
    location.origin,
    connection.person.id,
    target.sessionId,
    target.conversationId,
  ]);
  const [pending, setPending] = useState<Pending>(() => restore(key));
  const [receipt, setReceipt] = useState<PocketInputReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const admission = useRef(false);
  const alive = () => !ui.signal.aborted && !connection.signal.aborted;
  function release(requestId: string) {
    const remaining = clearPending(key, requestId, decodeOriginalInput);
    if (alive()) setPending(remaining);
  }
  function accept(result: PocketInputReceipt, original: OriginalInput) {
    if (
      result.actorId !== connection.person.id ||
      result.requestId !== original.requestId ||
      result.target.sessionId !== target.sessionId ||
      result.target.conversationId !== target.conversationId
    )
      throw new Error("原请求身份未得到确认。");
    if (result.status === "unknown") {
      const existing = restore(key);
      if (
        existing &&
        existing !== "unreadable" &&
        existing.requestId === original.requestId
      )
        sessionStorage.setItem(
          key,
          JSON.stringify({ ...original, receiptId: result.id }),
        );
      if (alive()) setPending(restore(key));
      return false;
    }
    release(original.requestId);
    if (alive()) {
      setReceipt(result);
      changed();
    }
    return !["denied", "cancelled"].includes(result.status);
  }
  async function submit(
    ref: AgentRef,
    text: string,
    mode: InputMode,
  ): Promise<boolean> {
    if (admission.current || !alive()) return false;
    const existing = restore(key);
    if (existing) {
      setPending(existing);
      return false;
    }
    admission.current = true;
    setBusy(true);
    setError(null);
    const original: OriginalInput = {
      requestId: crypto.randomUUID(),
      text,
      mode,
    };
    try {
      const reserved = claimPending(key, original, decodeOriginalInput);
      setPending(reserved);
      if (
        reserved === "unreadable" ||
        reserved.requestId !== original.requestId
      )
        return false;
      const result = await connection.workbench.request(
        { op: "submit", target: ref, input: original },
        {
          signal: requestSignal(ui.signal, connection),
          requestId: original.requestId,
        },
      );
      if (result.kind !== "receipt") throw new Error("提交回执未得到确认。");
      return accept(result.receipt, original) && alive();
    } catch (reason) {
      if (reason instanceof PocketRemoteError && reason.outcome === "denied") {
        try {
          release(original.requestId);
        } catch {
          /* Keep the original if local acknowledgement cannot be stored. */
        }
      }
      if (alive()) setError(describeFailure(reason));
      return false;
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  async function check() {
    if (admission.current || !alive()) return;
    const original = restore(key);
    setPending(original);
    if (!original || original === "unreadable" || !original.receiptId) return;
    admission.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await connection.workbench.request(
        { op: "receipt", id: original.receiptId, sessionId: target.sessionId },
        { signal: requestSignal(ui.signal, connection) },
      );
      if (result.kind !== "receipt") throw new Error("未收到原请求回执。");
      accept(result.receipt, original);
    } catch (reason) {
      if (alive()) setError(describeFailure(reason));
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  return { pending, receipt, busy, error, submit, check };
}
