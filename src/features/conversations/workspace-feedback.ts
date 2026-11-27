import type { WorkspaceOriginal } from "../../integrations/pakka/useWorkspaceChange.js";

export function workspaceFeedback({
  command,
  folderName,
  conversationName,
}: WorkspaceOriginal) {
  const named = (name?: string) => (name ? `「${name}」` : "");
  switch (command.op) {
    case "session.create":
      return {
        confirmed: `已创建 Session${named(command.name)}`,
        lookup: "查看创建结果",
      };
    case "fork":
      return {
        confirmed: `已创建对话分叉${named(command.name)}`,
        lookup: "查看分叉结果",
      };
    case "create":
      return {
        confirmed: `已创建对话${named(command.name)}`,
        lookup: "查看创建结果",
      };
    case "conversation.set":
      return {
        confirmed: `已保存对话${named(command.input.name)}的信息`,
        lookup: "查看保存结果",
      };
    case "navigation.update": {
      const action = command.input.action;
      switch (action.kind) {
        case "folder.create":
          return {
            confirmed: `已创建文件夹${named(action.name)}`,
            lookup: "查看创建结果",
          };
        case "folder.rename":
          return {
            confirmed: `已将文件夹${named(folderName)}重命名为${named(action.name)}`,
            lookup: "查看重命名结果",
          };
        case "folder.delete":
          return {
            confirmed: `已删除文件夹${named(folderName)}`,
            lookup: "查看删除结果",
          };
        case "assign":
          return {
            confirmed: `已将对话${named(conversationName)}移至${action.folderId ? `文件夹${named(folderName)}` : "未分类"}`,
            lookup: "查看移动结果",
          };
        case "mode":
          return {
            confirmed: `已按${action.mode === "session" ? " Session 与名称" : "名称"}排序`,
            lookup: "查看排序结果",
          };
      }
    }
  }
}
