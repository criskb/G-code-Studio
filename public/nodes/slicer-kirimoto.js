window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

function meshToStlAscii(mesh){
  const tris = meshToTris(mesh);
  if(!tris || !tris.length) return "";
  const lines = ["solid gcode_studio"]; 
  for(let i=0;i<tris.length;i+=9){
    const ax = tris[i];
    const ay = tris[i+1];
    const az = tris[i+2];
    const bx = tris[i+3];
    const by = tris[i+4];
    const bz = tris[i+5];
    const cx = tris[i+6];
    const cy = tris[i+7];
    const cz = tris[i+8];
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    lines.push(`facet normal ${nx} ${ny} ${nz}`);
    lines.push("  outer loop");
    lines.push(`    vertex ${ax} ${ay} ${az}`);
    lines.push(`    vertex ${bx} ${by} ${bz}`);
    lines.push(`    vertex ${cx} ${cy} ${cz}`);
    lines.push("  endloop");
    lines.push("endfacet");
  }
  lines.push("endsolid gcode_studio");
  return lines.join("\n");
}

function buildKiriMeshPayload(mesh){
  const tris = meshToTris(mesh);
  if(!tris || !tris.length) return null;
  const bounds = mesh.bounds || computeMeshBounds(tris);
  return {
    format: "stl",
    stl: meshToStlAscii(mesh),
    bounds
  };
}

function kiriMeshSignature(payload){
  if(!payload) return "none";
  const b = payload.bounds || {};
  return [payload.stl?.length || 0, b.minx, b.miny, b.minz, b.maxx, b.maxy, b.maxz].join("|");
}

function mapKiriRole(raw){
  if(!raw) return "";
  const key = String(raw).toLowerCase().trim();
  const MAP = {
    "outer": "wall_outer",
    "outerwall": "wall_outer",
    "inner": "wall_inner",
    "innerwall": "wall_inner",
    "wall": "walls",
    "shell": "walls",
    "perimeter": "walls",
    "sparse": "infill",
    "infill": "infill",
    "solid": "top",
    "skin": "top",
    "top": "top",
    "bottom": "bottom",
    "support": "support",
    "skirt": "skirt",
    "brim": "skirt",
    "raft": "skirt",
    "travel": "travel",
    "gap": "travel"
  };
  return MAP[key] || key;
}

function parseKiriGcodeToToolpath(gcode, profile = null){
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
    if (commentPart) {
      const typeMatch = commentPart.match(/TYPE:\s*([^\s]+)/i);
      if (typeMatch) currentRole = mapKiriRole(typeMatch[1]);
      const featureMatch = commentPart.match(/feature\s+([^\s]+)/i);
      if (featureMatch) currentRole = mapKiriRole(featureMatch[1]);
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

async function runKiriSlice(runtime, payload){
  const loader = window.KIRI_MOTO;
  if(!loader?.loadEngine) throw new Error("Kiri bundle not loaded");
  const Engine = await loader.loadEngine();
  const engine = new Engine({ workURL: loader.workerUrl, poolURL: loader.poolUrl });
  if(payload.mode) engine.setMode(payload.mode);
  await engine.parse(payload.stl);
  if(payload.process) await engine.setProcess(payload.process);
  if(payload.device) await engine.setDevice(payload.device);
  await engine.slice();
  await engine.prepare();
  const gcode = await engine.export();
  runtime.engine = engine;
  return { gcode };
}

window.GCODE_STUDIO.NODE_DEFS['Slicer Kiri:Moto'] = {
  title:"Slicer Kiri:Moto",
  defaultW:360,
  defaultH:360,
  tag:"slicer",
  desc:"Slice meshes with Kiri:Moto's in-browser engine.",
  inputs: [
    {name:"mesh", type:"mesh"},
    {name:"profile", type:"profile"},
    {name:"settings", type:"slicer_settings"},
    {name:"overrides", type:"json"}
  ],
  outputs: [
    {name:"toolpath", type:"toolpath"},
    {name:"path", type:"path"},
    {name:"stats", type:"json"},
    {name:"preview", type:"preview"}
  ],
  initData: ()=>({ mode:"FDM" }),
  render:(node, mount)=>{
    mount.innerHTML = "";
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.innerHTML = "Runs Kiri:Moto locally via its browser engine.";
    mount.appendChild(hint);
    renderSchema(SCHEMA_EXTERNAL_SLICER, node, mount);
  },
  evaluate:(node, ctx)=>{
    node.runtime = node.runtime || {};
    const runtime = node.runtime;

    const meshInput = ctx.getInput(node.id, "mesh");
    const mesh = meshInput?.mesh || meshInput?.out || meshInput || null;
    if(!mesh) return { toolpath:null, path:[], stats:null, preview:null };

    const profileInput = ctx.getInput(node.id, "profile");
    const profile = profileInput?.profile || profileInput || ctx.defaultProfile || null;

    const settingsInput = ctx.getInput(node.id, "settings");
    const overridesInput = ctx.getInput(node.id, "overrides");
    const baseSettings = settingsInput?.settings || settingsInput || {};
    const overrideSettings = overridesInput?.settings || overridesInput || {};
    const process = { ...baseSettings, ...overrideSettings };

    const meshPayload = buildKiriMeshPayload(mesh);
    if(!meshPayload) return { toolpath:null, path:[], stats:null, preview:null };

    const payloadKey = JSON.stringify({
      mesh: kiriMeshSignature(meshPayload),
      process,
      profile,
      mode: node.data.mode || "FDM"
    });

    if(runtime.payloadKey !== payloadKey){
      runtime.payloadKey = payloadKey;
      runtime.result = null;
      runtime.error = null;
      runtime.sentKey = null;
    }

    if(!runtime.inflight && runtime.sentKey !== payloadKey){
      runtime.inflight = true;
      runtime.sentKey = payloadKey;
      const payload = {
        stl: meshPayload.stl,
        process,
        device: profile?.kiriDevice || null,
        mode: node.data.mode || "FDM"
      };
      runKiriSlice(runtime, payload)
        .then((data)=>{
          runtime.result = data;
          runtime.error = null;
        })
        .catch((err)=>{
          runtime.error = err?.message || String(err);
          runtime.result = null;
        })
        .finally(()=>{
          runtime.inflight = false;
          markDirtyAuto();
        });
    }

    const result = runtime.result || {};
    let toolpath = result.toolpath || null;
    if(!toolpath && result.gcode){
      toolpath = parseKiriGcodeToToolpath(result.gcode, profile);
    }

    const stats = result.stats || (toolpath ? toolpath.stats : null) || (runtime.error ? { error: runtime.error } : null);
    const preview = toolpath ? { type:"toolpath", toolpath } : null;

    if(toolpath){
      const converted = toolpathToPath(toolpath, { maxMoves:200000, profile });
      const path = Array.isArray(converted?.path) ? converted.path : [];
      if(preview && converted?.warning){ preview.warning = converted.warning; }
      return { toolpath, path, stats, preview };
    }

    return { toolpath:null, path:[], stats, preview };
  }
};
