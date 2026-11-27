import { useState } from "react";
import type { ModelConfigurationView } from "@pakka/protocol/webui";
import { record, starts, valueAt, type Path } from "./modelFields.js";

const names = new Map([
  ["headers", "请求头"],
  ["apiKey", "API 密钥"],
  ["oauth", "OAuth"],
  ["baseUrl", "端点"],
]);
function fieldName(path: Path) {
  return path
    .map((part, i) => {
      const name =
        typeof part === "string" && i === path.length - 1
          ? names.get(part)
          : undefined;
      return name ? `${name} (${part})` : String(part);
    })
    .join(" › ");
}
interface ModelOwners {
  field: Path;
  models: Map<string, Set<string>>;
  unidentified: boolean;
}

/** Interpret each numeric marker only within the document revision that supplied it. */
export function managedFields(
  view: ModelConfigurationView,
  prefix: Path,
  provider: boolean,
) {
  const own: Path[] = [],
    groups = new Map<string, ModelOwners>();
  const config = record(valueAt(view.document, prefix));
  const ids =
    provider && Array.isArray(config.models)
      ? config.models.map((v) => record(v).id)
      : [];
  const definitions = new Map<string, number>();
  for (const id of ids)
    if (typeof id === "string" && id)
      definitions.set(id, (definitions.get(id) ?? 0) + 1);
  const overrides = record(config.modelOverrides);
  for (const path of view.protectedPaths) {
    if (!starts(path, prefix) || path.length <= prefix.length) continue;
    const tail = path.slice(prefix.length),
      [container, entry] = tail;
    if (
      !provider ||
      (container !== "models" && container !== "modelOverrides")
    ) {
      own.push(tail);
      continue;
    }
    const definition = container === "models",
      field = tail.slice(2),
      key = JSON.stringify(field);
    let group = groups.get(key);
    if (!group) {
      group = { field, models: new Map(), unidentified: false };
      groups.set(key, group);
    }
    const id =
      definition && typeof entry === "number"
        ? ids[entry]
        : !definition &&
            typeof entry === "string" &&
            Object.hasOwn(overrides, entry)
          ? entry
          : undefined;
    if (
      typeof id !== "string" ||
      !id ||
      (definition && definitions.get(id) !== 1)
    ) {
      group.unidentified = true;
      continue;
    }
    let roles = group.models.get(id);
    if (!roles) {
      roles = new Set();
      group.models.set(id, roles);
    }
    if (definitions.has(id) && Object.hasOwn(overrides, id))
      roles.add(definition ? "模型定义" : "目录模型覆盖");
  }
  return { own, groups };
}
export function ModelOwnersGroup({
  group,
  hasProviderHeaders,
}: {
  group: ModelOwners;
  hasProviderHeaders: boolean;
}) {
  const [open, setOpen] = useState(false);
  const title =
    group.field.length === 1 && group.field[0] === "headers"
      ? hasProviderHeaders
        ? "覆盖以上请求头设置的模型"
        : "单独设置了请求头的模型"
      : `设置了${group.field.length ? fieldName(group.field) : "受保护字段"}的模型`;
  return (
    <details
      className="native-owners"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <span>{title}</span>{" "}
        <small>
          {group.models.size} 个模型{group.unidentified && " · 含身份未确认项"}
        </small>
      </summary>
      {open && (
        <>
          <ul className="native-managed-list">
            {Array.from(group.models, ([id, roles]) => (
              <li key={id}>
                <code>{id}</code>
                {roles.size > 0 && `（${Array.from(roles).join("、")}）`}
              </li>
            ))}
          </ul>
          {group.unidentified && <p>有管理项无法确认所属模型身份。</p>}
        </>
      )}
    </details>
  );
}
