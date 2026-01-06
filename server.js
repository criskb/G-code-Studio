import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(__dirname, "public");
const primitivesRoot = path.join(__dirname, "Primitives");
const userConfigDir = path.join(os.homedir(), ".gcode-studio");
const userConfigPath = path.join(userConfigDir, "config.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".stl": "model/stl"
};

async function serveStatic(req, res) {
  const urlPath = req.url.split("?")[0];
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(publicRoot, safePath === "/" ? "/index.html" : safePath);
  if (safePath.startsWith("/primitives/")){
    const rel = safePath.slice("/primitives/".length);
    filePath = path.join(primitivesRoot, rel);
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      const indexPath = path.join(filePath, "index.html");
      const indexStat = await fs.stat(indexPath);
      if (indexStat.isFile()) {
        const data = await fs.readFile(indexPath);
        const ext = path.extname(indexPath);
        res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
        res.end(data);
        return;
      }
    }
    if (!stat.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

async function readUserConfig() {
  try {
    const data = await fs.readFile(userConfigPath, "utf8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeUserConfig(payload) {
  await fs.mkdir(userConfigDir, { recursive: true });
  await fs.writeFile(userConfigPath, JSON.stringify(payload, null, 2), "utf8");
}

async function readBodyJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  if (req.url.startsWith("/api/user-config")) {
    if (req.method === "GET") {
      const cfg = await readUserConfig();
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(cfg));
      return;
    }
    if (req.method === "POST" || req.method === "PUT") {
      try {
        const body = await readBodyJson(req);
        await writeUserConfig(body || {});
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: err?.message || "Invalid JSON" }));
      }
      return;
    }
  }
  await serveStatic(req, res);
});

const port = process.env.PORT ? Number(process.env.PORT) : 5174;
server.listen(port, "0.0.0.0", () => {
  console.log(`G-code Studio running at http://localhost:${port}`);
});
