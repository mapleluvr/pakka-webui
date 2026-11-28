# 固定的公开浏览器依赖

当前消费 Pakka `pakka/personal-mode`，基线 `e475795f99ce43b8a59bfbd9223f79a2750e2f5b` 加 notebook 契约，标准 build + npm pack 产物。services 7 / workbench 3 / extensions 3；资产 schema 2。

| 包                                    | SHA-256                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `pakka-protocol-6c8039ae49cffbfb.tgz` | `6c8039ae49cffbfb471e4776ffc8921e410d4b9411691679577dc3fb89aeaa36` |
| `pakka-client-d32c00ee20abf819.tgz`   | `d32c00ee20abf81923ebe396cefa5415d0ac57667c3aa175177a422f3955a662` |

应用 devDependencies 和 package-lock 的 integrity 固定实际字节。UI SDK 不需要这些应用开发依赖。

## 历史：Session 预算组合

本应用消费 Pakka `pakka/session-budget-unlimited` 工作树（基线 `7a329040efc3fc49bb11ad6e7280e28338765924` 与该分支的 Session 预算协议更改）构建后的 `npm pack --ignore-scripts` 公开包。services 5 / workbench 3 / extensions 3；资产 schema 2。旧的正数 decoder 不可读取 0 额度，新旧前后端不能混配。

| 归档                                  | 版本  | SHA-256                                                            |
| ------------------------------------- | ----- | ------------------------------------------------------------------ |
| `pakka-protocol-af43f2e9e3cde3df.tgz` | 0.1.0 | `af43f2e9e3cde3dfb6a0ee3550c353d8c21e7c26f6eb1a29eede9b222a04aeba` |
| `pakka-client-63d811926effaaea.tgz`   | 0.1.0 | `63d811926effaaea6403ff660c974b7ab4bd8e3b8f68c6347bfd01c27f11a08d` |

归档以内容身份命名，`package-lock.json` 锁定完整 integrity。UI SDK 不依赖这两份应用开发依赖。原归档仍在基线 Git 历史中。

两包构建来源（`packages/{protocol,client}` 各自的 `src/**`、`package.json`、`tsconfig.json`）：按相对 Pakka 根的 POSIX 路径升序，逐文件以 UTF-8 拼接 `sha256(原始字节)␠␠路径\n` 并取 SHA-256：`cbcfb2821cd8b61237060ee307c4f015b3f3b74ab1c84e409dcd47a54cfb58c3`。两仓均未从这个工作树生成新的提交号。
