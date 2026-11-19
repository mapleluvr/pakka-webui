import { useRef, useState } from "react";
import { PocketRemoteError } from "@pakka/client/pocket";
import {
  decodeControlIdentity,
  decodeFacetControl,
} from "@pakka/protocol/extension-rpc";
import type {
  ExtensionFacetControl,
  ExtensionControlReceipt,
  ExtensionRegistration,
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

export type FacetIdentity = Pick<ExtensionFacetControl, "extension" | "facet">;
function controlKey(connection: PakkaConnection, identity: FacetIdentity) {
  return JSON.stringify([
    "pakka-facet-control",
    connection.origin,
    connection.person.id,
    identity.extension,
    identity.facet,
  ]);
}

/** A removed publication must not hide an original request that is still awaiting confirmation. */
export function pendingFacetIdentities(
  connection: PakkaConnection,
): FacetIdentity[] {
  const identities: FacetIdentity[] = [];
  for (let index = 0; index < sessionStorage.length; index++) {
    const key = sessionStorage.key(index);
    if (!key) continue;
    try {
      const parts: unknown = JSON.parse(key);
      if (
        !Array.isArray(parts) ||
        parts.length !== 5 ||
        parts[0] !== "pakka-facet-control" ||
        parts[1] !== connection.origin ||
        parts[2] !== connection.person.id
      )
        continue;
      const identity = decodeControlIdentity({
        extension: parts[3],
        facet: parts[4],
        requestId: "saved",
      });
      identities.push({ extension: identity.extension, facet: identity.facet });
    } catch {
      /* Unrelated or invalid storage keys are not facet identities. */
    }
  }
  return identities;
}

export function useFacetControl(
  ui: UiContext,
  connection: PakkaConnection,
  identity: FacetIdentity,
  changed: () => Promise<void>,
) {
  const key = controlKey(connection, identity);
  function decode(value: unknown) {
    const original = decodeFacetControl(value);
    if (
      original.extension !== identity.extension ||
      original.facet !== identity.facet
    )
      throw new Error("控制原请求与此 facet 不符。");
    return original;
  }
  const [pending, setPending] = useState(() => readPending(key, decode));
  const [receipt, setReceipt] = useState<ExtensionControlReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const admission = useRef(false);
  const alive = () => !ui.signal.aborted && !connection.signal.aborted;
  async function run(change?: {
    action: ExtensionFacetControl["action"];
    registration: ExtensionRegistration;
  }): Promise<boolean> {
    if (admission.current || !alive()) return false;
    admission.current = true;
    setBusy(true);
    setError(null);
    let request: ExtensionFacetControl | undefined;
    let confirmed = false;
    try {
      request = change
        ? decode({
            extension: identity.extension,
            facet: identity.facet,
            action: change.action,
            expectedGeneration: change.registration.generation,
            requestId: crypto.randomUUID(),
          })
        : undefined;
      const original = request
        ? claimPending(key, request, decode)
        : readPending(key, decode);
      setPending(original);
      if (!original || original === "unreadable") return false;
      if (request && original.requestId !== request.requestId) {
        setError("此 facet 已有控制请求待核对，本次没有提交。");
        return false;
      }
      const signal = requestSignal(ui.signal, connection);
      const result = request
        ? await connection.extensions.control(original, { signal })
        : await connection.extensions.controlByRequest(
            {
              extension: original.extension,
              facet: original.facet,
              requestId: original.requestId,
            },
            { signal },
          );
      if (
        result &&
        (result.action !== original.action ||
          result.expectedGeneration !== original.expectedGeneration)
      )
        throw new Error("原控制回执参数不符，继续保留待核对请求。");
      if (alive()) setReceipt(result);
      if (!result || result.state === "unknown") {
        if (alive())
          setError(
            result
              ? "原控制结果仍未知；继续保留原请求，不能重新提交。"
              : "尚未找到原控制回执，不能据此重新提交。",
          );
        return false;
      }
      confirmed = true;
      const remaining = clearPending(key, original.requestId, decode);
      if (alive()) {
        setPending(remaining);
        await changed();
      }
      return alive();
    } catch (reason) {
      if (
        !confirmed &&
        request &&
        reason instanceof PocketRemoteError &&
        reason.outcome === "denied"
      ) {
        try {
          const remaining = clearPending(key, request.requestId, decode);
          if (alive()) setPending(remaining);
        } catch {
          /* Keep the original when acknowledgement cannot be stored. */
        }
      }
      if (alive())
        setError(
          confirmed
            ? `服务已确认原控制，当前显示尚未同步。${describeFailure(reason)}`
            : describeFailure(reason),
        );
      return confirmed && alive();
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  return { pending, receipt, busy, error, run };
}
