import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeWebUiAssetManifest } from "@pakka/protocol/webui-assets";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = process.argv[2] && resolve(process.argv[2]);
const npm = process.env.npm_execpath;
if (!destination || !npm || process.argv.length !== 3)
  throw new Error("Usage: npm run pack:app -- <new archive directory>");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const app = join(root, "dist/app");
const manifestBytes = await readFile(join(app, "asset-manifest.json"));
let manifest;
let own;
try {
  manifest = decodeWebUiAssetManifest(
    JSON.parse(manifestBytes.toString("utf8")),
  );
  own = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
} catch (cause) {
  throw new Error(
    "Cannot read application or package metadata; rebuild and check the source JSON",
    { cause },
  );
}
if (manifest.entry !== "/")
  throw new Error("The application archive requires its HTML entry at /");
if (
  manifest.files.some((file) =>
    ["package.json", "asset-manifest.json"].includes(file.path),
  )
)
  throw new Error("Frontend assets collide with archive metadata");

// An existing delivery is never overwritten. npm supplies the archive format;
// the manifest remains the public source of allowed asset paths and identities.
await mkdir(destination, { mode: 0o700 });
const stage = await mkdtemp(join(destination, ".pack-"));
try {
  for (const file of manifest.files) {
    let source = app;
    for (const part of file.path.split("/")) {
      source = join(source, part);
      if ((await lstat(source)).isSymbolicLink())
        throw new Error("Frontend asset links are refused");
    }
    const stat = await lstat(source);
    if (!stat.isFile() || stat.size > 32 * 1024 * 1024)
      throw new Error("Invalid frontend asset size or file type");
    const bytes = await readFile(source);
    if (digest(bytes) !== file.sha256)
      throw new Error("Frontend asset identity mismatch");
    const target = join(stage, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  await writeFile(join(stage, "asset-manifest.json"), manifestBytes);
  await writeFile(
    join(stage, "package.json"),
    JSON.stringify(
      {
        name: "@pakka/webui-app",
        version: own.version,
        private: true,
        description:
          "Fixed static Pakka WebUI application; no Node runtime dependencies",
        files: [
          "asset-manifest.json",
          ...manifest.files.map((file) => file.path),
        ],
      },
      null,
      2,
    ) + "\n",
  );
  const result = spawnSync(
    process.execPath,
    [
      npm,
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      destination,
    ],
    { cwd: stage, encoding: "utf8", timeout: 180000 },
  );
  if (result.error || result.status !== 0)
    throw new Error("npm could not pack the static application", {
      cause: result.error,
    });
  const [packed] = JSON.parse(result.stdout);
  const expected = new Set([
    "package.json",
    "asset-manifest.json",
    ...manifest.files.map((file) => file.path),
  ]);
  if (
    packed.files.length !== expected.size ||
    packed.files.some((file) => !expected.has(file.path))
  )
    throw new Error(
      "npm archive members differ from the declared application files",
    );
  const bytes = await readFile(join(destination, packed.filename));
  const sha256 = digest(bytes);
  const file = `pakka-webui-app-${own.version}-${sha256.slice(0, 16)}.tgz`;
  await rename(join(destination, packed.filename), join(destination, file));
  const release = {
    schema: 1,
    application: { name: "@pakka/webui-app", version: own.version },
    archive: { file, sha256, bytes: bytes.length },
    manifestSha256: digest(manifestBytes),
    assetSchema: manifest.schema,
    requires: manifest.requires,
    runtime: manifest.runtime,
    entry: manifest.entry,
    files: manifest.files.length,
  };
  await writeFile(
    join(destination, "app-release.json"),
    JSON.stringify(release, null, 2) + "\n",
  );
  console.log(JSON.stringify(release, null, 2));
} finally {
  await rm(stage, { recursive: true, force: true });
}
