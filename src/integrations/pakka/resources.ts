import type { ResourceReference } from "@pakka/webui-sdk";
import type { ConversationReference } from "@pakka/protocol/webui";

export function conversationResource(
  reference: Pick<ConversationReference, "sessionId" | "conversationId">,
): ResourceReference {
  return {
    source: "pakka",
    type: "conversation",
    id: JSON.stringify([reference.sessionId, reference.conversationId]),
  };
}
export function conversationReference(
  resource: ResourceReference | undefined,
): ConversationReference {
  if (
    !resource ||
    resource.source !== "pakka" ||
    resource.type !== "conversation" ||
    resource.id.length > 2048
  )
    throw new Error("需要明确的原 Session 与 Conversation 引用。");
  let value: unknown;
  try {
    value = JSON.parse(resource.id);
  } catch {
    throw new Error("Conversation 引用格式无效。");
  }
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value.some((item) => typeof item !== "string" || !item || item.length > 256)
  )
    throw new Error("Conversation 引用格式无效。");
  return {
    kind: "conversation",
    sessionId: value[0],
    conversationId: value[1],
  };
}
