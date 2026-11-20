# 固定应用交付与跨仓配对

阶段 2 ed05a2f / 977b138 收口后，用户批准继续阶段 3。独立前端工程、SDK、文档和许可已形成，本轮补齐可消费的标准应用归档、Pakka 侧固定配对与两个候选的实测，不重新搬运混合 Node 产品包。

应用沿用 npm pack 的归档格式。新增命令先构建完整应用，核对 manifest 声明文件，再生成只含静态资产/许可与必要 npm 元数据的私有归档。输出包含归档和 manifest 两级摘要；SDK 安装图不带入完整应用。边界实测发现元数据同名资产可能被覆盖，故在打包前拒绝保留名；损坏资产和已有交付目录也保持拒绝。

两个干净前端 checkout 使用相同公开依赖。A 为阶段 2 应用；B 只更新普通 GUI-only 插件的版本和计数行为。安装版 Pakka 以同一包和锁文件字节按 A → B → A 启动，显式重开同一原 Session。真实浏览器确认代码行为变化、兼容的原资源读取和回退；错误摘要、不兼容版本/格式、篡改资产及 runtime-only 产物在打开 Session 前失败。

预期在 [state](../state/webui.md)，操作契约在[交付说明](../development/DELIVERY.md)，固定结果、探针修正及限制见[阶段 3 验证](../verification/PHASE-3.md)。Pakka 侧维护 [phase-3](https://github.com/mapleluvr/pakka/blob/pakka/independent-webui-seams/openspec/changes/plan-independent-webui/phase-3.md)与 [tasks](https://github.com/mapleluvr/pakka/blob/pakka/independent-webui-seams/openspec/changes/plan-independent-webui/tasks.md)。B 是受控验证变体，未发布成另一版本；默认切换、阶段 4–5 功能、Provider /login、合并与发包在当时保留各自边界。

## 默认交付与旧实现退出

用户随后授权执行到阶段 5 的端到端交付。Pakka 构建选定独立应用归档，验证全部声明资产并随 Node 包交付；默认启动直接消费固定字节，安装消费者无需前端源码。可信装配继续支持兼容归档替换；实际使用当前归档与阶段 4 services 4 归档完成 A → B → A，原 Session 和丢响应请求保持可恢复。

对旧页面检查的逐项核对暴露 slash 字面输入被拦、Conversation 命令发现错位、Backend action 缺入口和 Session 重开锁未释放。修正依据来自真实服务和页面，当前采用的作用域、read/write/model 区分与原请求规则进入 [state](../state/webui.md)。独特安全/持久/执行风险留在原生/HTTP 检查，旧 DOM 和重复资产构建随其对象退出。

[阶段 5](../verification/PHASE-5.md)记录最终安装、SDK/headless、PC/手机、兼容回退、部署与限制。主会话按本轮授权自行核对；Provider 登录与真实录音状态保持明确，工作分支交付、合并和公共发行分别处理。
