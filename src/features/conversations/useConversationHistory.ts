import { useEffect, useMemo, useState } from "react";
import type { UiContext } from "@pakka/webui-sdk";
import type {
  ConversationHistory,
  ConversationReference,
  ConversationResolution,
} from "@pakka/protocol/webui";
import {
  describeFailure,
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";
import { observeConversation } from "../../integrations/pakka/observation.js";

export function useConversationHistory(
  ui: UiContext,
  connection: PakkaConnection,
  reference: ConversationReference,
  before: string | undefined,
  revision: number,
) {
  const scope = useMemo(
    () => ({ ui, connection, reference, before }),
    [ui, connection, reference, before],
  );
  const [resolution, setResolution] = useState<{
    scope: typeof scope;
    value: ConversationResolution;
  } | null>(null);
  const [history, setHistory] = useState<{
    scope: typeof scope;
    value: ConversationHistory;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [observation, setObservation] = useState<
    "reading" | "live" | "recovering" | "stopped" | "saved"
  >("reading");
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      requestSignal(ui.signal, connection),
    ]);
    let dispose: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const clear = () => {
      dispose?.();
      dispose = undefined;
      clearTimeout(timer);
    };
    const failed = (reason: unknown) => {
      if (signal.aborted) return;
      clear();
      setHistory(null);
      setError(describeFailure(reason));
      setLoading(false);
      setObservation("stopped");
    };
    const load = async () => {
      clear();
      if (signal.aborted) return;
      setLoading(true);
      setError(null);
      // A fresh public handshake detects server restarts before interpreting the former binding.
      await connection.workbench.request({ op: "hello" }, { signal });
      const { resolution: next } = await connection.services.request(
        { op: "resource.resolve", reference },
        { signal },
      );
      if (signal.aborted) return;
      setResolution((prior) =>
        prior?.scope === scope &&
        JSON.stringify(prior.value) === JSON.stringify(next)
          ? prior
          : { scope, value: next },
      );
      if (next.status !== "loaded" && next.status !== "unloaded") {
        setHistory(null);
        setLoading(false);
        setObservation("stopped");
        return;
      }
      const content = await connection.services.request(
        {
          op: "resource.history",
          reference,
          options: {
            limit: 32,
            maxBytes: 131072,
            ...(before ? { beforeEntryId: before } : {}),
          },
        },
        { signal },
      );
      if (signal.aborted) return;
      setHistory({ scope, value: content.history });
      setLoading(false);
      if (content.history.status !== "loaded" || before) {
        setObservation("saved");
        return;
      }
      setObservation("reading");
      const gap = () => {
        clear();
        if (signal.aborted) return;
        setHistory(null);
        setLoading(true);
        setObservation("recovering");
        if (++attempts > 3) {
          failed(
            new Error("实时观察未恢复，请刷新原历史。尚未确认的输入仍需核对。"),
          );
          return;
        }
        timer = setTimeout(() => {
          void load().catch(failed);
        }, 500 * attempts);
      };
      dispose = observeConversation(
        connection,
        content.history.snapshot.ref,
        signal,
        (value) => {
          clearTimeout(timer);
          if (signal.aborted) return;
          setHistory({
            scope,
            value: { status: "loaded", snapshot: value.snapshot },
          });
          setObservation("live");
          setLoading(false);
        },
        gap,
      );
      timer = setTimeout(gap, 15000);
    };
    // Keep this reader mounted during an explicit refresh; a new read scope has no visible old data.
    setHistory((prior) => (prior?.scope === scope ? prior : null));
    setObservation("reading");
    void load().catch(failed);
    signal.addEventListener("abort", clear, { once: true });
    return () => {
      controller.abort();
      clear();
      signal.removeEventListener("abort", clear);
    };
  }, [ui, connection, reference, before, revision, scope]);
  return {
    resolution: resolution?.scope === scope ? resolution.value : null,
    history: history?.scope === scope ? history.value : null,
    error,
    loading,
    observation,
  };
}
