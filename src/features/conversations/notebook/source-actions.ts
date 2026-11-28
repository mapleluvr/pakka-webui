import type { PocketMessage } from "@pakka/protocol/pocket";
import type { ContentRef, ConversationReference } from "@pakka/protocol/webui";
export type EntryRef = Extract<ContentRef, { content: unknown }>;
export type SourceAction = (
  mode: "pin" | "draft",
  source: EntryRef,
  excerpt: string,
) => void;
export function sourceActions(
  message: PocketMessage | undefined,
  conversation: ConversationReference,
  act?: SourceAction,
) {
  if (!act) return [];
  const part =
    message && typeof message.content !== "string"
      ? message.content.find((p) => p.type === "text")
      : undefined;
  const r = part?.contentReference ?? message?.contentReference,
    excerpt =
      part?.type === "text"
        ? part.text
        : typeof message?.content === "string"
          ? message.content
          : "";
  if (r?.source !== "entry" || !r.entryId || r.encoding !== "text")
    return [
      { label: "等待内容保存后置顶", isDisabled: true, onClick: () => {} },
    ];

  const ref: EntryRef = {
    kind: r.callId ? "tool-result" : "message",
    sessionId: conversation.sessionId,
    conversationId: conversation.conversationId,
    content: r,
  };
  return [
    {
      label: r.callId ? "置顶这条工具结果" : "置顶这条消息",
      onClick: () => act("pin", ref, excerpt),
    },
    {
      label: "从这条消息新建笔记",
      onClick: () => act("draft", ref, excerpt.slice(0, 2048)),
    },
  ];
}
