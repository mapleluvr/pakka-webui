# 独立 facet 浏览器接缝

2026-11-16，输入基线为 pakka-webui `70e3865` 与 Pakka `8207aa8`，两仓继续 `pakka/independent-webui-seams` 工作分支。Pakka 完整结果见[独立 facet 控制](https://github.com/mapleluvr/pakka/blob/pakka/independent-webui-seams/docs/verification/INDEPENDENT-FACET-CONTROL.md)。

## 实际结果

- 形成纯浏览器 `createUiFacet` 实例集合；重复清理保留结果，旧实例不能移除同名新实例，清理异常保持可见。实际宿主探针保留修复前失败和修复后结果。
- 公开 SDK/protocol/client 的仓库外安装、严格类型检查和浏览器 bundle 通过。`npm run check`、`npm run build`、`verify-lifecycle.mjs` 通过；不从 sibling 源码或根 overrides 消费后端。
- 安装版真实 Pakka 提供制品，以本轮独占 127.x.x.x origin 完成登录与 Cookie/CSRF 控制；未创建/切换 Ego profile、未升级 Ego Lite。三个实例共享 React/SDK/Astryx context。
- Client/Backend 停用保留 UI，Backend 原写入回执可查。WebUI 停用清理所属两个实例、Dialog/portal/监听/计时器，焦点返回启用入口；另一 publication 保持可用。重新启用使用新 generation，最终四个实例各清理一次，晚到 read/notice 被拒绝。
- 没有 CSP 违规，使用上游 built theme 和同源静态 CSS；该浏览器探针新增模型请求为 0。验证任务空间及服务关闭，Agent bindings 回到 0。
- 最终构建复现安装版 runtime manifest：`68a20cebe750e6d58b7782d90fd0513835eb22854572933dbf025120259066a1`，要求 services 3 / extensions 3 / workbench 2。UI SDK api 1 与 renderer 组合分别核对。

首次浏览器回执探针错误地期待普通 read 的持久回执，保留失败后改为真实 settings 写入，在全新数据上通过；产品 read 语义未改变。完整 Node 产品仍保留既有的 43 条上游声明错误，浏览器和新增 Agent 公共入口严格检查通过；原 Windows 长路径维护失败及短目录复验见 Pakka 完整记录。

本次不增加永久 DOM/CSS 测试。临时宿主和 runtime entry:null 不构成完整应用；阶段 2 仍需应用/registry、RSI 真实操作、跨 Session 历史与模型/Thinking 双入口。Provider /login、默认切换、合并及发行各自保留原边界。

## 本地保全

两仓使用同一个本地受限证据包：`pakka-independent-facet-evidence.zip`，**18464592 字节**，整体 SHA-256：

```text
e05bcd2da8d9ef8e00f9d45a452b314b7ac9318a85b2f07da340a68ef3866902
```

位置为工作区 `.backups/facet-control-ac47d620-0aba-4cbc-aee8-e134b89cfabd/`，成员大小与 hash 已验证。仅保留关键结果与整体身份；原始日志、安装清单及包本体不上传 GitHub，数据库与凭据未混入证据包。
