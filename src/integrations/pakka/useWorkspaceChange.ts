import { useRef, useState } from "react";
import {
  PocketRemoteError,
  type PocketClientResult,
} from "@pakka/client/pocket";
import {
  POCKET_VERSION,
  decodePocketRequest,
  type PocketCommand,
  type PocketOriginalCommand,
} from "@pakka/protocol/pocket";
import type { UiContext } from "@pakka/webui-sdk";
import { claimPending, clearPending, readPending } from "./pending.js";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "./connection.js";

export type WorkspaceChange =
  | PocketOriginalCommand
  | Extract<PocketCommand, { op: "session.create" | "navigation.update" }>;
export type WorkspaceOriginal = {
  requestId: string;
  command: WorkspaceChange;
  // Labels at submission, including folders that no longer exist on recovery.
  folderName?: string;
  conversationName?: string;
};
const requestId = (command: WorkspaceChange) =>
  "input" in command ? command.input.requestId : command.requestId;
function decode(value: unknown): WorkspaceOriginal {
  if (
    !value ||
    typeof value !== "object" ||
    !("requestId" in value) ||
    !("command" in value)
  )
    throw new Error("原请求不可读。");
  const { command } = decodePocketRequest({
    version: POCKET_VERSION,
    requestId: value.requestId,
    command: value.command,
  });
  if (
    ![
      "create",
      "fork",
      "conversation.set",
      "session.create",
      "navigation.update",
    ].includes(command.op)
  )
    throw new Error("原操作类型不匹配。");
  const original = command as WorkspaceChange;
  if (requestId(original) !== value.requestId)
    throw new Error("原请求身份不匹配。");
  return {
    requestId: requestId(original),
    command: original,
    ...("folderName" in value && typeof value.folderName === "string"
      ? { folderName: value.folderName }
      : {}),
    ...("conversationName" in value &&
    typeof value.conversationName === "string"
      ? { conversationName: value.conversationName }
      : {}),
  };
}
function lookup(command: WorkspaceChange): PocketCommand {
  if (command.op === "session.create")
    return { op: "session.lookup", original: command };
  if (command.op === "navigation.update")
    return { op: "navigation.lookup", original: command.input };
  return { op: "conversation.lookup", original: command };
}
function confirmed(result: PocketClientResult) {
  if (result.kind === "managed.session")
    return result.session?.status === "ready";
  if (result.kind === "conversation.operation") return result.result !== null;
  if (result.kind === "navigation.operation") return result.receipt !== null;
  return (
    result.kind === "reference" ||
    result.kind === "metadata" ||
    result.kind === "navigation.updated"
  );
}
/** Known public mutation families with their own original-request lookup contracts. */
export function useWorkspaceChange(
  ui: UiContext,
  connection: PakkaConnection,
  scope: string,
) {
  const key = JSON.stringify([
    "pakka-workspace-change",
    connection.origin,
    connection.person.id,
    scope,
  ]);
  const [pending, setPending] = useState<
    WorkspaceOriginal | "unreadable" | null
  >(() => readPending(key, decode));
  const [activity, setActivity] = useState<"save" | "check" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const admission = useRef(false);
  const alive = () => !ui.signal.aborted && !connection.signal.aborted;
  async function run(
    command?: WorkspaceChange,
    labels?: Pick<WorkspaceOriginal, "folderName" | "conversationName">,
  ) {
    if (admission.current || !alive()) return;
    admission.current = true;
    setActivity(command ? "save" : "check");
    setError(null);
    let original: WorkspaceOriginal | "unreadable" | null = null;
    try {
      original = command
        ? claimPending(
            key,
            decode({ requestId: requestId(command), command, ...labels }),
            decode,
          )
        : readPending(key, decode);
      setPending(original);
      if (!original || original === "unreadable") return;
      if (command && original.requestId !== requestId(command)) {
        setError("还有一项更改未确认，请先查看它的状态。");
        return;
      }
      const result = await connection.workbench.request(
        command ?? lookup(original.command),
        {
          signal: requestSignal(ui.signal, connection),
          ...(command ? { requestId: original.requestId } : {}),
        },
      );
      if (!confirmed(result)) {
        if (alive())
          setError("还没有查到这次更改的回执。可以稍后再查看，不必重新保存。");
        return;
      }
      const remaining = clearPending(key, original.requestId, decode);
      if (alive()) {
        setPending(remaining);
        return { result, original };
      }
    } catch (reason) {
      if (
        command &&
        original &&
        original !== "unreadable" &&
        reason instanceof PocketRemoteError &&
        reason.outcome === "denied"
      ) {
        try {
          const remaining = clearPending(key, original.requestId, decode);
          if (alive()) setPending(remaining);
        } catch {
          /* Keep the original on local acknowledgement failure. */
        }
      }
      if (alive())
        setError(
          reason instanceof PocketRemoteError &&
            reason.code === "UNKNOWN" &&
            original &&
            original !== "unreadable"
            ? command
              ? "未收到保存回执。"
              : "暂时无法读取这次更改的回执，请稍后再查看。"
            : describeFailure(reason),
        );
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
    run,
  };
}
