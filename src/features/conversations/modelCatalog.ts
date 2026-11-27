import type { ModelCatalogItem } from "@pakka/protocol/webui";
import type { PakkaConnection } from "../../integrations/pakka/connection.js";
export const modelKey = (model: Pick<ModelCatalogItem, "provider" | "id">) =>
  `${model.provider}/${model.id}`;
export function modelSelectionProblem(model: ModelCatalogItem): string | null {
  return model.authentication === "unconfigured"
    ? `${modelKey(model)} 尚未配置认证，不能选择；请先由后端配置凭据。本地无鉴权端点也可能需要原生占位 key。`
    : null;
}
export async function exactModel(
  connection: PakkaConnection,
  key: string,
  signal: AbortSignal,
): Promise<ModelCatalogItem> {
  const slash = key.indexOf("/");
  if (slash < 1 || slash === key.length - 1)
    throw new Error("请输入完整模型身份，例如 /model openai/gpt-4o。");
  const provider = key.slice(0, slash),
    id = key.slice(slash + 1);
  let offset = 0,
    revision: string | undefined;
  do {
    const { page } = await connection.services.request(
      {
        op: "model-catalog.read",
        query: {
          type: "chat",
          provider,
          query: id,
          offset,
          limit: 50,
          ...(revision ? { revision } : {}),
        },
      },
      { signal },
    );
    if (page.status !== "ready") throw new Error("模型目录当前不可得。");
    const found = page.models.find(
      (model) => model.provider === provider && model.id === id,
    );
    if (found) return found;
    if (page.nextOffset === null) break;
    offset = page.nextOffset;
    revision = page.revision;
  } while (!signal.aborted);
  signal.throwIfAborted();
  throw new Error(`未找到完整模型身份 ${key}；请检查提供商与 model ID。`);
}

export const modelIdentityKey = (model: ModelCatalogItem) =>
  JSON.stringify([model.provider, model.id]);
