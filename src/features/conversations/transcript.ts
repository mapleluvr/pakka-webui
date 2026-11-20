import type {
  PocketDisplay,
  PocketMessage,
  PocketPart,
  PocketSnapshot,
} from "@pakka/protocol/pocket";
import type { ConversationReference } from "@pakka/protocol/webui";

type Call = Extract<PocketPart, { type: "toolCall" }>;
export type ToolContent = {
  callId: string;
  name: string;
  declaration?: Call;
  result?: PocketMessage;
  live?: PocketSnapshot["live"]["tools"][number];
};
type Origin = {
  key: string;
  source: string;
  entryId?: string;
  isLive?: boolean;
};
export type TranscriptRow = Origin &
  (
    | { kind: "message"; message: PocketMessage }
    | { kind: "display"; display: PocketDisplay }
    | { kind: "tool"; tool: ToolContent }
  );

export function transcriptRows(
  entries: PocketSnapshot["entries"],
  live: PocketSnapshot["live"] | undefined,
  reference: ConversationReference,
): TranscriptRow[] {
  const rows: TranscriptRow[] = [],
    tools = new Map<string, Extract<TranscriptRow, { kind: "tool" }>>();
  function tool(
    source: string,
    callId: string,
    name: string,
    entryId?: string,
  ) {
    const key = JSON.stringify([reference.sessionId, source, callId]);
    let row = tools.get(key);
    if (!row) {
      row = {
        kind: "tool",
        key,
        source,
        ...(entryId ? { entryId } : {}),
        tool: { callId, name },
      };
      tools.set(key, row);
      rows.push(row);
    } else if (!row.entryId && entryId) row.entryId = entryId;
    return row;
  }
  function message(value: PocketMessage, origin: Origin) {
    if (value.role === "toolResult" && value.toolCallId) {
      tool(
        origin.source,
        value.toolCallId,
        value.toolName ?? "工具",
        origin.entryId,
      ).tool.result = value;
      return;
    }
    const content =
      typeof value.content === "string"
        ? value.content
        : value.content.filter((part) => part.type !== "toolCall");
    if (content.length || value.errorMessage)
      rows.push({ ...origin, kind: "message", message: { ...value, content } });
    if (typeof value.content !== "string")
      for (const part of value.content)
        if (part.type === "toolCall") {
          const row = tool(origin.source, part.id, part.name, origin.entryId);
          row.tool.declaration = part;
        }
  }
  for (const entry of entries) {
    const source = entry.sourceConversationId ?? entry.conversationId;
    entry.messages.forEach((value, index) =>
      message(value, {
        key: `entry/${entry.id}/${index}`,
        source,
        entryId: entry.id,
      }),
    );
    if (entry.display)
      rows.push({
        key: `display/${entry.id}`,
        kind: "display",
        source,
        entryId: entry.id,
        display: entry.display,
      });
  }
  if (live?.message)
    message(live.message, {
      key: "live-message",
      source: reference.conversationId,
      isLive: true,
    });
  for (const value of live?.tools ?? []) {
    const row = tool(reference.conversationId, value.callId, value.name);
    row.tool.live = value;
  }
  return rows;
}
function messageText(message: PocketMessage) {
  return [
    message.errorMessage ?? "",
    typeof message.content === "string"
      ? message.content
      : message.content
          .map((part) =>
            part.type === "text"
              ? part.text
              : part.type === "thinking"
                ? part.thinking
                : part.type === "image"
                  ? part.mimeType
                  : JSON.stringify(part.arguments),
          )
          .join("\n"),
  ].join("\n");
}
export function rowPreview(row: TranscriptRow): string {
  if (row.kind === "message") return messageText(row.message);
  if (row.kind === "display") return row.display.text;
  return [
    row.tool.name,
    row.tool.declaration ? JSON.stringify(row.tool.declaration.arguments) : "",
    row.tool.result ? messageText(row.tool.result) : "",
    row.tool.live?.output ?? "",
  ].join("\n");
}
