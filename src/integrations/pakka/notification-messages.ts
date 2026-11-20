export interface NotificationWorkerCommand {
  readonly kind: "clear" | "local-check";
  readonly requestId: string;
}
export interface NotificationWorkerReply {
  readonly kind: "pakka-notifications";
  readonly requestId: string;
  readonly status: "accepted" | "failed";
}
const invalid = (): never => {
  throw new Error("通知 worker 消息未通过校验。");
};
export function decodeNotificationWorkerCommand(
  value: unknown,
): NotificationWorkerCommand {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "kind,requestId" ||
    !("kind" in value) ||
    !("requestId" in value) ||
    (value.kind !== "clear" && value.kind !== "local-check") ||
    typeof value.requestId !== "string" ||
    !/^[A-Za-z0-9_.:-]{1,128}$/.test(value.requestId)
  )
    return invalid();
  return { kind: value.kind, requestId: value.requestId };
}
export function decodeNotificationWorkerReply(
  value: unknown,
): NotificationWorkerReply {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "kind,requestId,status" ||
    !("kind" in value) ||
    !("requestId" in value) ||
    !("status" in value) ||
    value.kind !== "pakka-notifications" ||
    typeof value.requestId !== "string" ||
    !/^[A-Za-z0-9_.:-]{1,128}$/.test(value.requestId) ||
    (value.status !== "accepted" && value.status !== "failed")
  )
    return invalid();
  return { kind: value.kind, requestId: value.requestId, status: value.status };
}
