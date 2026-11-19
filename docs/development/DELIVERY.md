# 应用归档与跨仓配对

本仓拥有应用、UI SDK、共享运行时、构建和上游许可。Pakka 通过明确的前端归档和 manifest 摘要装配静态字节；服务实现不参与前端构建。SDK 与完整网页分别交付。

## 生成本地应用候选

Node 24+、npm 11：

```sh
npm ci --ignore-scripts
npm run check
npm run pack:app -- dist/delivery-candidate
```

`pack:app` 先构建 SDK、共享 runtime 和完整应用，再使用 npm 自身的 `pack --ignore-scripts` 创建静态 tgz。目标目录必须尚不存在；命令不会覆盖旧交付。输出包括按内容 hash 命名的 `pakka-webui-app-<version>-<hash>.tgz` 和 `app-release.json`。

归档内的 `package/` 只包含：

- `asset-manifest.json` 声明的应用、模块、样式和上游许可文件；每项字节核对 hash。
- 原 manifest，保留兼容需求、入口与精确 CSP 样式许可。
- npm 所需的私有 `@pakka/webui-app` 元数据，无运行时依赖和 lifecycle script。

`package.json` 与 `asset-manifest.json` 是归档保留名，不能同时作为资产。未声明文件、构建日志、源码、node_modules、凭据和 `BUILD.json` 不进入归档。上游组件自身的许可随相应资产保留；生成 npm 元数据不为项目另行选择许可证。

此命令只生成本地制品，不发布 npm。`@pakka/webui-sdk` 仍按 [UI SDK](UI-SDK.md) 单独 pack；纯 SDK/headless 消费无需安装静态应用。

## 固定消费

`app-release.json` 记录归档完整 SHA-256、字节数、manifest SHA-256、资产格式和服务/runtime 组合。它是交付描述，不是签名或认证来源。消费方从获准的仓库配对记录或可信交付渠道取得预期摘要，不能对收到的未知文件现算 hash 后就把它当作可信 pin。

默认 Pakka 包在构建时按其固定配对核对应用归档，并把已验证资产放入 `dist/frontend`；未指定 `frontend` 的启动直接消费随包内容。显式替换时，先对照预期值核对归档的 SHA-256，再用系统 `tar -xzf` 解包到新的空目录。将该目录下的 `package/` 和配对记录中的 `manifestSha256` 交给 Pakka 公开装配入口：

```ts
import { startPocket } from "@pakka/webui";

const app = await startPocket({
  ...trustedProductOptions,
  frontend: {
    directory: extractedPackageDirectory,
    manifestSha256: approvedManifestSha256,
  },
});
```

实际配对由 Pakka 的 [integrations/webui](https://github.com/mapleluvr/pakka/tree/pakka/independent-webui-seams/integrations/webui)维护，避免在两仓重复维护服务定义。后端在打开 Session 前验证 manifest 身份、格式、服务版本、全部资产字节和 HTML 入口；失败不下载替代文件、不自动构建或回退到其他前端。共享 runtime 的 entry:null 不能用于完整产品启动。

## 更新与回退

替换前端使用另一个已核对的完整归档及其 manifest pin。当前 Node 装配在启动时载入固定资产；切换候选按正常停止/重开流程进行，显式保留原 Session 定位和服务配置，不宣称支持进程内资产热替换。

回退选择兼容的旧前端，原数据库、Session、已接纳工作与 unknown 请求继续保留。不同 services 主版本须重新核对，阶段 3 的 services 3 归档不能直接用于要求 services 4 的当前默认组合。资产格式、服务协议、UI SDK/renderer 分别核对。完整默认发行、独立部署、registry 发布和合并仍遵循各自的授权与验收。

当前默认组合与兼容回退见[阶段 5 验证](../verification/PHASE-5.md)；[阶段 3 验证](../verification/PHASE-3.md)保留原候选的历史结果。
