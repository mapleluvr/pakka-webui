import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const outdir = join(root, "dist/runtime");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (path) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(`Cannot read build metadata: ${relative(root, path)}`);
  }
};
const packages = [
  "react",
  "react-dom",
  "@astryxdesign/core",
  "@astryxdesign/theme-neutral",
  "@stylexjs/stylex",
  "lucide-react",
];
const metadata = new Map(
  await Promise.all(
    packages.map(async (name) => [
      name,
      await readJson(join(root, "node_modules", name, "package.json")),
    ]),
  ),
);
const own = await readJson(join(root, "package.json"));
const entries = new Map();
const bridges = new Map();

// React's CJS entry cannot become a default-only browser module: expose its actual
// named namespace while keeping every consumer on the same bundled module object.
for (const specifier of [
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom",
  "react-dom/client",
]) {
  const namespace = await import(specifier);
  const values = namespace.default ?? namespace;
  const names = Object.keys(values).filter(
    (name) =>
      /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) &&
      !["default", "__esModule"].includes(name),
  );
  bridges.set(
    specifier,
    `import value from ${JSON.stringify(specifier)};\nexport default value;\nexport const { ${names.join(", ")} } = value;\n`,
  );
  entries.set(specifier, `shared:${specifier}`);
}
for (const [key, target] of Object.entries(
  metadata.get("@stylexjs/stylex").exports,
)) {
  // This public entry contains declarations only in the installed package; it cannot be a browser runtime alias.
  if (key === "./lib/types/StyleXTypes") continue;
  if (typeof target !== "object" || !target.import?.endsWith(".mjs")) continue;
  const specifier =
    key === "." ? "@stylexjs/stylex" : "@stylexjs/stylex/" + key.slice(2);
  entries.set(specifier, fileURLToPath(import.meta.resolve(specifier)));
}
entries.set("@pakka/webui-sdk", join(root, "dist/sdk/index.js"));
entries.set("@pakka/webui-sdk/react", join(root, "dist/sdk/react.js"));

const astryx = metadata.get("@astryxdesign/core");
const astryxRoot = join(root, "node_modules/@astryxdesign/core");
const styles = [];
const excluded = [
  {
    specifier: "@stylexjs/stylex/lib/types/StyleXTypes",
    reason:
      "Type-only declarations; the published import target has no runtime file.",
  },
];
for (const [key, target] of Object.entries(astryx.exports)) {
  const file = typeof target === "string" ? target : target.default;
  const specifier =
    key === "." ? "@astryxdesign/core" : "@astryxdesign/core/" + key.slice(2);
  if (typeof file !== "string")
    throw new Error(`No published default for ${specifier}`);
  if (file.endsWith(".css")) {
    styles.push({ specifier, file: join(astryxRoot, file) });
    continue;
  }
  if (!file.endsWith(".js")) {
    excluded.push({
      specifier,
      reason:
        "Not a compiled JavaScript runtime entry; bundle data locally or consume the appropriate asset.",
    });
    continue;
  }
  if (!key.includes("*")) {
    entries.set(specifier, fileURLToPath(import.meta.resolve(specifier)));
    continue;
  }
  // Enumerate the upstream public locale wildcard, not private package modules.
  if ((file.match(/\*/g) ?? []).length !== 1)
    throw new Error("Unsupported public export pattern");
  const [before, after] = file.split("*");
  const directory = join(astryxRoot, before.slice(0, before.lastIndexOf("/")));
  const prefix = before.slice(before.lastIndexOf("/") + 1);
  for (const name of (await readdir(directory)).sort()) {
    if (!name.startsWith(prefix) || !name.endsWith(after)) continue;
    const match = name.slice(prefix.length, name.length - after.length);
    const expanded = specifier.replace("*", match);
    entries.set(expanded, fileURLToPath(import.meta.resolve(expanded)));
  }
}

