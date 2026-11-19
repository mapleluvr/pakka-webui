export const inputModeLabel = {
  prompt: "发送消息",
  steer: "调整当前工作",
  followUp: "本轮结束后执行",
} as const;

export const inputStatus = {
  queued: "排队中",
  placed: "已接纳",
  done: "已完成",
  unanswered: "未作答",
  unknown: "结果尚未确认",
} as const;
