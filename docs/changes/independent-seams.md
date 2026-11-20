# 独立消费接缝

## 要求与范围

用户于 2026-11-14 授权阶段 1，并再次明确：旧 monorepo WebUI 不必作为出发点，必要时重写，即使构建成本更高。

本仓从初始化提交 0ee6bdc 建立工作分支 `pakka/independent-webui-seams`，形成新的纯浏览器 `@pakka/webui-sdk` 与共享 runtime/资产构建基础。Pakka 侧配对工作位于同名工作分支；阶段 0 的固定依据为 [29cb207 的消费盘点](https://github.com/mapleluvr/pakka/blob/29cb207ec7b305e2e0a559f3de30a7a21b490228/openspec/changes/plan-independent-webui/inventory.md)。

采用的目标由 [WebUI state](../state/webui.md)维护，完整阶段和场景由 Pakka 的 `openspec/changes/plan-independent-webui/` 维护；本轮补充设计在该 change 的 `phase-1.md`，阶段状态在 `tasks.md`。这里记录前端实际边界，不复制服务 wire 定义。

## 接口与归属

- 新 UI SDK 以通用贡献、实例、资源视图、命名空间命令和 React 内容为边界。UI context 不携带 Pakka HTTP 路径、Session 必填项或全局业务 store。
- 业务 bindings 显式注入；纯 UI 插件不需要服务，Pakka 插件通过其 checked client 接受身份/资源绑定，不把授权托付给 UI 生命周期。
- UI SDK 与旧 Node 产品包不共用包身份。新 SDK 不是旧 Preact `ui/components` 的兼容 facade；旧插件不迁移。
- React、JSX runtime、Astryx 公开入口和必要 StyleX runtime 的共享由宿主构建负责。peer 声明、external 和浏览器 import map 各自验证；不封装成能力更窄的组件语言。
- 服务 API、UI SDK/runtime 与固定资产身份分别声明。开发使用固定归档与锁文件，不采用 sibling 源码、根 overrides 或浮动 latest。

## 实施与验证记录

已运行独立源码/构建、固定 SDK 干净安装与真实浏览器共享 context/portal/CSP/focus/卸载检查，见[固定结果](../verification/INDEPENDENT-SEAMS.md)。这些开发接缝不代替完整应用/registry、新 SDK 业务插件、模型双入口与跨 Session 原历史验收。Pakka 已核对：当前 Durable SQLite 初始化不是只读打开；缺少符合所有权边界的来源时必须明确报告，不能通过私读库或自动 reopen 通过浏览场景。

本轮不切换默认发行、不实现完整页面、不增加 Provider /login、不发布 npm 包或合并。原始结果保存在本地忽略目录；交付时记录实际候选、检查范围、限制与证据包 hash。

## 只读历史服务配对

2026-11-15，Pakka 增补原生只读 SDK 和已知未加载来源的受权历史服务，并将未合并的 services API 从 1 调整为 2。本仓共享 runtime manifest 同步要求 services 2；SDK、renderer、workbench 和 extension 版本不变。这是固定服务组合的显式调整，不是前端读取数据库或迁移旧 UI。

本仓仅改变服务要求元数据并更新开发说明。类型/构建和固定文件身份检查通过，634 个共享文件及 210 个公开映射与原浏览器候选相同；安装版 Pakka 通过真实启动路径接受 API 2 制品、拒绝 API 1 制品。结果见[配对补充](../verification/INDEPENDENT-SEAMS.md#只读历史服务配对补充)。该次配对没有实现完整历史界面或独立 facet 控制。

## 独立 facet 控制配对

2026-11-16，按用户授权完成 WebUI publication 的实例集合与清理接缝，公开服务/extension 显式升级为 3，workbench 保持 2。Backend/Client 的控制不卸载 UI；一个 UI publication 的禁用/替换只清理其实例，保留其他 publication。重复清理保留原结果，旧实例不能删除同名新实例或发布晚到结果。

通过真实安装产品、共享 React/Astryx、Cookie/CSRF、原写入回执、Dialog/portal/focus 与四个实例的清理检查；独占回环 origin 隔离验证 Cookie。具体候选、实际结果和限制见[独立 facet 记录](../verification/FACET-CONTROL.md)。用户要求阶段 1 验收后进入阶段 2，完整应用入口/registry、RSI 与模型和历史切片由后续工作形成。
