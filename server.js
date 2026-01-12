import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(__dirname, "public");
const primitivesRoot = path.join(__dirname, "Primitives");
const userConfigDir = path.join(os.homedir(), ".gcode-studio");
const userConfigPath = path.join(userConfigDir, "config.json");
const execFileAsync = promisify(execFile);

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
  ".stl": "model/stl",
  ".wasm": "application/wasm",
  ".gcode": "text/plain; charset=utf-8"
};

async function serveStatic(req, res) {
  const urlPath = req.url.split("?")[0];
  const cleanedPath = path.posix.normalize(urlPath.replace(/\\/g, "/"));
  const normalizedPath = cleanedPath === "." || cleanedPath.startsWith("..") ? "" : cleanedPath;
  const safePath = normalizedPath.replace(/^\/+/, "");
  const isPrimitives = safePath === "primitives" || safePath.startsWith("primitives/");
  let filePath = path.join(publicRoot, safePath || "index.html");
  if (isPrimitives) {
    const rel = safePath.slice("primitives".length).replace(/^\/+/, "");
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

function trisToAsciiStl(tris, name = "mesh") {
  const lines = [`solid ${name}`];
  for (let i = 0; i < tris.length; i += 9) {
    const ax = tris[i] ?? 0;
    const ay = tris[i + 1] ?? 0;
    const az = tris[i + 2] ?? 0;
    const bx = tris[i + 3] ?? 0;
    const by = tris[i + 4] ?? 0;
    const bz = tris[i + 5] ?? 0;
    const cx = tris[i + 6] ?? 0;
    const cy = tris[i + 7] ?? 0;
    const cz = tris[i + 8] ?? 0;
    lines.push("  facet normal 0 0 0");
    lines.push("    outer loop");
    lines.push(`      vertex ${ax} ${ay} ${az}`);
    lines.push(`      vertex ${bx} ${by} ${bz}`);
    lines.push(`      vertex ${cx} ${cy} ${cz}`);
    lines.push("    endloop");
    lines.push("  endfacet");
  }
  lines.push(`endsolid ${name}`);
  return lines.join("\n");
}

function mapCuraRole(raw) {
  if (!raw) return "";
  const key = String(raw).toUpperCase().trim();
  const MAP = {
    "WALL-OUTER": "wall_outer",
    "WALL-INNER": "wall_inner",
    "WALL": "walls",
    "SKIN": "top",
    "TOP": "top",
    "BOTTOM": "bottom",
    "TOP/BOTTOM": "top",
    "FILL": "infill",
    "INFILL": "infill",
    "SUPPORT": "support",
    "SUPPORT-INTERFACE": "support",
    "SKIRT": "skirt",
    "BRIM": "skirt",
    "PRIME_TOWER": "support",
    "TRAVEL": "travel",
    "EXTERNAL PERIMETER": "wall_outer",
    "OVERHANG PERIMETER": "wall_outer",
    "PERIMETER": "wall_inner",
    "INTERNAL INFILL": "infill",
    "SOLID INFILL": "bottom",
    "TOP SOLID INFILL": "top",
    "BRIDGE INFILL": "infill",
    "SKIRT/BRIM": "skirt",
    "SUPPORT MATERIAL": "support",
    "SUPPORT MATERIAL INTERFACE": "support",
    "WIPE TOWER": "support"
  };
  return MAP[key] || key.toLowerCase();
}

function parseGcodeToToolpath(gcode, profile = null) {
  const lines = String(gcode || "").split(/\r?\n/);
  const layers = [];
  let currentLayer = null;
  let x = 0;
  let y = 0;
  let z = 0;
  let e = 0;
  let f = 0;
  let absolutePos = true;
  let absoluteE = true;
  let currentRole = "";
  let lengthMm = 0;
  let extrudeMm = 0;
  let timeSec = 0;

  const ensureLayer = (zVal) => {
    if (!currentLayer) {
      currentLayer = { z: zVal, moves: [] };
      layers.push(currentLayer);
      return;
    }
    if (Math.abs((currentLayer.z ?? 0) - zVal) > 1e-6 && currentLayer.moves.length) {
      currentLayer = { z: zVal, moves: [] };
      layers.push(currentLayer);
    } else {
      currentLayer.z = zVal;
    }
  };

  for (const rawLine of lines) {
    const [codePart, commentPart] = rawLine.split(";", 2);
    if (commentPart && commentPart.includes("TYPE:")) {
      const typeLabel = commentPart.split("TYPE:")[1]?.trim();
      currentRole = mapCuraRole(typeLabel);
    }
    const line = codePart.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    const cmd = parts[0]?.toUpperCase();

    if (cmd === "G90") { absolutePos = true; continue; }
    if (cmd === "G91") { absolutePos = false; continue; }
    if (cmd === "M82") { absoluteE = true; continue; }
    if (cmd === "M83") { absoluteE = false; continue; }

    if (cmd !== "G0" && cmd !== "G1") continue;

    let nx = x;
    let ny = y;
    let nz = z;
    let ne = e;
    let hasMove = false;
    let hasE = false;

    for (let i = 1; i < parts.length; i++) {
      const token = parts[i];
      if (!token) continue;
      const key = token[0].toUpperCase();
      const value = Number(token.slice(1));
      if (!Number.isFinite(value)) continue;
      if (key === "X") { nx = absolutePos ? value : x + value; hasMove = true; }
      if (key === "Y") { ny = absolutePos ? value : y + value; hasMove = true; }
      if (key === "Z") { nz = absolutePos ? value : z + value; hasMove = true; }
      if (key === "E") { ne = absoluteE ? value : e + value; hasMove = true; hasE = true; }
      if (key === "F") { f = value; }
    }

    if (!hasMove) continue;
    ensureLayer(nz);

    const dx = nx - x;
    const dy = ny - y;
    const dz = nz - z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const extruding = hasE && ne > e + 1e-6;
    const moveRole = extruding ? currentRole : "travel";
    currentLayer.moves.push({
      x: nx,
      y: ny,
      z: nz,
      kind: extruding ? "print" : "travel",
      meta: { role: moveRole, feature: moveRole }
    });

    if (dist > 0) {
      lengthMm += dist;
      if (extruding) extrudeMm += Math.max(0, ne - e);
      if (f > 0) timeSec += dist / (f / 60);
    }

    x = nx;
    y = ny;
    z = nz;
    e = ne;
  }

  const filamentDia = Number(profile?.filamentDia || profile?.filament_diameter || 0);
  const filamentArea = filamentDia > 0 ? Math.PI * Math.pow(filamentDia / 2, 2) : 0;
  const extrudedMm3 = filamentArea ? extrudeMm * filamentArea : 0;

  return {
    units: "mm",
    absoluteExtrusion: absoluteE,
    layers,
    stats: {
      length_mm: lengthMm,
      extruded_mm3: extrudedMm3,
      time_s_est: timeSec
    }
  };
}

async function resolveCuraGcode(payload) {
  const proxyUrl = payload?.proxyUrl || process.env.CURA_ENGINE_URL;
  if (proxyUrl) {
    const resp = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data?.error || `Proxy slicer failed (${resp.status})`);
    }
    return data;
  }

  const enginePath = payload?.enginePath
    || process.env.CURA_ENGINE_PATH
    || process.env.CURAENGINE_PATH
    || "CuraEngine";
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gcode-studio-cura-"));
  const meshPath = path.join(tmpDir, "input.stl");
  const outPath = path.join(tmpDir, "output.gcode");

  const mesh = payload?.mesh || {};
  if (mesh.format === "stl" && typeof mesh.data === "string") {
    const buf = Buffer.from(mesh.data, "base64");
    await fs.writeFile(meshPath, buf);
  } else if (mesh.format === "tris" && Array.isArray(mesh.data)) {
    const stl = trisToAsciiStl(mesh.data);
    await fs.writeFile(meshPath, stl, "utf8");
  } else {
    throw new Error("Unsupported mesh format.");
  }

  const rawArgs = payload?.engineArgs || payload?.settings?.engineArgs || [];
  const args = (Array.isArray(rawArgs) ? rawArgs : [])
    .map((arg) => String(arg)
      .replace(/\{input\}/g, meshPath)
      .replace(/\{output\}/g, outPath)
    );

  if (!args.length) {
    args.push("slice", "-l", meshPath, "-o", outPath);
  }

  await execFileAsync(enginePath, args, { timeout: 1000 * 60 * 4 });
  const gcode = await fs.readFile(outPath, "utf8");
  return { gcode };
}

