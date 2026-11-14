# pakka-webui

Pakka 的独立浏览器应用与 UI 插件宿主，采用 React 19、TypeScript/TSX 与 Astryx，通过公开客户端和协议连接 Pakka。

当前交付是**纯浏览器 UI SDK、实例生命周期和共享运行时的开发接缝**。完整应用、开发服务器、Conversation 页面和默认产品切换尚未交付；`build` 的共享运行时产物不是可直接启动的完整 WebUI。

## 独立构建

使用 Node 24+ 和 npm 11。在本仓中执行，不需要 checkout、安装或构建 Pakka 后端：

```sh
npm ci --ignore-scripts
npm run check
npm run build
```

| 产物                               | 用途                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `dist/sdk/`                        | `@pakka/webui-sdk` 与 `@pakka/webui-sdk/react` 的 ESM 和类型声明              |
| `dist/runtime/`                    | 共同构建的 React/ReactDOM/JSX、Astryx、默认主题、StyleX runtime 及共享模块    |
| `dist/runtime/asset-manifest.json` | 文件身份、模块映射、默认 CSS 和兼容需求；此共享运行时产物的 `entry` 为 `null` |
| `dist/runtime/BUILD.json`          | 本地构建摘要，不是浏览器服务入口                                              |

默认主题消费上游预构建 `@astryxdesign/theme-neutral/built` 与静态 CSS，使用其支持的系统字体 fallback，不自动访问远程字体服务。自定义静态主题使用上游 theme build 流程；未构建主题的运行时样式注入不适用于当前严格 CSP。

## UI 插件开发

公开接口、示例与构建分工见 [UI SDK 与运行时](docs/development/UI-SDK.md)。插件提供普通 React 内容，通过显式 `bindings` 使用自己的服务；纯 UI 插件无需 Pakka 服务客户端或工作 Session。

开发消费渠道是固定归档：

```sh
npm run build:sdk
npm pack --pack-destination <archive-directory>
```

只将归档作为已核对的本地开发产物使用。当前 package 为 `private`，没有 npm 发布。插件的 peer 声明、共享依赖 external 与浏览器 import map 分别落实；直接消费 Astryx 公开入口，无需等待 Pakka 逐个包装组件。

## 从这里开始

- [工作入口](docs/OVERVIEW.md)：当前状态、实际结果与下一步。
- [产品与架构边界](docs/state/webui.md)：已经采用的职责、插件和模型访问要求。
- [开发约定](AGENTS.md)：代码组织、验证与协作规则。
- [接缝记录](docs/changes/independent-seams.md)：本轮范围、配对与证据边界。
- [初始化记录](docs/changes/repository-bootstrap.md)：仓库来源。

Pakka 后端维护在 [mapleluvr/pakka](https://github.com/mapleluvr/pakka)。本仓维护前端应用、浏览器 UI SDK 与 Pakka 接入层；后端执行、权限和持久化由 Pakka 提供。
