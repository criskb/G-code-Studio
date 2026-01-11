window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

function buildCuraMeshPayload(mesh){
  const tris = meshToTris(mesh);
  if(!tris || !tris.length) return null;
  const bounds = mesh.bounds || computeMeshBounds(tris);
  return { format:"tris", data:Array.from(tris), bounds };
}

function meshSignature(payload){
  if(!payload) return "none";
  const b = payload.bounds || {};
  return [payload.data?.length || 0, b.minx, b.miny, b.minz, b.maxx, b.maxy, b.maxz].join("|");
}

window.GCODE_STUDIO.NODE_DEFS['Slicer CuraEngine'] = {
  title:"Slicer CuraEngine",
  defaultW:360,
  defaultH:360,
  tag:"slicer",
  desc:"Send mesh + settings to a CuraEngine-backed slicer endpoint.",
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
  initData: ()=>({ endpoint:"/api/slice/cura" }),
  render:(node, mount)=>{
    mount.innerHTML = "";
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.innerHTML = "Uses <code>/api/slice/cura</code> to slice via CuraEngine (CLI or proxy).";
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

    const meshPayload = buildCuraMeshPayload(mesh);
    if(!meshPayload) return { toolpath:null, path:[], stats:null, preview:null };

    const payloadKey = JSON.stringify({
      mesh: meshSignature(meshPayload),
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
      fetch(node.data.endpoint || "/api/slice/cura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(async (resp)=>{
          const data = await resp.json().catch(()=>null);
          if(!resp.ok){
            throw new Error(data?.error || `CuraEngine request failed (${resp.status})`);
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
    const toolpath = result.toolpath || null;
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
