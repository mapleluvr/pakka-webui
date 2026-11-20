import type { ViewTarget } from "@pakka/webui-sdk";

/** Stable UI addresses carry references, never credentials or filesystem paths. */
export function viewHref(target: ViewTarget): string {
  const path = `#/plugins/${encodeURIComponent(target.plugin)}/${encodeURIComponent(target.view)}`;
  const resource = target.resource;
  if (!resource) return path;
  const query = new URLSearchParams({
    source: resource.source,
    type: resource.type,
    id: resource.id,
  });
  if (resource.version) query.set("version", resource.version);
  return `${path}?${query}`;
}
export function parseViewHref(hash: string): ViewTarget | null {
  if (!hash.startsWith("#/plugins/")) return null;
  if (hash.length > 8192) throw new Error("界面链接过长。");
  const split = hash.indexOf("?");
  const route = split < 0 ? hash : hash.slice(0, split);
  const query = new URLSearchParams(split < 0 ? "" : hash.slice(split + 1));
  let parts: string[];
  try {
    parts = route.slice("#/plugins/".length).split("/").map(decodeURIComponent);
  } catch {
    throw new Error("界面链接格式无效。");
  }
  const [plugin, view] = parts;
  if (
    parts.length !== 2 ||
    !plugin ||
    !view ||
    plugin.length > 256 ||
    view.length > 256
  )
    throw new Error("界面链接格式无效。");
  for (const key of query.keys())
    if (
      !["source", "type", "id", "version"].includes(key) ||
      query.getAll(key).length !== 1
    )
      throw new Error("资源链接格式无效。");
  if (!query.size) return { plugin, view };
  const source = query.get("source"),
    type = query.get("type"),
    id = query.get("id"),
    version = query.get("version");
  if (!source || !type || !id) throw new Error("资源链接缺少身份。");
  return {
    plugin,
    view,
    resource: { source, type, id, ...(version ? { version } : {}) },
  };
}
