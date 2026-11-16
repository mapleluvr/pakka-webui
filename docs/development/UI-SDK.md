# UI SDK 与共享运行时

## 按职责找代码

| 位置                        | 责任                                                           |
| --------------------------- | -------------------------------------------------------------- |
| `src/sdk/contracts.ts`      | 通用贡献、资源引用、命令、实例与显式服务 bindings 的公共类型   |
| `src/sdk/index.ts`          | 插件声明与 runtime 需求检查；没有服务连接或应用启动副作用      |
| `src/sdk/react.tsx`         | 宿主与插件共用的 `UiContextProvider` / `useUiContext`          |
| `src/host/lifetime.ts`      | 单个 UI 实例的 signal、清理和过期调用拒绝                      |
| `src/host/facet.ts`         | 同一 WebUI publication 的实例集合、替换清理与失败保留          |
| `scripts/build-runtime.mjs` | 从上游公开 exports 构建一张共享浏览器模块图及固定资产 manifest |

这些是已经存在的入口。应用壳层、完整插件 registry、Pakka 接入层和功能页面由后续真实消费者形成，不要求先建空目录或给每层增加转导出。

## 一个纯 UI 插件

```tsx
import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { defineUiPlugin, type UiViewProps } from "@pakka/webui-sdk";
import { useUiContext } from "@pakka/webui-sdk/react";

function Counter(_props: UiViewProps) {
  const ui = useUiContext();
  const [count, setCount] = useState(0);
  return (
    <Button
      label={`Count ${count}`}
      onClick={() => {
        setCount((value) => value + 1);
        ui.notice({ tone: "info", message: "计数已更新" });
      }}
    />
  );
}

export const plugin = defineUiPlugin({
  api: 1,
  runtime: "react19-astryx0.7.15",
  id: "counter",
  version: "1.0.0",
  title: "Counter",
  views: [{ id: "main", title: "Counter", placement: "page", render: Counter }],
});
```

宿主在自己的 React 根下提供共享主题和 `UiContextProvider`，再以 `{ ui, bindings: undefined }` 挂载这个纯 UI view。插件不调用 `createRoot`，不重复加载 reset，也不自行复制 SDK context。`useUiContext()` 读取同一实例对象；没有 provider 时明确拒绝。

有业务服务时使用 `UiPlugin<MyBindings>` 和 `UiViewProps<MyBindings>`，由装配方显式传入 client / 受权操作。UI SDK 不导入 Pakka 协议、服务客户端、Node 产品包或执行 runtime。Pakka 服务类型和 decoder 的单一源在 Pakka 仓库；它们不是另一份 UI context。

## 公共对象与操作

| 对象                    | 含义                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `UiPlugin`              | 身份、版本、明确的 SDK/runtime 需求、views 与可选 commands                           |
| `UiView`                | 普通 React 内容及 page/panel/sheet/settings 的默认放置；可声明所属资源类型与导航贡献 |
| `UiCommand`             | `plugin + command` 命名空间中的操作，接收同一 ui/bindings 和参数文字；不是模型消息   |
| `ResourceReference`     | `source/type/id` 与可选 version；由来源解释，不携带服务 authority                    |
| `UiContext`             | 一个 open-instance 的界面能力，不是全局 app 或 Backend capability                    |
| `UiViewProps<Bindings>` | 实例 ui、装配方提供的 bindings 与可选界面 input                                      |

`UiContext` 提供 `notice`、`open`、`navigate`、`dispatch`、`close` 和 `onDispose`。资源解析结果区分 ready、unloaded、unavailable、forbidden、identity-mismatch、unsupported；宿主不从 opaque id 猜测数据库路径或 Pakka URL。Pakka 接入层将自己的 typed Session/Conversation 引用交给公开服务，再适配到 UI 来源。

当前 SDK 声明了命名空间命令；应用的键盘、slash 解析和模型悬浮窗尚未实现。它们共享业务操作，但不因此成为 SDK 内置的模型命令。

## 实例与服务的生命周期

`createUiInstance(identity, ports)` 是宿主内部实现，不是新的 SDK public export。装配方提供 UI ports；异步 port 在发布结果前检查 owner 与 signal。实例关闭时先 abort signal，再逆序执行同步清理；重复 dispose 不重复清理。旧 context 拒绝新调用，也拒绝在异步等待结束后向已关闭实例发布结果。

`onDispose` 用于订阅、监听、计时器和其他实例资源。正常 React effect 卸载可注销其清理注册；已经 dispose 的实例立即执行新注册的清理。错误被汇总报告，不跳过余下清理。

