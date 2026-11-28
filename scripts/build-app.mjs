import { build } from "esbuild";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeWebUiAssetManifest,
  WEBUI_SERVICE_WORKER_PATH,
} from "@pakka/protocol/webui-assets";

const root = fileURLToPath(new URL("../", import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Build the application over the independently built shared runtime. */
export async function buildApplication() {
  const outdir = join(root, "dist/app");
  const runtime = join(root, "dist/runtime");
  let manifest;
  try {
    manifest = decodeWebUiAssetManifest(
      JSON.parse(await readFile(join(runtime, "asset-manifest.json"), "utf8")),
    );
  } catch (cause) {
    throw new Error(
      "Cannot load the shared runtime manifest. Run npm run build:runtime and check its output.",
      { cause },
    );
  }
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await cp(runtime, outdir, { recursive: true });
  const result = await build({
    absWorkingDir: root,
    entryPoints: ["src/app/main.tsx"],
    outdir: join(outdir, "app"),
    entryNames: "[name]-[hash]",
    chunkNames: "chunks/[name]-[hash]",
    assetNames: "assets/[name]-[hash]",
    loader: { ".svg": "file" },
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    jsxDev: false,
    minify: true,
    metafile: true,
    legalComments: "eof",
    define: { "process.env.NODE_ENV": '"production"' },
    external: Object.keys(manifest.imports),
  });
  const worker = await build({
    absWorkingDir: root,
    entryPoints: ["src/integrations/pakka/notification-worker.ts"],
    outfile: join(outdir, "notification-worker.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    minify: true,
    metafile: true,
    legalComments: "eof",
  });
  const inputs = { ...result.metafile.inputs, ...worker.metafile.inputs };
  const unexpected = Object.keys(inputs).filter((path) =>
    /node_modules\/(?:react(?:-dom)?|@astryxdesign|@stylexjs)\//.test(
      path.replaceAll("\\", "/"),
    ),
  );
  if (unexpected.length)
    throw new Error("Application bundled a second shared UI runtime");
  const files = [];
  let entry;
  for (const [path, metadata] of Object.entries({
    ...result.metafile.outputs,
    ...worker.metafile.outputs,
  }).sort(([a], [b]) => a.localeCompare(b))) {
    const absolute = resolve(root, path);
    const local = relative(outdir, absolute).replaceAll("\\", "/");
    const bytes = await readFile(absolute);
    const type = {
      css: "text/css; charset=utf-8",
      svg: "image/svg+xml",
      js: "text/javascript; charset=utf-8",
    }[path.split(".").at(-1)];
    if (!type) throw new Error(`Unsupported application asset: ${path}`);
    files.push({ path: local, sha256: digest(bytes), type });
    if (metadata.entryPoint === "src/app/main.tsx" && path.endsWith(".js"))
      entry = local;
  }
  if (!entry) throw new Error("Application entry was not emitted");
  // Ship notices for the actual bundled dependency closure, including Markdown's transitive packages.
  const dependencies = [
    ...new Set(
      Object.keys(inputs).flatMap((path) => {
        const packagePath = path
          .replaceAll("\\", "/")
          .match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//)?.[1];
        return packagePath ? [packagePath] : [];
      }),
    ),
  ].sort();
  const bundledLicenses = [];
  for (const directory of dependencies) {
    const absolute = resolve(root, directory);
    let metadata;
    try {
      metadata = JSON.parse(
        await readFile(join(absolute, "package.json"), "utf8"),
      );
      if (
        typeof metadata?.name !== "string" ||
        typeof metadata?.version !== "string"
      )
        throw new Error("Package name/version missing");
    } catch (cause) {
      throw new Error(`Cannot read bundled dependency metadata: ${directory}`, {
        cause,
      });
    }
    if (metadata.name.startsWith("@pakka/")) continue;
    const names = (await readdir(absolute))
      .filter((name) => /^licen[sc]e(?:[.-].*)?$/i.test(name))
      .sort();
    if (!names.length)
      throw Error(`Missing bundled dependency license: ${metadata.name}`);
    for (const name of names) {
      const bytes = await readFile(join(absolute, name));
      const local = `app/licenses/${metadata.name.replaceAll("@", "").replaceAll("/", "-")}-${metadata.version}-${name}.txt`;
      await mkdir(join(outdir, "app/licenses"), { recursive: true });
      await writeFile(join(outdir, local), bytes);
      files.push({
        path: local,
        sha256: digest(bytes),
        type: "text/plain; charset=utf-8",
      });
      bundledLicenses.push({
        package: metadata.name,
        version: metadata.version,
        path: local,
      });
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const prefix = `/pakka-webui/assets/app-${digest(JSON.stringify(files))}/`;
  const appFiles = files.map((file) => ({
    ...file,
    url:
      file.path === "notification-worker.js"
        ? WEBUI_SERVICE_WORKER_PATH
        : prefix + file.path,
  }));
  const styles = [
    ...manifest.styles,
    ...appFiles
      .filter((file) => file.type.startsWith("text/css"))
      .map((file) => file.url),
  ];
  const imports = JSON.stringify({ imports: manifest.imports }).replaceAll(
    "<",
    "\\u003c",
  );
  const icons = ["pakka-logo-", "pakka-logo-dark-"]
    .map((name, index) => {
      const file = appFiles.find(
        (file) =>
          file.path.startsWith(`app/assets/${name}`) &&
          (index === 1 || !file.path.startsWith("app/assets/pakka-logo-dark-")),
      );
      if (!file) throw new Error(`Missing brand asset: ${name}`);
      const mode = index === 0 ? "light" : "dark";
      return `<link rel="icon" type="image/svg+xml" data-brand-icon="${mode}" media="(prefers-color-scheme: ${mode})" href="${file.url}">`;
    })
    .join("\n");
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f8f9fb"><title>Pakka</title>${icons}
${styles.map((url) => `<link rel="stylesheet" href="${url}">`).join("\n")}
<script type="importmap">${imports}</script><script type="module" src="${prefix + entry}"></script></head>
<body><div id="app"></div><noscript>Pakka 需要启用 JavaScript 才能使用。</noscript></body></html>\n`;
  await writeFile(join(outdir, "index.html"), html);
  const output = decodeWebUiAssetManifest({
    ...manifest,
    entry: "/",
    styles,
    workers: [...new Set([...manifest.workers, WEBUI_SERVICE_WORKER_PATH])],
    files: [
      ...manifest.files,
      ...appFiles,
      {
        path: "index.html",
        url: "/",
        type: "text/html; charset=utf-8",
        sha256: digest(html),
      },
    ],
  });
  const bytes = JSON.stringify(output, null, 2) + "\n";
  await writeFile(join(outdir, "asset-manifest.json"), bytes);
  await writeFile(
    join(outdir, "BUILD.json"),
    JSON.stringify(
      {
        manifestSha256: digest(bytes),
        runtimeManifestSha256: digest(
          await readFile(join(runtime, "asset-manifest.json")),
        ),
        applicationInputs: Object.keys(inputs).sort(),
        bundledLicenses,
        productionJsx: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Application built: ${relative(root, outdir)} (${digest(bytes)})`,
  );
  return outdir;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await buildApplication();
