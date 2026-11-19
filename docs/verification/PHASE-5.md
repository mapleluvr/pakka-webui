# 阶段 5：默认安装与功能接续

按用户授权，本轮完成新前端默认装配所需的界面接续、公开 SDK 消费和旧实现清理。Pakka 的后端/完整回归与部署结果由[配套核对记录](https://github.com/mapleluvr/pakka/blob/pakka/independent-webui-seams/docs/verification/INDEPENDENT-WEBUI-PHASE-5.md)维护，本页记录前端的固定候选与实际能力。

## 候选与消费

当前应用归档 `pakka-webui-app-0.1.0-97c5bcd821a91b3a.tgz` 为 1,304,838 字节，SHA-256 `97c5bcd821a91b3a4c7ab4f80a7fffdd3b2172b84c77572c874f6f0dd71ce1ad`；manifest `a4ea8a221f173c4ac4c3e5d0f81c8019bb42d057fc7c91f2c7ef290c02631941`，713 个资产。它要求 services 4 / workbench 2 / extensions 3、资产 schema 2 和共享 React 19/Astryx runtime。构建使用 Node 24，公开 protocol/client 固定归档保持独立消费。

Pakka 默认构建消费该固定归档，并在 Node 包内提供完整资产；空目录安装无需本前端源码。完整 `smoke:package` 已通过实际安装、独立 headless 依赖隔离、公开 React SDK 类型消费及全部插件消费者。安装操作与配对来源见[交付说明](../development/DELIVERY.md)。

## 本轮补齐的行为

- 普通 `/tmp/...` 等字面输入可发送；已注册 slash/namespace 命令按当前 Conversation 发现并打开对应实例。
- Backend action 根据声明校验 JSON、scope 与 effect。write/model 保留完整原请求；App 请求按同一来源/Person 共享，Conversation 请求保留原资源。read 沿本次读取结果处理，失败保留草稿并可再次读取。
- 命令写入丢响应后跨刷新、原 Session 重开、Backend facet 停用或另一 Conversation，仍只查询原请求。unknown 保留且不重放；新草稿、关页晚到响应、撤权及只读隔离均实测。
- Session 重开分别记录发送与待刷新核对；成功读取解除待核对锁，已确认重开不会被随后的目录读取失败覆盖。

真实路径还补验了历史 32/32/16 分页、聚焦行回收、分叉来源/相同 call ID 的工具卡片、失败历史重开、新建与重命名空查询、同号跨 Session 浏览和设置晚到结果。模型/预算/人员/业务持久契约继续由所属服务验证。逐项旧检查的接续依据见 Pakka 的[覆盖记录](https://github.com/mapleluvr/pakka/blob/pakka/independent-webui-seams/docs/verification/WEBUI-COVERAGE-TRANSITION.md)，没有把删除旧 UI 测试作为通过证据。

## 最终安装版实操

PC 默认登录与一次字面输入通过，Provider 仅收到一次原消息。390px 的第二笔输入丢响应后刷新保留原正文；以兼容阶段 4 前端重开原 Session，查询一次找回原回执，查询期间另写草稿保留。再恢复当前默认归档，原历史与回执可读；A → B → A 始终指向同一 Session，合计两次提交、一次查询、两次 Provider 请求。

Files 插件读取安装版真实文件、390px 无横向溢出、退出登录清除插件与正文均通过。完整监听的脚本/CSP 错误为零，隔离服务正常结束且服务错误为零，浏览器空间已关闭。首次刷新未重新安装错误监听的探针单独保留，后续沿原请求补验。

当前/兼容归档使用同一 worker 字节 `c527bc532746a931830586f9f90b6aa7b91e6f6115ab06fb9e88644af38c856e`。worker 字节替换、通知清理与旧读取取消沿用[阶段 4](PHASE-4.md)编译变体的 A → B → A 证据；原生远端推送、Windows 实际显示和点击原历史分别有真机证据。

## 限制与交付状态

Provider `/login` 与新 API key/OAuth 交互继续延期。真实录音因用户无设备而授权跳过，原生识别质量未验证。worker 换版后仍把正文送达旧实例的分支未覆盖；已观察到的是浏览器取消旧读取。

两仓类型/构建及完整安装通过，最终前端重建 manifest 与验收归档完全一致。前端全量格式、本轮后端修改文件格式和 OpenSpec strict 通过；后端全仓格式仍有 16 个未改动的基线问题。Pakka release 首轮 274 文件全部完成，271 文件通过；三个失败文件修正旧登录断言后，在短隔离目录复验 15 项全通过。两轮合并覆盖 878 项通过、3 项平台跳过，原首轮 10 项失败保留。Windows 深目录 ACL 限制仍存在；两项 POSIX CDP 样例及一项固定路径 PowerShell 检查按平台跳过，真实安装版受管浏览器和当前 PowerShell 行为分别验证。

阶段 4/5 的所选范围已验收，默认入口与旧实现清理完成。分支提交/PR 按实际远端结果登记；合并、公共 registry 发布和 OpenSpec 归档各自独立。

本地证据包 `phase5-delivery-20261120-e4ba5c7a.zip`，1,074,141 字节，SHA-256 `1004ade3e91be04b6c2de0d2b12465652743ea342eae42bc5939da10132a9e34`；820 个文件逐项核对大小和摘要。位置为工作区 `.backups/webui-phase5-20261120`，不上 GitHub。包内保留失败探针、首轮 release 和后续复验；早期探针 URL 中一处隔离登录凭据明确脱敏，原件另在本地保留，数据库与凭据文件未纳入。归档首次计数把目录条目也计作文件而拒绝，按实际文件条目复核后全部通过，包字节未改。
