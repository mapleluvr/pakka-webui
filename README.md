# pakka-webui

Pakka 的独立浏览器应用与 UI 插件宿主，采用 React 19、TypeScript/TSX 与 Astryx，通过公开客户端和协议连接 Pakka。

**当前仅完成仓库与开发约定初始化，尚无可运行前端、构建命令或已发布 UI SDK。**

## 从这里开始

- [工作入口](docs/OVERVIEW.md)：当前状态与下一步。
- [产品与架构边界](docs/state/webui.md)：已经采用的职责、插件和模型访问要求。
- [开发约定](AGENTS.md)：代码组织、验证与协作规则。
- [初始化记录](docs/changes/repository-bootstrap.md)：授权范围和固定来源。

Pakka 后端维护在 [mapleluvr/pakka](https://github.com/mapleluvr/pakka)。本仓维护前端应用、浏览器 UI SDK 与 Pakka 接入层；后端执行、权限和持久化由 Pakka 提供。
