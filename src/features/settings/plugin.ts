import { defineUiPlugin } from "@pakka/webui-sdk";
import type { PakkaConnection } from "../../integrations/pakka/connection.js";
import { ModelConnectionsView } from "./ModelConnectionsView.js";
import { ModelDefaultsView } from "./ModelDefaultsView.js";

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
