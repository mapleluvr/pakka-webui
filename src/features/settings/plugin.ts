import { defineUiPlugin } from "@pakka/webui-sdk";
import { AppearanceView } from "./AppearanceView.js";

export const appearanceSettings = defineUiPlugin({
  api: 1,
  runtime: "react19-astryx0.7.15",
  id: "appearance-settings",
  version: "0.1.0",
  title: "外观",
  views: [
    {
      id: "appearance",
      title: "外观",
      placement: "settings",
      navigation: true,
      render: AppearanceView,
    },
  ],
});
import type { PakkaConnection } from "../../integrations/pakka/connection.js";
import { ModelConnectionsView } from "./ModelConnectionsView.js";
import { ModelDefaultsView } from "./ModelDefaultsView.js";
import { SessionBudgetView } from "./SessionBudgetView.js";
import { NotificationSettingsView } from "./NotificationSettingsView.js";
import {
  ExtensionSettingsView,
  type ExtensionSettingsBindings,
} from "./ExtensionSettingsView.js";

export const extensionSettings = defineUiPlugin<ExtensionSettingsBindings>({
  api: 1,
  runtime: "react19-astryx0.7.15",
  id: "extension-settings",
  version: "0.1.0",
  title: "扩展与 facets",
  views: [
    {
      id: "facets",
      title: "扩展与 facets",
      placement: "settings",
      navigation: true,
      render: ExtensionSettingsView,
    },
  ],
});

export const notificationSettings = defineUiPlugin<PakkaConnection>({
  api: 1,
  runtime: "react19-astryx0.7.15",
  id: "notification-settings",
  version: "0.1.0",
  title: "通知",
  views: [
    {
      id: "notifications",
      title: "通知",
      placement: "settings",
      navigation: true,
      resourceTypes: [{ source: "pakka", type: "conversation" }],
      render: NotificationSettingsView,
    },
  ],
});

export const sessionSettings = defineUiPlugin<PakkaConnection>({
  api: 1,
  runtime: "react19-astryx0.7.15",
  id: "session-settings",
  version: "0.1.0",
  title: "Session 设置",
  views: [
    {
      id: "budget",
      title: "Session 预算",
      placement: "settings",
      navigation: true,
      resourceTypes: [{ source: "pakka", type: "session" }],
      render: SessionBudgetView,
    },
  ],
});

export function modelSettings(connection: PakkaConnection) {
  return defineUiPlugin<PakkaConnection>({
    api: 1,
    runtime: "react19-astryx0.7.15",
    id: "model-settings",
    version: "0.1.0",
    title: "模型设置",
    views: [
      {
        id: "defaults",
        title: "个人模型默认",
        placement: "settings",
        navigation: true,
        render: ModelDefaultsView,
      },
      ...(connection.person.role === "admin"
        ? [
            {
              id: "connections",
              title: "提供商与模型",
              placement: "settings" as const,
              navigation: true,
              render: ModelConnectionsView,
            },
          ]
        : []),
    ],
  });
}
