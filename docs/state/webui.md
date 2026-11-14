# WebUI 产品与架构边界

本文维护本仓采用的预期；当前实现进度见[工作入口](../OVERVIEW.md)，采用依据见[初始化记录](../changes/repository-bootstrap.md)。

## 产品与交付

Pakka WebUI 是采用 React 19、TypeScript/TSX 与 Astryx 的独立浏览器应用。前端通过版本化的公开协议与客户端连接受支持的 Pakka，能够独立安装、开发和构建。默认 `pakka` 产品提供选定版本和内容身份的前端制品。

服务面使用 `/pakka-webui` 命名空间，由 Pakka 接入层消费。首版独立开发通过同源代理联调，维持 Host/Origin、Cookie/CSRF 和明确的代理边界。服务 API、UI SDK/renderer 与资产身份各自核对兼容性。

## 职责与依赖

源码按实际实现需要形成以下职责目录，目录不等于独立 package：

| 职责                      | 拥有的内容                                                     |
| ------------------------- | -------------------------------------------------------------- |
| `src/app/`                | 根装配、壳层、路由、主题和连接依赖注入                         |
| `src/host/`               | 通用贡献、容器、资源视图导航、模块/版本与界面实例生命周期      |
| `src/integrations/pakka/` | 认证与连接、公开客户端、服务绑定、资源/模型 DTO 和资产来源适配 |
| `src/features/`           | Conversation、Session、设置和 Pakka 人类身份等功能界面         |
| `src/ui/`                 | 共享主题、语义 tokens 与有真实复用需要的 UI 组合               |
| `src/sdk/`                | 纯浏览器公共 UI 声明和消费入口                                 |

host 消费显式注入的贡献、解析器和能力；Pakka URL 与服务实现知识属于接入层。功能和业务插件管理自身草稿、数据适配及操作结果；执行、授权、持久化和业务账本由后端所有者维护。

## 插件与共享 UI

- 纯 UI、Client、Backend、Agent facets 按实际需要组合；默认和第三方插件使用相同公开能力。RSI、MAS、Memo 的页面、控制与管线由各自插件维护。
- 纯 UI 插件无需工作 Session；打开或关闭不产生模型请求。只消费 Agent/headless 入口时，导入图保持与浏览器 runtime 和 UI 启动分离。
- 插件可以提供导航、page、sheet/panel、设置与完整自定义 React 内容，并直接使用 Astryx 的公开组件、parts、hooks、props 和类型。
- 宿主与插件共享 React/ReactDOM/JSX、Astryx 及所需 StyleX runtime、主题和浮层环境。普通 HTML、局部 CSS/SVG、自定义组件与有实际用途的局部主题可组合。
- 贡献声明、服务调用、命名空间命令和有限观察走公开接口。服务绑定承担 actor/resource 授权；界面容器承担打开、关闭、焦点、错误和清理。
- 实例绑定插件身份、版本/generation、资源与 open-instance。替换时清理旧订阅、监听、计时器与可中止读取；UI、Backend、Agent 的启停分别表达，已接纳工作由所属服务接续。

## 资源与持久效果

插件持有稳定资源引用并注册自己的资源视图。Pakka 接入层将 Session/Conversation 引用交给受控来源解析，进入另一已知且获准访问 Session 的原 Conversation，读取实际历史。

持久身份与当前运行绑定分别核对。已加载、未加载、不可得、无权和身份不符有明确状态；原 owner 保持 storage/writer 所有权，浏览只读取原对象。有限分页、搜索及按引用读取保留服务的完整内容契约。

持久操作通过原请求和所属服务回执确认。界面关闭、等待取消和 UI callback 结束只改变各自的界面/等待状态；unknown 效果保持待核对，不能换请求身份重放。浏览器请求、宿主 operation 和内层服务 receipt 的身份按公开契约对应。

## 模型访问与配置

| 对象                     | 作用域与操作                                                    |
| ------------------------ | --------------------------------------------------------------- |
| 当前模型 / Thinking      | 当前 Conversation，按其配置权限提交                             |
| 人类默认选择             | 当前 Person，后端跨设备保存，用作其新建 Conversation 的缺省选择 |
| 提供商 / 端点 / 模型定义 | Pakka 实例，由具备配置权限者管理                                |

Conversation 输入框中的 `/model` 打开悬浮搜索选择器；`/model openai/gpt-4o` 这类完整 provider/model 身份直接精确选择，失败时明确报告。人类命令与模型消息分开，普通选择只更新当前 Conversation。个人默认由显式动作保存，已有 Conversation 与工作流的显式选择保持各自配置。

`/thinking` 与点击/触控共用模型实际支持的级别和设置操作。设置页以常用可视化控件编辑提供商和模型参数，高级编辑保留适用的原生继承/覆盖语义。配置写入具备授权、校验、冲突与回执；秘密由可信宿主维护，普通表单接收脱敏状态。

模型与 Provider 契约属于 pi-ai；交互和公开配置能力参考 pi-coding-agent；持久 Conversation 配置与执行由 Pakka 接到 pi-durable。WebUI 的执行路径沿 Pakka 的持久服务接线。
