import type { UiPlugin, UiRuntimeRequirement } from "./contracts.js";

export type {
  CommandTarget,
  ResourceReference,
  ResourceResolution,
  SurfacePlacement,
  UiCommand,
  UiContext,
  UiNotice,
  UiPlugin,
  UiRuntimeRequirement,
  UiValue,
  UiView,
  UiViewProps,
  ViewTarget,
} from "./contracts.js";

function identifier(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !/\s|[\x00-\x1f\x7f]/.test(value)
  );
}

/** Check declarative metadata before importing a separately delivered UI module. Not a code sandbox. */
export function assertUiRuntime(
  requirement: unknown,
): asserts requirement is UiRuntimeRequirement {
  if (
    !requirement ||
    typeof requirement !== "object" ||
    !("api" in requirement) ||
    requirement.api !== 1 ||
    !("runtime" in requirement) ||
    requirement.runtime !== "react19-astryx0.7.15"
  )
    throw new Error("Unsupported UI plugin contract or runtime");
}

/** Declares ordinary React contributions; bindings are supplied separately by the host's caller. */
export function defineUiPlugin<Bindings = undefined>(
  plugin: UiPlugin<Bindings>,
): UiPlugin<Bindings> {
  assertUiRuntime(plugin);
  if (!identifier(plugin.id) || !plugin.version || !plugin.title.trim())
    throw new Error("Invalid UI plugin identity");
  for (const entries of [plugin.views, plugin.commands ?? []]) {
    const ids = new Set<string>();
    for (const entry of entries) {
      if (!identifier(entry.id) || !entry.title.trim() || ids.has(entry.id))
        throw new Error("Invalid or duplicate UI contribution identity");
      ids.add(entry.id);
    }
  }
  return Object.freeze({
    ...plugin,
    views: Object.freeze(
      plugin.views.map((view) => Object.freeze({ ...view })),
    ),
    ...(plugin.commands
      ? {
          commands: Object.freeze(
            plugin.commands.map((command) => Object.freeze({ ...command })),
          ),
        }
      : {}),
  });
}