function normalizeSlicerValue(value) {
  if (value == null) return null;
  if (typeof value === "boolean") return value ? "1" : "0";
  if (Array.isArray(value)) return value.map((v) => String(v)).join(",");
  if (typeof value === "string") return value.replace(/\r?\n/g, "\\n");
  return String(value);
}

function buildPrusaConfig(settings, overrides, profile) {
  const merged = { ...(settings || {}), ...(overrides || {}) };
  const rawConfig = merged.configText || merged.prusaConfigText || merged.config || "";
  delete merged.configText;
  delete merged.prusaConfigText;
  delete merged.config;
  delete merged.enginePath;
  delete merged.engineArgs;

  const profileDefaults = {};
  if (profile) {
    if (profile.nozzle != null) profileDefaults.nozzle_diameter = profile.nozzle;
    if (profile.filamentDia != null) profileDefaults.filament_diameter = profile.filamentDia;
    if (profile.tempBed != null) profileDefaults.bed_temperature = profile.tempBed;
    if (profile.tempNozzle != null) profileDefaults.temperature = profile.tempNozzle;
    if (profile.layerHeight != null) profileDefaults.layer_height = profile.layerHeight;
    if (profile.firstLayerHeight != null) profileDefaults.first_layer_height = profile.firstLayerHeight;
    if (profile.travelSpeed != null) profileDefaults.travel_speed = profile.travelSpeed;
    if (profile.printSpeed != null) profileDefaults.perimeter_speed = profile.printSpeed;
    if (profile.startGcode) profileDefaults.start_gcode = profile.startGcode;
    if (profile.endGcode) profileDefaults.end_gcode = profile.endGcode;
  }

  for (const [key, value] of Object.entries(profileDefaults)) {
    if (!(key in merged)) merged[key] = value;
  }

  const lines = [];
  if (rawConfig && typeof rawConfig === "string") {
    lines.push(rawConfig.trim());
  }
  for (const [key, value] of Object.entries(merged)) {
    const normalized = normalizeSlicerValue(value);
    if (normalized == null || normalized === "") continue;
    lines.push(`${key} = ${normalized}`);
  }

  return lines.filter((line) => line.length).join("\n");
}

