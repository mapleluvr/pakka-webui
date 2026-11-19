# 工作入口

Pakka 的独立 WebUI 与通用 UI 插件宿主。采用的目标见 [WebUI state](state/webui.md)，运行入口见 [README](../README.md)与[应用开发](development/APPLICATION.md)，插件公开能力见 [UI SDK](development/UI-SDK.md)。

## 当前状态

阶段 1 的独立 SDK、只读历史和逐 facet 接缝已经验收。阶段 2 候选形成独立应用与同源开发环境、通用 registry、GUI-only 示例、跨 Session 原历史浏览、模型/Thinking 双入口、实例连接和 Person 默认值设置，以及由 RSI 包提供的 React/Astryx 工单切片。

阶段 2/3 的已验收固定组合为 services 3 / extensions 3 / workbench 2、资产 schema 2；完整应用的 `dist/app` 有 HTML entry，共享 runtime 的 entry 仍为 null。后端提供固定 manifest 入口，默认产品尚未切换。具体检查、失败复验和制品身份见[阶段 2 核对](verification/PHASE-2.md)，形成过程见[独立应用记录](changes/independent-application.md)。阶段 3 已完成静态应用归档、两仓固定配对和相同安装版后端的 A → B → A；操作见[应用交付](development/DELIVERY.md)，实际检查见[阶段 3 核对](verification/PHASE-3.md)。

## 后续工作

- 阶段 4 正在执行，开发协议/client 与 manifest 使用 services 4、workbench 2、extensions 3 和资产 schema 2。Conversation、工作台、配置、协作和业务插件已完成分项运行核对；通知已实测原生推送、Windows 显示、点击原对话及撤权清理。Node 24 仓库外安装和 worker A → B → A 的字节替换/回退已核对，旧读取取消分支及其限制分别保留。
- 主界面已使用 design-companion 与真实页面迭代侧栏/手机导航、独立阅读、紧凑输入、消息操作和原文模式，PC/390px、阅读位置、原请求恢复与登录退出清理已核对；见[工作台界面](verification/WORKBENCH-INTERFACE.md)。外观和语音草稿生命周期已实现并验证；本机无录音设备，用户已授权跳过真实录音检查，原生识别质量仍未验证。
- 空 Conversation、最终固定归档/仓库外安装、登录/输入/刷新回执与撤权清理已核对。扩大回归仍有 13 个失败文件、1 个未完成文件，阶段退出受阻；固定候选与完整限制见[阶段 4 核对](verification/PHASE-4.md)。活动材料在 `docs/.temp/active-plan.md`，后续接续旧默认入口与检查覆盖，默认切换属于阶段 5。
- Provider `/login` 继续按 roadmap 延期。完整功能迁移、默认产品切换、npm 发布和合并分别授权与验收。
- Windows 长路径下旧私密文件 ACL helper 与上游 Node 依赖声明限制保留在核对记录，不通过放宽权限或 `skipLibCheck` 掩盖。

后端阶段与能力清单由 [plan-independent-webui](https://github.com/mapleluvr/pakka/tree/pakka/independent-webui-seams/openspec/changes/plan-independent-webui)管理。
