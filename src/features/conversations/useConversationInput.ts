import { useRef, useState } from "react";
import {
  PocketRemoteError,
  type AgentRef,
  type PocketInputReceipt,
} from "@pakka/client/pocket";
import { decodeOriginalConversationInput } from "@pakka/protocol/webui";
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
  /** Older local records can lack this field; never infer their original incarnation. */
  target?: AgentRef;
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
  if ("target" in value) {
    decodeOriginalConversationInput({
      target: value.target,
      input: { requestId: value.requestId, text: value.text, mode: value.mode },
    });
  }
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

  const [activity, setActivity] = useState<"send" | "check" | null>(null);
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
      result.target.conversationId !== target.conversationId ||
      (original.target &&
        (result.target.key !== original.target.key ||
          result.target.incarnation !== original.target.incarnation ||
          result.target.profile !== original.target.profile ||
          result.target.sessionId !== original.target.sessionId ||
          result.target.conversationId !== original.target.conversationId))
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
      if (alive()) {
        setPending(restore(key));
        ui.notice({
          key: original.requestId,
          tone: "warning",
          message: "还不能确认这条消息是否已送达",
        });
      }
      return false;
    }
    release(original.requestId);
    if (alive()) {
      const messages = {
        placed:
          original.mode === "steer"
            ? "对话已收到你的补充说明"
            : original.mode === "followUp"
              ? "对话已收到你的后续消息"
              : "对话已收到你的消息",
        queued: "这条消息已进入队列",
        done: "这条消息已处理完成",
        unanswered: "这条消息未获作答",
      };
      ui.notice({
        key: original.requestId,
        tone: result.status === "unanswered" ? "warning" : "success",
        message: messages[result.status],
      });
      changed();
    }
    return result.status !== "unanswered";
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
    setActivity("send");
    setError(null);
    const original: OriginalInput = {
      requestId: crypto.randomUUID(),
      text,
      mode,
      target: ref,
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
        {
          op: "submit",
          target: ref,
          input: { requestId: original.requestId, text, mode },
        },
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
      if (alive()) {
        if (
          reason instanceof PocketRemoteError &&
          reason.code === "UNKNOWN" &&
          reason.outcome !== "denied"
        )
          ui.notice({
            key: original.requestId,
            tone: "warning",
            message: "还不能确认这条消息是否已送达",
          });
        else setError(describeFailure(reason));
      }
      return false;
    } finally {
      admission.current = false;
      if (alive()) setActivity(null);
    }
  }
  async function check() {
    if (admission.current || !alive()) return;
    const original = restore(key);
    setPending(original);
    if (!original || original === "unreadable") return;
    if (!original.receiptId && !original.target) {
      setError("原记录缺少提交时的运行绑定，无法安全查询；请保留原请求。");
      return;
    }
    admission.current = true;
    setActivity("check");
    setError(null);
    try {
      const options = { signal: requestSignal(ui.signal, connection) };
      if (original.receiptId) {
        const result = await connection.workbench.request(
          {
            op: "receipt",
            id: original.receiptId,
            sessionId: target.sessionId,
          },
          options,
        );
        if (result.kind !== "receipt") throw new Error("未收到原请求回执。");
        if (accept(result.receipt, original) && alive()) return original.text;
      } else if (original.target) {
        const result = await connection.services.request(
          {
            op: "input.lookup",
            original: {
              target: original.target,
              input: {
                requestId: original.requestId,
                text: original.text,
                mode: original.mode,
              },
            },
          },
          options,
        );
        if (result.receipt) {
          if (accept(result.receipt, original) && alive()) return original.text;
        } else if (alive())
          setError("暂时没查到这条消息的回执，可以稍后再查看发送状态。");
      }
    } catch (reason) {
      if (alive())
        setError(`没能读取这条消息的发送状态。${describeFailure(reason)}`);
    } finally {
      admission.current = false;
      if (alive()) setActivity(null);
    }
  }
  return {
    pending,
    busy: !!activity,
    checking: activity === "check",
    error,
    submit,
    check,
  };
}
