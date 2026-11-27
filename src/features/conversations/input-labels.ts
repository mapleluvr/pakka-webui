import type {
  PocketInputReceipt,
  PocketSnapshot,
} from "@pakka/protocol/pocket";
import type {
  ConversationInputHistory,
  ConversationReference,
} from "@pakka/protocol/webui";

type ReceiptState = PocketInputReceipt["status"];

/** Receipts identify their own entry; matching text or a busy conversation cannot identify its author. */
export function ownEntryStatuses(
  entries: PocketSnapshot["entries"],
  inputs: ConversationInputHistory | null,
  personId: string,
  target: ConversationReference,
) {
  const eligible = new Set(
    entries
      .filter(
        (e) =>
          (e.sourceConversationId ?? e.conversationId) ===
            target.conversationId &&
          e.messages.filter((m) => m.role === "user").length === 1,
      )
      .map((e) => e.id),
  );
  const found = new Map<string, ReceiptState | null>();
  for (const { receipt: r } of inputs?.items ?? []) {
    if (
      !r.entryId ||
      !eligible.has(r.entryId) ||
      r.actorId !== personId ||
      r.target.sessionId !== target.sessionId ||
      r.target.conversationId !== target.conversationId
    )
      continue;
    found.set(r.entryId, found.has(r.entryId) ? null : r.status);
  }
  return found;
}

export function inlineInputStatus(
  status: ReceiptState | null | undefined,
  liveBusy: boolean,
) {
  if (!status || status === "done") return undefined;
  if (status === "placed" && liveBusy) return "processing";
  return status;
}

export const inputModeLabel = {
  prompt: "发送消息",
  steer: "调整当前工作",
  followUp: "本轮结束后执行",
} as const;

export const inputModeDescription = {
  prompt: "作为一条新消息发送。",
  steer: "Steering · 在当前任务中补充要求。",
  followUp: "Follow-up · 等当前任务结束，再处理这条消息。",
} as const;

export const sendLabel = {
  prompt: "发送消息",
  steer: "发送补充",
  followUp: "发送跟进",
} as const;

export const inputStatus = {
  queued: "排队中",
  placed: "已收到",
  done: "已答复",
  unanswered: "未作答",
  unknown: "发送状态待确认",
} as const;
