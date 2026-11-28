import { useEffect, useState } from "react";
import type { ModelCatalogItem } from "@pakka/protocol/webui";
import type { UiContext } from "@pakka/webui-sdk";
import {
  requestSignal,
  type PakkaConnection,
} from "../../integrations/pakka/connection.js";

/** A provider lookup follows one revision to completion. Free-text discovery shows bounded suggestions only. */
export function useConnectionCatalog(
  connection: PakkaConnection,
  ui: UiContext,
  provider: string,
  search: string,
  epoch: number,
) {
  const key = JSON.stringify([provider, search, epoch]);
  const [result, setResult] = useState<{
    key: string;
    models: ModelCatalogItem[];
    ready: boolean;
    more: boolean;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      requestSignal(ui.signal, connection),
    ]);
    const timer = setTimeout(async () => {
      const models: ModelCatalogItem[] = [];
      try {
        let revision: string | undefined,
          offset = 0;
        while (!signal.aborted) {
          const { page } = await connection.services.request(
            {
              op: "model-catalog.read",
              query: {
                ...(provider ? { provider } : {}),
                query: search,
                limit: provider ? 50 : 20,
                offset,
                ...(revision ? { revision } : {}),
              },
            },
            { signal },
          );
          if (signal.aborted) return;
          models.push(...page.models);
          if (
            page.status !== "ready" ||
            page.nextOffset === null ||
            !provider
          ) {
            setResult({
              key,
              models,
              ready: page.status === "ready",
              more: page.nextOffset !== null,
            });
            return;
          }
          revision = page.revision;
          offset = page.nextOffset;
        }
      } catch {
        if (!signal.aborted)
          setResult({ key, models: [], ready: false, more: false });
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [connection, ui, key, provider, search]);
  return result?.key === key ? result : null;
}
