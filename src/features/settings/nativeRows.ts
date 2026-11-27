import type { ModelConfigurationView } from "@pakka/protocol/webui";
import { compatFor, LEVELS } from "./ProtocolField.js";
import { browsable, checkNativeKey } from "./nativeFieldValues.js";
import {
  managed,
  privateKey,
  record,
  starts,
  valueAt,
  type FieldChange,
  type Json,
  type Path,
} from "./modelFields.js";

const isGroup = (v: Json | undefined) =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export interface RegularFields {
  provider: boolean;
  nonChat: boolean;
  compatApi: string;
}
/** Match a value the mounted form can actually represent, not an entire namespace. */
export function regularLeaf(
  { provider, nonChat, compatApi }: RegularFields,
  p: Path,
  v: Json | undefined,
  change?: FieldChange,
) {
  if (nonChat || change?.nativeType) return false;
  const [root, key] = p;
  const text =
    v === undefined ||
    (typeof v === "string" && (!!change || (!!v && v.trim() === v)));
  const numeric = v === undefined || (typeof v === "number" && v >= 0);
  const bool = v === undefined || typeof v === "boolean";
  if (p.length === 1 && ["api", "baseUrl", "name"].includes(String(root)))
    return text;
  if (root === "compat" && p.length === 2 && typeof key === "string") {
    const fields = compatFor(compatApi);
    if (!Object.hasOwn(fields, key)) return false;
    const options = fields[key]!;
    return options === true
      ? bool
      : v === undefined || (typeof v === "string" && options.includes(v));
  }
  if (provider) return false;
  if (p.length === 1) {
    if (root === "contextWindow" || root === "maxTokens") return numeric;
    if (root === "reasoning") return bool;
    if (root === "input")
      return (
        v === undefined ||
        ['["text"]', '["text","image"]'].includes(JSON.stringify(v))
      );
  }
  if (root === "cost" && p.length === 2)
    return (
      ["input", "output", "cacheRead", "cacheWrite"].includes(String(key)) &&
      numeric
    );
  const level = LEVELS.some((l) => l === key);
  if (root === "thinkingLevelMap" && p.length === 2 && level)
    return (
      v === undefined ||
      v === null ||
      (typeof v === "string" && (!!change || !!v.trim()))
    );
  if (
    (root === "samplingParams" && p.length === 2) ||
    (root === "samplingParamsByThinkingLevel" && p.length === 3 && level)
  )
    return !!change || !isGroup(v); // A regular JSON input keeps its editor until saved.
  return false;
}
export interface NativeRow {
  path: string[];
  kind: "group" | "locked" | "value";
  value?: Json;
  original?: Json;
  change?: FieldChange;
  children?: NativeRow[];
}
export function nativeRows({
  view,
  prefix,
  original,
  data,
  changes,
  groups,
  own,
  override,
  regular,
}: {
  view: ModelConfigurationView;
  prefix: Path;
  original: Json | undefined;
  data: Record<string, Json>;
  changes: FieldChange[];
  groups: string[][];
  own: Path[];
  override: boolean;
  regular: RegularFields;
}) {
  const paths = [...own, ...groups, ...changes.map((c) => c.path)];
  const byPath = new Map(changes.map((c) => [JSON.stringify(c.path), c]));
  function children(parent: string[]): NativeRow[] {
    const keys = new Set([
      ...Object.keys(record(valueAt(original, parent))),
      ...Object.keys(record(valueAt(data, parent))),
    ]);
    for (const p of paths)
      if (starts(p, parent) && typeof p[parent.length] === "string")
        keys.add(p[parent.length] as string);
    const rows: NativeRow[] = [];
    for (const key of keys) {
      const path = [...parent, key],
        absolute = [...prefix, ...path];
      if (absolute.length > 16) continue;
      try {
        checkNativeKey(key, parent, override);
      } catch {
        continue;
      }
      if (own.some((p) => starts(path, p)) || privateKey(absolute)) {
        rows.push({ path, kind: "locked" });
        continue;
      }
      const v = valueAt(data, path),
        base = valueAt(original, path),
        change = byPath.get(JSON.stringify(path)),
        value = v === undefined ? base : v;
      if (
        managed(view, absolute) &&
        (Array.isArray(value) ||
          own.some(
            (p) => starts(p, path) && typeof p[path.length] === "number",
          ))
      ) {
        rows.push({ path, kind: "locked" });
        continue;
      }
      const markerBranch = own.some(
        (p) => starts(p, path) && p.length > path.length,
      );
      if (
        !markerBranch &&
        regularLeaf(regular, path, value, change) &&
        !groups.some((g) => starts(g, path))
      )
        continue;
      if (
        !(value === undefined && markerBranch) &&
        !browsable(view, prefix, path, value, override)
      )
        continue;
      if (
        isGroup(value) ||
        groups.some((g) => starts(g, path)) ||
        markerBranch
      ) {
        rows.push({ path, kind: "group", children: children(path) });
      } else
        rows.push({ path, kind: "value", value: v, original: base, change });
    }
    // The direct provider headers marker is adjacent to its ownership disclosure.
    if (!parent.length && regular.provider)
      rows.sort(
        (a, b) =>
          Number(a.path[0] === "headers") - Number(b.path[0] === "headers"),
      );
    return rows;
  }
  return children([]);
}
export function nativeSummary(v: Json | undefined) {
  if (v === undefined) return "未设置";
  if (Array.isArray(v)) return `数组 · ${v.length} 项`;
  return typeof v === "string" ? v || '\"\"' : JSON.stringify(v);
}
