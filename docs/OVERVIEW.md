# 工作入口

Pakka 的独立 WebUI 与通用 UI 插件宿主。采用的目标见 [WebUI state](state/webui.md)，现有源码与构建入口见 [UI SDK](development/UI-SDK.md)及 [README](../README.md)。

## 当前状态

本仓从初始化基线 0ee6bdc 开始形成新的纯浏览器 `@pakka/webui-sdk`，不以旧 Preact 产物为架构模板。当前已有贡献/资源/命令声明、单个 UI 实例生命周期、共享 React context 和共同构建的 React/Astryx/主题/CSS runtime；Pakka 协议、服务客户端、模型配置和 Node 资产读取由后端仓库维护。

已运行仓库外干净安装/类型/构建及真实浏览器消费：插件与宿主共享 React、SDK/Astryx context 和 portal；静态主题符合现有 CSP，Dialog/focus 与实例卸载清理成立。结果限定于开发接缝，不等于完整应用或业务插件验收，见[接缝记录](changes/independent-seams.md)。

完整前端入口、开发服务器、Pakka 应用接入层、Conversation 与参数编辑页面尚未形成。共享 runtime manifest 的 entry 为 null、workers 为空，不能直接作为完整 WebUI 启动。

## 下一步与阻塞

- Pakka 已为已知未加载原 Session 接入公开只读 SDK 与受权历史/正文服务，不重开 writer；阶段 1 任务 3.2 仍缺独立分 facet 控制。新候选使用 services API 2，共享 runtime manifest 同步声明该要求；workbench、extension 与 UI SDK/renderer 版本各自不变。它们不代替本仓的实际历史浏览界面。
- 阶段 2 形成真实应用壳层与 registry、纯 UI 插件和新 SDK 业务插件、模型/Thinking 双入口、参数编辑及跨 Session 原历史消费。
- 开发服务器需提供与开发 JSX emission 匹配的共享 runtime，不能混用当前 production runtime 或引入第二份 React。
- Provider `/login` 继续按 roadmap 延期；不为本轮准备 API key/OAuth 交互，不切换默认产品或发布 npm 包。

后端阶段与能力清单由 [plan-independent-webui](https://github.com/mapleluvr/pakka/tree/pakka/independent-webui-seams/openspec/changes/plan-independent-webui)管理。源码、开发制品、正式发布和产品验收分别记录，不因建仓、构建或提交完成而勾选后续产品任务。
