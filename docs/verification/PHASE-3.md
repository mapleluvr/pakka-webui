# 阶段 3：固定应用交付

阶段 3 已验证独立 checkout 构建、标准静态归档和同一安装版 Pakka 的两个前端候选。产品预期见 [state](../state/webui.md)，使用方式见[应用交付](../development/DELIVERY.md)，来路见[固定交付记录](../changes/fixed-delivery.md)。

## 固定对象

应用源码基线 `977b138c074fcc17a16ba4ad00bfc7ca76b3332b`，后端基线 `ed05a2f202df5fd77b7c919b5eb8e545fde06e99`。应用归档 `pakka-webui-app-0.1.0-bc3c6f49f4e6e11b.tgz`：1,184,383 字节，SHA-256 `bc3c6f49f4e6e11b2ffbc947e35df1b0504f552726e715c752d4fba345f68482`。

manifest SHA-256：`418033338b02ad0f6dec8ab24dcbbf3278b9d71b8f8454197418f9669d396e15`。资产 schema 2，services 3 / extensions 3 / workbench 2，SDK api 1 / react19-astryx0.7.15。精确组合由 Pakka 的 [integrations/webui](https://github.com/mapleluvr/pakka/tree/pakka/independent-webui-seams/integrations/webui)单一维护。

## 结果

- 两个独立源码 checkout 安装、类型检查、构建和 pack 通过，无后端源码/执行安装图。归档 639 个成员与 manifest/必要元数据精确一致，637 项资产逐个核对 hash，六份上游许可保留。最终 pack 命令在干净源码候选重建得到与浏览器验收完全相同的 tgz。
- A 为阶段 2 完整应用；B 只在隔离 checkout 修改普通 GUI-only 插件版本与计数行为，不是另一公开发行。B manifest `1db10e04519cc990d12d1f13cdeb1fd93b52408d19ba94bd0a1754ac197bbff6`，公共服务需求和共享 runtime 与 A 相同。
- 相同安装版 Pakka 包/lock 按 A → B → A 提供固定资产，显式重开同一原 Session。真实浏览器显示 A 的 0 → 1、B 的 10 → 12、回退 A 后的 0；模块 URL 变化/恢复，原资源、登录和配置可读。该样例为空历史，不代替阶段 2 的长正文/分叉检查。
- 错 pin、服务版本不支持、旧资产 schema、资产篡改、runtime-only 五种情况均在创建 Runtime 数据目录前拒绝。pack 的损坏资产、元数据保留名、已有目录三个边界均拒绝且不输出新归档/覆盖已有文件。
- 原保留名覆盖缺陷先复现再修复。安装路径分隔符和浏览器监测未跨 CLI reload 保留的探针失败各自保留；监测同轮登记后复验通过。npm 路径查询的额外临时 Node 下载未用于验收；构建和服务仍为 Node 24.18.0，lock 未变。
- 同轮浏览器观察无脚本错误/CSP 违规，模型请求 **0**。服务和任务空间已关闭。新 pack 脚本与变体 TSX 主动 LSP 无错误；文档、格式、链接和 OpenSpec 核对记录与后端配对。

本轮未修改后端服务实现/依赖，未重复运行阶段 2 全部回归。Windows 长路径 ACL、完整 Node 产品的上游声明限制和旧依赖告警保持原记录；没有为此改权限、抑制类型或自动升级固定 Pi。

## 范围与证据

完整逐项结果见后端 [阶段 3 核对](https://github.com/mapleluvr/pakka/blob/pakka/independent-webui-seams/docs/verification/INDEPENDENT-WEBUI-PHASE-3.md)。原始数据只在本地封存；应用 tgz 是产品制品，证据 zip 不是产品制品。

本地证据包：`pakka-webui-phase-3-evidence.zip`，19,724,383 字节，整体 SHA-256 为 `92c7da5c972fdbfafb4970394da4e302c142b7fc6b855ea2b00a84c717f9ef93`。保全目录为工作区 `.backups/webui-phase-3-544acfeb-bc8b-44bf-b730-0cc74978752a/`，111 个归档成员已逐项读取并核对 hash。

阶段 4–5、Provider /login、默认产品切换、npm 发布和合并仍分别处理；普通输入公共回执查询仍是明确后续项。
