import { useEffect, useRef, useState } from "react";
import {
  PocketRemoteError,
  type PocketClientResult,
} from "@pakka/client/pocket";
import {
  decodeWebUiCommand,
  type NotificationRequest,
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

export type NotificationStatus = Extract<
  PocketClientResult,
  { kind: "notification" }
>["status"];
interface Pending {
  readonly requestId: string;
  readonly original: NotificationRequest;
}
function decode(value: unknown): Pending {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "original,requestId" ||
    !("original" in value) ||
    !("requestId" in value) ||
    typeof value.requestId !== "string"
  )
    throw new Error("通知原请求记录无法解析。");
  const command = decodeWebUiCommand({
    op: "notification.lookup",
    original: value.original,
  });
  if (
    command.op !== "notification.lookup" ||
    command.original.input.requestId !== value.requestId
  )
    throw new Error("通知原请求身份不匹配。");
  return { requestId: value.requestId, original: command.original };
}
export function useNotificationChanges(
  ui: UiContext,
  connection: PakkaConnection,
  changed: () => void,
) {
  const prefix =
    "pakka-notifications:" +
    JSON.stringify([connection.origin, connection.person.id]) +
    ":";
  const key = (value: string) => prefix + value;
  function slot(original: NotificationRequest) {
    if (original.op === "notification.preferences") return key("preferences");
    if (original.op === "notification.unsubscribe")
      return key("device:" + original.input.deviceId);
    return key(
      "register:" +
        JSON.stringify([
          original.target.sessionId,
          original.target.conversationId,
        ]),
    );
  }
  function readRows() {
    const rows: { key: string; value: Pending | "unreadable" }[] = [];
    for (let index = 0; index < sessionStorage.length; index++) {
      const name = sessionStorage.key(index);
      if (!name?.startsWith(prefix)) continue;
      const value = readPending(name, decode);
      if (value) rows.push({ key: name, value });
    }
    return rows.sort((a, b) => a.key.localeCompare(b.key));
  }
  const [pending, setPending] = useState(readRows);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [confirmed, setConfirmed] = useState<
    { original: NotificationRequest; status: NotificationStatus }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const admission = useRef(new Set<string>());
  const alive = () => !ui.signal.aborted && !connection.signal.aborted;
  useEffect(() => {
    setPending(readRows());
    setConfirmed([]);
    setError(null);
  }, [ui, connection]);
  async function run(name: string, source?: NotificationRequest) {
    if (!alive() || admission.current.has(name)) return false;
    admission.current.add(name);
    setBusy(new Set(admission.current));
    setError(null);
    let original: Pending | undefined,
      writeAcknowledged = false;
    const signal = requestSignal(ui.signal, connection);
    try {
      const request = source
        ? decode({ requestId: source.input.requestId, original: source })
        : undefined;
      const existing = request
        ? claimPending(name, request, decode)
        : readPending(name, decode);
      setPending(readRows());
      if (existing === "unreadable") {
        setError("原请求记录无法解析，此操作保持暂停。");
        return false;
      }
      if (!existing) {
        setError("没有可核对的原请求；本次没有写入。");
        return false;
      }
      original = existing;
      if (request && request.requestId !== existing.requestId) {
        setError("此操作已有原请求待核对，本次没有提交。");
        return false;
      }
      if (request) {
        const result = await connection.workbench.request(existing.original, {
          signal,
        });
        if (result.kind !== "notification")
          throw new Error("通知修改响应未通过校验。");
        writeAcknowledged = true;
      }
      const result = await connection.services.request(
        { op: "notification.lookup", original: existing.original },
        { signal },
      );
      if (!result.status) {
        if (alive())
          setError("尚未找到原请求结果；原请求继续保留，不能重复提交。");
        return false;
      }
      if (signal.aborted) return false;
      clearPending(name, existing.requestId, decode);
      setPending(readRows());
      setConfirmed((value) => [
        ...value.slice(-7),
        { original: existing.original, status: result.status! },
      ]);
      changed();
      return true;
    } catch (reason) {
      if (
        source &&
        original &&
        !writeAcknowledged &&
        reason instanceof PocketRemoteError &&
        reason.outcome === "denied"
      ) {
        clearPending(name, original.requestId, decode);
        if (alive()) setPending(readRows());
      }
      if (alive())
        setError(
          writeAcknowledged
            ? "写入响应已返回，但原请求核对或当前读取未完成。" +
                describeFailure(reason)
            : describeFailure(reason),
        );
      return false;
    } finally {
      admission.current.delete(name);
      if (alive()) setBusy(new Set(admission.current));
    }
  }
  function blocked(name: string) {
    return admission.current.has(name) || !!readPending(name, decode);
  }
  const preferences = readPending(key("preferences"), decode);
  return {
    pending,
    busy,
    confirmed,
    error,
    preferences,
    send: (original: NotificationRequest) => run(slot(original), original),
    reconcile: (name: string) => run(name),
    preferencesBlocked: () => blocked(key("preferences")),
    registrationBlocked: (target: {
      sessionId: string;
      conversationId: string;
    }) =>
      blocked(
        key(
          "register:" +
            JSON.stringify([target.sessionId, target.conversationId]),
        ),
      ),
    deviceBlocked: (id: string) => blocked(key("device:" + id)),
  };
}
