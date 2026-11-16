import type { ComponentType } from "react";
import {
  assertUiRuntime,
  defineUiPlugin,
  type UiContext,
  type UiViewProps,
} from "@pakka/webui-sdk";
import {
  bindExtensionService,
  type ExtensionServiceBinding,
} from "@pakka/client/extensions";
import type { ExtensionRegistration } from "@pakka/protocol/extensions";
import type { UiRegistry } from "../../host/registry.js";
import { requestSignal, type PakkaConnection } from "./connection.js";

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

/** Authorized app-scoped contributions. Importing trusted code is not a browser sandbox. */
export function attachPakkaExtensions(
  connection: PakkaConnection,
  registry: UiRegistry,
) {
  const lifetime = new AbortController();
  const signal = requestSignal(lifetime.signal, connection);
  const publications = new Map<string, string>();
  const failures = new Set<string>();
  let backend = new Map<string, ExtensionRegistration>();
  let refreshing: Promise<void> | null = null;
  function report(id: string, generation: string, reason: unknown) {
    const key = `${id}:${generation}`;
    if (signal.aborted || failures.has(key)) return;
    failures.add(key);
    registry.notice({
      tone: "warning",
      message: `${id}：${reason instanceof Error ? reason.message : "插件界面未能载入。"}`,
    });
  }
  function remove(id: string) {
    publications.delete(id);
    registry.remove(extensionUiId(id));
  }
  async function publish(row: ExtensionRegistration) {
    const requirement = row.manifest.facets.webui;
    assertUiRuntime(requirement);
    if (!requirement) throw new Error("UI 声明缺失。");
    const views = row.manifest.interfaces.filter(
      (view) => view.scope === "app",
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
      const id = extensionUiId(row.manifest.id);
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
            navigation: view.navigation,
            render: component as ComponentType<
              UiViewProps<ExtensionServiceBinding>
            >,
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
                await ui.open({ plugin: id, view: view.id });
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
    const rows = await connection.extensions.list(undefined, { signal });
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
    refreshing ??= synchronize().finally(() => {
      refreshing = null;
    });
    return refreshing;
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
    dispose() {
      lifetime.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      const errors: unknown[] = [];
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
): Promise<boolean> {
  const match = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(text);
  if (!match) return false;
  const rows = await connection.extensions.list(undefined, {
    signal: requestSignal(ui.signal, connection),
  });
  ui.signal.throwIfAborted();
  connection.signal.throwIfAborted();
  const matches = rows
    .filter((row) => row.facet === "webui")
    .flatMap((row) =>
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
  if (row.phase !== "ready") throw new Error("此插件界面尚未启用。");
  assertUiRuntime(row.manifest.facets.webui);
  if (!command.interface)
    throw new Error("此服务命令尚未接入输入框，不会作为消息提交。");
  await ui.dispatch(
    { plugin: extensionUiId(row.manifest.id), command: command.id },
    match[2] ?? "",
  );
  return true;
}
