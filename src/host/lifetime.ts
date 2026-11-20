import type {
  CommandTarget,
  ResourceReference,
  ResourceResolution,
  SurfacePlacement,
  UiContext,
  UiNotice,
  ViewTarget,
} from "../sdk/contracts.js";

export interface UiPorts {
  notice(notice: UiNotice, owner: string): void;
  open(
    target: ViewTarget,
    placement: SurfacePlacement | undefined,
    owner: string,
    signal: AbortSignal,
  ): Promise<string>;
  navigate(
    reference: ResourceReference,
    owner: string,
    signal: AbortSignal,
  ): Promise<ResourceResolution>;
  dispatch(
    target: CommandTarget,
    argumentsText: string,
    owner: string,
    signal: AbortSignal,
  ): Promise<void>;
  close(owner: string): void;
}

/** Instance-local lifecycle only. UI ports must honor the signal before publishing asynchronous results. */
export function createUiInstance(
  identity: {
    readonly instanceId: string;
    readonly pluginId: string;
    readonly generation: string;
    readonly resource?: ResourceReference;
  },
  ports: UiPorts,
) {
  const controller = new AbortController();
  const cleanups = new Set<() => void>();
  const owner = identity.instanceId;
  function active() {
    if (controller.signal.aborted) throw new Error("UI instance is disposed");
  }
  async function run<T>(operation: () => Promise<T>): Promise<T> {
    active();
    const result = await operation();
    active();
    return result;
  }
  const context: UiContext = Object.freeze({
    ...identity,
    ...(identity.resource
      ? { resource: Object.freeze({ ...identity.resource }) }
      : {}),
    signal: controller.signal,
    notice(notice: UiNotice) {
      active();
      ports.notice(notice, owner);
    },
    open(target: ViewTarget, placement?: SurfacePlacement) {
      return run(() => ports.open(target, placement, owner, controller.signal));
    },
    navigate(reference: ResourceReference) {
      return run(() => ports.navigate(reference, owner, controller.signal));
    },
    dispatch(target: CommandTarget, argumentsText: string) {
      return run(() =>
        ports.dispatch(target, argumentsText, owner, controller.signal),
      );
    },
    close() {
      active();
      ports.close(owner);
    },
    onDispose(cleanup: () => void) {
      if (controller.signal.aborted) {
        cleanup();
        return () => {};
      }
      cleanups.add(cleanup);
      return () => {
        cleanups.delete(cleanup);
      };
    },
  });
  return Object.freeze({
    context,
    dispose() {
      if (controller.signal.aborted) return;
      controller.abort();
      const errors: unknown[] = [];
      for (const cleanup of [...cleanups].reverse()) {
        cleanups.delete(cleanup);
        try {
          cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length)
        throw new AggregateError(errors, "UI instance cleanup failed");
    },
  });
}
