import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { defineUiPlugin } from "@pakka/webui-sdk";
import { createUiRegistry } from "../host/registry.js";
import { playground } from "../plugins/playground.js";
import { modelSettings } from "../features/settings/plugin.js";
import { WorkspaceView } from "../features/conversations/WorkspaceView.js";
import { ConversationView } from "../features/conversations/ConversationView.js";
import {
  takeLoginCredential,
  usePakkaConnection,
} from "../features/identity/usePakkaConnection.js";
import { conversationReference } from "../integrations/pakka/resources.js";
import type { PakkaConnection } from "../integrations/pakka/connection.js";
import { attachPakkaExtensions } from "../integrations/pakka/extensions.js";
import { Application } from "./Application.js";
import "./style.css";

const conversations = defineUiPlugin<PakkaConnection>({
  api: 1,
  runtime: "react19-astryx0.7.15",
  id: "conversations",
  version: "0.1.0",
  title: "Conversations",
  views: [
    {
      id: "workspace",
      title: "Conversations",
      placement: "page",
      navigation: true,
      render: WorkspaceView,
    },
    {
      id: "history",
      title: "Conversation",
      placement: "page",
      resourceTypes: [{ source: "pakka", type: "conversation" }],
      render: ConversationView,
    },
  ],
});
const initialCredential = takeLoginCredential();
function Root() {
  const identity = usePakkaConnection();
  const current = useRef<PakkaConnection | null>(null);
  const extensions = useRef<ReturnType<typeof attachPakkaExtensions> | null>(
    null,
  );
  current.current = identity.connection;
  const [registry] = useState(() => {
    const host = createUiRegistry({
      title: (target, fallback) => {
        if (
          target.resource?.source !== "pakka" ||
          target.resource.type !== "conversation"
        )
          return fallback;
        const ref = conversationReference(target.resource);
        return `${fallback} ${ref.conversationId} · ${ref.sessionId.slice(0, 8)}`;
      },
      resolve: async (resource, signal) => {
        if (resource.source !== "pakka" || resource.type !== "conversation")
          return { status: "unsupported", reference: resource };
        const connection = current.current;
        if (!connection)
          return {
            status: "unavailable",
            reference: resource,
            message: "请先连接 Pakka。",
          };
        const combined = AbortSignal.any([signal, connection.signal]);
        const { resolution } = await connection.services.request(
          {
            op: "resource.resolve",
            reference: conversationReference(resource),
          },
          { signal: combined },
        );
        combined.throwIfAborted();
        if (current.current !== connection) throw new Error("连接身份已变化。");
        const view = { plugin: "conversations", view: "history", resource };
        if (resolution.status === "loaded")
          return { status: "ready", reference: resource, view };
        if (resolution.status === "unloaded")
          return { status: "unloaded", reference: resource, view };
        const messages = {
          forbidden: "当前身份无权读取此原资源。",
          "identity-mismatch": "已登记来源与原 Session 身份不符。",
          unavailable: "原来源当前不可得或不支持只读历史。",
        };
        return {
          status: resolution.status,
          reference: resource,
          message: messages[resolution.status],
        };
      },
    });
    host.publish({
      plugin: playground,
      generation: "bundled-0.1.0",
      bindings: undefined,
    });
    return host;
  });
  useEffect(() => {
    const connection = identity.connection;
    if (!connection) return;
    const plugins = [conversations, modelSettings(connection)];
    for (const plugin of plugins)
      registry.publish({
        plugin,
        generation: connection.identity,
        bindings: connection,
      });
    const attached = attachPakkaExtensions(connection, registry);
    extensions.current = attached;
    void attached.refresh().catch(() => {
      if (!connection.signal.aborted)
        registry.notice({
          tone: "warning",
          message: "插件发现未能完成，可手动刷新。",
        });
    });
    return () => {
      if (extensions.current === attached) extensions.current = null;
      try {
        attached.dispose();
      } catch {
        /* Registry retains and reports cleanup failures. */
      }
      for (const plugin of plugins) {
        try {
          registry.remove(plugin.id);
        } catch {
          /* Registry retains and reports the cleanup failure. */
        }
      }
    };
  }, [identity.connection, registry]);
  useEffect(() => {
    if (identity.error)
      registry.notice({ tone: "warning", message: identity.error });
  }, [identity.error, registry]);
  useEffect(
    () => () => {
      try {
        registry.dispose();
      } catch {
        /* App shutdown; retained cleanup result remains unconfirmed. */
      }
    },
    [registry],
  );
  return (
    <Application
      registry={registry}
      identity={identity}
      initialCredential={initialCredential}
      refreshExtensions={async () => {
        try {
          await extensions.current?.refresh();
        } catch {
          registry.notice({
            tone: "warning",
            message: "插件发现未能完成，请检查连接后重试。",
          });
        }
      }}
    />
  );
}

const element = document.getElementById("app");
if (!element) throw new Error("Application entry is missing");
createRoot(element).render(<Root />);
