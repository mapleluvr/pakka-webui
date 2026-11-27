# 应用开发与固定制品

## 安装和构建

使用 Node 24+、npm 11，执行 `npm ci --ignore-scripts`、`npm run check`、`npm run build`。`check` 先生成本仓 SDK 的公开声明，再检查应用。依赖通过本仓 [vendor](../../vendor/README.md) 的固定 protocol/client 归档安装，不需要 Pakka 后端源码、根 overrides 或后端执行包。

`dist/sdk` 是纯浏览器 SDK；`dist/runtime` 是共享模块与静态主题，entry 为 null；`dist/app` 包含 HTML entry、应用和共享模块。后两者各有 `asset-manifest.json`，由构建时的公开 decoder 校验。生成目录不提交 Git。

## 开发服务器

```sh
npm run dev
npm run dev -- --host 127.0.0.1 --port 5173 --backend http://127.0.0.1:5180
```

参数只接受回环地址与本地 HTTP 后端。首条命令无需后端，可使用纯 UI 示例的独立计数和 Dialog。第二条连接已经启动的 Pakka；该后端的 `publicOrigin` 须设为 `http://127.0.0.1:5173`，与浏览器地址精确对应。浏览器始终请求前端 origin 下的 `/pakka-webui/*`，开发服务器保留 Host/Origin、Cookie 和 CSRF 约束，转发有限服务路由与流式响应。不要把后端地址直接配成浏览器客户端的跨源 endpoint。

默认监视 `src`，重建成功后提示手动刷新浏览器；`--no-watch` 关闭监视。修改构建脚本或锁文件后重新启动开发命令。当前 JSX emission 和共享 React 都使用 production 模式，未启用 HMR。整页刷新会释放 UI 实例；待核对请求保留在当前标签页的 sessionStorage 中。

Pakka 人类凭据在登录弹窗交换为同源会话。凭据不要写入源码、构建参数或 URL。Provider 认证属于独立 roadmap；模型参数页不收集 API key/OAuth。切换或失效的人类身份会清理其连接、实例和旧正文。

## 代码入口与实际切片

| 位置                                                | 责任                                                    |
| --------------------------------------------------- | ------------------------------------------------------- |
| `src/app/main.tsx`、`Application.tsx`               | React 根、预构建主题、壳层与连接装配                    |
| `src/host/registry.ts`、`InstanceView.tsx`          | 通用贡献、实例、命令、资源视图、错误和清理              |
| `src/host/links.ts`、`src/app/useViewNavigation.ts` | 稳定 hash 引用与浏览器前进/返回                         |
| `src/integrations/pakka/`                           | 公开客户端、身份、资源解析、插件资产与 Backend bindings |
| `src/plugins/playground.tsx`                        | 不需要服务或 Session 的纯 UI 插件                       |
| `src/features/conversations/`                       | 授权资源列表、原历史/原文、当前模型/Thinking 与输入     |
| `src/features/settings/`                            | 模型、预算、人员、facet 与通知设置及原请求核对          |

Conversation 可按完整 Session/Conversation 引用打开；未加载来源标记为保存历史。正文按公开范围读取，分叉来源保留原引用；状态或权限不成立时显示对应结果。实时观察使用有界 SSE 预览和快照恢复，队列、撤回与停止沿原服务接续；关闭观察只结束页面读取，模型工作由原服务管理。

输入 `/model` 或点击模型按钮打开搜索选择器；`/model provider/model` 精确选择。`/thinking` 与点击/触控入口使用相同的 Conversation 配置操作。无认证来源的模型明确拒绝选择；列表中的 configured 不代表在线可用或能力已验证。

实例连接参数按原生 `models.json` 的字段修改，保存前校验；受保护值和未编辑字段由服务保全。个人默认独立保存，只参与此 Person 后续缺省 Conversation 的创建。结果未知时按原请求查询，不重复提交。多个设置实例共享同一作用域的待核对保护：发送前同步保留身份，只有对应 requestId 的结果能清除记录。

普通 Conversation 输入的未知结果会保留稳定来源、Person、Conversation 和 requestId，并阻止再次发送；后端重开不丢失这项保护。恢复经 services 5 的 `input.lookup` 核对完整原 target/text/mode/requestId，空值或 unknown 保持待核对。sessionStorage 限于当前标签页生命周期，不是跨设备恢复账本。重新装载时，输入框和 mode 从这份原记录初始化；详情显示冻结的原消息与请求号。确认旧请求时只清除对应记录，后来另写的草稿保持原样。

