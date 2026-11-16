import { useEffect, useRef, useState } from "react";
import type {
  AgentRef,
  PocketConfiguration,
  PocketConfigurationChange,
} from "@pakka/client/pocket";
import type { ModelCatalogItem } from "@pakka/protocol/webui";
import type { UiContext } from "@pakka/webui-sdk";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";
import { exactModel } from "./ModelPicker.js";

/** Read current state after a change; an unconfirmed change is never retried by this hook. */
export function useConversationConfiguration(
  ui: UiContext,
  connection: PakkaConnection,
  target: AgentRef,
) {
  const [configuration, setConfiguration] =
    useState<PocketConfiguration | null>(null);
  const [model, setModel] = useState<ModelCatalogItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const admission = useRef(false);
  const current = useRef(target);
  const alive = () => !ui.signal.aborted && !connection.signal.aborted;
  async function read(ref: AgentRef, signal: AbortSignal) {
    const result = await connection.workbench.request(
      { op: "configuration", target: ref },
      { signal },
    );
    if (result.kind !== "configuration")
      throw new Error("配置读取未得到确认。");
    if (signal.aborted) return;
    current.current = result.configuration.ref;
    setConfiguration(result.configuration);
    const key = result.configuration.current?.model;
    let item: ModelCatalogItem | null = null;
    if (key)
      try {
        item = await exactModel(connection, key, signal);
      } catch {
        /* Current configuration remains authoritative when the catalog is unavailable. */
      }
    if (!signal.aborted) setModel(item);
  }
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      requestSignal(ui.signal, connection),
    ]);
    void read(target, signal).catch((reason) => {
      if (!signal.aborted) setError(describeFailure(reason));
    });
    return () => controller.abort();
  }, [target, connection, ui]);
  async function configure(
    change: PocketConfigurationChange,
  ): Promise<boolean> {
    if (admission.current || unconfirmed || !alive()) return false;
    if (!configuration?.canConfigure) {
      setError("当前身份不能配置此 Conversation。");
      return false;
    }
    admission.current = true;
    setBusy(true);
    setError(null);
    const signal = requestSignal(ui.signal, connection);
    let confirmed = false;
    try {
      const result = await connection.workbench.request(
        { op: "configure.agent", target: current.current, change },
        { signal, requestId: crypto.randomUUID() },
      );
      if (result.kind !== "reference") throw new Error("配置结果未得到确认。");
      current.current = result.ref;
      confirmed = true;
      await read(result.ref, signal);
      return !signal.aborted;
    } catch (reason) {
      if (alive()) {
        setError(
          confirmed
            ? `配置已保存，当前显示尚未刷新。${describeFailure(reason)}`
            : describeFailure(reason),
        );
        setUnconfirmed(true);
      }
      return false;
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  async function reconcile() {
    if (admission.current || !alive()) return;
    admission.current = true;
    setBusy(true);
    const signal = requestSignal(ui.signal, connection);
    try {
      const { resolution } = await connection.services.request(
        {
          op: "resource.resolve",
          reference: {
            kind: "conversation",
            sessionId: target.sessionId,
            conversationId: target.conversationId,
          },
        },
        { signal },
      );
      if (resolution.status !== "loaded")
        throw new Error("原 Conversation 当前未加载。");
      await read(resolution.target, signal);
      if (!signal.aborted) {
        setUnconfirmed(false);
        setError("已读取当前配置；此前未确认请求的结果仍未知。");
      }
    } catch (reason) {
      if (alive()) setError(describeFailure(reason));
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  return {
    configuration,
    model,
    busy,
    unconfirmed,
    error,
    configure,
    reconcile,
    currentTarget: () => current.current,
  };
}
