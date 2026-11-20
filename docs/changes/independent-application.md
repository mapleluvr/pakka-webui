# 独立应用与真实业务切片

用户要求阶段 1 验收后进入阶段 2，并明确新 layout 与 elements 基于 React 19 / Astryx 重新设计。应用壳层、通用 registry、同源开发和功能页面在独立仓库形成；旧页面用于核对功能与服务边界。阶段 2 的布局是可使用的最小切片，完整页面迁移仍在后续阶段。

按用户指定的 RSI 边界，工单 React/Astryx 页面由 `@pakka/rsi` 提供；本仓仅增加通用模块/样式装载与显式 Backend 服务绑定。读取、编辑和两层回执使用原领域协议。丢响应后先找外层 operation，再用 operation.id 查工单回执，不重提写入。WebUI publication 替换清理 UI，不取消已接纳工作。

真实模型验证使用隔离的确定性 HTTP 端点和后端注入的合成凭据。设置页新连接、原生配置重载、Conversation 选择和实际请求串通；`/model`、`/thinking` 与点击/触控入口共享操作。配置来源、Person 默认和 Conversation 配置分别保持已采用作用域。没有认证来源的模型在选择入口明确拒绝；Provider `/login` 不提前实现。

浏览器实测要求补齐 Astryx Layer 的固定样式许可。资产格式显式升至 schema 2，固定依赖版本与精确样式 hash 进入 manifest；开发代理和生产 Node 入口采用同一许可，未列入许可的 inline style 仍被阻止。共享主题沿上游预构建路径，不改已安装的 Astryx。

收口实测发现并修正两处恢复问题：输入 pending 不能以随重开变化的 HTTP serverId 为持久定位；多个设置实例发送前须同步保留原请求，且只允许对应 requestId 的结果清除记录。同一原 Session 重开与控制响应次序的真实并发实验已复验。输入公共回执查询仍留在阶段 4，这项保护不等于该能力已经完成。

当前行为由 [state](../state/webui.md)和[应用开发](../development/APPLICATION.md)说明；检查结果、真实失败和制品身份见[阶段 2 核对](../verification/PHASE-2.md)。完整范围由 Pakka 的 [phase-2](https://github.com/mapleluvr/pakka/blob/pakka/independent-webui-seams/openspec/changes/plan-independent-webui/phase-2.md)与 [tasks](https://github.com/mapleluvr/pakka/blob/pakka/independent-webui-seams/openspec/changes/plan-independent-webui/tasks.md)维护。本轮提交工作分支，不切换默认产品、不合并或发布。
