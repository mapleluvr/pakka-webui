import { createElement, type ReactNode } from "react";
import {
  defineUiPlugin,
  type ResourceReference,
  type ResourceResolution,
  type SurfacePlacement,
  type UiContext,
  type UiNotice,
  type UiPlugin,
  type UiValue,
  type ViewTarget,
} from "@pakka/webui-sdk";
import { createUiFacet } from "./facet.js";
import type { UiPorts } from "./lifetime.js";

export interface NavigationItem {
  readonly plugin: string;
  readonly view: string;
  readonly title: string;
  readonly placement: SurfacePlacement;
}
export interface OpenView extends NavigationItem {
  readonly id: string;
  readonly ui: UiContext;
  readonly render: () => ReactNode;
}
interface Publication {
  readonly generation: string;
  readonly facet: ReturnType<typeof createUiFacet>;
  readonly navigation: readonly NavigationItem[];
  readonly views: ReadonlyMap<
    string,
    {
      readonly title: string;
      readonly placement: SurfacePlacement;
      render(ui: UiContext, input?: UiValue): ReactNode;
    }
  >;
  readonly commands: ReadonlyMap<
    string,
    (ui: UiContext, text: string) => void | Promise<void>
  >;
  readonly release?: () => void;
}
export interface VisibleNotice extends UiNotice {
  readonly id: string;
  readonly event: string;
  readonly count: number;
  readonly owners: readonly string[];
}
export interface RegistrySnapshot {
  readonly navigation: readonly NavigationItem[];
  readonly instances: readonly OpenView[];
  readonly notices: readonly VisibleNotice[];
  readonly announcement?: VisibleNotice;
}

