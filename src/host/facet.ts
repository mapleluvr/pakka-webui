import { createUiInstance, type UiPorts } from "./lifetime.js";
import type { ResourceReference } from "../sdk/contracts.js";

/** One UI publication, not a Backend/Agent/Client switch or a persistent-work owner. */
export function createUiFacet(
  identity: { readonly pluginId: string; readonly generation: string },
  ports: UiPorts,
) {
  if (
    [identity.pluginId, identity.generation].some(
      (value) =>
        typeof value !== "string" || !value.length || value.length > 256,
    )
  )
    throw new Error("Invalid UI facet identity");
  const publication = Object.freeze({
    pluginId: identity.pluginId,
    generation: identity.generation,
  });
  const instances = new Map<string, ReturnType<typeof createUiInstance>>();
  const failures = new Map<string, unknown>();
  let disposed = false;
  return Object.freeze({
    identity: publication,
    create(input: {
      readonly instanceId: string;
      readonly resource?: ResourceReference;
    }) {
      const id = input.instanceId;
      if (
        disposed ||
        typeof id !== "string" ||
        !id ||
        id.length > 256 ||
        instances.has(id) ||
        failures.has(id)
      )
        throw new Error("UI facet or instance is unavailable");
      const child = createUiInstance(
        { instanceId: id, resource: input.resource, ...publication },
        ports,
      );
      let attempted = false;
      let failure: { readonly error: unknown } | undefined;
      const instance = Object.freeze({
        context: child.context,
        dispose() {
          if (attempted) {
            if (failure) throw failure.error;
            return;
          }
          // Keep this wrapper's result; an id may later identify a different instance.
          attempted = true;
          try {
            child.dispose();
          } catch (error) {
            failure = { error };
            failures.set(id, error);
            throw error;
          } finally {
            instances.delete(id);
          }
        },
      });
      instances.set(id, instance);
      return instance;
    },
    dispose() {
      // Seal admission first; a cleanup cannot create another instance in the old publication.
      disposed = true;
      for (const instance of [...instances.values()]) {
        try {
          instance.dispose();
        } catch {
          /* Retained below; every other instance still gets cleanup. */
        }
      }
      if (failures.size)
        throw new AggregateError(
          [...failures.values()],
          "UI facet cleanup is unconfirmed",
        );
    },
  });
}
