# 阶段 2：独立应用验收

2026-11-16，在 `pakka/independent-webui-seams` 完成阶段 2 最小真实前端。前端基线 `48adf839458489f91a5cf01d6744b647c4b337cd`，Pakka 基线 `dfb3837510052a4f725cbc3fa30026093ebea4ad`；本记录所在提交及配对提交保存候选源码，完整行为、原始失败与回归分类见 Pakka 的[阶段 2 核对](https://github.com/mapleluvr/pakka/blob/pakka/independent-webui-seams/docs/verification/INDEPENDENT-WEBUI-PHASE-2.md)。

## 实际通过的路径

- 空目录按 README 执行安装、类型检查、应用构建，不依赖后端源码或执行包。`check` 自行生成公开 SDK 声明，避免旧 dist 掩盖缺口。
- GUI-only 实例、计数、Dialog/portal、键盘焦点、关闭与重开、浏览器前进/返回通过；此类操作及固定生产入口该轮检查没有模型请求。
- 两个实际 Session 的同号 Conversation 可按稳定引用读取原历史；保存状态单独显示。分叉原文 14,132 字节与原内容 hash 一致，原 SQLite/WAL 未变，浏览没有重开 writer。撤权后旧正文及相关界面清除。
- `/model` 搜索/分页、完整 provider/model 直接选择，`/thinking` 与点击/触控入口通过。新连接由设置页保存，经公开 ModelRuntime 重载与 Conversation 配置，实际发出两次隔离本地模型 HTTP 请求，验证模型级端点、Thinking、输出上限与 header。
- 实例连接的受保护值、注释和未编辑字段保留；Person 默认只影响本人后续缺省 Conversation。写入丢响应后刷新仍持有原请求，通过一次 lookup 找回回执，没有重提。
- RSI 包提供实际 React/Astryx 工单读取/编辑；本仓只有通用装载和 bindings。断响应及外层 unknown/内层已保存两种情况均按外层 operation → 工单回执核对；publication 替换清理实例/Dialog/样式，新实例可核对先前的保存。
- 390px 窄屏模型页、登录失败弹窗和工单编辑器按钮可操作，无横向溢出，关闭焦点正确。截图发现的尺寸/裁切问题已经复验修正。
- 安装版 Pakka 通过固定 manifest 直接提供应用；Astryx Layer 精确 hash 许可生效，未知 inline style 仍被拦截，正常页面无脚本错误或 CSP 违规。

使用 Node 24.18.0、npm 11、TypeScript 7.0.2、React/ReactDOM 19.3.1、Astryx 0.7.15。使用隔离数据、回环 origin、真实 Cookie/CSRF 与本地确定性 provider；没有使用用户模型凭据或付费推理。浏览器任务空间已结束，服务已正常停止。

## 收口修正和检查

原 Session 重开复现了 serverId 改变导致输入 pending 丢失保护，现已按稳定来源/Person/Conversation 定位；重开后保留原 requestId，Enter 不产生第二次提交。设置多实例的真实并发复现了冲突收尾误清另一条记录，现改为发送前同步占用且仅按相同 requestId 清理；同序复验只有一次保存和一次核对。损坏记录保持阻止写入。

两仓最终类型检查与构建通过。前端 25 文件主动 LSP 为 0 诊断；后端 14 文件用全新 LSP 完整核对为 0 错误。最终 RSI headless/UI 归档的隔离严格类型检查、导入/浏览器打包均通过，无后端执行依赖。

Pakka 扩大回归选择 336 文件、999 项：989 通过、7 失败、3 跳过。失败均为两个旧 maintenance 文件的 Windows 长路径 ACL 核验；这两个文件在短隔离目录复跑 13/13 通过。原始失败与环境限制分别保留，不将首轮改写为全绿。前端审计为 0；Node 产品既有 6 项依赖告警和 43 条上游声明限制没有被本轮修复，也没有执行自动依赖升级。

收尾格式整理与已安装受验产物逐文件对照：131 文件中 121 个字节一致，其余 10 个仅格式差异，包括声明和 RSI CSS；RSI public JS 未变。最终归档重新核对，不沿用旧 hash。完整应用的字节身份没有变化。

## 制品身份与证据

| 对象                            | SHA-256                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| 应用 manifest，637 文件         | `418033338b02ad0f6dec8ab24dcbbf3278b9d71b8f8454197418f9669d396e15` |
| 共享 runtime manifest，634 文件 | `800a54b6a1dca25b2288c79a77b8192885c158eba2f8bd894f9a5811c46c9137` |
| protocol 固定归档               | `c57ec7c43f2d8156648e285bd79acadb52563c5806ae4a163eea49dc094e3033` |
| client 固定归档                 | `96236109a3fb92a39d609c6a1caf6c7b528e18524fb2194a73cc514a92b24994` |

最后一次空目录安装/构建的两份 manifest 与实际生产浏览器验收候选相同。服务组合为 services 3 / extensions 3 / workbench 2，资产 schema 2，UI SDK api 1 / `react19-astryx0.7.15`。

本地证据包：`pakka-webui-phase-2-evidence.zip`，18,401,331 字节，整体 SHA-256 为 `69fed4b9144ebe6f8d3b12e3367e341ab94e3ecd194f07860a260a37d8e85b67`。保全目录为工作区 `.backups/webui-phase-2-469f2ebb-2b96-4318-a438-bda676392421/`，762 个归档成员已逐项读取并核对 hash。原始日志、截图、探针与证据包不提交 Git 或上传 GitHub；隔离会话/凭据另行保存，云端由用户处理。

## 保留范围

阶段 2 验收不等于完整应用迁移或默认产品切换。普通输入只有原请求保留和阻止重发，公共回执查询仍待阶段 4；sessionStorage 限于当前标签页生命周期。当前插件装载切片为 app scope，完整事件观察、其他资源范围/服务命令、预算/人员与其余功能按后续阶段推进。Provider `/login` 继续延期。阶段 3–5、合并和发布分别保留未完成状态。