/** UI-only publication registry. Service discovery, authority and URLs are injected by the caller. */
export function createUiRegistry(options: {
  resolve(
    reference: ResourceReference,
    signal: AbortSignal,
  ): Promise<ResourceResolution>;
  title?(target: ViewTarget, fallback: string): string;
}) {
  const publications = new Map<string, Publication>();
  const instances = new Map<string, { view: OpenView; dispose(): void }>();
  const invocations = new Map<
    string,
    ReturnType<ReturnType<typeof createUiFacet>["create"]> & {
      owners: readonly string[];
    }
  >();
  const cleanupFailures = new Map<string, unknown>();
  const listeners = new Set<() => void>();
  const closeListeners = new Set<(view: OpenView) => void>();
  let latestNoticeEvent: string | undefined;
  let capacity = 3;
  let notices: RegistrySnapshot["notices"] = [];
  let snapshot: RegistrySnapshot = { navigation: [], instances: [], notices };
  function changed(publicationChanged = false) {
    snapshot = Object.freeze({
      navigation: publicationChanged
        ? Object.freeze(
            [...publications.values()].flatMap((value) => value.navigation),
          )
        : snapshot.navigation,
      instances: Object.freeze(
        [...instances.values()].map((value) => value.view),
      ),
      notices,
      announcement:
        notices.at(-1)?.event === latestNoticeEvent
          ? notices.at(-1)
          : undefined,
    });
    for (const listener of listeners) listener();
  }
  function notice(value: UiNotice, owners: readonly string[] = []) {
    const previous = notices.find(
      (item) =>
        item.owners.at(-1) === owners.at(-1) &&
        item.tone === value.tone &&
        item.message === value.message &&
        item.key === value.key,
    );
    const event = crypto.randomUUID();
    latestNoticeEvent = event;
    const entry = Object.freeze({
      ...value,
      owners,
      event,
      id: previous?.id ?? event,
      count: (previous?.count ?? 0) + 1,
    });
    notices = Object.freeze(
      [...notices.filter((item) => item !== previous), entry].slice(-capacity),
    );
    changed();
    // Cleanup handles identify a publication event, not the reusable visual row.
    return event;
  }
  function ownerPath(owner: string): readonly string[] {
    const path = invocations.get(owner)?.owners;
    if (path) return path;
    const view = instances.get(owner)?.view;
    if (!view) throw new Error("UI instance is no longer available");
    return [`plugin:${view.plugin}`, owner];
  }
  function removeOwned(owner: string) {
    notices = notices.filter((item) => !item.owners.includes(owner));
  }
  function active(owner: string, signal: AbortSignal) {
    if (signal.aborted || (!instances.has(owner) && !invocations.has(owner)))
      throw new Error("UI instance is no longer available");
  }
  function close(id: string) {
    const closed = instances.get(id)?.view;
    const instance = instances.get(id) ?? invocations.get(id);
    if (!instance) return;
    try {
      instance.dispose();
    } catch {
      notice({
        key: id,
        tone: "error",
        message: "界面已关闭，但部分清理未能确认。",
      });
    } finally {
      removeOwned(id);
      instances.delete(id);
      invocations.delete(id);
      changed();
      if (closed)
        for (const listener of closeListeners) {
          try {
            listener(closed);
          } catch {
            notice({
              key: id,
              tone: "error",
              message: "界面关闭后的清理未能确认。",
            });
          }
        }
    }
  }
  function open(target: ViewTarget, placement?: SurfacePlacement): string {
    const publication = publications.get(target.plugin);
    const view = publication?.views.get(target.view);
    if (!publication || !view)
      throw new Error("UI contribution is unavailable");
    const title = options.title?.(target, view.title) ?? view.title;
    const id = crypto.randomUUID();
    const instance = publication.facet.create({
      instanceId: id,
      resource: target.resource,
    });
    const opened: OpenView = Object.freeze({
      id,
      plugin: target.plugin,
      view: target.view,
      title,
      placement: placement ?? view.placement,
      ui: instance.context,
      render: () => view.render(instance.context, target.input),
    });
    instances.set(id, { view: opened, dispose: instance.dispose });
    changed();
    return id;
  }
  function setTitle(id: string, title: string) {
    const instance = instances.get(id);
    const label = title.trim().slice(0, 256);
    if (!instance || !label || instance.view.title === label) return;
    instance.view = Object.freeze({ ...instance.view, title: label });
    changed();
  }
  const ports: UiPorts = {
    notice: (value, owner) => notice(value, ownerPath(owner)),
    close,
    open: async (target, placement, owner, signal) => {
      active(owner, signal);
      return open(target, placement);
    },
    navigate: async (reference, owner, signal) => {
      active(owner, signal);
      const result = await options.resolve(reference, signal);
      active(owner, signal);
      if (
        (result.status === "ready" || result.status === "unloaded") &&
        result.view
      )
        open(result.view);
      return result;
    },
    dispatch: async (target, text, owner, signal) => {
      active(owner, signal);
      const publication = publications.get(target.plugin),
        command = publication?.commands.get(target.command);
      if (!publication || !command)
        throw new Error("UI command is unavailable");
      const id = crypto.randomUUID();
      const instance = publication.facet.create({ instanceId: id });
      invocations.set(id, {
        ...instance,
        owners: [...ownerPath(owner), `plugin:${target.plugin}`, id],
      });
      const abort = () => close(id);
      signal.addEventListener("abort", abort, { once: true });
      instance.context.onDispose(() =>
        signal.removeEventListener("abort", abort),
      );
      try {
        await command(instance.context, text);
        active(owner, signal);
      } catch (error) {
        removeOwned(id);
        changed();
        throw error;
      } finally {
        invocations.delete(id);
        instance.dispose();
      }
    },
  };
  function remove(id: string) {
    if (cleanupFailures.has(id)) throw cleanupFailures.get(id);
    const publication = publications.get(id);
    if (!publication) return;
    const failures: unknown[] = [];
    try {
      publication.facet.dispose();
    } catch (error) {
      failures.push(error);
    }
    try {
      publication.release?.();
    } catch (error) {
      failures.push(error);
    }
    removeOwned(`plugin:${id}`);
    publications.delete(id);
    for (const [key, instance] of instances)
      if (instance.view.plugin === id) instances.delete(key);
    for (const [key, instance] of invocations)
      if (instance.context.pluginId === id) invocations.delete(key);
    changed(true);
    if (failures.length) {
      const failure = new AggregateError(
        failures,
        "UI publication cleanup is unconfirmed",
      );
      cleanupFailures.set(id, failure);
      notice({
        key: id,
        tone: "error",
        message: "插件已停止接纳界面，清理结果尚未确认。",
      });
      throw failure;
    }
  }
  return Object.freeze({
    getSnapshot: () => snapshot,
    hasView: (target: ViewTarget) =>
      publications.get(target.plugin)?.views.has(target.view) ?? false,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Explicit instance close; publication replacement has its own lifetime. */
    onClose(listener: (view: OpenView) => void) {
      closeListeners.add(listener);
      return () => {
        closeListeners.delete(listener);
      };
    },
    publish<Bindings>(input: {
      plugin: UiPlugin<Bindings>;
      generation: string;
      bindings: Bindings;
      release?: () => void;
    }) {
      const plugin = defineUiPlugin(input.plugin);
      if (cleanupFailures.has(plugin.id)) throw cleanupFailures.get(plugin.id);
      if (publications.get(plugin.id)?.generation === input.generation) return;
      remove(plugin.id);
      const views: Publication["views"] = new Map(
        plugin.views.map((view) => [
          view.id,
          {
            title: view.title,
            placement: view.placement,
            render: (ui: UiContext, value?: UiValue) =>
              createElement(view.render, {
                ui,
                input: value,
                bindings: input.bindings,
              }),
          },
        ]),
      );
      const commands: Publication["commands"] = new Map(
        (plugin.commands ?? []).map((command) => [
          command.id,
          (ui: UiContext, text: string) =>
            command.run({ ui, bindings: input.bindings }, text),
        ]),
      );
      publications.set(plugin.id, {
        generation: input.generation,
        facet: createUiFacet(
          { pluginId: plugin.id, generation: input.generation },
          ports,
        ),
        navigation: plugin.views
          .filter((view) => view.navigation)
          .map((view) => ({
            plugin: plugin.id,
            view: view.id,
            title: view.title,
            placement: view.placement,
          })),
        views,
        commands,
        release: input.release,
      });
      changed(true);
    },
    remove,
    open,
    close,
    setTitle,
    notice,
    setNoticeCapacity(value: 1 | 3) {
      capacity = value;
      if (notices.length <= capacity) return;
      notices = notices.slice(-capacity);
      changed();
    },
    clearNotices() {
      if (!notices.length) return;
      notices = [];
      changed();
    },
    dismiss(event: string) {
      if (!notices.some((item) => item.event === event)) return;
      notices = notices.filter((item) => item.event !== event);
      changed();
    },
    dispose() {
      const failures: unknown[] = [...cleanupFailures.values()];
      for (const id of [...publications.keys()])
        try {
          remove(id);
        } catch (error) {
          failures.push(error);
        }
      notices = [];
      changed();
      if (failures.length)
        throw new AggregateError(
          failures,
          "UI registry cleanup is unconfirmed",
        );
    },
  });
}
export type UiRegistry = ReturnType<typeof createUiRegistry>;