`createUiFacet({ pluginId, generation }, ports)` 是宿主内部的 publication 集合，不新增 SDK public export。create 为该 generation 建立实例；禁用/替换时 dispose 先封闭接纳，再逐个清理全部实例。清理失败仍执行其余清理并保留错误，重复调用不重做清理或改报成功。单个实例成功关闭后可重开同名实例，但旧 wrapper 的清理不能移除新实例，也不能继承新实例的错误。

Pakka 接入层核对服务提供的 WebUI publication 后驱动这项清理；Backend、Agent、Client 的独立变更不关闭它。宿主集合本身不解析服务 URL、不轮询后端，也不管理持久任务。晚到异步结果仍须核对旧 signal 与 owner，不能向替代实例发布。

这些行为只属于 UI。业务调用、持久回执和 Backend/Agent 的停启由服务绑定处理；界面关闭不取消已接纳工作。`clickAction` 或 UI loading 结束也不证明持久写入完成。丢响应后使用所属服务的原请求查询，不能换 requestId 重提。

## 依赖、external 和浏览器解析

当前共享组合由锁文件固定：React/ReactDOM 19.3.1、Astryx Core 与 Neutral 0.7.15、StyleX runtime 0.19.2。SDK 的接口版本是 `api: 1`，runtime id 为 `react19-astryx0.7.15`；它们不是服务 API 或文件 hash。

当前 runtime 构建使用 production React。插件的 JSX 构建应使用 production `react/jsx-runtime`；不能把 development JSX emission 与这份生产 runtime 混用。上游在 production 下的 `react/jsx-dev-runtime` 不提供可调用的 jsxDEV，独立开发服务器须在阶段 2 提供相应开发组合，而不是把它 alias 到另一个 React。

三件事分别成立：

1. 插件开发依赖/peer 和类型对应宿主公布的组合；SDK 的 React peer 不代替插件对其他上游包的声明。
2. 插件构建 external 宿主 manifest 中共享的 specifiers，包括 React/JSX、SDK、Astryx 与公开子路径。
3. 浏览器 import map 将这些 specifiers 指向宿主 manifest 声明的同一模块图。

例如构建插件时可将已核对 manifest 的 `Object.keys(manifest.imports)` 交给 esbuild 的 `external`；这只是构建接缝，还需要宿主真正安装 import map。共享图不是按组件逐一重新 bundle；跨公开入口的内部依赖通过共同 chunk 保持单份对象。

上游公开组件、parts、hooks、props 和类型直接可用。只消费声明的 exports，不深导未公开实现。样式与数据入口按各自资产/类型用途处理，不能把类型文件映射成浏览器模块。

`assertUiRuntime()` 应先检查可信贡献描述，再 import 单独交付的 UI 模块；import 后核对实际插件声明。它只核对兼容需求，不认证任意代码的能力，也不建立安全沙箱。

## 静态资产与主题

共享 runtime 构建生成 `asset-manifest.json`：包括服务需求、runtime/SDK 组合、imports、styles、workers 和每个文件的 URL/内容 hash。URL 带共同的内容身份，内部 chunk 使用相对引用。此构建的 `entry` 是 `null`，`workers` 是空数组；完整应用还需把 HTML/入口、页面和实际 worker 纳入自己的 manifest。

当前开发制品要求的服务组合为 workbench 2、extensions 3、services 3；它与 UI SDK/renderer 兼容范围分别检查。具体服务协议由 Pakka 的公开 protocol/client 包维护。

默认 CSS 顺序为 Core reset、Core 组件样式、Neutral theme。使用上游 `@astryxdesign/theme-neutral/built`，其静态 CSS 不触发 Theme 的 inline 注入；字体采用上游支持的系统 fallback。可选远程 fonts.css 不自动交付或加载，字体资源按实际用途纳入获准的同源资产。

静态自定义主题沿上游 `astryx theme build` 生成 CSS 与 built object。当前严格 `style-src 'self'` 会拦截未构建 Theme 的 inline style；运行时主题编辑需要另行形成 CSP 接缝。组件、自定义 React 内容、普通 HTML/CSS/SVG 和有实际用途的局部静态主题不因此受限，也不通过手工写 `__built` 或放宽 `unsafe-inline` 绕过校验。

后端消费的是固定字节与 manifest digest，而不是组件树。完整应用制品须声明 HTML entry；宿主对兼容需求、文件、路径及内容身份的核对失败时，不启动替代前端。开发制品渠道、实际结果与剩余范围见[接缝记录](../changes/independent-seams.md)。
