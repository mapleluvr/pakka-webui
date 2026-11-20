import { decodeJson } from "@pakka/protocol/extension-rpc";
import type { ExtensionJson } from "@pakka/protocol/extensions";
import type {
  ModelConfigurationEdit,
  ModelConfigurationPath,
} from "@pakka/protocol/webui";

export function record(value: unknown): Record<string, ExtensionJson> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, ExtensionJson>)
    : {};
}
export function valueAt(
  document: ExtensionJson,
  path: ModelConfigurationPath,
): ExtensionJson | undefined {
  let value: ExtensionJson | undefined = document;
  for (const key of path) {
    if (value === null || typeof value !== "object") return undefined;
    value = Array.isArray(value)
      ? value[Number(key)]
      : (value as Readonly<Record<string, ExtensionJson>>)[key];
  }
  return value;
}
export function displayValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}
export function jsonValue(text: string): ExtensionJson {
  try {
    return decodeJson(JSON.parse(text));
  } catch {
    throw new Error("请输入有效的 JSON 值。");
  }
}
export function editPath(text: string): ModelConfigurationPath {
  const value = jsonValue(text);
  if (
    !Array.isArray(value) ||
    !value.length ||
    value[0] !== "providers" ||
    value.some(
      (key) =>
        typeof key !== "string" &&
        !(typeof key === "number" && Number.isSafeInteger(key) && key >= 0),
    )
  )
    throw new Error('路径应是以 "providers" 开头的 JSON 数组。');
  return value as ModelConfigurationPath;
}
export function fieldEdit(
  path: ModelConfigurationPath,
  text: string,
  numeric = false,
): ModelConfigurationEdit {
  if (!text.trim()) return { path, remove: true };
  if (!numeric) return { path, value: text.trim() };
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0)
    throw new Error("数值必须是非负有限数字。");
  return { path, value: number };
}
