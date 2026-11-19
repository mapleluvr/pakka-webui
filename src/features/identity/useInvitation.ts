import { useEffect, useRef, useState } from "react";
import type { UiContext } from "@pakka/webui-sdk";
import { PocketRemoteError } from "@pakka/client/pocket";
import type { PocketInvite } from "@pakka/protocol/pocket";
import {
  decodeOriginalInvitation,
  type OriginalInvitation,
} from "@pakka/protocol/webui";
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

export function useInvitation(ui: UiContext, connection: PakkaConnection) {
  const key = JSON.stringify([
    connection.origin,
    connection.person.id,
    "people-invitation",
  ]);
  const [lifetime] = useState(() => new AbortController());
  const alive = () =>
    !ui.signal.aborted &&
    !connection.signal.aborted &&
    !lifetime.signal.aborted;
  const signal = () =>
    AbortSignal.any([requestSignal(ui.signal, connection), lifetime.signal]);
  const [pending, setPending] = useState(() =>
    readPending(key, decodeOriginalInvitation),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    invite: PocketInvite;
    token: string | null;
    qr?: string;
  } | null>(null);
  const admission = useRef(false);
  useEffect(() => () => lifetime.abort(), [lifetime]);
  function release(requestId: string) {
    const remaining = clearPending(key, requestId, decodeOriginalInvitation);
    if (alive()) setPending(remaining);
  }
  async function create(input: Omit<OriginalInvitation, "requestId">) {
    if (admission.current || !alive()) return;
    admission.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    let sent: OriginalInvitation | undefined;
    try {
      const original = decodeOriginalInvitation({
        ...input,
        requestId: crypto.randomUUID(),
      });
      const reserved = claimPending(key, original, decodeOriginalInvitation);
      setPending(reserved);
      if (
        reserved === "unreadable" ||
        reserved.requestId !== original.requestId
      ) {
        setError("已有邀请原请求尚未确认，本次未创建邀请。");
        return;
      }
      sent = original;
      const value = await connection.workbench.request(
        { op: "invite", ...original },
        { signal: signal() },
      );
      if (value.kind !== "invite")
        throw new Error("邀请结果未得到确认，请核对原请求。");
      release(original.requestId);
      if (alive())
        setResult({
          invite: value.invite,
          token: value.token,
          ...(value.qr ? { qr: value.qr } : {}),
        });
    } catch (reason) {
      if (
        sent &&
        reason instanceof PocketRemoteError &&
        reason.outcome === "denied"
      ) {
        try {
          release(sent.requestId);
        } catch {
          /* Keep the unresolved record if storage is unavailable. */
        }
      }
      if (alive()) setError(describeFailure(reason));
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  async function lookup() {
    if (admission.current || !alive()) return;
    admission.current = true;
    setBusy(true);
    setError(null);
    try {
      const original = readPending(key, decodeOriginalInvitation);
      setPending(original);
      if (!original || original === "unreadable") return;
      const value = await connection.services.request(
        { op: "people.invite.lookup", original },
        { signal: signal() },
      );
      if (!value.invite) {
        if (alive())
          setError("尚未找到原邀请，继续保留原请求；不能据此再次创建。");
        return;
      }
      release(original.requestId);
      if (alive()) setResult({ invite: value.invite, token: null });
    } catch (reason) {
      if (alive()) setError(describeFailure(reason));
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  return { pending, busy, error, result, create, lookup };
}
