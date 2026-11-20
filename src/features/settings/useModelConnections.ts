import { useEffect, useRef, useState } from "react";
import { PocketRemoteError } from "@pakka/client/pocket";
import {
  decodeModelConfigurationChange,
  type ModelConfigurationChange,
  type ModelConfigurationEdit,
  type ModelConfigurationReceipt,
  type ModelConfigurationView,
} from "@pakka/protocol/webui";
import type { UiContext } from "@pakka/webui-sdk";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";
import {
  readPending,
  claimPending,
  clearPending,
} from "../../integrations/pakka/pending.js";

export function useModelConnections(
  ui: UiContext,
  connection: PakkaConnection,
) {
  const key = JSON.stringify([
    location.origin,
    connection.person.id,
    "model-connections",
  ]);
  const restore = () => readPending(key, decodeModelConfigurationChange);
  const [view, setView] = useState<ModelConfigurationView | null>(null);
  const [pending, setPending] = useState(restore);
  const [receipt, setReceipt] = useState<ModelConfigurationReceipt | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const admission = useRef(false);
  const alive = () => !ui.signal.aborted && !connection.signal.aborted;
  const signal = () => requestSignal(ui.signal, connection);
  async function read(readSignal = signal()) {
    const result = await connection.services.request(
      { op: "model-connections.read" },
      { signal: readSignal },
    );
    if (!readSignal.aborted) setView(result.configuration);
  }
  useEffect(() => {
    const controller = new AbortController();
    void read(AbortSignal.any([controller.signal, signal()])).catch(
      (reason) => {
        if (!controller.signal.aborted && alive())
          setError(describeFailure(reason));
      },
    );
    return () => controller.abort();
  }, [ui, connection]);
  function release(requestId: string) {
    const remaining = clearPending(
      key,
      requestId,
      decodeModelConfigurationChange,
    );
    if (alive()) setPending(remaining);
  }
  async function accept(
    result: ModelConfigurationReceipt,
    original: ModelConfigurationChange,
  ) {
    if (
      result.requestId !== original.requestId ||
      result.actorId !== connection.person.id
    )
      throw new Error("原配置请求身份未得到确认。");
    if (alive()) setReceipt(result);
    if (result.state === "saved") {
      release(original.requestId);
      if (alive())
        setMessage(
          result.reload === "ready"
            ? "配置已保存并重新加载。端点能力需通过实际请求确认。"
            : "配置已保存，重新加载尚未完成；可以单独重载。",
        );
      try {
        await read();
      } catch (reason) {
        if (alive())
          setError(`保存已确认，读取当前配置失败。${describeFailure(reason)}`);
      }
    }
  }
  async function save(
    edits: readonly ModelConfigurationEdit[],
    validateOnly = false,
  ) {
    if (admission.current || !view || !alive()) return;
    const existing = restore();
    if (existing) {
      setPending(existing);
      setError("有原请求尚未确认，请先核对。");
      return;
    }
    admission.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    setReceipt(null);
    let sent: ModelConfigurationChange | null = null;
    try {
      const change = decodeModelConfigurationChange({
        requestId: crypto.randomUUID(),
        expectedVersion: view.version,
        edits,
      });
      const validation = await connection.services.request(
        { op: "model-connections.validate", change },
        { signal: signal() },
      );
      if (!validation.valid)
        throw new Error("原生配置校验未通过，请检查端点、协议与模型参数。");
      if (validateOnly) {
        if (alive())
          setMessage(
            "原生配置校验通过，尚未保存；这不证明端点或模型能力可用。",
          );
        return;
      }
      const reserved = claimPending(
        key,
        change,
        decodeModelConfigurationChange,
      );
      if (alive()) setPending(reserved);
      if (
        reserved === "unreadable" ||
        reserved.requestId !== change.requestId
      ) {
        if (alive())
          setError("另一个界面有原请求尚未确认，请先核对；本次修改未提交。");
        return;
      }
      sent = change;
      const result = await connection.services.request(
        { op: "model-connections.write", change },
        { signal: signal() },
      );
      await accept(result.receipt, change);
    } catch (reason) {
      if (
        sent &&
        reason instanceof PocketRemoteError &&
        reason.outcome === "denied"
      ) {
        try {
          release(sent.requestId);
        } catch {
          /* Preserve uncertainty if browser storage is unavailable. */
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
    const original = restore();
    setPending(original);
    if (!original || original === "unreadable") return;
    admission.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await connection.services.request(
        { op: "model-connections.lookup", original },
        { signal: signal() },
      );
      if (result.receipt) await accept(result.receipt, original);
      else if (alive())
        setMessage("尚未找到原请求的回执，结果仍未知；未重新提交。");
    } catch (reason) {
      if (alive()) setError(describeFailure(reason));
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  async function refresh(reload: boolean) {
    if (admission.current || !alive()) return;
    admission.current = true;
    setBusy(true);
    setError(null);
    try {
      if (reload) {
        const result = await connection.services.request(
          { op: "model-connections.reload" },
          { signal: signal() },
        );
        if (alive())
          setMessage(
            result.load === "ready"
              ? "原生配置已重载。"
              : "重载尚未成功，已保存的配置仍保留。",
          );
      }
      await read();
    } catch (reason) {
      if (alive()) setError(describeFailure(reason));
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  return {
    view,
    pending,
    receipt,
    error,
    message,
    busy,
    save,
    lookup,
    refresh,
  };
}
