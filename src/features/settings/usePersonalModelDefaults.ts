import { useEffect, useRef, useState } from "react";
import { PocketRemoteError } from "@pakka/client/pocket";
import {
  decodeModelDefaultsChange,
  type ModelDefaults,
  type ModelDefaultsChange,
  type ModelDefaultsReceipt,
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

const personalSlots = new EventTarget();

export type DefaultSelection = Pick<ModelDefaults, "model" | "thinkingLevel">;
function describeDefaults(value: ModelDefaults) {
  return `${value.model ? `${value.model.provider}/${value.model.id}` : "跟随实例"} · Thinking：${value.thinkingLevel ?? "使用原生默认"}`;
}
export function sameModel(
  a: ModelDefaults["model"],
  b: ModelDefaults["model"],
) {
  return a?.provider === b?.provider && a?.id === b?.id;
}
export function usePersonalModelDefaults(
  ui: UiContext,
  connection: PakkaConnection,
  followConfirmedChanges = true,
) {
  const key = JSON.stringify([
    location.origin,
    connection.person.id,
    "model-defaults",
  ]);
  const restore = () => readPending(key, decodeModelDefaultsChange);
  const [pending, setPending] = useState(restore),
    [defaults, setDefaults] = useState<ModelDefaults | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const lifetime = useRef<AbortSignal | null>(null),
    admission = useRef(false),
    followPeer = useRef(followConfirmedChanges);
  useEffect(() => {
    followPeer.current = followConfirmedChanges;
  }, [followConfirmedChanges]);
  async function read(signal: AbortSignal) {
    try {
      const { defaults: value } = await connection.services.request(
        { op: "model-defaults.read" },
        { signal },
      );
      signal.throwIfAborted();
      setDefaults(value);
      return value;
    } catch (e) {
      if (!signal.aborted) setDefaults(null);
      throw e;
    }
  }
  useEffect(() => {
    const controller = new AbortController(),
      signal = AbortSignal.any([
        controller.signal,
        requestSignal(ui.signal, connection),
      ]);
    lifetime.current = signal;
    admission.current = true;
    setBusy(true);
    setDefaults(null);
    setPending(restore());
    personalSlots.addEventListener(
      key,
      (e) => {
        setPending(restore());
        // A hidden settings page may still be mounted. Follow confirmed peer writes only when this view has no draft to rebase.
        if (
          e instanceof CustomEvent &&
          e.detail === "confirmed" &&
          followPeer.current &&
          !admission.current
        )
          void run("read");
      },
      { signal },
    );
    void read(signal)
      .catch((e) => {
        if (!signal.aborted) setError(describeFailure(e));
      })
      .finally(() => {
        if (!signal.aborted) {
          admission.current = false;
          setBusy(false);
        }
      });
    return () => controller.abort();
  }, [connection, ui]);
  function release(id: string, signal: AbortSignal, confirmed = false) {
    const rest = clearPending(key, id, decodeModelDefaultsChange);
    if (!signal.aborted) setPending(rest);
    personalSlots.dispatchEvent(
      confirmed
        ? new CustomEvent(key, { detail: "confirmed" })
        : new Event(key),
    );
  }
  function verify(
    receipt: ModelDefaultsReceipt,
    original: ModelDefaultsChange,
  ) {
    if (
      receipt.actorId !== connection.person.id ||
      receipt.requestId !== original.requestId ||
      receipt.defaults.version !== original.expectedVersion + 1 ||
      !sameModel(receipt.defaults.model, original.model) ||
      receipt.defaults.thinkingLevel !== original.thinkingLevel
    )
      throw Error("个人默认的原请求身份或保存内容未能确认。");
  }
  async function run(
    mode: "read" | "lookup" | "write",
    selection?: DefaultSelection,
  ) {
    const signal = lifetime.current;
    if (!signal || signal.aborted || admission.current) return false;
    admission.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    let sent: ModelDefaultsChange | undefined,
      confirmed = false;
    try {
      const existing = restore();
      setPending(existing);
      if (mode === "read") {
        await read(signal);
        return true;
      }
      let original: ModelDefaultsChange, receipt: ModelDefaultsReceipt | null;
      if (mode === "lookup") {
        if (!existing || existing === "unreadable") return false;
        original = existing;
        ({ receipt } = await connection.services.request(
          { op: "model-defaults.lookup", original },
          { signal },
        ));
        if (!receipt) {
          if (!signal.aborted)
            setMessage("尚未找到原默认请求的回执，未重新提交。");
          return false;
        }
      } else {
        if (!selection || !defaults || existing) return false;
        if (
          sameModel(selection.model, defaults.model) &&
          selection.thinkingLevel === defaults.thinkingLevel
        )
          return true;
        original = decodeModelDefaultsChange({
          ...selection,
          expectedVersion: defaults.version,
          requestId: crypto.randomUUID(),
        });
        const reserved = claimPending(key, original, decodeModelDefaultsChange);
        setPending(reserved);
        personalSlots.dispatchEvent(new Event(key));
        if (
          reserved === "unreadable" ||
          reserved.requestId !== original.requestId
        )
          return false;
        sent = original;
        ({ receipt } = await connection.services.request(
          { op: "model-defaults.write", change: original },
          { signal },
        ));
      }
      verify(receipt, original);
      confirmed = true;
      release(original.requestId, signal, true);
      signal.throwIfAborted();
      const model = original.model;
      setMessage(
        model
          ? `已确认保存我的新对话默认模型：${model.provider}/${model.id}。`
          : "已确认恢复跟随实例。",
      );
      // Even a genuine receipt can be historical. Only a separate read supplies the current marker/version.
      const now = await read(signal);
      if (now.version !== receipt.defaults.version)
        setMessage(
          `原请求已确认，个人默认随后已有更新。已读取当前设置：${describeDefaults(now)}。`,
        );
      return true;
    } catch (e) {
      if (
        sent &&
        !confirmed &&
        e instanceof PocketRemoteError &&
        e.outcome === "denied"
      ) {
        try {
          release(sent.requestId, signal);
        } catch {
          if (!signal.aborted)
            setError("请求已被拒绝，本地原请求未能清除。请保留记录。");
          return false;
        }
        if (e.code === "CONFLICT" && !signal.aborted) {
          try {
            const now = await read(signal);
            setError(
              `个人默认已在别处更改。当前为 ${describeDefaults(now)}。请核对后再决定是否保存。`,
            );
          } catch (reason) {
            if (!signal.aborted) setError(describeFailure(reason));
          }
          return false;
        }
      }
      if (!signal.aborted)
        setError(
          confirmed
            ? `保存已确认，当前个人默认读取失败。${describeFailure(e)}`
            : describeFailure(e),
        );
      return confirmed;
    } finally {
      if (!signal.aborted) {
        admission.current = false;
        setBusy(false);
      }
    }
  }
  return {
    defaults,
    pending,
    busy,
    error,
    message,
    read: () => run("read"),
    save: (choice: DefaultSelection) => run("write", choice),
    lookup: () => run("lookup"),
  };
}
export type PersonalModelDefaults = ReturnType<typeof usePersonalModelDefaults>;
