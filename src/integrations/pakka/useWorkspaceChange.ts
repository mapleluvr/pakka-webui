import { useRef, useState } from "react";
import {
  PocketRemoteError,
  type PocketClientResult,
} from "@pakka/client/pocket";
import {
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
type Original = { requestId: string; command: WorkspaceChange };
const requestId = (command: WorkspaceChange) =>
  "input" in command ? command.input.requestId : command.requestId;
function decode(value: unknown): Original {
  if (
    !value ||
    typeof value !== "object" ||
    !("requestId" in value) ||
    !("command" in value)
  )
    throw new Error("原请求不可读。");
  const { command } = decodePocketRequest({
    version: 2,
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
  return { requestId: requestId(original), command: original };
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
  const [pending, setPending] = useState<Original | "unreadable" | null>(() =>
    readPending(key, decode),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const admission = useRef(false);
  const alive = () => !ui.signal.aborted && !connection.signal.aborted;
  async function run(command?: WorkspaceChange) {
    if (admission.current || !alive()) return;
    admission.current = true;
    setBusy(true);
    setError(null);
    let original: Original | "unreadable" | null = null;
    try {
      original = command
        ? claimPending(
            key,
            decode({ requestId: requestId(command), command }),
            decode,
          )
        : readPending(key, decode);
      setPending(original);
      if (!original || original === "unreadable") return;
      if (command && original.requestId !== requestId(command)) {
        setError("此作用域已有待核对操作，请先核对原请求。");
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
        if (alive()) setError("原操作尚未确认；原请求仍保留，不能重复提交。");
        return;
      }
      const remaining = clearPending(key, original.requestId, decode);
      if (alive()) {
        setPending(remaining);
        return result;
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
      if (alive()) setError(describeFailure(reason));
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  return { pending, busy, error, run };
}
