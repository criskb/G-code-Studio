window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

function buildPrusaMeshPayload(mesh){
  const tris = meshToTris(mesh);
  if(!tris || !tris.length) return null;
  const bounds = mesh.bounds || computeMeshBounds(tris);
  return { format:"tris", data:Array.from(tris), bounds };
}

function prusaMeshSignature(payload){
  if(!payload) return "none";
  const b = payload.bounds || {};
  return [payload.data?.length || 0, b.minx, b.miny, b.minz, b.maxx, b.maxy, b.maxz].join("|");
}

function mapPrusaRole(raw){
  if(!raw) return "";
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

function parsePrusaGcodeToToolpath(gcode, profile = null){
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
      currentRole = mapPrusaRole(typeLabel);
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
    coords: "machine",
    absoluteExtrusion: absoluteE,
    layers,
    stats: {
      length_mm: lengthMm,
      extruded_mm3: extrudedMm3,
      time_s_est: timeSec
    }
  };
}

window.GCODE_STUDIO.NODE_DEFS['Slicer PrusaSlicer'] = {
  title:"Slicer PrusaSlicer",
  defaultW:360,
  defaultH:360,
  tag:"slicer",
  desc:"Send mesh + settings to a PrusaSlicer/Slic3r CLI endpoint.",
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
  initData: ()=>({ endpoint:"/api/slice/prusa" }),
  render:(node, mount)=>{
    mount.innerHTML = "";
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.innerHTML = "Uses <code>/api/slice/prusa</code> to slice via PrusaSlicer or Slic3r.";
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
    const settings = { ...baseSettings, ...overrideSettings };

    const meshPayload = buildPrusaMeshPayload(mesh);
    if(!meshPayload) return { toolpath:null, path:[], stats:null, preview:null };

    const payloadKey = JSON.stringify({
      mesh: prusaMeshSignature(meshPayload),
      settings,
      profile
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
        mesh: meshPayload,
        settings,
        overrides: overridesInput?.settings || overridesInput || null,
        profile
      };
      fetch(node.data.endpoint || "/api/slice/prusa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(async (resp)=>{
          const data = await resp.json().catch(()=>null);
          if(!resp.ok){
            throw new Error(data?.error || `PrusaSlicer request failed (${resp.status})`);
          }
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
      toolpath = parsePrusaGcodeToToolpath(result.gcode, profile);
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
