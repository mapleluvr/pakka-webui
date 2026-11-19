# 工作入口

Pakka 的独立 WebUI 与通用 UI 插件宿主。采用的产品与架构见 [WebUI state](state/webui.md)，运行入口见 [README](../README.md)与[应用开发](development/APPLICATION.md)，插件能力见 [UI SDK](development/UI-SDK.md)。

## 当前交付

阶段 0–5 的所选范围已完成。默认 Pakka 产品消费独立前端的固定归档，当前组合为 services 4 / workbench 2 / extensions 3、资产 schema 2。Conversation 阅读/输入/原请求恢复、工作台、设置、协作与所选业务插件均有真实路径验证；主界面经 design-companion 和实际 PC/手机操作迭代。

最终 Node 24 空目录安装、headless 依赖隔离、公开 SDK 消费、默认登录/输入、390px、TLS 代理、原 Session 跨兼容前端 A → B → A、Files 插件及退出清理已核对。[阶段 5](verification/PHASE-5.md)记录固定候选与完整结果，[覆盖接续](https://github.com/mapleluvr/pakka/blob/pakka/independent-webui-seams/docs/verification/WEBUI-COVERAGE-TRANSITION.md)说明旧检查的逐项处理。前端应用和 SDK 由本仓维护，Node 装配与服务仍由 Pakka 维护。

交付使用两仓现有工作分支和 PR；分支集成、公共 registry 发布与 OpenSpec 归档分别处理。构建/替换方法见[应用交付](development/DELIVERY.md)，形成过程见[固定交付](changes/fixed-delivery.md)与[工作台界面](changes/conversation-workbench.md)。原阶段 4 失败仍保留在[原候选记录](verification/PHASE-4.md)，当前结果不倒写历史。

## 保留范围与后续

- Provider `/login` 与新的 API key/OAuth 交互继续延期，已有服务凭据的安全和恢复检查保留。
- 语音草稿的预览、插入与生命周期已验证；本机无录音设备，用户授权跳过真实录音，原生识别质量仍未验证。
- 原生推送、Windows 显示/点击与撤权清理已实测。worker 字节更新/回退覆盖旧读取取消；换版后正文仍送达旧实例的分支未覆盖。
- Windows 深目录的私密 ACL 校验限制仍存在；维护恢复在短隔离目录通过，完整 release 的平台跳过与分轮结果明确保留。

本机执行与交付记录在 `docs/.temp/phase-5/active-plan.md`；后端阶段由 [plan-independent-webui](https://github.com/mapleluvr/pakka/tree/pakka/independent-webui-seams/openspec/changes/plan-independent-webui)管理。
