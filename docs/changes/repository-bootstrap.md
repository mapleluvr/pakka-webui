# 独立仓库初始化

2026-11-14，用户明确授权以 `mapleluvr` 身份创建公开的 `pakka-webui` GitHub 仓库并初始化。

## 本次采用与初始化范围

- 仓库为 [mapleluvr/pakka-webui](https://github.com/mapleluvr/pakka-webui)，独立本地 checkout，初始默认分支为 `main`。
- 建立 README、开发约定、文本/忽略规则，以及工作入口、预期状态、变更记录的文档分工。模型、插件与职责声明接续已经采用的设计，不重新发明服务接口。
- 公开建仓先行完成；这是管理与协作入口的准备，不代表阶段 1–2 的独立消费、真实前端切片或阶段 3 的实际代码迁移已完成。
- 本次没有复制旧 WebUI、创建产品源码、选定 npm 包名/构建器、安装运行依赖或发布包。公开可见性与许可证是不同决定；本次未新增许可证授权。

## 延续的选择与待办

已有决定采用独立前端及 React 19/TSX/Astryx，旧 Preact 插件不迁移，旧 WebUI/SDK 按无用户处理，不为兼容保留 facade 或旧默认入口；业务能力与后端持久数据仍按所属职责接续。

Provider `/login` 的新交互等待用户确定多端偏好后再设计和实施。该延期不影响 Pakka 人类身份登录、Cookie/CSRF 或已有宿主认证的安全使用。多 Session 自动发现、统一总览和全局搜索尚未采用；当前要求是沿稳定引用浏览原 Conversation。

阶段 0 已确认混合安装包、原 Session 历史读取、插件资产身份、public reconnect、facet 控制和默认静态制品装配等接缝。后续按真实消费者与阶段退出条件落实；创建仓库没有解决这些问题。

## 固定来源与维护分工

- [已采用的 WebUI 架构](https://github.com/mapleluvr/pakka/blob/29cb207ec7b305e2e0a559f3de30a7a21b490228/docs/development/WEBUI-ARCHITECTURE.md)。
- [开发原则](https://github.com/mapleluvr/pakka/blob/29cb207ec7b305e2e0a559f3de30a7a21b490228/docs/development/FRONTEND-GUIDELINES.md)。
- [阶段 0 盘点](https://github.com/mapleluvr/pakka/blob/29cb207ec7b305e2e0a559f3de30a7a21b490228/openspec/changes/plan-independent-webui/inventory.md)与[阶段任务](https://github.com/mapleluvr/pakka/blob/29cb207ec7b305e2e0a559f3de30a7a21b490228/openspec/changes/plan-independent-webui/tasks.md)。
- [通用插件能力 G1–G6](https://github.com/mapleluvr/pakka/blob/170aa153e7dad0cda8f6172665d709407dfa703a/docs/requirements/WEBUI-PLUGIN-CAPABILITIES.md)。

以上为固定形成依据。本仓采用的前端预期在 `docs/state/` 维护；服务协议、客户端和后端能力由 Pakka 所属公开产物维护。后续接口调整需要对应更新实际消费与版本组合，不在两仓复制 wire 定义或依赖本机 sibling 源码。
