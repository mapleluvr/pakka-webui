import { createElement, type ComponentType } from "react";
import {
  assertUiRuntime,
  defineUiPlugin,
  type UiContext,
  type UiViewProps,
  type ViewTarget,
} from "@pakka/webui-sdk";
import {
  bindExtensionService,
  type ExtensionServiceBinding,
} from "@pakka/client/extensions";
import {
  decodeValue,
  type ExtensionAction,
  type ExtensionCall,
  type ExtensionRegistration,
} from "@pakka/protocol/extensions";
import type { AgentRef } from "@pakka/protocol/pocket";
import type { UiRegistry } from "../../host/registry.js";
import { requestSignal, type PakkaConnection } from "./connection.js";
import { conversationReference, conversationResource } from "./resources.js";

/** Integration namespace avoids collisions with bundled and GUI-only contributions. */
export const extensionUiId = (id: string) => `extension:${id}`;

function stylesheet(
  url: string,
  signal: AbortSignal,
  links: HTMLLinkElement[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    links.push(link);
    const finish = (error?: unknown) => {
      signal.removeEventListener("abort", abort);
      link.onload = null;
      link.onerror = null;
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(signal.reason);
    link.onload = () => finish();
    link.onerror = () => finish(new Error("插件样式未能加载。"));
    signal.addEventListener("abort", abort, { once: true });
    document.head.append(link);
  });
}
async function moduleAt(
  url: string,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  signal.throwIfAborted();
  let abort = () => {};
  try {
    return await Promise.race([
      import(url),
      new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

interface ConversationExtensionScope {
  readonly target: AgentRef;
  readonly signal: AbortSignal;
  readonly instanceId: string;
  readonly changed?: () => void;
}
export interface PakkaExtensions {
  refresh(): Promise<void>;
  prepare(target: ViewTarget): Promise<void>;
  views(): readonly {
    plugin: string;
    view: string;
    title: string;
    placement: "page" | "panel" | "sheet" | "settings";
  }[];
  forConversation(scope: ConversationExtensionScope): PakkaExtensions;
  dispose(): void;
}

/** Authorized app or explicit Conversation contributions. Importing trusted code is not a browser sandbox. */
export function attachPakkaExtensions(
  connection: PakkaConnection,
  registry: UiRegistry,
  scope?: ConversationExtensionScope,
): PakkaExtensions {
  const lifetime = new AbortController();
  const signal = requestSignal(
    AbortSignal.any([lifetime.signal, ...(scope ? [scope.signal] : [])]),
    connection,
  );
  const pluginId = (id: string) =>
    scope ? `conversation:${scope.instanceId}:${id}` : extensionUiId(id);
  const publications = new Map<string, string>();
  const children = new Set<PakkaExtensions>();
  const restored = new Map<
    string,
    { resource: string; loading: Promise<void> }
  >();
  const failures = new Map<string, string>();
  let backend = new Map<string, ExtensionRegistration>();
  let discovered = new Map<string, ExtensionRegistration>();
  let refreshing: Promise<void> | null = null;
  function report(id: string, generation: string, reason: unknown) {
    const key = `${id}:${generation}`;
    if (signal.aborted || failures.has(key)) return;
    failures.set(
      key,
      registry.notice({
        key: JSON.stringify([scope?.instanceId, id, generation]),
        tone: "warning",
        message: `${id}：${reason instanceof Error ? reason.message : "插件界面未能载入。"}`,
      }),
    );
  }
  function remove(id: string) {
    publications.delete(id);
    registry.remove(pluginId(id));
  }
  async function publish(row: ExtensionRegistration) {
    const requirement = row.manifest.facets.webui;
    assertUiRuntime(requirement);
    if (!requirement) throw new Error("UI 声明缺失。");
    const views = row.manifest.interfaces.filter(
      (view) => view.scope === (scope ? "conversation" : "app"),
    );
    if (!views.length) return;
    const publication = new AbortController();
    const active = AbortSignal.any([signal, publication.signal]);
    const loading = AbortSignal.any([active, AbortSignal.timeout(30000)]);
    const links: HTMLLinkElement[] = [];
    const release = () => {
      publication.abort();
      for (const link of links) link.remove();
    };
    try {
      const url = (path: string) =>
        connection.extensions.assetUrl(
          row.manifest.id,
          "webui",
          row.generation,
          path,
          scope?.target,
        );
      const [module] = await Promise.all([
        moduleAt(url(requirement.entry), loading),
        Promise.all(
          (requirement.styles ?? []).map((path) =>
            stylesheet(url(path), loading, links),
          ),
        ),
      ]);
      active.throwIfAborted();
      const id = pluginId(row.manifest.id);
      const plugin = defineUiPlugin<ExtensionServiceBinding>({
        api: requirement.api,
        runtime: requirement.runtime,
        id,
        version: row.manifest.version,
        title: row.manifest.title,
        views: views.map((view) => {
          const component = module[view.export];
          if (
            !component ||
            (typeof component !== "function" && typeof component !== "object")
          )
            throw new Error(`缺少 React 界面出口：${view.export}`);
          // The approved module declares the shared React contract. React also accepts memo/forwardRef objects;
          // invalid render values are contained by the instance error boundary, not treated as an authority check.
          return {
            id: view.id,
            title: view.title,
            placement: view.slot,
            navigation: scope ? false : view.navigation,
            render: (props: UiViewProps<ExtensionServiceBinding>) => {
              if (scope) {
                const reference =
                  props.ui.resource && conversationReference(props.ui.resource);
                if (
                  !reference ||
                  reference.sessionId !== scope.target.sessionId ||
                  reference.conversationId !== scope.target.conversationId
                )
                  throw new Error("插件地址与服务绑定的 Conversation 不符。");
              }
              return createElement(
                component as ComponentType<
                  UiViewProps<ExtensionServiceBinding>
                >,
                props,
              );
            },
          };
        }),
        commands: row.manifest.commands.flatMap((command) => {
          const view = views.find((view) => view.id === command.interface);
          if (!view) return [];
          return [
            {
              id: command.id,
              title: command.title,
              async run(
                { ui }: UiViewProps<ExtensionServiceBinding>,
                text: string,
              ) {
                if (text.trim()) throw new Error("此界面命令不接受参数。");
                await ui.open({
                  plugin: id,
                  view: view.id,
                  ...(scope
                    ? { resource: conversationResource(scope.target) }
                    : {}),
                });
              },
            },
          ];
        }),
      });
      const bindings = bindExtensionService(connection.extensions, {
        extensionId: row.manifest.id,
        personId: connection.person.id,
        serverId: connection.serverId,
        signal: active,
        ...(scope ? { target: scope.target } : {}),
        backend: () => backend.get(row.manifest.id),
      });
      registry.publish({
        plugin,
        bindings,
        generation: row.generation,
        release,
      });
      publications.set(row.manifest.id, row.generation);
    } catch (reason) {
      release();
      throw reason;
    }
  }
  async function synchronize() {
    const rows = await connection.extensions.list(scope?.target, { signal });
    signal.throwIfAborted();
    backend = new Map(
      rows
        .filter((row) => row.facet === "backend")
        .map((row) => [row.manifest.id, row]),
    );
    const webui = new Map(
      rows
        .filter((row) => row.facet === "webui")
        .map((row) => [row.manifest.id, row]),
    );
    discovered = webui;
    for (const [id, generation] of publications) {
      const current = webui.get(id);
      if (
        !current ||
        current.phase !== "ready" ||
        current.generation !== generation
      ) {
        try {
          remove(id);
        } catch (reason) {
          report(id, generation, reason);
        }
      }
    }
    for (const row of webui.values()) {
      if (signal.aborted) return;
      if (
        row.phase !== "ready" ||
        publications.get(row.manifest.id) === row.generation
      )
        continue;
      try {
        await publish(row);
      } catch (reason) {
        report(row.manifest.id, row.generation, reason);
      }
    }
  }
  function refresh() {
    if (signal.aborted) return Promise.resolve();
    // A control may have completed after the active discovery request began.
    // Each caller waits for its own read; older results cannot satisfy that synchronization.
    const current = (refreshing ?? Promise.resolve())
      .catch(() => {
        /* A failed earlier read does not prevent a new authorized attempt. */
      })
      .then(async () => {
        if (!signal.aborted) {
          try {
            await synchronize();
          } catch (error) {
            if (scope) for (const id of [...publications.keys()]) remove(id);
            throw error;
          } finally {
            scope?.changed?.();
          }
          await Promise.all([...children].map((child) => child.refresh()));
        }
      })
      .finally(() => {
        if (refreshing === current) refreshing = null;
      });
    refreshing = current;
    return current;
  }
  const update = () => {
    if (document.visibilityState === "visible")
      void refresh().catch((reason) =>
        report("插件发现", connection.serverId, reason),
      );
  };
  const timer = window.setInterval(update, 10000);
  window.addEventListener("focus", update);
  return {
    refresh,
    async prepare(destination) {
      if (registry.hasView(destination) || scope) return;
      const match =
        /^conversation:([a-f0-9-]{36}):([a-zA-Z0-9][a-zA-Z0-9._-]*)$/.exec(
          destination.plugin,
        );
      if (!match || !destination.resource) return;
      const reference = conversationReference(destination.resource);
      const resource = JSON.stringify([
        reference.sessionId,
        reference.conversationId,
      ]);
      const previous = restored.get(match[1]!);
      if (previous) {
        if (previous.resource !== resource)
          throw new Error("插件地址的 Conversation 身份不符。");
        await previous.loading;
        return;
      }
      const loading = (async () => {
        const { resolution } = await connection.services.request(
          { op: "resource.resolve", reference },
          { signal },
        );
        signal.throwIfAborted();
        if (resolution.status !== "loaded")
          throw new Error("原 Conversation 当前不可用于此插件。");
        const owner = match[1]!;
        const child = attachPakkaExtensions(connection, registry, {
          target: resolution.target,
          signal,
          instanceId: owner,
        });
        let unsubscribe = () => {};
        const owned: PakkaExtensions = {
          ...child,
          dispose() {
            unsubscribe();
            restored.delete(owner);
            children.delete(owned);
            child.dispose();
          },
        };
        const prefix = `conversation:${owner}:`;
        unsubscribe = registry.onClose((view) => {
          if (
            view.plugin.startsWith(prefix) &&
            !registry
              .getSnapshot()
              .instances.some((item) => item.plugin.startsWith(prefix))
          )
            owned.dispose();
        });
        children.add(owned);
        try {
          await owned.refresh();
        } catch (reason) {
          owned.dispose();
          throw reason;
        }
      })();
      restored.set(match[1]!, { resource, loading });
      try {
        await loading;
      } catch (reason) {
        restored.delete(match[1]!);
        throw reason;
      }
    },
    forConversation(input) {
      const child = attachPakkaExtensions(connection, registry, input);
      const owned = {
        ...child,
        dispose() {
          children.delete(owned);
          child.dispose();
        },
      };
      children.add(owned);
      return owned;
    },
    views() {
      return [...publications.keys()].flatMap((id) => {
        const row = discovered.get(id);
        return (
          row?.manifest.interfaces
            .filter((view) => view.scope === "conversation")
            .map((view) => ({
              plugin: pluginId(id),
              view: view.id,
              title: view.title,
              placement: view.slot,
            })) ?? []
        );
      });
    },
    dispose() {
      lifetime.abort();
      for (const event of failures.values()) registry.dismiss(event);
      failures.clear();
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      const errors: unknown[] = [];
      for (const child of [...children]) {
        try {
          child.dispose();
        } catch (error) {
          errors.push(error);
        }
      }
      for (const id of [...publications.keys()])
        try {
          remove(id);
        } catch (reason) {
          errors.push(reason);
        }
      if (errors.length)
        throw new AggregateError(errors, "插件界面清理未确认。");
    },
  };
}

/** Exact slash aliases only; inactive/ambiguous/unsupported commands never fall through to a model message. */
export async function dispatchExtensionCommand(
  connection: PakkaConnection,
  ui: UiContext,
  text: string,
  target: AgentRef,
  execute: (
    call: Omit<ExtensionCall, "requestId">,
    title: string,
    effect: ExtensionAction["effect"],
  ) => Promise<void>,
): Promise<boolean> {
  const match =
    /^\/((?:[a-z][a-z0-9-]{0,63}:)?[a-z][a-z0-9-]{0,63})(?:\s+([\s\S]*))?$/.exec(
      text,
    );
  // Paths and other literal slash text do not depend on command discovery.
  if (!match) return false;
  const rows = await connection.extensions.list(target, {
    signal: requestSignal(ui.signal, connection),
  });
  ui.signal.throwIfAborted();
  connection.signal.throwIfAborted();
  const matches = rows.flatMap((row) =>
    row.manifest.commands
      .filter(
        (command) =>
          match[1] === command.slash ||
          match[1] === `${row.manifest.id}:${command.slash}`,
      )
      .map((command) => ({ row, command })),
  );
  if (!matches.length) return false;
  if (matches.length !== 1)
    throw new Error("命令存在多个来源，请使用 /扩展ID:命令 的完整名称。");
  const { row, command } = matches[0]!;
  if (row.phase !== "ready") throw new Error("此命令所属 facet 尚未启用。");
  if (command.action) {
    const action = row.manifest.actions.find(
      (action) => action.id === command.action,
    );
    if (row.facet !== "backend" || !action)
      throw new Error("命令的 Backend action 声明不可用。");
    let input;
    try {
      input = decodeValue(action.input, JSON.parse(match[2]?.trim() || "{}"));
    } catch {
      throw new Error("命令参数须是符合其声明的 JSON；原稿已保留。");
    }
    await execute(
      {
        extension: row.manifest.id,
        generation: row.generation,
        action: action.id,
        input,
        ...(action.scope === "conversation" ? { target } : {}),
      },
      command.title,
      action.effect,
    );
    return true;
  }
  if (!command.interface) throw new Error("命令入口声明不可用。");
  assertUiRuntime(row.manifest.facets.webui);
  const view = row.manifest.interfaces.find(
    (view) => view.id === command.interface,
  );
  if (!view) throw new Error("命令界面声明不可用。");
  await ui.dispatch(
    {
      plugin:
        view.scope === "conversation"
          ? `conversation:${ui.instanceId}:${row.manifest.id}`
          : extensionUiId(row.manifest.id),
      command: command.id,
    },
    match[2] ?? "",
  );
  return true;
}
