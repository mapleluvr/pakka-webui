import { build } from "esbuild";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeWebUiAssetManifest } from "@pakka/protocol/webui-assets";

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
  const unexpected = Object.keys(result.metafile.inputs).filter((path) =>
    /node_modules\/(?:react(?:-dom)?|@astryxdesign|@stylexjs)\//.test(
      path.replaceAll("\\", "/"),
    ),
  );
  if (unexpected.length)
    throw new Error("Application bundled a second shared UI runtime");
  const files = [];
  let entry;
  for (const [path, metadata] of Object.entries(result.metafile.outputs).sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    const absolute = resolve(root, path);
    const local = relative(outdir, absolute).replaceAll("\\", "/");
    const bytes = await readFile(absolute);
    const type = path.endsWith(".css")
      ? "text/css; charset=utf-8"
      : "text/javascript; charset=utf-8";
    files.push({ path: local, sha256: digest(bytes), type });
    if (metadata.entryPoint === "src/app/main.tsx" && path.endsWith(".js"))
      entry = local;
  }
  if (!entry) throw new Error("Application entry was not emitted");
  const prefix = `/pakka-webui/assets/app-${digest(JSON.stringify(files))}/`;
  const appFiles = files.map((file) => ({ ...file, url: prefix + file.path }));
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
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f8f9fb"><title>Pakka</title><link rel="icon" href="data:,">
${styles.map((url) => `<link rel="stylesheet" href="${url}">`).join("\n")}
<script type="importmap">${imports}</script><script type="module" src="${prefix + entry}"></script></head>
<body><div id="app"></div><noscript>Pakka 需要启用 JavaScript 才能使用。</noscript></body></html>\n`;
  await writeFile(join(outdir, "index.html"), html);
  const output = decodeWebUiAssetManifest({
    ...manifest,
    entry: "/",
    styles,
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
        applicationInputs: Object.keys(result.metafile.inputs).sort(),
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
