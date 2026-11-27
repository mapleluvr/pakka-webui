import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  defineUiPlugin,
  type UiViewProps,
  type ViewTarget,
} from "@pakka/webui-sdk";
import { createUiRegistry, type UiRegistry } from "../host/registry.js";
import { playground } from "../plugins/playground.js";
import {
  modelSettings,
  sessionSettings,
  extensionSettings,
  notificationSettings,
  appearanceSettings,
} from "../features/settings/plugin.js";
import { WorkspaceView } from "../features/conversations/WorkspaceView.js";
import { ConversationView } from "../features/conversations/ConversationView.js";
import { PeopleView } from "../features/identity/PeopleView.js";
import {
  takeLoginCredential,
  usePakkaConnection,
} from "../features/identity/usePakkaConnection.js";
import { conversationReference } from "../integrations/pakka/resources.js";
import type { PakkaConnection } from "../integrations/pakka/connection.js";
import {
  registerNotificationWorker,
  notificationWorkerCommand,
} from "../integrations/pakka/notification-browser.js";
import {
  attachPakkaExtensions,
  type PakkaExtensions,
} from "../integrations/pakka/extensions.js";
import { ConversationExtensions } from "../integrations/pakka/ConversationExtensions.js";
import { Application } from "./Application.js";
import "./style.css";

function conversationPlugin(extensions: PakkaExtensions, registry: UiRegistry) {
  function History(props: UiViewProps<PakkaConnection>) {
    const title = useCallback(
      (name: string) => {
        if (!props.ui.signal.aborted)
          registry.setTitle(props.ui.instanceId, name);
      },
      [props.ui],
    );
    return (
      <ConversationView
        {...props}
        onTitle={title}
        contributions={(target) => (
          <ConversationExtensions
            ui={props.ui}
            target={target}
            extensions={extensions}
          />
        )}
      />
    );
  }
  return defineUiPlugin<PakkaConnection>({
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
        render: History,
      },
    ],
  });
}
const peopleSettings = defineUiPlugin<PakkaConnection>({
  api: 1,
  runtime: "react19-astryx0.7.15",
  id: "people-settings",
  version: "0.1.0",
  title: "人员与邀请",
  views: [
    {
      id: "people",
      title: "人员与邀请",
      placement: "settings",
      navigation: true,
      render: PeopleView,
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
  const notificationPerson = useRef<string | null | undefined>(undefined);
  const [registry] = useState(() => {
    const host = createUiRegistry({
      title: (target, fallback) => {
        if (
          target.resource?.source === "pakka" &&
          target.resource.type === "session"
        )
          return `${fallback} · ${target.resource.id.slice(0, 8)}`;
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
      plugin: appearanceSettings,
      generation: "bundled-0.1.0",
      bindings: undefined,
    });
    host.publish({
      plugin: playground,
      generation: "bundled-0.1.0",
      bindings: undefined,
    });
    return host;
  });
  useLayoutEffect(
    () => () => registry.clearNotices(),
    [identity.connection, registry],
  );
  useEffect(() => {
    if (!isSecureContext || !("serviceWorker" in navigator)) return;
    let active = true;
    let notice: string | undefined;
    void registerNotificationWorker().catch(() => {
      if (active)
        notice = registry.notice({
          tone: "warning",
          message:
            "通知 worker 未能加载，请在通知设置中核对；这不影响模型工作。",
        });
    });
    return () => {
      active = false;
      if (notice) registry.dismiss(notice);
    };
  }, [registry]);
  useEffect(() => {
    const personId = identity.connection?.person.id ?? null;
    if (notificationPerson.current === personId) return;
    notificationPerson.current = personId;
    if (!isSecureContext || !("serviceWorker" in navigator)) return;
    let active = true;
    let notice: string | undefined;
    void notificationWorkerCommand("clear").catch(() => {
      if (active)
        notice = registry.notice({
          tone: "warning",
          message: "已显示的系统通知清理未得到确认，请检查浏览器通知区。",
        });
    });
    return () => {
      active = false;
      if (notice) registry.dismiss(notice);
    };
  }, [identity.connection?.person.id, registry]);
  useEffect(() => {
    const connection = identity.connection;
    if (!connection) return;
    const attached = attachPakkaExtensions(connection, registry);
    const conversations = conversationPlugin(attached, registry);
    const plugins = [
      conversations,
      modelSettings(connection),
      notificationSettings,
      ...(connection.person.role === "admin" ? [sessionSettings] : []),
      ...(connection.person.role === "admin" &&
      connection.person.resources === "*"
        ? [peopleSettings]
        : []),
    ];
    for (const plugin of plugins)
      registry.publish({
        plugin,
        generation: connection.identity,
        bindings: connection,
      });
    extensions.current = attached;
    const manageExtensions =
      connection.person.role === "admin" && connection.person.resources === "*";
    if (manageExtensions)
      registry.publish({
        plugin: extensionSettings,
        generation: connection.identity,
        bindings: { connection, synchronize: attached.refresh },
      });
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
      if (manageExtensions) {
        try {
          registry.remove(extensionSettings.id);
        } catch {
          /* Registry retains and reports the cleanup failure. */
        }
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
    if (!identity.error) return;
    const id = registry.notice({ tone: "warning", message: identity.error });
    return () => registry.dismiss(id);
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
  const prepareView = useCallback(
    async (target: ViewTarget) => {
      await extensions.current?.prepare(target);
    },
    [identity.connection],
  );
  return (
    <Application
      registry={registry}
      prepareView={prepareView}
      identity={identity}
      initialCredential={initialCredential}
      refreshExtensions={async () => {
        const attached = extensions.current;
        try {
          await attached?.refresh();
        } catch {
          if (
            !attached ||
            extensions.current !== attached ||
            identity.connection?.signal.aborted
          )
            return;
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
