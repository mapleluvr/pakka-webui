import { useRef, useState } from "react";
import { PocketRemoteError } from "@pakka/client/pocket";
import {
  decodePeopleChange,
  type PeopleAction,
  type PeopleChange,
} from "@pakka/protocol/webui";
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

export function usePeopleChange(ui: UiContext, connection: PakkaConnection) {
  const key = JSON.stringify([
    "pakka-people-change",
    connection.origin,
    connection.person.id,
  ]);
  const [pending, setPending] = useState(() =>
    readPending(key, decodePeopleChange),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const admission = useRef(false);
  const alive = () => !ui.signal.aborted && !connection.signal.aborted;
  async function run(action?: PeopleAction) {
    if (admission.current || !alive()) return;
    admission.current = true;
    setBusy(true);
    setError(null);
    let request: PeopleChange | undefined;
    try {
      request = action
        ? decodePeopleChange({ requestId: crypto.randomUUID(), action })
        : undefined;
      const original = request
        ? claimPending(key, request, decodePeopleChange)
        : readPending(key, decodePeopleChange);
      setPending(original);
      if (!original || original === "unreadable") return;
      if (request && original.requestId !== request.requestId) {
        setError("已有人员操作待核对，本次没有提交。");
        return;
      }
      const result = request
        ? await connection.services.request(
            { op: "people.write", change: original },
            { signal: requestSignal(ui.signal, connection) },
          )
        : await connection.services.request(
            { op: "people.lookup", original },
            { signal: requestSignal(ui.signal, connection) },
          );
      if (!result.receipt) {
        if (alive())
          setError("尚未找到原操作，继续保留原请求，不能据此重新提交。");
        return;
      }
      const remaining = clearPending(
        key,
        original.requestId,
        decodePeopleChange,
      );
      if (alive()) {
        setPending(remaining);
        return result.receipt;
      }
    } catch (reason) {
      if (
        request &&
        reason instanceof PocketRemoteError &&
        reason.outcome === "denied"
      ) {
        try {
          const remaining = clearPending(
            key,
            request.requestId,
            decodePeopleChange,
          );
          if (alive()) setPending(remaining);
        } catch {
          /* Local acknowledgement remains unresolved. */
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
