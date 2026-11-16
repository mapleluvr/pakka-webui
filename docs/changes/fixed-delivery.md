# 固定应用交付与跨仓配对

阶段 2 ed05a2f / 977b138 收口后，用户批准继续阶段 3。独立前端工程、SDK、文档和许可已形成，本轮补齐可消费的标准应用归档、Pakka 侧固定配对与两个候选的实测，不重新搬运混合 Node 产品包。

应用沿用 npm pack 的归档格式。新增命令先构建完整应用，核对 manifest 声明文件，再生成只含静态资产/许可与必要 npm 元数据的私有归档。输出包含归档和 manifest 两级摘要；SDK 安装图不带入完整应用。边界实测发现元数据同名资产可能被覆盖，故在打包前拒绝保留名；损坏资产和已有交付目录也保持拒绝。

两个干净前端 checkout 使用相同公开依赖。A 为阶段 2 应用；B 只更新普通 GUI-only 插件的版本和计数行为。安装版 Pakka 以同一包和锁文件字节按 A → B → A 启动，显式重开同一原 Session。真实浏览器确认代码行为变化、兼容的原资源读取和回退；错误摘要、不兼容版本/格式、篡改资产及 runtime-only 产物在打开 Session 前失败。

预期在 [state](../state/webui.md)，操作契约在[交付说明](../development/DELIVERY.md)，固定结果、探针修正及限制见[阶段 3 验证](../verification/PHASE-3.md)。Pakka 侧维护 [phase-3](https://github.com/mapleluvr/pakka/blob/pakka/independent-webui-seams/openspec/changes/plan-independent-webui/phase-3.md)与 [tasks](https://github.com/mapleluvr/pakka/blob/pakka/independent-webui-seams/openspec/changes/plan-independent-webui/tasks.md)。B 是受控验证变体，未发布成另一版本；默认切换、阶段 4–5 功能、Provider /login、合并与发包保留各自边界。
