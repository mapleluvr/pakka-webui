import type { ModelConfigurationView } from "@pakka/protocol/webui";
import type { NativeValueType } from "./modelFields.js";
import {
  jsonValue,
  managed,
  privateKey,
  publicEdit,
  sensitiveUrl,
  starts,
  type Json,
  type Path,
} from "./modelFields.js";

export function nativeValueType(value: Json | undefined): NativeValueType {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number")
    return typeof value === "boolean" ? "boolean" : "number";
  return typeof value === "object" ? "json" : "text";
}
export function nativeText(value: Json | undefined) {
  return value === undefined
    ? ""
    : typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2);
}
export function nativeValue(type: NativeValueType, text: string): Json {
  switch (type) {
    case "text":
      return text;
    case "boolean":
      return text === "true";
    case "null":
      return null;
    case "number": {
      const value = jsonValue(text);
      if (typeof value !== "number" || !Number.isFinite(value))
        throw Error("请输入有限的 JSON 数值。");
      return value;
    }
    case "json": {
      const value = jsonValue(text);
      if (!Array.isArray(value)) throw Error("请输入完整的 JSON 数组。");
      return value;
    }
  }
}
export function checkNativeKey(key: string, path: Path, override: boolean) {
  if (
    !key.trim() ||
    key.length > 512 ||
    /[\x00-\x1f\x7f]/.test(key) ||
    ["__proto__", "prototype", "constructor"].includes(key)
  )
    throw Error("字段键为空、过长或使用了保留名称。");
  if (
    path.length === 0 &&
    (["models", "modelOverrides", "id"].includes(key) ||
      (override && ["api", "baseUrl"].includes(key)))
  )
    throw Error("请在对应的模型定义或覆盖中编辑。");
  if (sensitiveUrl(key)) throw Error("请勿输入认证 URL。");
}
export function browsable(
  view: ModelConfigurationView,
  prefix: Path,
  relative: string[],
  value: Json | undefined,
  override: boolean,
) {
  const path = [...prefix, ...relative];
  try {
    if (path.length > 16) return false;
    checkNativeKey(relative.at(-1)!, relative.slice(0, -1), override);
    if (privateKey(path) || view.protectedPaths.some((p) => starts(path, p)))
      return false;
    if (value && typeof value === "object" && !Array.isArray(value))
      return true; // Browse its children, never prefill the parent.
    if (managed(view, path)) return false;
    publicEdit(
      view,
      value === undefined ? { path, remove: true } : { path, value },
    );
    return true;
  } catch {
    return false;
  }
}

// Reject recognizable credentials even while single-field JSON input is incomplete.
export function checkNativeText(
  path: Path,
  type: NativeValueType,
  text: string,
) {
  const refuse = () => {
    throw Error("凭据、认证 URL 和请求头由宿主管理。");
  };
  if (sensitiveUrl(text)) refuse();
  if (type !== "json") return;
  for (const token of text.matchAll(/"((?:\\.|[^"\\])*)("\s*:?)?/gs)) {
    const raw = token[1]!,
      end = token[2] ?? "";
    let value = raw;
    try {
      value = JSON.parse(`"${raw}"`) as string;
    } catch {
      /* Unfinished escape. */
    }
    if (
      sensitiveUrl(value) ||
      (end.endsWith(":") && privateKey([...path, value]))
    )
      refuse();
  }
}
