import type { PocketMessage } from "@pakka/protocol/pocket";
import type { ToolContent } from "./transcript.js";
export type ReplyIssue = {
  title: "回复失败" | "回复已中止";
  reason: string;
  stopped?: true;
  hint?: string;
  http?: number;
  detail: string;
  excerpt?: string;
  fingerprint?: Fingerprint;
  reference?: PocketMessage["errorReference"];
};

export type Fingerprint = { scope: string; text: string; words: Set<string> };
// Remove variable IDs on the comparison copy only. Keep ordinary words and short status/exit codes.
function signature(scope: string, value: string): Fingerprint | undefined {
  const normalized = value
    .slice(0, 1024)
    .normalize("NFKC")
    .replace(
      /\b(?:(?:request|trace|correlation|span|item)[-_ ]?id)\s*["']?\s*[:=]\s*["']?[\w./:+-]+/gi,
      " ",
    )
    .replace(/\b[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\b/gi, " ")
    .replace(/\b[A-Za-z0-9_-]{16,}\b/g, (s) =>
      s.length >= 28 || /\d/.test(s) || (/[a-z]/.test(s) && /[A-Z]/.test(s))
        ? " "
        : s,
    )
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (!normalized) return;
  return { scope, text: normalized, words: new Set(normalized.split(" ")) };
}
export function similar(a?: Fingerprint, b?: Fingerprint) {
  if (!a || !b || a.scope !== b.scope) return false;
  if (a.text === b.text) return true;
  const shorter = a.text.length <= b.text.length ? a.text : b.text;
  const longer = a.text.length <= b.text.length ? b.text : a.text;
  if (shorter.length >= 16 && longer.startsWith(`${shorter} `)) return true;
  const shared = [...a.words].filter((w) => b.words.has(w)).length;
  if (shared >= 3 && shared / (a.words.size + b.words.size - shared) >= 0.77)
    return true;
  // Character bigrams also work for scripts without word separators. Compare
  // against the first member so gradual wording drift cannot bridge unrelated errors.
  if (shorter.length < 16 || shorter.length / longer.length < 0.8) return false;
  const grams = (v: string) =>
    new Set(Array.from(v.slice(1), (_, i) => v.slice(i, i + 2)));
  const x = grams(shorter),
    y = grams(longer);
  return (2 * [...x].filter((g) => y.has(g)).length) / (x.size + y.size) >= 0.9;
}
function providerDiagnostic(raw: string) {
  const line = raw.trim();
  const match =
    /^(?:(?:([\w./-]+)\s+)?API error\s*\(|HTTP(?:\/\d(?:\.\d)?)?\s+)?([45]\d{2})(?=[):\s]|$)\)?\s*:?\s*/i.exec(
      line,
    );
  const http = match ? Number(match[2]) : undefined;
  let message = line.slice(match?.[0].length ?? 0);
  let code = "",
    type = "";
  if (message.startsWith("{")) {
    try {
      const parsed = JSON.parse(message),
        node = parsed?.error ?? parsed;
      if (typeof node?.message === "string") message = node.message;
      if (typeof node?.code === "string" || typeof node?.code === "number")
        code = String(node.code);
      if (typeof node?.type === "string") type = node.type;
    } catch {
      /* truncated previews still retain their original reference */
    }
  }
  const scope = JSON.stringify([
    "model",
    match?.[1]?.toLowerCase(),
    http,
    code,
    type,
  ]);
  return { http, message, scope };
}
/** Interpret only the assistant's dedicated diagnostic, never its answer or a tool result. */
export function replyIssue(m: PocketMessage): ReplyIssue | undefined {
  const detail = m.errorMessage ?? "";
  const base = { detail, reference: m.errorReference };
  if (m.stopReason === "aborted")
    return {
      ...base,
      title: "回复已中止",
      stopped: true,
      reason: "这次生成在完成前停止了。",
    };
  if (m.stopReason !== "error" && !detail && !m.errorReference) return;
  const parsed = providerDiagnostic(detail);
  const { http, message } = parsed;
  const issue = {
    ...base,
    title: "回复失败" as const,
    http,
    fingerprint: signature(
      parsed.scope,
      message || (http ? `HTTP ${http}` : ""),
    ),
    excerpt: brief(message, ""),
  };
  if (
    http === 400 &&
    /the requested item was created under a different[^.\n]{0,80}openai resource\b/i.test(
      detail,
    )
  )
    return {
      ...issue,
      reason: "本次请求引用的内容来自另一个 OpenAI 资源，当前连接无法读取。",
      hint: "请核对模型连接是否仍指向创建该内容的资源。若连接未变，可请服务商检查请求路由。",
    };
  switch (http) {
    case 400:
      return {
        ...issue,
        reason: "模型服务拒绝了本次请求。",
        hint: "请查看技术详情，核对服务指出的参数或内容。",
      };
    case 401:
      return {
        ...issue,
        reason: "模型服务未接受当前连接的身份凭据。",
        hint: "请检查这个模型连接的登录状态或 API key。",
      };
    case 403:
      return {
        ...issue,
        reason: "模型服务拒绝了当前连接的访问请求。",
        hint: "请检查账号对所选模型和资源的权限。",
      };
    case 429:
      return {
        ...issue,
        reason: "模型服务限制了本次调用。",
        hint: "请查看服务商的请求频率限制和可用额度。",
      };
    default:
      if (http && http >= 500)
        return {
          ...issue,
          reason: "模型服务返回了服务器错误。",
          hint: "请检查服务商的运行状态。",
        };
      return {
        ...issue,
        reason:
          issue.excerpt ||
          (detail || m.errorReference
            ? "这次生成未能完成，技术详情中保留了错误记录。"
            : "这次生成未能完成，记录中没有更多错误信息。"),
      };
  }
}

export function brief(value: string | undefined, fallback: string) {
  const line = value
    ?.trim()
    .split(/\r?\n/, 1)[0]
    ?.replace(
      /\s*\[(?:request|trace|correlation|span)[-_ ]?id\s*[:=][\w./:+-]+\]/gi,
      "",
    )
    .replace(/:\s*[{\[].*$/, "")
    .trim();
  if (!line || /^[<{\[]/.test(line)) return fallback;
  const chars = Array.from(line);
  return chars.length > 64 ? `${chars.slice(0, 63).join("")}…` : line;
}
function toolDiagnosticText(tool: ToolContent) {
  const m = tool.result;
  const fallback = `${tool.name} failed`;
  if (m?.errorMessage) return m.errorMessage;
  if (!m) return fallback;
  const parts =
    typeof m.content === "string"
      ? [m.content]
      : m.content.flatMap((p) => (p.type === "text" ? [p.text] : []));
  // Combined output can start with normal stdout; prefer an explicit error line, then the harness exit record.
  const all = parts.join("\n");
  const error =
    /^(?:fatal:|error:|\w*Error:|Script error:|\[error\] (?!Command exited))[^\r\n]*/im.exec(
      all,
    );
  if (error) return error[0].replace(/^\[error\] /i, "");
  const code =
    /(?:^|\n)(?:\[error\] )?Command exited with code (-?\d+)\s*(?=\n|$)/i.exec(
      all,
    );
  if (code) return `${tool.name} exited with code ${code[1]}`;
  return parts.find((p) => p.trim()) ?? fallback;
}

export function toolDiagnostic(tool: ToolContent) {
  const text = toolDiagnosticText(tool);
  const result = tool.result;
  const output =
    typeof result?.content === "string"
      ? result.content
      : (result?.content
          .flatMap((p) => (p.type === "text" ? [p.text] : []))
          .join("\n") ?? "");
  const exit = /Command exited with code (-?\d+)\b/i.exec(output)?.[1];
  const status = /^HTTP(?:\/\d(?:\.\d)?)?\s+([45]\d{2})\b/i.exec(text)?.[1];
  return {
    label: brief(text, `${tool.name} failed`),
    fingerprint: signature(
      JSON.stringify(["tool", tool.name, exit, status]),
      text,
    ),
  };
}
export function modelLabel(issue: ReplyIssue) {
  const body = issue.excerpt || issue.reason;
  return brief(issue.http ? `HTTP ${issue.http} · ${body}` : body, issue.title);
}
