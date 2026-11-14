# 独立 UI 接缝验证

## 候选与方法

本仓基于初始化提交 `0ee6bdc` 的 `pakka/independent-webui-seams` 工作分支；后端同名分支基于 `dev@cc1cdd8` 加阶段 0 文档 `29cb207`。Node 24.18.0 / npm 11.16.0 / TypeScript 7.0.2；React/ReactDOM 19.3.1、Astryx Core/Neutral 0.7.15、StyleX 0.19.2。

主会话运行独立源码/类型/构建、固定 tgz 安装、真实 Node 产品静态资产及 Ego 浏览器消费。使用隔离 HOME/Pi/TEMP、合成身份与本地 provider；没有用户凭据访问、付费请求或 subagent review。完整服务侧结果见 [Pakka 阶段 1](https://github.com/mapleluvr/pakka/blob/pakka/independent-webui-seams/docs/verification/INDEPENDENT-WEBUI-PHASE-1.md)。

## 已取得的证据

- 从无 node_modules 的独立源码目录运行 `npm ci --ignore-scripts`、`npm run check`、`npm run build`。没有借用 sibling 源码/安装、根 overrides 或后端编译；共享 runtime manifest 字节与本仓一致。
- 仓库外 GUI-only 消费者安装实际 `pakka-webui-sdk-0.1.0.tgz`，以 `skipLibCheck:false` 编译并构建纯插件；没有安装 Pakka 协议/client 或后端。插件 bare imports 按实际 manifest external，没有复制第二份共享依赖。
- 安装版 headless client 只消费后端仓库的 protocol/client，无 renderer、Agent、Server、Coding Agent；经真实 HTTP 访问两个已加载 Session 并正确 reconnect。它不是完整 headless 业务插件的验收。
- 真实 `startPocket({frontend})` 提供核对后的固定字节。浏览器中共享 React、SDK/Astryx context；实际点击使按钮变为 Count 1，portal 使用宿主 neutral 主题。
- Dialog 进入原生 modal、焦点在其中；Escape 关闭后焦点回到触发按钮。单个实例关闭后 portal/Dialog 消失、清理一次、signal aborted，旧 UI context 调用被拒绝。
- 初次未构建 Theme 的 inline style 被现有 CSP 拦截。改用上游 Neutral built + 静态 CSS 后，没有观察到 CSP 违规或外部资源请求；没有 unsafe-inline、伪造 built 标记或安装依赖修改。Ego 空间消失后获批准建立新空间，未升级 Ego Lite。
- 文档 TSX 示例在隔离安装里实际编译；修正 Astryx Button 必填 label 后通过。类型/构建及主动诊断分别记录，没有用组件包装或 ts-ignore 掩盖问题。

开发 SDK 归档 SHA-256：`4a5225161223c5c2bbecee719988b3b03882210becc724f8dba07b9e0cedb03c`。

共享 runtime manifest SHA-256：`17e8762dfcbe48439a53c190d05b3f710e9e33ecdb7555e706986bb18c8feb11`。它有 210 个模块映射、634 个文件、3 份静态 CSS；`entry:null`、`workers:[]`。浏览器候选另外附加 HTML/宿主，不是完整应用发行。

上述浏览器/模型接缝推理请求为 0。零请求只支持无额外推理判断；按钮、modal、焦点和卸载结果分别取证。前置 runtime 元数据拒绝验证了检查原语，不证明真实插件发现/registry 已形成。

## 后续差距

完整应用入口、开发服务器、Pakka 接入层、registry/资源视图、真实业务插件、模型/Thinking 双入口和参数触控页面由后续任务承接。后端阶段 1 的 3.2 仍缺未加载原 Session 的公开只读历史及独立 facet 控制；不自动 reopen writer 或私读 SQLite。

Provider `/login`、完整 worker/缓存更新、默认切换、npm 发布和合并均未执行。此记录不把 SDK 可安装或局部浏览器通过算作完整阶段/产品验收。

## 本地保全

完整本地证据包：`pakka-webui-phase-1-evidence.zip`，1881349 字节，SHA-256 `c2d710edde0bd38de65811163e009f96d23d64b0b9fb0719f5dec2fa75e35fa3`。只提交候选、关键结果、限制和整体包 hash；原始截图、日志、依赖树、清单与包本体不提交或上传 GitHub。后端及本仓使用同一包身份，具体命令/结果在本地保全。