// Use the upstream prebuilt theme in production: its static CSS needs no inline
// style exception. Runtime defineTheme() remains an upstream API, not a CSP bypass.
const themeName = "@astryxdesign/theme-neutral";
const themeRoot = join(root, "node_modules", themeName);
for (const [key, target] of Object.entries(metadata.get(themeName).exports)) {
  const specifier = key === "." ? themeName : themeName + "/" + key.slice(2);
  const file = target.default ?? target.import?.default ?? target.import;
  if (key === "./fonts.css") {
    excluded.push({
      specifier,
      reason:
        "Optional remote-font stylesheet. Default assets use the upstream-supported system-font fallback; fonts must be delivered as approved same-origin assets.",
    });
  } else if (typeof file === "string" && file.endsWith(".css")) {
    styles.push({ specifier, file: join(themeRoot, file) });
  } else if (typeof file === "string" && /\.(?:js|mjs)$/.test(file)) {
    entries.set(specifier, fileURLToPath(import.meta.resolve(specifier)));
  } else {
    throw new Error(`No browser theme entry: ${specifier}`);
  }
}

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
const keys = [...entries.keys()].sort();
const points = Object.fromEntries(
  keys.map((key, index) => [
    `entry-${String(index).padStart(3, "0")}`,
    entries.get(key),
  ]),
);
const built = await build({
  absWorkingDir: root,
  entryPoints: points,
  outdir,
  entryNames: "modules/[name]-[hash]",
  chunkNames: "modules/shared-[hash]",
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: false,
  metafile: true,
  legalComments: "eof",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "shared-public-cjs-exports",
      setup(builder) {
        builder.onResolve({ filter: /^shared:/ }, ({ path }) => ({
          path: path.slice(7),
          namespace: "shared",
        }));
        builder.onLoad({ filter: /.*/, namespace: "shared" }, ({ path }) => ({
          contents: bridges.get(path),
          loader: "js",
          resolveDir: root,
        }));
      },
    },
  ],
});
const files = [];
for (const path of Object.keys(built.metafile.outputs).sort()) {
  const local = join(root, path);
  const bytes = await readFile(local);
  files.push({
    path: relative(outdir, local).replaceAll("\\", "/"),
    sha256: sha256(bytes),
    type: "text/javascript; charset=utf-8",
  });
}
const styleFiles = new Map();
for (const style of styles) {
  const bytes = await readFile(style.file);
  const path = "styles/" + style.specifier.split("/").at(-1);
  await mkdir(dirname(join(outdir, path)), { recursive: true });
  await writeFile(join(outdir, path), bytes);
  files.push({ path, sha256: sha256(bytes), type: "text/css; charset=utf-8" });
  styleFiles.set(style.specifier, path);
}
const upstreamLicenses = await readJson(join(root, "licenses/upstream.json"));
for (const name of packages) {
  const directory = join(root, "node_modules", name);
  const license = (await readdir(directory)).find((file) =>
    /^licen[sc]e(?:\.txt|\.md)?$/i.test(file),
  );
  const pinned = upstreamLicenses.find(
    (item) =>
      item.package === name && item.version === metadata.get(name).version,
  );
  if (!license && !pinned) throw new Error(`Missing upstream license: ${name}`);
  const bytes = await readFile(
    license ? join(directory, license) : join(root, "licenses", pinned.path),
  );
  if (!license && sha256(bytes) !== pinned.sha256)
    throw new Error(`License identity mismatch: ${name}`);
  const path =
    "licenses/" + name.replaceAll("/", "-").replaceAll("@", "") + ".txt";
  await mkdir(dirname(join(outdir, path)), { recursive: true });
  await writeFile(join(outdir, path), bytes);
  files.push({
    path,
    sha256: sha256(bytes),
    type: "text/plain; charset=utf-8",
  });
}
files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
const contentIdentity = sha256(JSON.stringify(files));
const prefix = `/pakka-webui/assets/${contentIdentity}/`;
const imports = {};
for (const [index, specifier] of keys.entries()) {
  const stem = `modules/entry-${String(index).padStart(3, "0")}-`;
  const file = files.find((file) => file.path.startsWith(stem));
  if (!file) throw new Error(`Missing browser entry: ${specifier}`);
  imports[specifier] = prefix + file.path;
}
const manifest = {
  schema: 1,
  requires: { services: 1, workbench: 2, extensions: 2 },
  runtime: {
    id: "react19-astryx0.7.15",
    sdk: own.version,
    packages: Object.fromEntries(
      packages.map((name) => [name, metadata.get(name).version]),
    ),
  },
  entry: null,
  imports,
  styles: [
    "@astryxdesign/core/reset.css",
    "@astryxdesign/core/astryx.css",
    "@astryxdesign/theme-neutral/theme.css",
  ].map((specifier) => prefix + styleFiles.get(specifier)),
  workers: [],
  files: files.map((file) => ({ ...file, url: prefix + file.path })),
};
const manifestBytes = JSON.stringify(manifest, null, 2) + "\n";
await writeFile(join(outdir, "asset-manifest.json"), manifestBytes);
await writeFile(
  join(outdir, "BUILD.json"),
  JSON.stringify(
    {
      manifestSha256: sha256(manifestBytes),
      sharedExports: keys.length,
      excluded,
      source: "Published package exports; one browser module graph.",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    directory: outdir,
    manifestSha256: sha256(manifestBytes),
    sharedExports: keys.length,
    files: files.length,
  }),
);