工作台在 PC 使用侧栏，窄屏使用导航抽屉；Conversation 历史独立滚动，下部输入始终可达。消息 header 提供复制、原文与原 Entry 分叉。固定阅读导航承载原文返回和最新消息入口，控制位置按内容身份保存。明确发送接续新回复，手动阅读暂停跟随；同一范围的历史刷新和配置不会重新触发此前发送的跟随意图。实际结果与未覆盖条件见[工作台界面](../verification/WORKBENCH-INTERFACE.md)。

## 业务插件

Pakka 接入层发现已授权的 app-scope 与 Conversation 资源贡献，按其 WebUI generation 加载固定 JS/CSS，再向 registry 发布普通 React view。它显式注入 `@pakka/client/extensions` 的 `ExtensionServiceBinding`；新调用取当前 Backend publication，原请求核对独立于 Backend 的启用状态。资源地址带完整 Session/Conversation，直接刷新时重新解析与授权，关闭最后实例时释放该恢复装载作用域。

RSI 工单组件、草稿和领域 decoder 位于 Pakka 的 `@pakka/rsi` 包。前端宿主只拥有通用装载与绑定。RSI 写入的恢复顺序是浏览器 requestId → `operationByRequest` → 外层 operation → operation.id 对应的工单回执；查询不重放写入。WebUI publication 替换会清理旧实例、样式和 Dialog，已接纳的服务工作仍由后端接续。

共享 React、SDK、Astryx 的依赖及插件 external 规则见 [UI SDK](UI-SDK.md)。可信模块加载不构成浏览器安全沙箱。

## 通知与 worker

通知设置区分 Person 偏好、所选获准 Conversation 的设备登记和本浏览器能力。只读成员也可修改自己的偏好。设备停用解除全部已登记资源；“移除本浏览器推送订阅”是独立本地动作。未知修改只查询原请求，当前清单不证明旧操作已完成。

“检查系统通知显示”从真实点击请求浏览器权限，由用户处理提示。成功信息只说明浏览器接纳了显示调用，实际显示要直接查看系统通知区；它不证明远端推送已到达。“登记此 Conversation”使用原生 PushManager，还需要可用的推送网络和服务端许可该浏览器实际端点的精确 HTTPS origin。部署者用 `notifications.endpointOrigins` 指定完整许可列表；示例验收中的 Windows Ego 端点为 `https://jmt17.google.com`，该 origin 仅在隔离验收配置中显式采用。

固定应用文件 `notification-worker.js` 通过 `/pakka-webui/service-worker.js` 提供，生产和开发 header 均声明 `Service-Worker-Allowed: /`。worker 收到事件/设备身份后重新受权读取内容；点击再次授权并进入原 Conversation。暂停或关闭设置结束读取，后台通知仍由服务管理。实际系统显示与点击可独立核对，不从服务发送回执推断；本轮证据和待复验条件见[工作入口](../OVERVIEW.md)。

## 固定制品与 CSP

使用 `npm run pack:app -- <新目录>` 交付完整应用的固定静态 tgz；归档组成、摘要来源及更新流程见[应用交付](DELIVERY.md)。发布候选使用解包后的完整应用目录和其 manifest 的 SHA-256，由 Pakka 公开 Node 装配参数 `frontend: { directory, manifestSha256 }` 指定。Node 启动前校验 schema、服务兼容和每个文件的 hash。默认 Pakka 包在构建时已选定并装入固定前端；这个参数用于可信宿主显式选择另一个兼容制品。部署与 registry 发布按各自交付流程处理。

当前支持组合为资产 schema 2、services 5、extensions 3、workbench 3，UI SDK api 1 / `react19-astryx0.7.15`；阶段 2/3 已验收的固定应用仍声明 services 3。`scripts/runtime-style-hashes.json` 为固定 Astryx 版本的必要运行时样式声明精确摘要；构建将其纳入 manifest，服务按摘要生成 CSP。依赖升级时须重新核对样式字节及正反检查。预构建主题继续使用静态 CSS，未获许可的 inline style 被拒绝。
