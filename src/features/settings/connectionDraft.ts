import type {
  ModelCatalogItem,
  ModelConfigurationEdit,
  ModelConfigurationView,
} from "@pakka/protocol/webui";
import {
  applyFields,
  publicEdit,
  record,
  valueAt,
  type FieldChange,
  type Path,
} from "./modelFields.js";

export type Layer =
  | "new-provider"
  | "provider-override"
  | "provider"
  | "new-definition"
  | "new-override"
  | "definition"
  | "override";
export interface Target {
  layer: Layer;
  provider: string;
  model: string;
}
export interface Draft {
  target: Target;
  base: ModelConfigurationView;
  changes: FieldChange[];
  requestId?: string;
}
export const labels: Record<Layer, string> = {
  "new-provider": "新建提供商",
  "provider-override": "覆盖已有提供商",
  provider: "提供商设置",
  "new-definition": "添加模型定义",
  "new-override": "覆盖目录模型",
  definition: "编辑模型定义",
  override: "编辑目录模型覆盖",
};
export function newProvider(layer: Layer) {
  return layer === "new-provider" || layer === "provider-override";
}
export function modelLayer(layer: Layer) {
  return !newProvider(layer) && layer !== "provider";
}
export function locate(
  view: ModelConfigurationView,
  { layer, provider, model }: Target,
) {
  if (newProvider(layer)) provider = provider.trim();
  if (layer.startsWith("new-")) model = model.trim();
  const providers = record(view.document.providers),
    config = record(valueAt(providers, [provider])),
    models = Array.isArray(config.models) ? config.models : [];
  const matches = models.flatMap((v, i) => (record(v).id === model ? [i] : []));
  const index = layer === "new-definition" ? models.length : (matches[0] ?? -1);
  const prefix = ["providers", provider];
  const path: Path =
    layer === "new-definition" || layer === "definition"
      ? [...prefix, "models", index]
      : layer === "new-override" || layer === "override"
        ? [...prefix, "modelOverrides", model]
        : prefix;
  return {
    providers,
    config,
    models,
    matches,
    path,
    base: valueAt(view.document, path),
  };
}
export function prepareDraft(
  d: Draft,
  catalog: { models: ModelCatalogItem[]; ready: boolean } | null,
) {
  const { layer, provider, model } = d.target,
    ctx = locate(d.base, d.target),
    data = applyFields(
      newProvider(layer) || layer.startsWith("new-") ? undefined : ctx.base,
      d.changes,
    ),
    key = provider.trim(),
    id = model.trim();
  if (d.changes.some((c) => c.error)) throw Error("请修正下方标出的字段。");
  if (!key) throw Error("请输入 提供商 ID。");
  if (!newProvider(layer) && !Object.hasOwn(ctx.providers, key))
    throw Error("此提供商已不在当前配置中，请重新选择。");
  if (newProvider(layer) && Object.hasOwn(ctx.providers, key))
    throw Error("此提供商已配置，请打开原对象。");
  if (
    layer === "new-provider" &&
    catalog?.models.some((m) => m.provider === key)
  )
    throw Error("目录已有此提供商，请选择「覆盖已有提供商」。");
  if (layer === "new-provider" && (!data.api || !data.baseUrl || !id))
    throw Error("请选择协议、填写端点及首个聊天模型 ID。");
  if (layer === "provider-override" && !data.baseUrl)
    throw Error("请填写要覆盖的端点。");
  if ((layer === "new-definition" || layer === "new-override") && !id)
    throw Error("请选择或填写完整模型 ID。");
  if (
    layer === "new-definition" &&
    (ctx.matches.length ||
      catalog?.models.some((m) => m.provider === key && m.id === id))
  )
    throw Error("已有同名模型，请编辑原定义或覆盖目录模型。");
  if (layer === "new-definition" && !(data.api || ctx.config.api))
    throw Error("请为新增模型明确选择模型级协议或提供商的默认协议。");
  if (
    layer === "new-override" &&
    (!catalog?.ready ||
      !catalog.models.some(
        (m) => m.provider === key && m.id === id && m.type === "chat",
      ) ||
      ctx.matches.length ||
      ctx.base !== undefined)
  )
    throw Error("请选择目录中尚无定义或覆盖的完整 chat 模型。");
  if (
    (layer === "definition" && ctx.matches.length !== 1) ||
    (layer === "override" && ctx.base === undefined)
  )
    throw Error("目标缺失或身份不唯一，请重新选择。");
  let edits: ModelConfigurationEdit[];
  if (newProvider(layer))
    edits = [
      {
        path: ctx.path,
        value: layer === "new-provider" ? { ...data, models: [{ id }] } : data,
      },
    ];
  else if (layer === "new-definition")
    edits = [{ path: ctx.path, value: { ...data, id } }];
  else if (layer === "new-override") {
    if (!d.changes.length) throw Error("请先修改要覆盖的字段。");
    edits = [{ path: ctx.path, value: data }];
  } else
    edits = d.changes.map((c) =>
      c.value === undefined
        ? { path: [...ctx.path, ...c.path], remove: true }
        : { path: [...ctx.path, ...c.path], value: c.value },
    );
  if (!edits.length) throw Error("没有待保存的修改。");
  if (edits.length > 64) throw Error("单次最多 64 项修改，请撤下多余修改。");
  for (const edit of edits) publicEdit(d.base, edit);
  return edits;
}
export function savedTarget({ layer, provider, model }: Target): Target {
  return {
    provider: provider.trim(),
    model: model.trim(),
    layer:
      layer === "new-provider" || layer === "new-definition"
        ? "definition"
        : layer === "provider-override"
          ? "provider"
          : layer === "new-override"
            ? "override"
            : layer,
  };
}
