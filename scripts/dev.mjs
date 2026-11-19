import { createServer, request as httpRequest } from "node:http";
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { decodeWebUiAssetManifest } from "@pakka/protocol/webui-assets";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({
  options: {
    backend: { type: "string" },
    host: { type: "string", default: "127.0.0.1" },
    port: { type: "string", default: "5173" },
    watch: { type: "boolean", default: true },
  },
  allowNegative: true,
});
const loopback = (host) =>
  host === "localhost" ||
  host === "::1" ||
  (isIP(host) === 4 && host.startsWith("127."));
const port = Number(values.port),
  host = values.host;
if (!loopback(host) || !Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Use a loopback host and a port from 1 to 65535");
const publicHost = `${host.includes(":") ? `[${host}]` : host}:${port}`;
const origin = `http://${publicHost}`;
let backend;
if (values.backend) {
  try {
    backend = new URL(values.backend);
    if (
      backend.protocol !== "http:" ||
      !loopback(backend.hostname.replace(/^\[|\]$/g, "")) ||
      backend.username ||
      backend.password ||
      backend.pathname !== "/" ||
      backend.search ||
      backend.hash
    )
      throw new Error("unsupported");
  } catch {
    throw new Error(
      "--backend must be the HTTP origin of a local Pakka development instance",
    );
  }
}

async function loadAssets() {
  const directory = join(root, "dist/app");
  let manifest;
  try {
    manifest = decodeWebUiAssetManifest(
      JSON.parse(
        await readFile(join(directory, "asset-manifest.json"), "utf8"),
      ),
    );
  } catch (cause) {
    throw new Error("Cannot read the application build. Run npm run build.", {
      cause,
    });
  }
  const assets = new Map();
  for (const file of manifest.files) {
    const bytes = await readFile(join(directory, file.path));
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
      throw new Error(`Asset integrity mismatch: ${file.path}`);
    assets.set(file.url, { type: file.type, bytes });
  }
  const html = assets.get("/")?.bytes.toString("utf8");
  const importMap = html?.match(
    /<script type="importmap">([^<]+)<\/script>/,
  )?.[1];
  if (!html || !importMap)
    throw new Error("Application entry or shared import map is missing");
  const hash = createHash("sha256")
    .update(importMap.replace(/\r\n?/g, "\n"))
    .digest("base64");
  const stylePolicy = manifest.inlineStyleHashes
    .map(
      (hash) => " 'sha256-" + Buffer.from(hash, "hex").toString("base64") + "'",
    )
    .join("");
  return {
    assets,
    workers: new Set(manifest.workers),
    policy: `default-src 'self'; script-src 'self' 'sha256-${hash}'; style-src 'self'${stylePolicy}; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
  };
}
let current = await loadAssets();
const forwarding = [
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-for",
];
const hopByHop = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];
function headers(input) {
  const extra = String(input.connection ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase());
  return Object.fromEntries(
    Object.entries(input).filter(
      ([key]) => !hopByHop.includes(key) && !extra.includes(key),
    ),
  );
}
const server = createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", current.policy);
  function reject(status, message) {
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(message);
  }
  if (
    req.headers.host !== publicHost ||
    forwarding.some((key) => req.headers[key]) ||
    (req.headers.origin && req.headers.origin !== origin) ||
    req.headers["sec-fetch-site"] === "cross-site"
  )
    return reject(403, "Forbidden origin");
  let url;
  try {
    if (!req.url?.startsWith("/") || req.url.startsWith("//"))
      throw new Error("invalid");
    url = new URL(req.url, origin);
  } catch {
    return reject(400, "Invalid request URL");
  }
  const asset = current.assets.get(url.pathname);
  if (asset) {
    if (req.method !== "GET" && req.method !== "HEAD")
      return reject(405, "Read-only static asset");
    if (current.workers.has(url.pathname))
      res.setHeader("Service-Worker-Allowed", "/");
    res.writeHead(200, {
      "Content-Type": asset.type,
      "Content-Length": asset.bytes.length,
    });
    res.end(req.method === "HEAD" ? undefined : asset.bytes);
    return;
  }
  if (
    !url.pathname.startsWith("/pakka-webui/") ||
    url.pathname.startsWith("/pakka-webui/assets/")
  )
    return reject(404, "Not found");
  if (!backend) return reject(503, "No Pakka backend configured");
  // Host, Origin, Cookie, CSRF and identity headers pass through unchanged. No retries or inferred authority.
  const upstream = httpRequest(
    {
      hostname: backend.hostname.replace(/^\[|\]$/g, ""),
      port: backend.port || 80,
      method: req.method,
      path: url.pathname + url.search,
      headers: headers(req.headers),
    },
    (response) => {
      res.writeHead(response.statusCode ?? 502, headers(response.headers));
      response.on("error", () => res.destroy());
      response.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (res.headersSent) res.destroy();
    else reject(502, "Pakka backend is unavailable");
  });
  req.once("aborted", () => upstream.destroy());
  res.once("close", () => upstream.destroy());
  req.pipe(upstream);
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, host, resolve);
});
console.log(`Pakka WebUI: ${origin}`);
if (backend) console.log(`Backend must declare publicOrigin: ${origin}`);
else
  console.log(
    "GUI-only mode. Add --backend http://127.x.x.x:PORT to connect Pakka.",
  );

let watching,
  timer,
  building = false,
  pending = false;
async function rebuild() {
  pending = true;
  if (building) return;
  building = true;
  try {
    while (pending) {
      pending = false;
      if (!process.env.npm_execpath)
        throw new Error("Start with npm run dev to enable rebuilds");
      await new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [process.env.npm_execpath, "run", "build"],
          { cwd: root, stdio: "inherit" },
        );
        child.once("error", reject);
        child.once("exit", (code) =>
          code === 0 ? resolve() : reject(new Error(`Build exited ${code}`)),
        );
      });
      current = await loadAssets();
      console.log("Build ready. Reload the browser to use it.");
    }
  } catch (error) {
    console.error(
      "Build failed; the previous complete asset set remains available.",
      error.message,
    );
  } finally {
    building = false;
  }
}
if (values.watch)
  watching = watch(join(root, "src"), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void rebuild();
    }, 150);
  });
function close() {
  watching?.close();
  clearTimeout(timer);
  server.close();
  server.closeAllConnections();
}
process.once("SIGINT", close);
process.once("SIGTERM", close);
