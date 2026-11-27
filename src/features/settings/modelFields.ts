import type { ExtensionJson } from "@pakka/protocol/extensions";
import type {
  ModelConfigurationEdit,
  ModelConfigurationPath,
  ModelConfigurationView,
} from "@pakka/protocol/webui";
import { decodeJson } from "@pakka/protocol/extension-rpc";

export type Path = ModelConfigurationPath;
export type Json = ExtensionJson;
export function record(value: unknown): Record<string, Json> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : Object.create(null);
}
export function valueAt(
  document: Json | undefined,
  path: Path,
): Json | undefined {
  let value = document;
  for (const key of path) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key))
      return undefined;
    value = (value as Record<string, Json>)[key];
  }
  return value;
}
export function jsonValue(text: string): Json {
  let value: Json;
  try {
    value = decodeJson(JSON.parse(text));
  } catch {
    throw Error("请输入有效的单个 JSON 值。");
  }
  // JSON.parse silently keeps the last repeated property. Inspect keys in the already validated source.
  const objects: Set<string>[] = [];
  for (const match of text.matchAll(/"(?:\\.|[^"\\])*"\s*:?|[{}]/gs)) {
    const token = match[0];
    if (token === "{") objects.push(new Set());
    else if (token === "}") objects.pop();
    else if (token.endsWith(":")) {
      const key = JSON.parse(token.slice(0, -1)) as string;
      if (objects.at(-1)?.has(key)) throw Error("JSON 对象中有重复的键。");
      objects.at(-1)?.add(key);
    }
  }
  return value;
}
export const starts = (path: Path, prefix: Path) =>
  prefix.length <= path.length && prefix.every((v, i) => path[i] === v);
export const overlaps = (a: Path, b: Path) => starts(a, b) || starts(b, a);
export const managed = (view: ModelConfigurationView, path: Path) =>
  view.protectedPaths.some((p) => overlaps(p, path));
export function sensitiveUrl(text: string) {
  try {
    const url = new URL(text);
    return (
      !!url.username ||
      !!url.password ||
      [...url.searchParams.keys()].some((k) =>
        /key|auth|password|secret|token|signature/i.test(k),
      )
    );
  } catch {
    return false;
  }
}
export function privateKey(path: Path) {
  const key = path.at(-1);
  // Dictionary identities are not configuration field names.
  return (
    typeof key === "string" &&
    !(
      path.length === 2 ||
      (path.length === 4 && path[2] === "modelOverrides")
    ) &&
    /^(?:api[-_]?key|x-api-key|oauth|headers|authorization|cookie)$|(?:password|credentials?|secrets?|token)$/i.test(
      key,
    )
  );
}
export function publicEdit(
  view: ModelConfigurationView,
  edit: ModelConfigurationEdit,
) {
  const { path } = edit;
  if (
    path.length < 3 &&
    (path.length !== 2 ||
      "remove" in edit ||
      valueAt(view.document, path) !== undefined)
  )
    throw Error("请选择具体对象中的字段。");
  if (
    path[0] !== "providers" ||
    path.some(
      (k) =>
        typeof k === "string" &&
        (!k.trim() || ["constructor", "prototype", "__proto__"].includes(k)),
    )
  )
    throw Error("字段路径无效。");
  for (let n = 2; n < path.length; n++) {
    const parent = valueAt(view.document, path.slice(0, n));
    if (
      parent !== undefined &&
      (parent === null ||
        typeof parent !== "object" ||
        Array.isArray(parent) !== (typeof path[n] === "number"))
    )
      throw Error("路径与现有字段类型不符。");
  }
  if (managed(view, path)) throw Error("此字段或其子项由宿主管理。");
  function inspect(p: Path, v: Json | undefined) {
    if (privateKey(p) || (typeof v === "string" && sensitiveUrl(v)))
      throw Error("凭据、认证 URL 和请求头由宿主管理，不能在此提交。");
    if (p.at(-1) === "baseUrl" && v !== undefined) {
      try {
        if (
          typeof v !== "string" ||
          !["http:", "https:"].includes(new URL(v).protocol)
        )
          throw Error();
      } catch {
        throw Error("请输入不含认证信息的完整 HTTP(S) 端点。");
      }
    }
    if (v && typeof v === "object")
      for (const [k, c] of Object.entries(v))
        inspect([...p, Array.isArray(v) ? Number(k) : k], c);
  }
  for (let i = 1; i < path.length; i++) inspect(path.slice(0, i), undefined);
  inspect(path, "value" in edit ? edit.value : undefined);
}

export type NativeValueType = "text" | "number" | "boolean" | "null" | "json";
export interface FieldChange {
  nativeType?: NativeValueType;
  path: Path;
  removal?: "local";
  value?: Json;
  text?: string;
  error?: string;
}
export function replaceField(
  changes: FieldChange[],
  change: FieldChange,
  original: Json | undefined,
) {
  const same = (p: Path) => JSON.stringify(p) === JSON.stringify(change.path);
  if (changes.some((c) => !same(c.path) && overlaps(c.path, change.path)))
    throw Error("此路径与待保存修改的父项或子项冲突，请先撤下原修改。");
  const next = changes.filter((c) => !same(c.path));
  if (change.error || JSON.stringify(original) !== JSON.stringify(change.value))
    next.push(change);
  return next;
}
export function applyFields(
  base: Json | undefined,
  changes: FieldChange[],
): Record<string, Json> {
  const root = structuredClone(record(base));
  for (const change of changes) {
    let node = root;
    for (const key of change.path.slice(0, -1)) {
      if (!Object.hasOwn(node, key)) node[key] = Object.create(null);
      node = node[key] as Record<string, Json>;
    }
    const last = change.path.at(-1)!;
    if (change.value === undefined) delete node[last];
    else node[last] = change.value;
  }
  return root;
}
