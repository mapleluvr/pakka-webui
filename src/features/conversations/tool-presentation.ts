import type { UiIconName } from "@pakka/webui-sdk/icons";
import { codeEnvelope } from "./codemode-preview.js";
import type { ToolContent } from "./transcript.js";

export const shellTool = /^(?:powershell|pwsh|bash|sh|shell|zsh|cmd)$/i;

function toolInput(tool: ToolContent) {
  let key: "path" | "code" | "command" = "path";
  if (tool.name === "codemode") key = "code";
  else if (shellTool.test(tool.name)) key = "command";
  const text = tool.declaration?.arguments[key];
  if (typeof text === "string" && text.trim())
    return {
      key,
      text,
      title: { code: "JavaScript", command: "命令", path: "路径" }[key],
    };
}

export function firstLine(text?: string) {
  const line = text?.trim().split(/\r?\n/, 1)[0];
  if (!line || line.length <= 160) return line;
  return line.slice(0, 159).replace(/[\uD800-\uDBFF]$/, "") + "…";
}

export function toolPresentation(tool: ToolContent) {
  const input = toolInput(tool);
  const excerpt = firstLine(
    input?.key === "code"
      ? input.text.replace(/^\s*\/\/ @options:[^\n]*\n/, "")
      : input?.text,
  );
  let icon: UiIconName = "tool";
  if (tool.name === "codemode") icon = "code";
  else if (shellTool.test(tool.name)) icon = "terminal";
  else if (tool.name === "read") icon = "file";
  else if (tool.name === "write" || tool.name === "edit") icon = "edit";

  const parts = tool.result?.content;
  const elapsed =
    tool.name === "codemode" && Array.isArray(parts)
      ? codeEnvelope(parts, Boolean(tool.result?.isError))
      : undefined;
  return { input, excerpt, icon, elapsed };
}
