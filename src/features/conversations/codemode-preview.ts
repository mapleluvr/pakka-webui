import type { PocketPart } from "@pakka/protocol/pocket";

type Section = { title: string; text: string };

/** Presentation of a known Pi envelope. Outcome still comes from the tool receipt. */
export function codeEnvelope(parts: readonly PocketPart[], failed: boolean) {
  const first = parts[0];
  if (
    first?.type !== "text" ||
    first.contentReference?.previewComplete === false
  )
    return;
  const match =
    /^Script (completed|failed)\r?\nWall time (\d{1,9}(?:\.\d{1,3})?) seconds\r?\nOutput:\r?\n$/.exec(
      first.text,
    );
  if (match && (match[1] === "failed") === failed) return `${match[2]} 秒`;
}

/** Labels inside printed text guide typography only. They never create tool executions or references. */
export function codeSections(
  source: string,
  failed: boolean,
): Section[] | undefined {
  if (source.length > 64 * 1024) return;
  const lines = source.split(/\r?\n/);
  const out: Section[] = [],
    buffer: string[] = [];
  let title = failed ? "部分输出" : "文本",
    mode: "body" | "console" | "after-console" | "error" = "body";
  let next = 0,
    total = 0;
  function flush() {
    if (buffer.length || next || mode === "console")
      out.push({ title, text: buffer.join("\n") });
    buffer.length = 0;
  }
  let marked = false;
  for (const line of lines) {
    if (mode === "error") {
      buffer.push(line);
      continue;
    }
    if (mode === "console") {
      if (line === "</console_output>") {
        flush();
        mode = "after-console";
      } else buffer.push(line);
      continue;
    }
    if (failed && line === "Script error:") {
      if (mode !== "after-console") flush();
      mode = "error";
      title = "脚本错误";
      marked = true;
      continue;
    }
    if (mode === "after-console") {
      if (line.trim()) return;
      continue;
    }
    if (line === "<console_output>") {
      flush();
      title = "Console";
      mode = "console";
      marked = true;
      continue;
    }
    if (line.startsWith("==> text ")) {
      const match = /^==> text ([1-9]\d{0,3})\/([1-9]\d{0,3}) <==$/.exec(line);
      if (!match) return;
      const n = Number(match[1]),
        m = Number(match[2]);
      if (
        n > m ||
        m < 2 ||
        (next && (n !== next || m !== total)) ||
        (!next && buffer.length) ||
        out.length >= 32
      )
        return;
      flush();
      total = m;
      next = n + 1;
      title = `文本 ${n}/${m}`;
      marked = true;
      continue;
    }
    buffer.push(line);
  }
  if (!marked || mode === "console") return;
  if (mode !== "after-console") flush();
  return out;
}
