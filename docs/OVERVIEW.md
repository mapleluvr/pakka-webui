# 工作入口

Pakka 的独立 WebUI 与通用 UI 插件宿主。当前采用的目标见 [WebUI state](state/webui.md)，仓库建立的范围与来源见[初始化记录](changes/repository-bootstrap.md)。

## 当前状态

本仓处于初始化状态，仅有说明与开发约定。Pakka 侧已完成[阶段 0 消费盘点](https://github.com/mapleluvr/pakka/blob/29cb207ec7b305e2e0a559f3de30a7a21b490228/openspec/changes/plan-independent-webui/inventory.md)；独立协议/client/SDK、React/Astryx 真实宿主与功能迁移仍待实施。

## 下一步

按[阶段任务](https://github.com/mapleluvr/pakka/blob/29cb207ec7b305e2e0a559f3de30a7a21b490228/openspec/changes/plan-independent-webui/tasks.md)接续阶段 1 的公开消费接缝：明确协议/client/UI SDK/Backend 出口与固定制品，验证仓库外安装，并处理资源身份/原历史读取、模型配置与资产装配。

随后才验证真实宿主、纯 UI 插件、RSI 读取/编辑、模型/Thinking 双入口与两个 Session 的原历史浏览。仓库创建本身不替代这些退出条件。
