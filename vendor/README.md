# 固定的公开浏览器依赖

当前应用消费 Pakka `pakka/independent-webui-seams` 的阶段 4 公开协议与客户端归档。组合为 services 4 / workbench 2 / extensions 3，资产 schema 2；固定安装与来源随阶段候选记录核对。这些是完整公开包，前端通过包出口消费。

| 归档                                  | 版本  | SHA-256                                                            |
| ------------------------------------- | ----- | ------------------------------------------------------------------ |
| `pakka-client-73510b9c9689d6ae.tgz`   | 0.1.0 | `73510b9c9689d6ae4e2d2496e2c0c0e777f820d8f8459d9ca5d1f7795bef86dd` |
| `pakka-protocol-d17f5af6cd81e18d.tgz` | 0.1.0 | `d17f5af6cd81e18d4bc80c92c2850e0ba0cbf2c26d1fba93cc913e3fd059ead3` |

归档以内容身份命名，`package-lock.json` 同时锁定完整 integrity。纯 UI SDK 独立于这些应用开发依赖；包版本相同仍须核对精确候选字节。

阶段 3 的两份已跟踪归档保留历史身份：`pakka-client-96236109a3fb92a3.tgz` 与 `pakka-protocol-c57ec7c43f2d8156.tgz`，对应[阶段 2 公开包记录](../docs/verification/PHASE-2.md)及[阶段 3 应用记录](../docs/verification/PHASE-3.md)。中间未选用的本地归档已移到仓库外保全目录；当前安装仅引用表中的两份归档。
