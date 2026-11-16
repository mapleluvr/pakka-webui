# 工作入口

Pakka 的独立 WebUI 与通用 UI 插件宿主。采用的目标见 [WebUI state](state/webui.md)，运行入口见 [README](../README.md)与[应用开发](development/APPLICATION.md)，插件公开能力见 [UI SDK](development/UI-SDK.md)。

## 当前状态

阶段 1 的独立 SDK、只读历史和逐 facet 接缝已经验收。阶段 2 候选形成独立应用与同源开发环境、通用 registry、GUI-only 示例、跨 Session 原历史浏览、模型/Thinking 双入口、实例连接和 Person 默认值设置，以及由 RSI 包提供的 React/Astryx 工单切片。

当前组合为 services 3 / extensions 3 / workbench 2、资产 schema 2；完整应用的 `dist/app` 有 HTML entry，共享 runtime 的 entry 仍为 null。后端提供固定 manifest 入口，默认产品尚未切换。具体检查、失败复验和制品身份见[阶段 2 核对](verification/PHASE-2.md)，形成过程见[独立应用记录](changes/independent-application.md)。阶段 3 已完成静态应用归档、两仓固定配对和相同安装版后端的 A → B → A；操作见[应用交付](development/DELIVERY.md)，实际检查见[阶段 3 核对](verification/PHASE-3.md)。

## 后续工作

- 阶段 4 补齐完整 Conversation、事件观察、设置与其余插件。普通输入丢响应后保留原 requestId 并阻止重发，公共输入回执查询仍是明确缺口；模型设置和 RSI 已有各自的原请求核对。
- Provider `/login` 继续按 roadmap 延期。完整功能迁移、默认产品切换、npm 发布和合并分别授权与验收。
- Windows 长路径下旧私密文件 ACL helper 与上游 Node 依赖声明限制保留在核对记录，不通过放宽权限或 `skipLibCheck` 掩盖。

后端阶段与能力清单由 [plan-independent-webui](https://github.com/mapleluvr/pakka/tree/pakka/independent-webui-seams/openspec/changes/plan-independent-webui)管理。