async function resolvePrusaGcode(payload) {
  const slicerPath = payload?.enginePath || process.env.PRUSA_SLICER_PATH || process.env.SLIC3R_PATH || "PrusaSlicer";
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gcode-studio-prusa-"));
  const meshPath = path.join(tmpDir, "input.stl");
  const outPath = path.join(tmpDir, "output.gcode");
  const configPath = path.join(tmpDir, "config.ini");

  const mesh = payload?.mesh || {};
  if (mesh.format === "stl" && typeof mesh.data === "string") {
    const buf = Buffer.from(mesh.data, "base64");
    await fs.writeFile(meshPath, buf);
  } else if (mesh.format === "tris" && Array.isArray(mesh.data)) {
    const stl = trisToAsciiStl(mesh.data);
    await fs.writeFile(meshPath, stl, "utf8");
  } else {
    throw new Error("Unsupported mesh format.");
  }

  const configText = buildPrusaConfig(payload?.settings, payload?.overrides, payload?.profile);
  if (configText) {
    await fs.writeFile(configPath, configText, "utf8");
  }

  const rawArgs = payload?.engineArgs || payload?.settings?.engineArgs || [];
  const args = (Array.isArray(rawArgs) ? rawArgs : [])
    .map((arg) => String(arg)
      .replace(/\{input\}/g, meshPath)
      .replace(/\{output\}/g, outPath)
      .replace(/\{config\}/g, configPath)
    );

  if (!args.length) {
    args.push("--export-gcode", "--load", configPath, "--output", outPath, meshPath);
  }

  await execFileAsync(slicerPath, args, { timeout: 1000 * 60 * 6 });
  const gcode = await fs.readFile(outPath, "utf8");
  return { gcode };
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  if (req.url.startsWith("/api/logs")) {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      return;
    }
    try {
      const body = await readBodyJson(req);
      const level = String(body?.level || "info").toLowerCase();
      const label = "[client-log]";
      if (level === "error") {
        const fnLabel = body?.functionName ? ` ${body.functionName}` : "";
        const nodeLabel = body?.node?.type ? ` ${body.node.type}` : "";
        console.error(`${label}${nodeLabel}${fnLabel}`, JSON.stringify(body));
      } else if (level === "warn" || level === "warning") {
        console.warn(label, JSON.stringify(body));
      } else {
        console.log(label, JSON.stringify(body));
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: err?.message || "Invalid JSON" }));
    }
    return;
  }
  if (req.url.startsWith("/api/slice/prusa")) {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      return;
    }
    try {
      const body = await readBodyJson(req);
      const payload = body || {};
      const sliceResult = await resolvePrusaGcode(payload);
      if (!sliceResult.gcode) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "No G-code produced." }));
        return;
      }
      const toolpath = parseGcodeToToolpath(sliceResult.gcode, payload.profile || null);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        ok: true,
        gcode: sliceResult.gcode,
        toolpath,
        stats: toolpath.stats
      }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: err?.message || "PrusaSlicer failed." }));
    }
    return;
  }
  if (req.url.startsWith("/api/slice/cura")) {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      return;
    }
    try {
      const body = await readBodyJson(req);
      const payload = body || {};
      const sliceResult = await resolveCuraGcode(payload);
      if (sliceResult.toolpath) {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, ...sliceResult }));
        return;
      }
      if (!sliceResult.gcode) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "No G-code produced." }));
        return;
      }
      const toolpath = parseGcodeToToolpath(sliceResult.gcode, payload.profile || null);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        ok: true,
        gcode: sliceResult.gcode,
        toolpath,
        stats: toolpath.stats
      }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: err?.message || "CuraEngine failed." }));
    }
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
