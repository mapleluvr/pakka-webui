import { useEffect, useState } from "react";
import type { UiContext } from "@pakka/webui-sdk";
import type { ConversationReference } from "@pakka/protocol/webui";
import {
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";

/** Names come from the current authorized loaded list; a saved reference stays explicit. */
export function useConversationName(
  ui: UiContext,
  connection: PakkaConnection,
  reference: ConversationReference,
  loaded: boolean,
  revision: number,
) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    setName(null);
    if (!loaded) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      requestSignal(ui.signal, connection),
    ]);
    void connection.workbench
      .request({ op: "list" }, { signal })
      .then((result) => {
        if (signal.aborted || result.kind !== "list") return;
        const row = (result.navigation ?? []).find(
          (item) =>
            item.ref.sessionId === reference.sessionId &&
            item.ref.conversationId === reference.conversationId,
        );
        setName(row?.name ?? null);
      })
      .catch(() => {
        if (!signal.aborted) setName(null);
      });
    return () => controller.abort();
  }, [
    ui,
    connection,
    reference.sessionId,
    reference.conversationId,
    loaded,
    revision,
  ]);
  return name;
}
