# 固定的公开浏览器依赖

当前开发组合使用 Pakka `pakka/independent-webui-seams` 阶段 2 候选（基线 `dfb3837510052a4f725cbc3fa30026093ebea4ad`）构建的公开包。这些是完整包产物；本仓不复制协议源码，也不安装后端执行包。对应源码和核对范围见[阶段 2 记录](../docs/verification/PHASE-2.md)。

| 归档                                  | 版本  | SHA-256                                                            |
| ------------------------------------- | ----- | ------------------------------------------------------------------ |
| `pakka-client-96236109a3fb92a3.tgz` | 0.1.0 | `96236109a3fb92a39d609c6a1caf6c7b528e18524fb2194a73cc514a92b24994` |
| `pakka-protocol-c57ec7c43f2d8156.tgz` | 0.1.0 | `c57ec7c43f2d8156648e285bd79acadb52563c5806ae4a163eea49dc094e3033` |

组合为 services 3 / extensions 3 / workbench 2、资产 schema 2。客户端新增独立 Backend service binding，协议提供固定样式摘要的资产契约。归档以内容身份命名，package-lock 同时锁定完整 integrity；不能原位覆盖已固定的产物。

纯 UI SDK 不依赖这些包；它们仅属于应用构建的开发依赖。包尚未发布 npm，版本相同不代表开发候选字节相同。替换候选时核对来源、hash、锁文件、干净安装及前后端配对。
