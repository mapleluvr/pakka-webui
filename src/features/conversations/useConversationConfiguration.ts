import { useEffect, useRef, useState } from "react";
import {
  PocketRemoteError,
  type AgentRef,
  type PocketConfigurationChange,
} from "@pakka/client/pocket";
import {
  decodeConversationConfigurationRequest,
  type ConversationConfigurationRequest,
  type ConversationConfigurationSelection,
  type ConversationConfigurationView,
  type ModelCatalogItem,
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
import { exactModel } from "./ModelPicker.js";

/** The original receipt proves the change; current configuration is read separately. */
export function useConversationConfiguration(
  ui: UiContext,
  connection: PakkaConnection,
  target: AgentRef,
  changed: () => void,
) {
  const key = JSON.stringify([
    "pakka-conversation-configuration",
    connection.origin,
    connection.person.id,
    target.sessionId,
    target.conversationId,
  ]);
  function decode(value: unknown) {
    const original = decodeConversationConfigurationRequest(value);
    if (
      original.target.sessionId !== target.sessionId ||
      original.target.conversationId !== target.conversationId
    )
      throw new Error("配置原请求不属于此 Conversation。");
    return original;
  }
  const [view, setView] = useState<ConversationConfigurationView | null>(null);
  const [pending, setPending] = useState(() => readPending(key, decode));
  const [model, setModel] = useState<ModelCatalogItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const admission = useRef(false);
  const current = useRef(target);
  const readRevision = useRef(0);
  const alive = () => !ui.signal.aborted && !connection.signal.aborted;
  async function read(ref: AgentRef, signal: AbortSignal) {
    const revision = ++readRevision.current;
    const result = await connection.services.request(
      { op: "conversation-configuration.read", target: ref },
      { signal },
    );
    if (signal.aborted || revision !== readRevision.current) return;
    current.current = result.view.configuration.ref;
    setView(result.view);
    setModel(null);
    const selected = result.view.configuration.current?.model;
    let item: ModelCatalogItem | null = null;
    if (selected) {
      try {
        item = await exactModel(connection, selected, signal);
      } catch {
        /* Configuration remains authoritative when the optional model catalog is unavailable. */
      }
    }
    if (!signal.aborted && revision === readRevision.current) setModel(item);
  }
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      requestSignal(ui.signal, connection),
    ]);
    setView(null);
    setModel(null);
    void read(target, signal).catch((reason) => {
      if (!signal.aborted) setError(describeFailure(reason));
    });
    return () => controller.abort();
  }, [target, connection, ui]);
  async function refresh(signal: AbortSignal) {
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
  }
  async function run(
    selection?: ConversationConfigurationSelection,
  ): Promise<boolean> {
    if (admission.current || !alive()) return false;
    if (
      selection &&
      (!view?.configuration.canConfigure || !view.supportsRequests)
    ) {
      setError("当前来源或身份不支持配置变更。");
      return false;
    }
    admission.current = true;
    setBusy(true);
    setError(null);
    const signal = requestSignal(ui.signal, connection);
    let request: ConversationConfigurationRequest | undefined;
    let confirmed = false;
    try {
      request = selection
        ? decode({
            requestId: crypto.randomUUID(),
            target: current.current,
            selection,
          })
        : undefined;
      const original = request
        ? claimPending(key, request, decode)
        : readPending(key, decode);
      setPending(original);
      if (original === "unreadable") return false;
      if (!original) {
        await refresh(signal);
        return false;
      }
      if (request && original.requestId !== request.requestId) {
        setError("此 Conversation 已有配置待核对，本次没有提交。");
        return false;
      }
      const result = request
        ? await connection.services.request(
            { op: "conversation-configuration.write", change: original },
            { signal },
          )
        : await connection.services.request(
            { op: "conversation-configuration.lookup", original },
            { signal },
          );
      if (!result.receipt) {
        if (alive())
          setError("尚未找到原配置回执，原请求继续保留，不能重复保存。");
        return false;
      }
      confirmed = true;
      const remaining = clearPending(key, original.requestId, decode);
      if (alive()) setPending(remaining);
      await refresh(signal);
      if (alive()) changed();
      return !signal.aborted;
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
          /* Keep the original if local acknowledgement fails. */
        }
      }
      if (alive())
        setError(
          confirmed
            ? `配置已确认保存，当前显示尚未刷新。${describeFailure(reason)}`
            : describeFailure(reason),
        );
      return confirmed && !signal.aborted;
    } finally {
      admission.current = false;
      if (alive()) setBusy(false);
    }
  }
  return {
    configuration: view?.configuration ?? null,
    presets: view?.presets ?? [],
    supportsRequests: view?.supportsRequests ?? false,
    model,
    pending,
    busy,
    unconfirmed: !!pending,
    error,
    configure: (change: PocketConfigurationChange) =>
      run({ kind: "agent", change }),
    preset: (profile: string) => run({ kind: "profile", profile }),
    reconcile: () => run(),
    currentTarget: () => current.current,
  };
}
