import { useRef, useState } from "react";
import { PocketRemoteError, type AgentRef } from "@pakka/client/pocket";
import {
  decodeExtensionRequest,
  EXTENSION_VERSION,
} from "@pakka/protocol/extension-rpc";
import type {
  ExtensionAction,
  ExtensionCall,
  ExtensionOperation,
} from "@pakka/protocol/extensions";
import type { UiContext } from "@pakka/webui-sdk";
import {
  claimPending,
  clearPending,
  readPending,
} from "../../integrations/pakka/pending.js";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";

type OriginalCommand = {
  requestId: string;
  title: string;
  text: string;
  call: ExtensionCall;
};

/** A command's original call survives view closure, publication changes and server restart. */
export function useExtensionCommand(
  ui: UiContext,
  connection: PakkaConnection,
  target: AgentRef,
  changed: () => void,
) {
  const appKey = JSON.stringify([
    "pakka-command",
    location.origin,
    connection.person.id,
    "app",
  ]);
  const conversationKey = JSON.stringify([
    "pakka-command",
    location.origin,
    connection.person.id,
    target.sessionId,
    target.conversationId,
  ]);
  const keyFor = (original: OriginalCommand) =>
    original.call.target ? conversationKey : appKey;
  function decode(value: unknown): OriginalCommand {
    if (
      !value ||
      typeof value !== "object" ||
      Object.keys(value).sort().join(",") !== "call,requestId,text,title" ||
      !("requestId" in value) ||
      typeof value.requestId !== "string" ||
      !("text" in value) ||
      typeof value.text !== "string" ||
      value.text.length > 262144 ||
      !("title" in value) ||
      typeof value.title !== "string" ||
      value.title.length > 256 ||
      !("call" in value)
    )
      throw new Error("命令原请求不可读。");
    const decoded = decodeExtensionRequest({
      version: EXTENSION_VERSION,
      requestId: value.requestId,
      command: { op: "call", call: value.call },
    }).command;
    if (
      decoded.op !== "call" ||
      decoded.call.requestId !== value.requestId ||
      (decoded.call.target &&
        (decoded.call.target.sessionId !== target.sessionId ||
          decoded.call.target.conversationId !== target.conversationId))
    )
      throw new Error("命令原请求的资源身份不符。");
    return {
      requestId: value.requestId,
      title: value.title,
      text: value.text,
      call: decoded.call,
    };
  }
  function restore() {
    for (const key of [conversationKey, appKey]) {
      const saved = readPending(key, (value) => {
        const original = decode(value);
        if (keyFor(original) !== key)
          throw new Error("命令原请求的作用域不符。");
        return original;
      });
      if (saved) return saved;
    }
    return null;
  }
  const [pending, setPending] = useState(restore);
  const [result, setResult] = useState<{
    original: OriginalCommand;
    operation: ExtensionOperation;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const admission = useRef(false);
  const alive = () => !ui.signal.aborted && !connection.signal.aborted;
  function accept(operation: ExtensionOperation, original: OriginalCommand) {
    if (
      operation.actorId !== connection.person.id ||
      operation.requestId !== original.requestId ||
      operation.extension !== original.call.extension ||
      operation.action !== original.call.action
    )
      throw new Error("命令原请求身份未得到确认。");
    if (operation.state === "unknown") return false;
    clearPending(keyFor(original), original.requestId, decode);
    const remaining = restore();
    if (alive()) {
      setPending(remaining);
      setResult({ original, operation });
      changed();
    }
    return true;
  }
  async function run(
    call: Omit<ExtensionCall, "requestId">,
    text: string,
    title: string,
    effect: ExtensionAction["effect"],
  ) {
    if (!alive() || admission.current) throw new Error("命令仍在处理中。");
    admission.current = true;
    setBusy(true);
    setError(null);
    let original: OriginalCommand | undefined;
    try {
      const requestId = crypto.randomUUID();
      const proposed = decode({
        requestId,
        text,
        title,
        call: { ...call, requestId },
      });
      const existing = restore();
      if (existing) {
        setPending(existing);
        throw new Error("请先核对已有命令原请求。");
      }
      if (effect !== "read") {
        const reserved = claimPending(keyFor(proposed), proposed, decode);
        setPending(reserved);
        if (reserved === "unreadable" || reserved.requestId !== requestId)
          throw new Error("请先核对已有命令原请求。");
        original = reserved;
      }
      setResult(null);
      const operation = await connection.extensions.call(proposed.call, {
        requestId,
        signal: requestSignal(ui.signal, connection),
      });
      if (!accept(operation, proposed))
        throw new Error(
          effect === "read"
            ? "命令读取未确认，可重新读取；原稿已保留。"
            : "命令结果尚未确认，请核对原请求。",
        );
    } catch (reason) {
      if (
        original &&
        reason instanceof PocketRemoteError &&
        reason.outcome === "denied"
      ) {
        try {
          clearPending(keyFor(original), original.requestId, decode);
          const remaining = restore();
          if (alive()) setPending(remaining);
        } catch {
          // Preserve the original if local acknowledgement cannot be stored.
        }
      }
      const failure =
        effect === "read" &&
        reason instanceof PocketRemoteError &&
        reason.outcome !== "denied"
          ? new Error("命令读取未确认，可重新读取；原稿已保留。")
          : reason;
      if (alive()) setError(describeFailure(failure));
      throw failure;
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  async function check(): Promise<string | undefined> {
    if (!alive() || admission.current) return;
    const original = restore();
    setPending(original);
    if (!original || original === "unreadable") return;
    admission.current = true;
    setBusy(true);
    setError(null);
    try {
      const operation = await connection.extensions.operationByRequest(
        {
          extension: original.call.extension,
          requestId: original.requestId,
          ...(original.call.target ? { target: original.call.target } : {}),
        },
        { signal: requestSignal(ui.signal, connection) },
      );
      if (accept(operation, original) && alive()) return original.text;
      if (alive()) setError("命令结果仍未知，原请求继续保留。");
    } catch (reason) {
      if (alive()) setError(describeFailure(reason));
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  return { pending, result, busy, error, run, check };
}
