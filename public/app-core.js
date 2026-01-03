/* =========================================================
   G-code Studio — Node Graph v72 v7 v3
   Preview fix: offline WebGL orbit viewer (no CDN dependencies)
   Controls: rotate, shift-pan, wheel-zoom
   ========================================================= */

/* ---------------------------
   Utilities
---------------------------- */
const LS_KEY = "gcode-studio:nodegraph:v3";
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const DEFAULT_NODE_W = 460;
const DEFAULT_NODE_H = 240;
const fmt = (n, d=2)=> (isFinite(n)? Number(n).toFixed(d) : "—");
const rad = (deg)=>deg * Math.PI / 180;
const uid = ()=> Math.random().toString(16).slice(2,10) + "-" + Math.random().toString(16).slice(2,6);
const safeName = (s)=> String(s||"").toLowerCase().replace(/[^a-z0-9\-_]+/g,"_").slice(0,48);
const TYPE_ALIASES = {
  meshArray: "mesh[]"
};
function normalizePortType(type){
  return TYPE_ALIASES[type] || type;
}
function isTypeCompatible(a, b){
  return normalizePortType(a) === normalizePortType(b);
}
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
const numOr = (v, fallback)=>Number.isFinite(Number(v)) ? Number(v) : fallback;
function parseNumberList(input, fallback){
  if(Array.isArray(input)) return input.map(Number).filter((n)=>Number.isFinite(n));
  if(typeof input !== "string") return fallback || [];
  return input
    .split(/[\s,]+/)
    .map((v)=>Number(v))
    .filter((v)=>Number.isFinite(v));
}
function getPathInput(ctx, node, port){
  const inp = ctx.getInput(node.id, port);
  return (inp?.out || inp?.path || inp) || [];
}
function getMeshInput(ctx, node, port){
  const inp = ctx.getInput(node.id, port);
  return inp?.mesh || inp?.out || inp || null;
}
function getBoundsLocal(mesh){
  if(!mesh) return null;
  if(mesh.bounds) return mesh.bounds;
  if(mesh.tris && mesh.tris.length) return computeMeshBounds(mesh.tris);
  return null;
}
function lengthBetween(a, b){
  const ax = a?.X ?? a?.x ?? 0;
  const ay = a?.Y ?? a?.y ?? 0;
  const az = a?.Z ?? a?.z ?? 0;
  const bx = b?.X ?? b?.x ?? 0;
  const by = b?.Y ?? b?.y ?? 0;
  const bz = b?.Z ?? b?.z ?? 0;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function summarizeToolpath(path){
  let length = 0;
  let travelLength = 0;
  let printLength = 0;
  for(let i=1;i<path.length;i++){
    const seg = lengthBetween(path[i-1], path[i]);
    length += seg;
    if(path[i]?.travel){
      travelLength += seg;
    }else{
      printLength += seg;
    }
  }
  return { length, travelLength, printLength };
}
function simpleReport(title, details){
  return { title, ...details, createdAt: new Date().toISOString() };
}
function simpleNode({
  name,
  tag,
  desc,
  inputs,
  outputs,
  initData,
  schema,
  evaluate
}){
  window.GCODE_STUDIO.NODE_DEFS[name] = {
    title: name,
    tag,
    desc,
    inputs,
    outputs,
    initData: initData || (()=>({})),
    render: (node, mount)=>{
      mount.innerHTML = "";
      if(schema && schema.length){
        renderParamsFromSchema(node, mount, schema);
      }else{
        const hint = document.createElement("div");
        hint.className = "hint";
        hint.textContent = "No parameters.";
        mount.appendChild(hint);
      }
    },
    evaluate
  };
}
const ideaNodeUtils = {
  clamp,
  numOr,
  parseNumberList,
  getPathInput,
  getMeshInput,
  getBounds: getBoundsLocal,
  summarizeToolpath,
  simpleReport,
  simpleNode
};
window.GCODE_STUDIO.IDEA_NODE_UTILS_FALLBACK = window.GCODE_STUDIO.IDEA_NODE_UTILS_FALLBACK || ideaNodeUtils;
window.GCODE_STUDIO.IDEA_NODE_UTILS = window.GCODE_STUDIO.IDEA_NODE_UTILS || window.GCODE_STUDIO.IDEA_NODE_UTILS_FALLBACK;
const downloadText = (filename, text)=>{
  const blob = new Blob([text], {type:"text/plain"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const toastEl = document.getElementById("toast");
function toast(msg, ms=1400){
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(()=>toastEl.classList.remove("show"), ms);
}

window.addEventListener("error", (ev)=>{
  try{
    const msg = (ev && (ev.message || ev.error?.message)) || "Script error";
    console.warn(ev);
    toast(msg);
  }catch(_){}
});
window.addEventListener("unhandledrejection", (ev)=>{
  try{
    const msg = (ev && (ev.reason?.message || String(ev.reason))) || "Unhandled rejection";
    console.warn(ev);
    toast(msg);
  }catch(_){}
});


let compatMenuEl = null;

function ensureCompatMenu(){
  if(compatMenuEl) return compatMenuEl;
  compatMenuEl = document.createElement("div");
  compatMenuEl.className = "compatMenu";
  compatMenuEl.innerHTML = `<div class="title">Create compatible node…</div><div class="list"></div>`;
  document.body.appendChild(compatMenuEl);

  window.addEventListener("pointerdown", (e)=>{
    if(!compatMenuEl) return;
    if(compatMenuEl.style.display==="none") return;
    if(compatMenuEl.contains(e.target)) return;
    hideCompatMenu();
  }, {capture:true});

  return compatMenuEl;
}

function hideCompatMenu(){
  if(!compatMenuEl) return;
  compatMenuEl.style.display="none";
  compatMenuEl.dataset.open="0";
  compatMenuEl.dataset.wx="";
  compatMenuEl.dataset.wy="";
  compatMenuEl.dataset.fromNode="";
  compatMenuEl.dataset.fromPort="";
  compatMenuEl.dataset.fromType="";
}

function showCompatMenu(screenX, screenY, worldX, worldY, fromNode, fromPort, fromType){
  const el = ensureCompatMenu();
  const listEl = el.querySelector(".list");
  listEl.innerHTML = "";

  const candidates = [];
  for(const [type, def] of Object.entries(NODE_DEFS)){
    const inputs = def.inputs || [];
    for(const inp of inputs){
      if(isTypeCompatible(inp.type, fromType)){
        candidates.push({type, def, inputPort: inp.name});
      }
    }
  }

  if(!candidates.length){
    toast("No compatible nodes for: " + fromType);
    hideCompatMenu();
    return;
  }

  candidates.sort((a,b)=> (a.def.tag||"").localeCompare(b.def.tag||"") || a.def.title.localeCompare(b.def.title));

  for(const c of candidates.slice(0, 18)){
    const item = document.createElement("div");
    item.className="compatItem";
    item.innerHTML = `<div><div class="name">${c.def.title}</div><div class="tag">${c.def.tag||""} · input: ${c.inputPort}</div></div><div style="opacity:.5;font-size:12px">↵</div>`;
    item.addEventListener("click", ()=>{
      const id = addNode(c.type, worldX, worldY);
      const linkType = normalizePortType(fromType);
      // create link from source to this input
      state.links.push({id:uid(), from:{node:fromNode, port:fromPort, type:linkType}, to:{node:id, port:c.inputPort, type:linkType}});
      selectNode(id);
      saveState();
      markDirtyAuto();
      hideCompatMenu();
      toast(`Added: ${c.def.title}`);
    });
    listEl.appendChild(item);
  }

  el.style.left = Math.min(window.innerWidth-340, Math.max(10, screenX)) + "px";
  el.style.top  = Math.min(window.innerHeight-260, Math.max(10, screenY)) + "px";
  el.style.display="block";
  el.dataset.open="1";
  el.dataset.wx=String(worldX);
  el.dataset.wy=String(worldY);
  el.dataset.fromNode=fromNode;
  el.dataset.fromPort=fromPort;
  el.dataset.fromType=fromType;
}

const statusPill = document.getElementById("statusPill");
function setStatus(msg){ statusPill.textContent = msg; }
const zoomPill = document.getElementById("zoomPill");
const outPill = document.getElementById("outPill");

/* ---------------------------
   DOM refs
---------------------------- */
const graphWrap = document.getElementById("graphWrap");
const graphBg = document.getElementById("graphBg");
const linkCanvas = document.getElementById("linkCanvas");
const nodesLayer = document.getElementById("nodesLayer");
const gcodePre = document.getElementById("gcodePre");
const chipPts = document.getElementById("chipPts");
const chipLen = document.getElementById("chipLen");
const chipE = document.getElementById("chipE");
const chipT = document.getElementById("chipT");
const glCanvas = document.getElementById("glPreview");
const prevRoleEl = document.getElementById("prevRole");
const prevOverlayEl = document.getElementById("prevOverlay");
const prevLayerModeEl = document.getElementById("prevLayerMode");
const prevLayerEl = document.getElementById("prevLayer");
const prevLayerValEl = document.getElementById("prevLayerVal");
const prevScrubEl = document.getElementById("prevScrub");
const prevScrubValEl = document.getElementById("prevScrubVal");
const prevScrubPlayEl = document.getElementById("prevScrubPlay");
const prevScrubSpeedEl = document.getElementById("prevScrubSpeed");
const prevScrubLoopEl = document.getElementById("prevScrubLoop");
const prevScrubFollowEl = document.getElementById("prevScrubFollow");
const prevLineStyleEl = document.getElementById("prevLineStyle");
const prevLineWidthEl = document.getElementById("prevLineWidth");
const prevLineWidthValEl = document.getElementById("prevLineWidthVal");
const previewLegendEl = document.getElementById("previewLegend");
const previewLegendTitleEl = document.getElementById("previewLegendTitle");
const previewLegendRangeEl = document.getElementById("previewLegendRange");
const previewLegendBarEl = document.getElementById("previewLegendBar");
const previewWarnEl = document.getElementById("previewWarn");

const previewFilter = {
  role: "all",
  overlay: "featureType",
  layerMode: "all",
  layer: 0,
  maxLayer: 0,
  layerHeight: 0.2,
  scrub: 100
};
const previewLineSettings = {
  mode: "thin",
  width: 0.6
};
const previewScrubPlayback = {
  playing: false,
  speed: 1,
  loop: true,
  follow: false,
  lastTs: 0,
  raf: 0
};
window.__GCODE_STUDIO_PREVIEW__ = window.__GCODE_STUDIO_PREVIEW__ || {};
window.__GCODE_STUDIO_PREVIEW__.filter = previewFilter;
window.__GCODE_STUDIO_PREVIEW__.line = previewLineSettings;
window.__GCODE_STUDIO_PREVIEW__.scrub = previewScrubPlayback;

function computeLayerBounds(path){
  if(!path || !path.length) return {maxLayer:0, layerHeight:0.2};
  const lh = pickLayerHeight(path, null) || 0.2;
  let maxL=0;
  for(const p of path){
    const L = inferLayer(p, lh);
    if(L>maxL) maxL=L;
  }
  return {maxLayer:maxL, layerHeight:lh};
}

function updatePreviewControlsFromPath(path){
  if(!prevLayerEl || !prevLayerValEl) return;
  const b = computeLayerBounds(path);
  previewFilter.maxLayer = b.maxLayer;
  previewFilter.layerHeight = b.layerHeight;
  prevLayerEl.max = String(Math.max(0, b.maxLayer));
  if(previewFilter.layer > b.maxLayer) previewFilter.layer = b.maxLayer;
  prevLayerEl.value = String(previewFilter.layer);
  updatePreviewLayerLabel();
  // Disable slider when "All"
  prevLayerEl.disabled = (previewFilter.layerMode !== "single");
}

function updatePreviewLayerLabel(){
  if(previewFilter.layerMode !== "single"){
    prevLayerValEl.textContent = "All";
  }else{
    prevLayerValEl.textContent = "L " + String(previewFilter.layer);
  }
}

function updatePreviewScrubLabel(){
  if(!prevScrubValEl) return;
  const v = Math.max(0, Math.min(100, Number(previewFilter.scrub) || 0));
  prevScrubValEl.textContent = `${v}%`;
}

function updateScrubPlaybackUI(){
  if(!prevScrubPlayEl) return;
  prevScrubPlayEl.textContent = previewScrubPlayback.playing ? "Pause" : "Play";
}

function animateScrubPlayback(ts){
  if(!previewScrubPlayback.playing){
    previewScrubPlayback.raf = 0;
    previewScrubPlayback.lastTs = 0;
    return;
  }
  const last = previewScrubPlayback.lastTs || ts;
  const dt = Math.max(0, (ts - last) / 1000);
  previewScrubPlayback.lastTs = ts;
  const baseRate = 12;
  const speed = Math.max(0.1, Number(previewScrubPlayback.speed) || 1);
  const delta = baseRate * speed * dt;
  const next = previewFilter.scrub + delta;
  if(next >= 100){
    if(previewScrubPlayback.loop){
      previewFilter.scrub = next % 100;
    }else{
      previewFilter.scrub = 100;
      previewScrubPlayback.playing = false;
      updateScrubPlaybackUI();
    }
  }else{
    previewFilter.scrub = next;
  }
  if(prevScrubEl) prevScrubEl.value = String(Math.round(previewFilter.scrub));
  updatePreviewScrubLabel();
  schedulePreviewUpdate();
  previewScrubPlayback.raf = requestAnimationFrame(animateScrubPlayback);
}

function normalizePreviewRole(role, travel){
  if(travel) return "travel";
  const r = String(role || "").toLowerCase();
  if(r === "perimeter" || r === "outer_perimeter") return "wall_outer";
  if(r === "inner_perimeter") return "wall_inner";
  if(r === "skin" || r === "top_skin") return "top";
  if(r === "bottom_skin") return "bottom";
  if(r === "gap_fill" || r === "sparse_infill" || r === "solid_infill") return "infill";
  if(r === "support" || r === "support_interface") return "support";
  if(!r) return "";
  if(r === "inner_wall") return "wall_inner";
  if(r === "outer_wall") return "wall_outer";
  if(r === "wall") return "walls";
  if(r === "perimeter") return "walls";
  if(r === "perimeters") return "walls";
  return r;
}

function filterPreviewPath(path){
  if(!path || !path.length) return path || [];
  const want = previewFilter.role;
  const singleLayer = previewFilter.layerMode === "single";
  const filtering = (want && want !== "all") || singleLayer;
  if(!filtering){
    return applyScrubPercent(path, previewFilter.scrub);
  }

  const lh = singleLayer ? (previewFilter.layerHeight || (pickLayerHeight(path, null) || 0.2)) : null;
  const Lwant = singleLayer ? (previewFilter.layer|0) : null;
  const out = [];
  let open = false;

  for(const p of path){
    if(!p){
      open = false;
      continue;
    }
    let matches = true;

    if(want && want !== "all"){
      const r = normalizePreviewRole(p.meta?.role || p.role || "", !!p.travel);
      if(want==="walls") matches = (r==="walls" || r==="wall_outer" || r==="wall_inner");
      else matches = (r === want);
    }

    if(matches && singleLayer){
      matches = inferLayer(p, lh) === Lwant;
    }

    if(matches){
      if(!open && out.length) out.push(null);
      out.push(p);
      open = true;
    }else{
      open = false;
    }
  }
  return applyScrubPercent(out, previewFilter.scrub);
}

function applyScrubPercent(path, percent){
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  if(pct >= 100) return path;
  if(pct <= 0) return [];
  let totalSeg = 0;
  let last = null;
  for(const p of path){
    if(!p){ last = null; continue; }
    if(last) totalSeg++;
    last = p;
  }
  if(!totalSeg) return [];
  const allowed = Math.max(0, Math.floor(totalSeg * pct / 100));
  if(!allowed) return [];
  const out = [];
  let segCount = 0;
  last = null;
  for(const p of path){
    if(!p){
      if(out.length && out[out.length-1] !== null) out.push(null);
      last = null;
      continue;
    }
    if(!last){
      out.push(p);
      last = p;
      continue;
    }
    if(segCount >= allowed) break;
    out.push(p);
    segCount++;
    last = p;
  }
  return out;
}

function bindPreviewControls(){
  if(bindPreviewControls.bound) return;
  if(!prevRoleEl || !prevLayerModeEl || !prevLayerEl) return;

  prevRoleEl.value = previewFilter.role;
  if(prevOverlayEl) prevOverlayEl.value = previewFilter.overlay;
  prevLayerModeEl.value = previewFilter.layerMode;
  prevLayerEl.value = String(previewFilter.layer);
  if(prevScrubEl){
    prevScrubEl.value = String(previewFilter.scrub);
    updatePreviewScrubLabel();
  }
  if(prevScrubSpeedEl){
    prevScrubSpeedEl.value = String(previewScrubPlayback.speed || 1);
  }
  if(prevScrubLoopEl) prevScrubLoopEl.checked = !!previewScrubPlayback.loop;
  if(prevScrubFollowEl) prevScrubFollowEl.checked = !!previewScrubPlayback.follow;
  updateScrubPlaybackUI();
  if(prevLineStyleEl) prevLineStyleEl.value = previewLineSettings.mode;
  if(prevLineWidthEl && prevLineWidthValEl){
    prevLineWidthEl.value = String(previewLineSettings.width);
    prevLineWidthValEl.textContent = `${previewLineSettings.width.toFixed(2)}mm`;
  }

  prevRoleEl.addEventListener("change", ()=>{
    previewFilter.role = prevRoleEl.value;
    schedulePreviewUpdate();
  });
  if(prevOverlayEl){
    prevOverlayEl.addEventListener("change", ()=>{
      previewFilter.overlay = prevOverlayEl.value;
      schedulePreviewUpdate();
    });
  }
  prevLayerModeEl.addEventListener("change", ()=>{
    previewFilter.layerMode = prevLayerModeEl.value;
    updatePreviewLayerLabel();
    prevLayerEl.disabled = (previewFilter.layerMode !== "single");
    schedulePreviewUpdate();
  });
  prevLayerEl.addEventListener("input", ()=>{
    previewFilter.layer = Math.max(0, Math.min(previewFilter.maxLayer|0, Number(prevLayerEl.value||0)|0));
    updatePreviewLayerLabel();
    schedulePreviewUpdate();
  });
  if(prevScrubEl){
    prevScrubEl.addEventListener("input", ()=>{
      previewFilter.scrub = Math.max(0, Math.min(100, Number(prevScrubEl.value||0)));
      updatePreviewScrubLabel();
      schedulePreviewUpdate();
    });
  }
  if(prevScrubPlayEl){
    prevScrubPlayEl.addEventListener("click", ()=>{
      previewScrubPlayback.playing = !previewScrubPlayback.playing;
      updateScrubPlaybackUI();
      if(previewScrubPlayback.playing && !previewScrubPlayback.raf){
        previewScrubPlayback.raf = requestAnimationFrame(animateScrubPlayback);
      }
    });
  }
  if(prevScrubSpeedEl){
    prevScrubSpeedEl.addEventListener("change", ()=>{
      previewScrubPlayback.speed = Math.max(0.1, Number(prevScrubSpeedEl.value || 1));
    });
  }
  if(prevScrubLoopEl){
    prevScrubLoopEl.addEventListener("change", ()=>{
      previewScrubPlayback.loop = !!prevScrubLoopEl.checked;
    });
  }
  if(prevScrubFollowEl){
    prevScrubFollowEl.addEventListener("change", ()=>{
      previewScrubPlayback.follow = !!prevScrubFollowEl.checked;
    });
  }
  if(prevLineStyleEl){
    prevLineStyleEl.addEventListener("change", ()=>{
      previewLineSettings.mode = prevLineStyleEl.value;
      schedulePreviewUpdate();
    });
  }
  if(prevLineWidthEl && prevLineWidthValEl){
    prevLineWidthEl.addEventListener("input", ()=>{
      const v = Math.max(0.2, Math.min(1.5, Number(prevLineWidthEl.value || 0.6)));
      previewLineSettings.width = v;
      prevLineWidthValEl.textContent = `${v.toFixed(2)}mm`;
      schedulePreviewUpdate();
    });
  }
  bindPreviewControls.bound = true;
}
bindPreviewControls.bound = false;

function updatePreviewOverlayOptions(overlays){
  if(!prevOverlayEl) return;
  const list = (overlays && overlays.length) ? overlays : ["featureType"];
  prevOverlayEl.innerHTML = "";
  for(const item of list){
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item === "featureType" ? "Feature type" : item;
    prevOverlayEl.appendChild(opt);
  }
  if(!list.includes(previewFilter.overlay)){
    previewFilter.overlay = list.includes("featureType") ? "featureType" : list[0];
  }
  prevOverlayEl.value = previewFilter.overlay;
}

function updatePreviewLegend(legend){
  if(!previewLegendEl) return;
  if(!legend){
    previewLegendEl.style.display = "none";
    return;
  }
  previewLegendEl.style.display = "flex";
  if(previewLegendTitleEl) previewLegendTitleEl.textContent = `${legend.field || ""} ${legend.unit ? `(${legend.unit})` : ""}`.trim();
  if(previewLegendRangeEl) previewLegendRangeEl.textContent = `${fmt(legend.min, 2)} → ${fmt(legend.max, 2)}`;
  if(previewLegendBarEl && legend.colors){
    previewLegendBarEl.style.background = `linear-gradient(90deg, ${legend.colors.join(", ")})`;
  }
}

function updatePreviewWarning(msg){
  if(!previewWarnEl) return;
  if(msg){
    previewWarnEl.textContent = msg;
    previewWarnEl.style.display = "block";
  }else{
    previewWarnEl.textContent = "";
    previewWarnEl.style.display = "none";
  }
}

const prevMeshRenderEl = document.getElementById("prevMeshRender");
const prevMeshAlphaEl = document.getElementById("prevMeshAlpha");
const prevMeshAlphaValEl = document.getElementById("prevMeshAlphaVal");
const prevViewerEl = document.getElementById("prevViewer");

const previewMeshSettings = {
  render: "wire", // wire | solid | both | off
  alpha: 0.28,
  viewer: "gl" // gl | mv
};

function setViewerMode(mode){
  previewMeshSettings.viewer = mode;
  const mv = document.getElementById("mvPreview");
  if(mode === "mv" && mv && customElements.get("model-viewer")){
    // show MV, hide GL canvases
    mv.style.display = "block";
    glCanvas.style.display = "none";
    fallback2d.style.display = "none";
    // update mesh source if available
    try{
      const mesh = state.outputs.preview?.mesh || state.outputs.mesh || null;
      if(mesh?.glbUrl){
        mv.src = mesh.glbUrl;
        mv.setAttribute("camera-controls", "");
      }else if(mesh && meshToTris(mesh)?.length>=9){
        const url = meshToObjectURL_GLb(mesh);
        mv.src = url;
        mv.setAttribute("camera-controls", "");
      }else{
        mv.removeAttribute("src");
      }
    }catch(err){ console.warn(err); toast(err.message||String(err)); }
  }else{
    // show GL
    if(mv) mv.style.display = "none";
    glCanvas.style.display = "block";
  }
}

function bindPreviewMeshControls(){
  if(bindPreviewMeshControls.bound) return;
  if(prevViewerEl && !customElements.get("model-viewer")){
    const mvOption = prevViewerEl.querySelector('option[value="mv"]');
    if(mvOption){
      mvOption.disabled = true;
      mvOption.textContent = "Model-Viewer (offline)";
    }
    if(previewMeshSettings.viewer === "mv"){
      previewMeshSettings.viewer = "gl";
    }
  }
  if(prevMeshRenderEl){
    prevMeshRenderEl.value = previewMeshSettings.render;
    prevMeshRenderEl.addEventListener("change", ()=>{
      previewMeshSettings.render = prevMeshRenderEl.value;
      schedulePreviewUpdate();
    });
  }
  if(prevMeshAlphaEl && prevMeshAlphaValEl){
    prevMeshAlphaEl.value = String(Math.round(previewMeshSettings.alpha*100));
    prevMeshAlphaValEl.textContent = `${Math.round(previewMeshSettings.alpha*100)}%`;
    prevMeshAlphaEl.addEventListener("input", ()=>{
      const v = Math.max(0, Math.min(100, Number(prevMeshAlphaEl.value||0)));
      previewMeshSettings.alpha = v/100;
      prevMeshAlphaValEl.textContent = `${v}%`;
      schedulePreviewUpdate();
    });
  }
  if(prevViewerEl){
    prevViewerEl.value = previewMeshSettings.viewer;
    prevViewerEl.addEventListener("change", ()=>{
      const v = prevViewerEl.value;
      // guard MV if not available
      if(v==="mv" && !customElements.get("model-viewer")){
        toast("Model-Viewer not available (offline?)");
        prevViewerEl.value = "gl";
        setViewerMode("gl");
        return;
      }
      setViewerMode(v);
      schedulePreviewUpdate();
    });
  }
  bindPreviewMeshControls.bound = true;
}
bindPreviewMeshControls.bound = false;



const fallback2d = document.getElementById("fallback2d");

/* ---------------------------
   App state
---------------------------- */
function defaultState(){
  return {
    ui: { theme:"dark", autoRun:true, panX:60, panY:80, zoom:1.0, selectedNodeId:null },
    params: [
      {k:"pi", v:String(Math.PI), locked:true},
      {k:"tau", v:String(Math.PI*2), locked:true},
      {k:"A", v:"50"},
      {k:"B", v:"10"},
      {k:"C", v:"6"},
    ],
    nodes: {},
    links: [],
    orca: { printers:[], filaments:[], processes:[], files:{}, lastImported:"" },
    outputs: { gcode:"", path:[], mesh:null, toolpath:null, preview:null, previewWarning:"", stats:{points:0,length:0,e:0,timeMin:0} }
  };
}
let state = null;

/* ---------------------------
   Params + expression engine
---------------------------- */
const RESERVED = new Set(["window","document","Function","constructor","__proto__","prototype","eval","import","fetch","XMLHttpRequest"]);
function buildParamMap(){
  const map = {};
  for(const row of state.params){
    const k = (row.k||"").trim();
    if(!k) continue;
    const v = Number(row.v);
    if(isFinite(v)) map[k] = v;
  }
  if(map.pi == null) map.pi = Math.PI;
  if(map.tau == null) map.tau = Math.PI*2;
  return map;
}
function sanitizeExpr(expr){
  const s = String(expr ?? "").trim();
  if(!/^[0-9a-zA-Z_\s\+\-\*\/\%\^\.\,\(\)]*$/.test(s)) throw new Error("Illegal characters in expression");
  const ids = s.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  for(const id of ids) if(RESERVED.has(id)) throw new Error("Blocked identifier: "+id);
  return s;
}
function compileExpr(expr){
  const s0 = sanitizeExpr(expr);
  const s1 = String(s0).replace(/\^/g, "**");

  // Single-pass identifier rewrite (avoids reprocessing inserted "Math.*" etc.)
  const fnMap = {
    sin:"Math.sin", cos:"Math.cos", tan:"Math.tan",
    asin:"Math.asin", acos:"Math.acos", atan:"Math.atan",
    abs:"Math.abs", sqrt:"Math.sqrt",
    floor:"Math.floor", ceil:"Math.ceil", round:"Math.round",
    min:"Math.min", max:"Math.max",
    exp:"Math.exp", log:"Math.log", pow:"Math.pow", sign:"Math.sign"
  };

  const baseConsts = {
    printSpeed: "b.printSpeed",
    travelSpeed: "b.travelSpeed",
    nozzleTemp: "b.nozzleTemp",
    bedTemp: "b.bedTemp"
  };

  const s = s1.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g, (m)=>{
    const key = m.toLowerCase();

    // allow variables
    if(m==="T") return "t";
    if(m==="t"||m==="i"||m==="n"||m==="x"||m==="y"||m==="z"||m==="layer") return m;

    // math functions
    if(fnMap[key]) return fnMap[key];

    // allow explicit Math (rare, but safe)
    if(m==="Math") return "Math";

    // base settings shortcut
    if(m==="base") return "b";

    // base constants
    if(baseConsts[m]) return baseConsts[m];

    // everything else becomes a parameter lookup
    return `p["${m}"]`;
  });

  // eslint-disable-next-line no-new-func
  return new Function("t","i","n","x","y","z","layer","p","b", `return (${s});`);
}


function escapeHtml(s){
  return String(s??"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function mdToHtml(md){
  // Tiny, safe-ish markdown: headings, bold, italic, inline code, codeblocks, links, lists.
  const src = String(md??"");
  const lines = src.replace(/\r/g,"").split("\n");
  let out = [];
  let inCode = false;
  for(let ln of lines){
    if(ln.trim().startsWith("```")){
      inCode = !inCode;
      out.push(inCode ? "<pre class='mdCode'><code>" : "</code></pre>");
      continue;
    }
    if(inCode){
      out.push(escapeHtml(ln));
      continue;
    }
    const m1 = ln.match(/^(#{1,3})\s+(.*)$/);
    if(m1){
      const lvl = m1[1].length;
      out.push(`<div class="mdH${lvl}">${inlineMd(m1[2])}</div>`);
      continue;
    }
    const m2 = ln.match(/^\s*-\s+(.*)$/);
    if(m2){
      // start list if previous not list
      if(!out.length || !String(out[out.length-1]).startsWith("<li")) out.push("<ul class='mdUl'>");
      out.push(`<li>${inlineMd(m2[1])}</li>`);
      continue;
    }else{
      // close list if previous was list
      if(out.length && String(out[out.length-1]).startsWith("<li")){
        out.push("</ul>");
      }
    }
    if(ln.trim()===""){ out.push("<div class='mdP'></div>"); continue; }
    out.push(`<div class="mdP">${inlineMd(ln)}</div>`);
  }
  if(out.length && String(out[out.length-1]).startsWith("<li")) out.push("</ul>");
  return out.join("\n");
}
function inlineMd(s){
  let t = escapeHtml(s);
  t = t.replace(/`([^`]+)`/g, "<code class='mdInline'>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  t = t.replace(/\*([^*]+)\*/g, "<i>$1</i>");
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m,a,b)=>`<a class="mdLink" href="${escapeHtml(b)}" target="_blank" rel="noreferrer">${a}</a>`);
  return t;
}

/* ---------------------------
   Small DOM helpers
---------------------------- */
function divider(){ const d=document.createElement("div"); d.className="divider"; return d; }
function dividerTiny(){
  const d = document.createElement("div");
  d.style.height="1px"; d.style.background="var(--stroke)"; d.style.margin="6px 0";
  return d;
}
function field(labelText, el){
  const wrap = document.createElement("div");
  const lab = document.createElement("label");
  lab.textContent = labelText;
  wrap.appendChild(lab);
  wrap.appendChild(el);
  return wrap;
}


function renderParamsFromSchema(node, mount, schema){
  // schema: [{key,label,type,min,max,step,options,placeholder,help,visibleIf:(d)=>bool, group, ui}]
  const d = node.data || (node.data={});
  const frag = document.createDocumentFragment();
  const groups = new Map();
  for(const p of (schema||[])){
    if(p.visibleIf && !p.visibleIf(d,node)) continue;
    const g = p.group || "";
    if(!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p);
  }
  for(const [g, params] of groups){
    if(g){
      const h = document.createElement("div");
      h.className = "sect";
      h.textContent = g;
      frag.appendChild(h);
    }
    const rows = [];
    for(const p of params){
      const key = p.key;
      const val = (d[key] ?? p.default);
      let ctrl = null;

      if(p.type==="number"){
        ctrl = elNumber(val, (v)=>{ d[key]=Number(v); markDirtyAuto(); saveState(); }, p.step||0.01, p.min, p.max);
      }else if(p.type==="int"){
        ctrl = elNumber(val, (v)=>{ d[key]=Math.floor(Number(v||0)); markDirtyAuto(); saveState(); }, p.step||1, p.min, p.max);
      }else if(p.type==="select"){
        ctrl = elSelect(val, p.options||[], (v)=>{ d[key]=v; markDirtyAuto(); saveState(); });
      }else if(p.type==="toggle"){
        ctrl = elToggle(!!val, (v)=>{ d[key]=!!v; markDirtyAuto(); saveState(); });
      }else if(p.type==="text"){
        ctrl = elInput(val||"", (v)=>{ d[key]=String(v); saveState(); }, p.placeholder||"");
      }else if(p.type==="textarea"){
        ctrl = elTextarea(val||"", (v)=>{ d[key]=String(v); saveState(); }, p.placeholder||"");
      }else{
        ctrl = elInput(val??"", (v)=>{ d[key]=v; saveState(); });
      }

      const wrap = document.createElement("div");
      wrap.className = "field";
      const lab = document.createElement("div");
      lab.className = "label";
      lab.textContent = p.label || key;
      wrap.appendChild(lab);
      wrap.appendChild(ctrl);
      if(p.help){
        const h = document.createElement("div");
        h.className = "hint";
        h.innerHTML = p.help;
        wrap.appendChild(h);
      }
      frag.appendChild(wrap);
    }
  }
  mount.appendChild(frag);
}


function grid2(children){
  const r = document.createElement("div");
  r.className="miniRow";
  children.forEach(c=>r.appendChild(c));
  return r;
}
function elInput(value, onChange, placeholder){
  const i=document.createElement("input");
  i.value = value ?? "";
  if(placeholder) i.placeholder = placeholder;
  i.addEventListener("input", ()=> onChange(i.value));
  return i;
}

function elText(value, onChange, opts={}){
  const multiline = !!opts.multiline;
  const el = document.createElement(multiline ? "textarea" : "input");
  if(!multiline) el.type = "text";
  el.className = (opts.className || "text");
  el.value = (value ?? "").toString();
  if(opts.placeholder) el.placeholder = opts.placeholder;
  if(multiline){
    el.rows = Math.max(2, Number(opts.rows||3));
    el.style.resize = "vertical";
  }
  el.addEventListener("input", ()=>{ try{ onChange && onChange(el.value); }catch(e){ console.error(e);} });
  return el;
}

function elNumber(value, onChange, step){
  const i=document.createElement("input");
  i.type="number";
  if(step!=null) i.step=String(step);
  i.value = (value ?? 0);
  i.addEventListener("input", ()=> onChange(parseFloat(i.value)));
  return i;
}
function elSelect(value, options, onChange){
  const s=document.createElement("select");
  for(const [val, text] of options){
    const o = document.createElement("option");
    o.value=val; o.textContent=text;
    s.appendChild(o);
  }
  s.value = value;
  s.addEventListener("change", ()=> onChange(s.value));
  return s;
}

function elToggle(value, onChange){
  // value: boolean
  const lab = document.createElement("label");
  lab.className = "toggle";

  const inp = document.createElement("input");
  inp.type="checkbox";
  inp.checked = !!value;

  const track = document.createElement("span");
  track.className = "track";

  const knob = document.createElement("span");
  knob.className = "knob";
  track.appendChild(knob);

  const sync = ()=>{
    lab.classList.toggle("on", !!inp.checked);
  };
  sync();

  inp.addEventListener("change", ()=>{
    sync();
    onChange(!!inp.checked);
  });

  lab.appendChild(inp);
  lab.appendChild(track);
  return lab;
}


function elTextarea(value, onChange, rows){
  const t=document.createElement("textarea");
  if(rows) t.rows = rows;
  t.value = value ?? "";
  t.addEventListener("input", ()=> onChange(t.value));
  return t;
}

/* ---------------------------
   Node UI 2.0 (schema-driven widgets)
   Pattern inspiration: modern DOM/component node UIs (Comfy-style), implemented from scratch.
---------------------------- */

function uiSet(d, key, v, nodeId){
  d[key] = v;
  // refresh node UI so conditional sections update (schema 'when')
  scheduleRefreshNodeContent(nodeId || state?.ui?.selectedNodeId);
  markDirtyAuto();
  saveStateThrottled ? saveStateThrottled() : saveState();
}
function uiGet(d, key, fallback){
  return (d[key]===undefined ? fallback : d[key]);
}
function uiWhen(when, d, node){
  if(when===undefined || when===null) return true;
  try{
    if(typeof when === "function") return !!when(d, node);
    if(typeof when === "string"){
      // Light expression support using d as scope. Example: "d.pathMode==='slice'"
      return Function("d","node", `return !!(${when});`)(d, node);
    }
  }catch(_){}
  return true;
}

function uiWidget(item, d, node){
  const key = item.key;
  const label = item.label || key || "";
  const ui = item.ui || item.type || "text";
  const disabled = !!item.disabled;

  let el = null;

  if(ui==="button"){
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = item.text || label || "Action";
    btn.addEventListener("click", (e)=>{
      e.preventDefault(); e.stopPropagation();
      if(item.onClick){ try{ item.onClick(d, node); }catch(err){ console.warn(err); toast(err.message||String(err)); } }
    });
    el = btn;
  } else if(ui==="toggle"){
    const v = !!uiGet(d, key, !!item.default);
    el = elToggle(v, (nv)=>uiSet(d, key, !!nv));
  } else if(ui==="number"){
    const step = (item.step!==undefined ? item.step : 1);
    el = elNumber(uiGet(d, key, item.default), (nv)=>{
      let x = Number(nv);
      if(Number.isNaN(x)) x = Number(item.default||0);
      if(item.min!==undefined) x = Math.max(item.min, x);
      if(item.max!==undefined) x = Math.min(item.max, x);
      uiSet(d, key, x, node.id);
      if(item.onChange) try{ item.onChange(d, node, x); }catch(_){}
    }, step);
  } else if(ui==="select"){
    const opts = (item.options||[]).map(o=> Array.isArray(o) ? o : [o,o]);
    el = elSelect(String(uiGet(d, key, item.default ?? (opts[0]?.[0] ?? ""))), opts, (nv)=>{
      let val = nv;
      if(item.coerce==="number") val = Number(nv);
      else if(item.coerce==="bool") val = (nv===true || nv==="true" || nv==="1");
      uiSet(d, key, val, node.id);
      if(item.onChange) try{ item.onChange(d, node, val); }catch(_){}
    });
} else if(ui==="textarea"){
    const t = document.createElement("textarea");
    t.className = "textArea";
    t.value = String(uiGet(d, key, item.default||""));
    t.placeholder = item.placeholder || "";
    t.addEventListener("input", ()=>{
      uiSet(d, key, t.value, node.id);
      if(item.onChange) try{ item.onChange(d, node, t.value); }catch(_){}
    });
    el = t;
  } else { // text
    el = elInput(String(uiGet(d, key, item.default||"")), (nv)=>{
      uiSet(d, key, nv, node.id);
      if(item.onChange) try{ item.onChange(d, node, nv); }catch(_){}
    }, item.placeholder||"");
  }

  if(disabled){ el.disabled = true; el.style.opacity = 0.6; }

  const wrap = field(label, el);
  if(item.hint){
    const h = document.createElement("div");
    h.className="hint";
    h.innerHTML = item.hint;
    wrap.appendChild(h);
  }
  return wrap;
}

function renderSchema(schema, node, mount){
  const d = node.data || (node.data = {});
  mount.innerHTML="";
  if(!schema || !schema.length){
    const h = document.createElement("div");
    h.className="hint";
    h.innerHTML = "No UI schema.";
    mount.appendChild(h);
    return;
  }

  for(const section of schema){
    if(!uiWhen(section.when, d, node)) continue;

    if(section.kind==="group"){
      const box = document.createElement("div");
      box.className="group";

      const head = document.createElement("div");
      head.className="groupHead";
      head.innerHTML = `<span>${section.title||""}</span>${section.badge?`<small>${section.badge}</small>`:""}`;
      box.appendChild(head);

      const inner = document.createElement("div");
      inner.className="groupBody";

      for(const row of (section.rows||[])){
        if(!uiWhen(row.when, d, node)) continue;
        const cells = [];
        for(const item of (row.items||[])){
          if(!item) continue;
          if(!uiWhen(item.when, d, node)) continue;
          cells.push(uiWidget(item, d, node));
        }
        if(cells.length) inner.appendChild(grid2(cells));
      }

      if(section.note){
        const note = document.createElement("div");
        note.className="hint";
        note.innerHTML = section.note;
        inner.appendChild(note);
      }

      box.appendChild(inner);
      mount.appendChild(box);
    } else {
      const cells = [];
      for(const item of (section.items||[])){
        if(!item) continue;
        if(!uiWhen(item.when, d, node)) continue;
        cells.push(uiWidget(item, d, node));
      }
      if(cells.length) mount.appendChild(grid2(cells));
    }
  }
}

/* ---- Schemas for key nodes (initial migration to Node UI 2.0) ---- */

const SCHEMA_MESH_PRIMITIVE = [
  { kind:"group", title:"Primitive", rows:[
    { items:[
      {key:"kind", label:"Type", ui:"select", options:[["cube","Cube"],["dome","Dome"],["wavy","Wavy plane"]]},
      {key:"size", label:"Size (mm)", ui:"number", min:5, max:400, step:1},
    ]},
    { items:[
      {key:"seg", label:"Segments", ui:"number", min:4, max:200, step:1},
      {key:"height", label:"Height", ui:"number", min:0, max:300, step:1, when:"d.kind!=='cube'"},
    ]},
    { items:[
      {key:"waveAmp", label:"Wave amp", ui:"number", min:0, max:80, step:0.1, when:"d.kind==='wavy'"},
      {key:"waveFreq", label:"Wave freq", ui:"number", min:0, max:20, step:0.1, when:"d.kind==='wavy'"},
    ]},
  ], note:"Outputs <b>mesh</b> and optionally a <b>path</b> depending on Path mode." },

  { kind:"group", title:"Path mode", rows:[
    { items:[
      {key:"pathMode", label:"Mode", ui:"select", options:[["none","None"],["surface","Surface (raster)"],["slice","Planar slice (walls+infill)"]]},
      {key:"zOffset", label:"Z offset", ui:"number", step:0.05},
    ]},
  ], note:"<span class='hint'>Use <b>Surface</b> for non-planar raster paths. Use <b>Planar slice</b> for layers (bottom/walls/infill/top).</span>" },

  { kind:"group", title:"Surface path", when:"d.pathMode==='surface'", rows:[
    { items:[
      {key:"surfacePathEnabled", label:"Enable", ui:"toggle", default:true},
      {key:"pattern", label:"Pattern", ui:"select", options:[["raster","Raster"],["rings","Rings"]]},
    ]},
    { items:[
      {key:"spacing", label:"Spacing", ui:"number", min:0.2, max:20, step:0.1},
      {key:"step", label:"Step", ui:"number", min:0.1, max:10, step:0.1},
    ]},
    { items:[
      {key:"angleDeg", label:"Angle°", ui:"number", min:-180, max:180, step:1},
      {key:"margin", label:"Margin", ui:"number", min:0, max:30, step:0.1},
    ]},
    { items:[
      {key:"serpentine", label:"Serpentine", ui:"toggle", default:true},
      {key:"maxPoints", label:"Max points", ui:"number", min:1000, max:400000, step:1000},
    ]},
  ]},

  { kind:"group", title:"Planar slicer", when:"d.pathMode==='slice'", rows:[
    { items:[
      {key:"slice_layerHeight", label:"Layer height", ui:"number", min:0.05, max:1.2, step:0.01},
      {key:"slice_lineWidth", label:"Line width", ui:"number", min:0.2, max:1.2, step:0.01},
    ]},
    { items:[
      {key:"slice_perimeters", label:"Perimeters", ui:"number", min:0, max:12, step:1},
      {key:"slice_infillPct", label:"Infill %", ui:"number", min:0, max:100, step:1},
    ]},
    { items:[
      {key:"slice_infillPattern", label:"Infill pattern", ui:"select",
        options:[
          ["lines","Lines"],
          ["zigzag","ZigZag"],
          ["grid","Grid"],
          ["cross","Cross"],
          ["triangles","Triangles"],
          ["octagrid","OctaGrid"],
          ["diamond","Diamond"],
          ["honeycomb","Honeycomb (approx)"],
          ["cubic","Cubic (layer alt)"],
          ["concentric","Concentric"]
        ]},
      {key:"slice_infillAngle", label:"Angle°", ui:"number", min:-180, max:180, step:1},
    ]},
    { items:[
      {key:"slice_topLayers", label:"Top layers", ui:"number", min:0, max:20, step:1},
      {key:"slice_bottomLayers", label:"Bottom layers", ui:"number", min:0, max:20, step:1},
    ]},
    { items:[
      {key:"slice_serpentine", label:"Serpentine", ui:"toggle", default:true},
      {key:"slice_limitLayers", label:"Max layers (safety)", ui:"number", min:1, max:2000, step:1},
    ]},
  ], note:"Preview colors: <b>Top</b> is electric green, <b>Bottom</b> amber, <b>Infill</b> violet, <b>Outer/Inner</b> blue/cyan." },
];

const SCHEMA_PRINTER = [
  { kind:"group", title:"Machine", rows:[
    { items:[
      {key:"name", label:"Profile name", ui:"text", placeholder:"My Printer"},
      {key:"origin", label:"Origin", ui:"select", options:[["center","Center"],["frontleft","Front-left"]]},
    ]},
    { items:[
      {key:"bedW", label:"Bed W (mm)", ui:"number", min:50, max:1000, step:1},
      {key:"bedD", label:"Bed D (mm)", ui:"number", min:50, max:1000, step:1},
    ]},
    { items:[
      {key:"offsetX", label:"Offset X", ui:"number", step:0.1},
      {key:"offsetY", label:"Offset Y", ui:"number", step:0.1},
    ]},
  ]},
  { kind:"group", title:"Material & Motion", rows:[
    { items:[
      {key:"speedPrint", label:"Print speed (mm/min)", ui:"number", min:60, max:60000, step:10},
      {key:"speedTravel", label:"Travel speed (mm/min)", ui:"number", min:60, max:90000, step:10},
    ]},
    { items:[
      {key:"tempNozzle", label:"Nozzle °C", ui:"number", min:0, max:350, step:1},
      {key:"tempBed", label:"Bed °C", ui:"number", min:0, max:140, step:1},
    ]},
    { items:[
      {key:"lineWidth", label:"Line width", ui:"number", min:0.2, max:1.2, step:0.01},
      {key:"filamentDia", label:"Filament Ø", ui:"number", min:1.0, max:3.0, step:0.01},
    ]},
    { items:[
      {key:"extrusionMult", label:"Extrusion mult", ui:"number", min:0.2, max:3.0, step:0.01},
      {key:"travelZ", label:"Travel Z lift", ui:"number", min:0, max:10, step:0.05},
    ]},
  ], note:"Tip: speeds here are defaults; Rules nodes can override speed/flow/temp/fan per-point." },
  { kind:"group", title:"Start / End G-code", rows:[
    { items:[
      {key:"startGcode", label:"Start G-code", ui:"textarea", placeholder:"G28\nG92 E0\n..."},
      {key:"endGcode", label:"End G-code", ui:"textarea", placeholder:"M104 S0\nM140 S0\nM84\n"},
    ]},
  ]},
];

const SCHEMA_RULES = [
  { kind:"group", title:"Per-point rules", badge:"t ∈ [0..1]", rows:[
    { items:[
      {key:"speedExpr", label:"speed(t) mm/min", ui:"text", placeholder:"1800 + 600*sin(t*tau)"},
      {key:"flowExpr", label:"flow(t) scale", ui:"text", placeholder:"1"},
    ]},
    { items:[
      {key:"injectEveryN", label:"Inject every N layers", ui:"number", min:1, max:50, step:1},
      {key:"layerHeightHint", label:"Layer height hint", ui:"number", min:0.05, max:1.2, step:0.01},
    ]},
  ], note:"Expressions support: <code>sin</code>, <code>cos</code>, <code>abs</code>, <code>min</code>, <code>max</code>, and params like <code>A</code>, <code>B</code>." },
  { kind:"group", title:"Temp / Fan (optional)", rows:[
    { items:[
      {key:"enableTemp", label:"Enable temp", ui:"toggle", default:false},
      {key:"tempExpr", label:"temp(t) °C", ui:"text", placeholder:"210 + 10*sin(t*tau)", when:"d.enableTemp"},
    ]},
    { items:[
      {key:"enableFan", label:"Enable fan", ui:"toggle", default:false},
      {key:"fanExpr", label:"fan(t) 0..255", ui:"text", placeholder:"clamp(255*t,0,255)", when:"d.enableFan"},
    ]},
  ]},
];

const SCHEMA_EXPORT = [
  { kind:"group", title:"Export", rows:[
    { items:[
      {key:"fileName", label:"File name", ui:"text", placeholder:"gcode-studio_output"},
      {key:"addLayerComments", label:"Layer comments", ui:"toggle", default:true},
    ]},
    { items:[
      {key:"capPreviewChars", label:"Preview cap", ui:"number", min:10000, max:1500000, step:1000},
      {key:"_", label:" ", ui:"text", disabled:true, default:""},
    ]},
  ], note:"Connect <b>Path</b> + <b>Printer</b>. Optionally connect <b>Rules</b> + <b>Mesh</b> for preview." },
];

const SCHEMA_NOTE = [
  { kind:"group", title:"Notes", rows:[
    { items:[
      {key:"title", label:"Title", ui:"text", placeholder:"Demo note"},
      {key:"compact", label:"Compact header", ui:"toggle", default:false},
    ]},
    { items:[
      {key:"text", label:"Documentation / Notes", ui:"textarea", placeholder:"This demo does...\n\nTip: Connect Path → Modifiers → Printer → Export..."},
    ]},
  ], note:"Notes do not affect the graph; they are for demo docs and reminders." },
];



/* ---------------------------
   Path generators + SVG sampler + G-code (same as v2)
   (kept intact, omitted here in comment for brevity)
---------------------------- */
/* ====== START: Core path & gcode functions ====== */
function baseFromProfile(profile){
  return {
    base: 0,
    printSpeed: Number(profile.speedPrint||1800),
    travelSpeed: Number(profile.speedTravel||6000),
    nozzleTemp: Number(profile.tempNozzle||210),
    bedTemp: Number(profile.tempBed||60),
  };
}
function defaultPrinterFallback(){
  const printerNode = Object.values(state.nodes).find(n=>n.type==="Printer");
  return printerNode?.data || { speedPrint:1800, speedTravel:6000, tempNozzle:210, tempBed:60, bedW:220, bedD:220, origin:"center" };
}
function genEquation(g, pmap){
  const fx = compileExpr(g.x);
  const fy = compileExpr(g.y);
  const fz = compileExpr(g.z);
  const steps = Math.max(2, Math.floor(g.steps||200));
  const t0 = Number(g.t0||0), t1 = Number(g.t1||1);
  const layers = Math.max(1, Math.floor(g.layers||1));
  const lh = Number(g.layerHeight||0.2);
  const rotPer = rad(Number(g.rotatePerLayerDeg||0));
  const base = baseFromProfile(defaultPrinterFallback());
  const pts=[];
  const evalXY = (t,i,n)=>{
    const x = Number(fx(t,i,n,0,0,0,0,pmap, base));
    const y = Number(fy(t,i,n,0,0,0,0,pmap, base));
    return {x,y};
  };
  if(g.zMode==="explicit"){
    for(let i=0;i<steps;i++){
      const u = i/(steps-1);
      const t = t0 + (t1-t0)*u;
      const {x,y} = evalXY(t,i,steps);
      const z = Number(fz(t,i,steps,x,y,0,0,pmap, base));
      pts.push({x,y,z, meta:{layerHeight: lh}});
    }
    return pts;
  }
  if(g.zMode==="helical"){
    const totalZ = layers * lh;
    for(let i=0;i<steps;i++){
      const u = i/(steps-1);
      const t = t0 + (t1-t0)*u;
      const {x,y} = evalXY(t,i,steps);
      const z = u*totalZ;
      pts.push({x,y,z, meta:{layerHeight: lh}});
    }
    return pts;
  }
  for(let L=0; L<layers; L++){
    const ang = rotPer * L;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const z = (L+1)*lh;
    for(let i=0;i<steps;i++){
      const u = i/(steps-1);
      const t = t0 + (t1-t0)*u;
      const {x,y} = evalXY(t,i,steps);
      const xr = x*ca - y*sa;
      const yr = x*sa + y*ca;
      pts.push({x:xr, y:yr, z, layer:L, meta:{layerHeight: lh}});
    }
  }
  return pts;
}
function genPolar(g, pmap){
  const fr = compileExpr(g.r);
  const fth = compileExpr(g.theta);
  const fz = compileExpr(g.z);
  const steps = Math.max(2, Math.floor(g.steps||300));
  const t0 = Number(g.t0||0), t1 = Number(g.t1||1);
  const layers = Math.max(1, Math.floor(g.layers||1));
  const lh = Number(g.layerHeight||0.2);
  const rotPer = rad(Number(g.rotatePerLayerDeg||0));
  const base = baseFromProfile(defaultPrinterFallback());
  const pts=[];
  const evalXY = (t,i,n)=>{
    const r = Number(fr(t,i,n,0,0,0,0,pmap, base));
    const th = Number(fth(t,i,n,0,0,0,0,pmap, base));
    return {x:r*Math.cos(th), y:r*Math.sin(th)};
  };
  if(g.zMode==="explicit"){
    for(let i=0;i<steps;i++){
      const u = i/(steps-1);
      const t = t0 + (t1-t0)*u;
      const {x,y} = evalXY(t,i,steps);
      const z = Number(fz(t,i,steps,x,y,0,0,pmap, base));
      pts.push({x,y,z, meta:{layerHeight: lh}});
    }
    return pts;
  }
  if(g.zMode==="helical"){
    const totalZ = layers * lh;
    for(let i=0;i<steps;i++){
      const u = i/(steps-1);
      const t = t0 + (t1-t0)*u;
      const {x,y} = evalXY(t,i,steps);
      const z = u*totalZ;
      pts.push({x,y,z, meta:{layerHeight: lh}});
    }
    return pts;
  }
  for(let L=0; L<layers; L++){
    const ang = rotPer * L;
    const ca=Math.cos(ang), sa=Math.sin(ang);
    const z = (L+1)*lh;
    for(let i=0;i<steps;i++){
      const u = i/(steps-1);
      const t = t0 + (t1-t0)*u;
      const {x,y} = evalXY(t,i,steps);
      const xr = x*ca - y*sa;
      const yr = x*sa + y*ca;
      pts.push({x:xr, y:yr, z, layer:L, meta:{layerHeight: lh}});
    }
  }
  return pts;
}
function genSpiralVase(g){
  const height = Number(g.height||100);
  const lh = Number(g.layerHeight||0.2);
  const radius = Number(g.radius||40);
  const turns = Math.max(1, Number(g.turns||100));
  const waveAmp = Number(g.waveAmp||0);
  const waveFreq = Number(g.waveFreq||0);
  const spt = Math.max(6, Math.floor(g.stepsPerTurn||16));
  const steps = Math.floor(turns*spt);
  const pts=[];
  for(let i=0;i<=steps;i++){
    const u = i/steps;
    const th = u * turns * Math.PI*2;
    const z = u * height;
    const r = radius + waveAmp * Math.sin(u * waveFreq * Math.PI*2);
    const x = r*Math.cos(th);
    const y = r*Math.sin(th);
    pts.push({x,y,z, meta:{layerHeight: lh}});
  }
  return pts;
}
function genFromSVG(d){
  const svgText = String(d.svgText||"").trim();
  if(!svgText) return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if(!svg) throw new Error("SVG: No <svg> root element");
  const live = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  live.setAttribute("xmlns","http://www.w3.org/2000/svg");
  live.style.position="absolute";
  live.style.left="-99999px";
  live.style.top="-99999px";
  live.style.width="1px";
  live.style.height="1px";
  live.innerHTML = svg.innerHTML;
  document.body.appendChild(live);
  const elems = live.querySelectorAll("path, circle, rect, line, polyline, polygon, ellipse");
  const paths = [];
  for(const el of elems){
    if(typeof el.getTotalLength === "function" && typeof el.getPointAtLength === "function"){
      try{
        const len = el.getTotalLength();
        if(!isFinite(len) || len<=0) continue;
        paths.push({el, len});
      }catch(e){}
    }
  }
  if(!paths.length){
    live.remove();
    throw new Error("SVG: No geometry elements with length found");
  }
  const pts=[];
  for(const {el, len} of paths){
    const step = Math.max(0.05, Number(d.sampleStep||1.5));
    const n = Math.max(2, Math.ceil(len/step));
    for(let i=0;i<n;i++){
      const L = (i/(n-1))*len;
      const pt = el.getPointAtLength(L);
      pts.push({x: pt.x, y: pt.y, z: 0});
    }
  }
  const scale = Math.max(0.0001, Number(d.scaleMmPerUnit||1.0));
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for(const p of pts){ minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y); }
  const cx = (minX+maxX)/2;
  const cy = (minY+maxY)/2;
  const base = pts.map(p=>{
    const x = (d.center ? (p.x - cx) : p.x) * scale;
    const y = (d.center ? (p.y - cy) : p.y) * scale;
    return {x, y, z:0, meta:{layerHeight: Number(d.layerHeight||0.2)}};
  });
  const zMode = d.zMode || "flat";
  const rotPer = rad(Number(d.rotatePerLayerDeg||0));
  if(zMode==="flat"){ live.remove(); return base.map(p=>({...p, z:0})); }
  if(zMode==="helical"){
    const height = Math.max(1, Number(d.height||60));
    const out=[];
    const N = base.length;
    for(let i=0;i<N;i++){
      const u = i/(N-1);
      out.push({...base[i], z: u*height});
    }
    live.remove();
    return out;
  }
  const layers = Math.max(1, Math.floor(d.layers||10));
  const lh = Math.max(0.01, Number(d.layerHeight||0.2));
  const out=[];
  for(let L=0; L<layers; L++){
    const ang = rotPer * L;
    const ca=Math.cos(ang), sa=Math.sin(ang);
    const z = (L+1)*lh;
    for(const p of base){
      const xr = p.x*ca - p.y*sa;
      const yr = p.x*sa + p.y*ca;
      out.push({x:xr, y:yr, z, layer:L, meta:{layerHeight: lh}});
    }
  }
  live.remove();
  return out;
}
function toMachineXY(x, y, profile){
  let X=x, Y=y;
  if(profile.origin==="center"){
    X = x + profile.bedW/2;
    Y = y + profile.bedD/2;
  } else {
    X = x;
    Y = y;
  }
  X += (profile.offsetX||0);
  Y += (profile.offsetY||0);
  return {X,Y};
}
function safeNum(v, fallback, minV, maxV){
  const n = Number(v);
  if(!isFinite(n)) return fallback;
  return clamp(n, minV, maxV);
}
function pickLayerHeight(path, rulesBundle){
  for(const p of path){
    if(p?.meta?.layerHeight && isFinite(p.meta.layerHeight)) return Number(p.meta.layerHeight);
  }
  if(rulesBundle?.layerHeightHint && isFinite(rulesBundle.layerHeightHint)) return Number(rulesBundle.layerHeightHint);
  return 0.2;
}
function inferLayer(pt, lh){
  if(pt.layer!=null) return pt.layer|0;
  const z = Number(pt.z||0);
  const h = Math.max(0.01, lh||0.2);
  // Our Z convention uses z=(layerIndex+1)*layerHeight for printed layers.
  return Math.max(0, Math.floor((z + 1e-6) / h) - 1);
}
function maybeInjectLayerControls(lines, rules, base, t, z, layer){
  const every = Math.max(1, Math.floor(rules.injectEveryN||1));
  if(layer % every !== 0) return;

  // Filament swaps (single color per layer range; pause/change at boundaries)
  if(Array.isArray(rules.filamentChanges) && rules.filamentChanges.length){
    const hit = rules.filamentChanges.find(fc => (fc && Math.floor(fc.layer)===Math.floor(layer)));
    if(hit){
      const cmd = String(rules.filamentCmd || "M600").trim();
      const name = hit.name ? String(hit.name) : "";
      const hex  = hit.hex ? String(hit.hex) : "";
      lines.push(`; --- FILAMENT CHANGE @ layer ${layer} ${name} ${hex} ---`);
      if(cmd){
        lines.push(`${cmd} ; filament change`);
      }
    }
  }

  if(rules.enableTemp && rules.tempFn){
    const temp = safeNum(rules.tempFn(t,0,1,0,0,z,layer), base.nozzleTemp, 0, 400);
    lines.push(`M104 S${Math.round(temp)} ; rule temp`);
  }
  if(rules.enableFan && rules.fanFn){
    const fan = safeNum(rules.fanFn(t,0,1,0,0,z,layer), 0, 0, 255);
    lines.push(`M106 S${Math.round(fan)} ; rule fan`);
  }
}
function buildGcodeWithRules(path, profile, rulesBundle, addLayerComments){
  const p = profile;
  const base = baseFromProfile(p);

  // Sanitize incoming path: remove holes/undefined and any points missing XY
  const raw = Array.isArray(path) ? path : [];
  const pre = [];
  for(const pt of raw){
    if(!pt) continue;
    // Accept either {x,y,z} or already-machine {X,Y,z}
    const x = isFinite(pt.x) ? pt.x : (isFinite(pt.X) ? pt.X : NaN);
    const y = isFinite(pt.y) ? pt.y : (isFinite(pt.Y) ? pt.Y : NaN);
    const z = isFinite(pt.z) ? pt.z : 0;
    if(!isFinite(x) || !isFinite(y)) continue;
    pre.push({...pt, x, y, z});
  }

  const filamentArea = Math.PI * Math.pow((p.filamentDia||1.75)/2, 2);
  const layerHDefault = pickLayerHeight(pre, rulesBundle);
  const beadArea = Math.max(0.000001, (p.lineWidth||0.45) * layerHDefault);

  
const roleSpeedDefault = (role, layer)=> {
  const r = String(role||"");
  if(layer===0 && isFinite(p.firstLayerSpeed)) return p.firstLayerSpeed;
  if(r==="bottom") return Number(p.bottomSpeed||p.wallSpeed||p.speedPrint||1800);
  if(r==="top") return Number(p.topSpeed||p.wallSpeed||p.speedPrint||1800);
  if(r==="infill") return Number(p.infillSpeed||p.speedPrint||1800);
  if(r==="walls"||r==="wall"||r==="inner_wall"||r==="outer_wall") return Number(p.wallSpeed||p.speedPrint||1800);
  return Number(p.speedPrint||1800);
};
const roleFlowDefault = (role)=> {
  const r = String(role||"");
  if(r==="bottom") return Number(p.bottomFlow||1.0);
  if(r==="top") return Number(p.topFlow||1.0);
  if(r==="infill") return Number(p.infillFlow||1.0);
  if(r==="walls"||r==="wall"||r==="inner_wall"||r==="outer_wall") return Number(p.wallFlow||1.0);
  return 1.0;
};

const rules = {
    layerHeightHint: layerHDefault,
    injectEveryN: 1,
    speedFn: (t,i,n,x,y,z,layer,role)=> roleSpeedDefault(role, layer),
    flowFn: ()=> 1,
    enableTemp:false,
    tempFn:null,
    enableFan:false,
    fanFn:null,
    filamentChanges: null,
    filamentCmd: null
  };
  if(rulesBundle && typeof rulesBundle === "object"){
    if(typeof rulesBundle.speedFn === "function") rules.speedFn = rulesBundle.speedFn;
    if(typeof rulesBundle.flowFn === "function") rules.flowFn = rulesBundle.flowFn;
    if(typeof rulesBundle.tempFn === "function") rules.tempFn = rulesBundle.tempFn;
    if(typeof rulesBundle.fanFn === "function") rules.fanFn = rulesBundle.fanFn;
    if(typeof rulesBundle.layerHeightHint === "number") rules.layerHeightHint = rulesBundle.layerHeightHint;
    if(typeof rulesBundle.injectEveryN === "number") rules.injectEveryN = rulesBundle.injectEveryN;
    if(typeof rulesBundle.enableTemp === "boolean") rules.enableTemp = rulesBundle.enableTemp;
    if(typeof rulesBundle.enableFan === "boolean") rules.enableFan = rulesBundle.enableFan;
    if(Array.isArray(rulesBundle.filamentChanges)) rules.filamentChanges = rulesBundle.filamentChanges;
    if(typeof rulesBundle.filamentCmd === "string") rules.filamentCmd = rulesBundle.filamentCmd;
  }

  const lines=[];
  const nl = ()=>lines.push("");

  lines.push("; G-code Studio export");
  lines.push(`; Date: ${new Date().toISOString()}`);
  lines.push(`; Profile: ${(p.name||"Printer")}`);
  lines.push(`; Points: ${pre.length}`);
  nl();
  lines.push("G21 ; mm");
  lines.push("G90 ; absolute XYZ");
  lines.push("M82 ; absolute E");
  lines.push(`M104 S${Math.round(p.tempNozzle||0)}`);
  lines.push(`M140 S${Math.round(p.tempBed||0)}`);
  if(p.startGcode?.trim()){
    lines.push("; --- START GCODE (user) ---");
    lines.push(...p.startGcode.split("\n").map(s=>s.replace(/\r/g,"")));
    lines.push("; --- END START GCODE ---");
  }
  nl();

  // Build machinePath (always defined; used for preview + motion generation)
  const machinePath = [];
  for(const pt of pre){
    const m = toMachineXY(pt.x, pt.y, p);
    machinePath.push({...pt, X:m.X, Y:m.Y});
  }

  const N = machinePath.length;
  let E=0, len=0, timeSec=0;

  // Empty path: still return a valid file (start/end blocks) with empty preview
  if(N === 0){
    lines.push("; --- END MOVES ---");
    if(p.endGcode?.trim()){
      lines.push("; --- END GCODE (user) ---");
      lines.push(...p.endGcode.split("\n").map(s=>s.replace(/\r/g,"")));
      lines.push("; --- END END GCODE ---");
    }
    lines.push("M84");
    const stats = { points:0, length:0, e:0, timeMin:0 };
    lines.splice(2,0, `; PathLen(mm): 0.00`, `; Extrusion(mm filament): 0.00`, `; EstTime(min): 0.0` );
    return {gcode: lines.join("\n"), stats, machinePath: []};
  }

  const first = machinePath[0];
  const safeZ = Math.max(0, Number(p.travelZ||0));
  lines.push(`G0 F${Math.round(p.speedTravel||6000)} Z${fmt(safeZ,2)}`);
  lines.push(`G0 F${Math.round(p.speedTravel||6000)} X${fmt(first.X,2)} Y${fmt(first.Y,2)}`);
  lines.push(`G0 F${Math.round(p.speedTravel||6000)} Z${fmt(first.z,2)}`);
  lines.push("G92 E0");
  nl();

  let lastLayer = inferLayer(machinePath[0], layerHDefault);
  maybeInjectLayerControls(lines, rules, base, 0, machinePath[0].z, lastLayer);

  for(let i=1;i<N;i++){
    const a = machinePath[i-1];
    const b = machinePath[i];

    const dx=b.X-a.X, dy=b.Y-a.Y, dz=b.z-a.z;
    const dist = Math.sqrt(dx*dx+dy*dy+dz*dz);
    if(!isFinite(dist) || dist<=1e-9) continue;

    const layer = inferLayer(b, layerHDefault);
    if(layer !== lastLayer){
      lastLayer = layer;
      maybeInjectLayerControls(lines, rules, base, i, b.z, layer);
      if(addLayerComments){
        lines.push(`; --- LAYER ${layer} ---`);
      }
    }

    // travel moves
    if(b.travel){
      const tf = Math.round(p.travelSpeed || p.speedTravel || 6000);
      if((p.travelZ||0) > 0){
        lines.push(`G0 F${tf} Z${fmt(safeZ,2)} ; travel lift`);
        lines.push(`G0 F${tf} X${fmt(b.X,2)} Y${fmt(b.Y,2)} ; travel XY`);
        lines.push(`G0 F${tf} Z${fmt(b.z,2)} ; travel down`);
      } else {
        {
        const rlen = Number(p.retract||0);
        const rmin = Number(p.retractMinTravel||1.0);
        const rF = Math.round(p.retractSpeed||1800);
        const zhop = Number(p.zHop||0);
        if(rlen>0 && dist>=rmin){
          lines.push(`G1 F${rF} E${fmt(E - rlen,5)} ; retract`);
          E -= rlen;
        }
        if(zhop>0){ lines.push(`G0 F${tf} Z${fmt(b.z+zhop,2)} ; zhop`); }
        lines.push(`G0 F${tf} X${fmt(b.X,2)} Y${fmt(b.Y,2)} Z${fmt((zhop>0)?(b.z+zhop):b.z,2)} ; travel`);
        if(zhop>0){ lines.push(`G0 F${tf} Z${fmt(b.z,2)} ; unhop`); }
        if(rlen>0 && dist>=rmin){
          lines.push(`G1 F${rF} E${fmt(E + rlen,5)} ; unretract`);
          E += rlen;
        }
      }
      }
      timeSec += (dist / (tf/60));
      continue;
    }

    // print move
    const t = i / Math.max(1,(N-1));
    const role = b.role || b.meta?.role || "";
    const f0 = isFinite(b.speedHint) ? Number(b.speedHint) : roleSpeedDefault(role, layer);
    const flow0 = isFinite(b.flowHint) ? Number(b.flowHint) : roleFlowDefault(role);
    const f = safeNum(rules.speedFn(t,i,N,b.X,b.Y,b.z,layer,role), f0, 1, 60000);
    const flow = safeNum(rules.flowFn(t,i,N,b.X,b.Y,b.z,layer,role), flow0, 0, 20);

    // E increment (very simplified volumetric -> filament)
    const vol = beadArea * dist * flow;
    const dE = vol / filamentArea;
    E += dE;
    len += dist;
    timeSec += (dist / (f/60));

    lines.push(`G1 X${fmt(b.X,2)} Y${fmt(b.Y,2)} Z${fmt(b.z,2)} E${fmt(E,5)} F${Math.round(f)}`);
  }

  nl();
  lines.push("; --- END MOVES ---");
  if(p.endGcode?.trim()){
    lines.push("; --- END GCODE (user) ---");
    lines.push(...p.endGcode.split("\n").map(s=>s.replace(/\r/g,"")));
    lines.push("; --- END END GCODE ---");
  }
  lines.push("M84");

  const stats = { points:N, length:len, e:E, timeMin: timeSec/60 };
  lines.splice(2,0, `; PathLen(mm): ${fmt(len,2)}`, `; Extrusion(mm filament): ${fmt(E,2)}`, `; EstTime(min): ${fmt(timeSec/60,1)}` );
  return {gcode: lines.join("\n"), stats, machinePath};
}
function annotatePathHints(path, opts){
  const d = opts||{};
  const safe = (v, def)=> (isFinite(v) ? Number(v) : def);
  const roleSpeed = (role, layer)=>{
    const r=String(role||"");
    if(layer===0) return safe(d.firstLayerSpeed, 900);
    if(r==="bottom") return safe(d.bottomSpeed, safe(d.wallSpeed, 1800));
    if(r==="top") return safe(d.topSpeed, safe(d.wallSpeed, 1800));
    if(r==="infill") return safe(d.infillSpeed, 2400);
    if(r==="walls"||r==="wall"||r==="wall_inner"||r==="wall_outer"||r==="inner_wall"||r==="outer_wall") return safe(d.wallSpeed, 1800);
    return safe(d.wallSpeed, 1800);
  };
  const roleFlow = (role)=>{
    const r=String(role||"");
    if(r==="bottom") return safe(d.bottomFlow, 1.0);
    if(r==="top") return safe(d.topFlow, 1.0);
    if(r==="infill") return safe(d.infillFlow, 1.0);
    if(r==="walls"||r==="wall"||r==="wall_inner"||r==="wall_outer"||r==="inner_wall"||r==="outer_wall") return safe(d.wallFlow, 1.0);
    return 1.0;
  };

  for(const pt of (path||[])){
    if(!pt) continue;
    const role = pt.role || pt.meta?.role || "";
    const layer = isFinite(pt.layer) ? Number(pt.layer) : (isFinite(pt.meta?.layer) ? Number(pt.meta.layer) : 0);
    if(!isFinite(pt.speedHint)) pt.speedHint = roleSpeed(role, layer);
    if(!isFinite(pt.flowHint)) pt.flowHint = roleFlow(role);
  }
  return path;
}

/* ====== END: Core path & gcode functions ====== */

/* ---------------------------
   Mesh utilities (STL import + projection)
---------------------------- */
const meshRuntimeCache = new Map(); // nodeId -> { mesh, name, bytesLen }

function b64FromArrayBuffer(buf){
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for(let i=0;i<bytes.length;i+=chunk){
    binary += String.fromCharCode(...bytes.subarray(i, i+chunk));
  }
  return btoa(binary);
}
function arrayBufferFromB64(b64){
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function computeMeshBounds(tris){
  let minX=Infinity,minY=Infinity,minZ=Infinity;
  let maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(let i=0;i<tris.length;i+=3){
    const x=tris[i], y=tris[i+1], z=tris[i+2];
    if(x<minX) minX=x; if(y<minY) minY=y; if(z<minZ) minZ=z;
    if(x>maxX) maxX=x; if(y>maxY) maxY=y; if(z>maxZ) maxZ=z;
  }
  return {min:{x:minX,y:minY,z:minZ}, max:{x:maxX,y:maxY,z:maxZ}, minx:minX, miny:minY, minz:minZ, maxx:maxX, maxy:maxY, maxz:maxZ};
}

function meshToTris(mesh){
  if(!mesh) return null;
  if(mesh.tris && mesh.tris.length) return mesh.tris;
  const positions = mesh.positions || null;
  const indices = mesh.indices || null;
  if(positions && indices && indices.length){
    const tris = new Float32Array(indices.length * 3);
    for(let i=0;i<indices.length;i++){
      const idx = indices[i] * 3;
      tris[i*3+0] = positions[idx] ?? 0;
      tris[i*3+1] = positions[idx+1] ?? 0;
      tris[i*3+2] = positions[idx+2] ?? 0;
    }
    return tris;
  }
  if(positions && positions.length % 3 === 0) return new Float32Array(positions);
  return null;
}
function buildFromImage(node, previewCanvas, drawPreviewCb){
  const d=node.data;
  node.runtime = node.runtime || {};
  node.runtime.needsRebuild = false;

  if(!d.imgB64){
    node.runtime.mesh=null;
    node.runtime.imgObj=null;
    node.runtime.imgSmall=null;
    drawPreviewCb && drawPreviewCb();
    return;
  }

  const img = new Image();
  img.onload = ()=>{
    node.runtime.imgObj = img;

    // Downsample for processing
    const maxRes = Math.max(32, Math.floor(Number(d.maxRes||180)));
    const scale = Math.min(1, maxRes / Math.max(img.width, img.height));
    const w = Math.max(8, Math.floor(img.width * scale));
    const h = Math.max(8, Math.floor(img.height * scale));

    const c = document.createElement("canvas");
    c.width=w; c.height=h;
    const ctx=c.getContext("2d", {willReadFrequently:true});
    ctx.drawImage(img,0,0,w,h);

    // optional blur (cheap box blur)
    let imgData = ctx.getImageData(0,0,w,h);
    if(Number(d.blur||0) > 0){
      imgData = boxBlurImageData(imgData, Math.floor(Number(d.blur||0)));
      ctx.putImageData(imgData,0,0);
      imgData = ctx.getImageData(0,0,w,h);
    }

    node.runtime.imgSmall = {w,h,data:imgData.data};

    // Build heightmap mesh (relief on bed)
    const widthMM = Math.max(10, Number(d.widthMM||120));
    const aspect = h / Math.max(1, w);
    const heightMM = widthMM * aspect;

    const tMin = Number(d.thicknessMin||0.6);
    const tMax = Math.max(tMin+0.01, Number(d.thicknessMax||3.2));
    const gamma = Math.max(0.1, Number(d.gamma||1.6));
    const inv = !!d.invert;

    const tris=[];
    const dx = widthMM/(w-1);
    const dy = heightMM/(h-1);

    // Center on (0,0)
    const ox = -widthMM*0.5;
    const oy = -heightMM*0.5;

    // Precompute z grid
    const Z = new Float32Array(w*h);
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const i=(y*w+x)*4;
        const r=imgData.data[i], g=imgData.data[i+1], b=imgData.data[i+2];
        let L=(0.2126*r + 0.7152*g + 0.0722*b)/255; // 0..1
        if(inv) L=1-L;
        // darker => thicker
        const v = Math.pow(clamp(1-L,0,1), gamma);
        const z = tMin + v*(tMax - tMin);
        Z[y*w+x]=z;
      }
    }

    // Triangulate grid
    for(let y=0;y<h-1;y++){
      for(let x=0;x<w-1;x++){
        const x0 = ox + x*dx;
        const y0 = oy + y*dy;
        const x1 = ox + (x+1)*dx;
        const y1 = oy + (y+1)*dy;

        const z00 = Z[y*w+x];
        const z10 = Z[y*w+(x+1)];
        const z01 = Z[(y+1)*w+x];
        const z11 = Z[(y+1)*w+(x+1)];

        // tri1: (x0,y0,z00) (x1,y0,z10) (x0,y1,z01)
        tris.push(x0,y0,z00,  x1,y0,z10,  x0,y1,z01);
        // tri2: (x1,y0,z10) (x1,y1,z11) (x0,y1,z01)
        tris.push(x1,y0,z10,  x1,y1,z11,  x0,y1,z01);
      }
    }

    const arr = new Float32Array(tris);
    const mesh = { tris: arr, triCount: Math.floor(arr.length/9), bounds: computeMeshBounds(arr), index:null };
    // keep on bed
    const aligned = bedAlignMesh(mesh);
    node.runtime.mesh = aligned;

    saveState();
    markDirtyAuto();
    drawPreviewCb && drawPreviewCb();
    toast("Image processed → relief mesh ready.");
  };
  img.onerror = (e)=>{
    console.error(e);
    toast("Failed to load image.");
    node.runtime.mesh=null;
    node.runtime.imgObj=null;
    node.runtime.imgSmall=null;
    drawPreviewCb && drawPreviewCb();
  };
  img.src = d.imgB64;
}

function boxBlurImageData(imgData, radius){
  const r = Math.max(0, Math.min(12, radius|0));
  if(r<=0) return imgData;
  const {width:w, height:h, data:src} = imgData;
  const dst = new Uint8ClampedArray(src.length);
  const tmp = new Uint8ClampedArray(src.length);

  // horizontal
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      let rs=0,gs=0,bs=0,as=0, cnt=0;
      for(let k=-r;k<=r;k++){
        const xx = Math.max(0, Math.min(w-1, x+k));
        const i=(y*w+xx)*4;
        rs+=src[i]; gs+=src[i+1]; bs+=src[i+2]; as+=src[i+3]; cnt++;
      }
      const o=(y*w+x)*4;
      tmp[o]=rs/cnt; tmp[o+1]=gs/cnt; tmp[o+2]=bs/cnt; tmp[o+3]=as/cnt;
    }
  }
  // vertical
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      let rs=0,gs=0,bs=0,as=0, cnt=0;
      for(let k=-r;k<=r;k++){
        const yy = Math.max(0, Math.min(h-1, y+k));
        const i=(yy*w+x)*4;
        rs+=tmp[i]; gs+=tmp[i+1]; bs+=tmp[i+2]; as+=tmp[i+3]; cnt++;
      }
      const o=(y*w+x)*4;
      dst[o]=rs/cnt; dst[o+1]=gs/cnt; dst[o+2]=bs/cnt; dst[o+3]=as/cnt;
    }
  }
  return new ImageData(dst, w, h);
}

function parseSTL(arrayBuffer){
  // Detect binary STL by expected size
  if(arrayBuffer.byteLength >= 84){
    const dv = new DataView(arrayBuffer);
    const triCount = dv.getUint32(80, true);
    const expected = 84 + triCount * 50;
    if(expected === arrayBuffer.byteLength && triCount > 0){
      const tris = new Float32Array(triCount * 9);
      let off = 84;
      for(let t=0;t<triCount;t++){
        off += 12; // normal
        for(let v=0; v<9; v++){
          tris[t*9 + v] = dv.getFloat32(off, true);
          off += 4;
        }
        off += 2; // attr
      }
      const bounds = computeMeshBounds(tris);
      return { tris, triCount, bounds, index:null };
    }
  }
  // ASCII STL
  const u8 = new Uint8Array(arrayBuffer);
  const text = new TextDecoder().decode(u8);
  const reV = /vertex\s+([-+0-9eE\.]+)\s+([-+0-9eE\.]+)\s+([-+0-9eE\.]+)/g;
  const arr = [];
  let m;
  while((m = reV.exec(text))){
    arr.push(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  const triCount = Math.floor(arr.length / 9);
  if(triCount <= 0) throw new Error("STL parse failed (no vertices found).");
  const tris = new Float32Array(arr.slice(0, triCount*9));
  const bounds = computeMeshBounds(tris);
  return { tris, triCount, bounds, index:null };
}

function meshToObjectURL_GLb(mesh){
  // Converts our mesh (tris Float32Array of xyz xyz xyz...) into a minimal GLB for <model-viewer>.
  // Note: this outputs the mesh only (no toolpath).
  try{
    if(preview.mvUrl){ try{ URL.revokeObjectURL(preview.mvUrl); }catch(_){ } preview.mvUrl=""; }
  }catch(_){}
  const tris = meshToTris(mesh) || new Float32Array(0);
  const triCount = Math.floor(tris.length/9);
  const maxTris = 60000;
  const step = triCount > maxTris ? Math.ceil(triCount/maxTris) : 1;

  const vCount = Math.floor(triCount/step) * 3;
  const pos = new Float32Array(vCount*3);
  const nor = new Float32Array(vCount*3);

  let pMin = [Infinity,Infinity,Infinity];
  let pMax = [-Infinity,-Infinity,-Infinity];

  let vi=0;
  for(let ti=0; ti<triCount; ti+=step){
    const o = ti*9;
    const ax=tris[o+0], ay=tris[o+1], az=tris[o+2];
    const bx=tris[o+3], by=tris[o+4], bz=tris[o+5];
    const cx=tris[o+6], cy=tris[o+7], cz=tris[o+8];

    // normal (flat)
    const ux=bx-ax, uy=by-ay, uz=bz-az;
    const vx=cx-ax, vy=cy-ay, vz=cz-az;
    let nx=uy*vz - uz*vy;
    let ny=uz*vx - ux*vz;
    let nz=ux*vy - uy*vx;
    const nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
    nx/=nl; ny/=nl; nz/=nl;

    const pts = [[ax,ay,az],[bx,by,bz],[cx,cy,cz]];
    for(let k=0;k<3;k++){
      const x=pts[k][0], y=pts[k][1], z=pts[k][2];
      pos[vi*3+0]=x; pos[vi*3+1]=y; pos[vi*3+2]=z;
      nor[vi*3+0]=nx; nor[vi*3+1]=ny; nor[vi*3+2]=nz;
      if(x<pMin[0]) pMin[0]=x; if(y<pMin[1]) pMin[1]=y; if(z<pMin[2]) pMin[2]=z;
      if(x>pMax[0]) pMax[0]=x; if(y>pMax[1]) pMax[1]=y; if(z>pMax[2]) pMax[2]=z;
      vi++;
    }
  }

  // Build GLB
  const json = {
    asset:{version:"2.0", generator:"G-code Studio"},
    scenes:[{nodes:[0]}],
    nodes:[{mesh:0}],
    meshes:[{primitives:[{attributes:{POSITION:0, NORMAL:1}}]}],
    buffers:[{byteLength:0}],
    bufferViews:[],
    accessors:[]
  };

  // binary layout: positions then normals, each 4-byte aligned
  const posBytes = pos.byteLength;
  const norBytes = nor.byteLength;
  const pad4 = (n)=> (n + 3) & ~3;
  const posOff = 0;
  const norOff = pad4(posBytes);
  const binLen = pad4(norOff + norBytes);

  json.buffers[0].byteLength = binLen;
  json.bufferViews.push({buffer:0, byteOffset:posOff, byteLength:posBytes, target:34962});
  json.bufferViews.push({buffer:0, byteOffset:norOff, byteLength:norBytes, target:34962});

  json.accessors.push({
    bufferView:0, byteOffset:0, componentType:5126, count:vCount, type:"VEC3",
    min:[pMin[0],pMin[1],pMin[2]], max:[pMax[0],pMax[1],pMax[2]]
  });
  json.accessors.push({
    bufferView:1, byteOffset:0, componentType:5126, count:vCount, type:"VEC3"
  });

  const jsonStr = JSON.stringify(json);
  const enc = new TextEncoder();
  const jsonBuf = enc.encode(jsonStr);
  const jsonPad = pad4(jsonBuf.byteLength);
  const jsonChunk = new Uint8Array(jsonPad);
  jsonChunk.set(jsonBuf);
  for(let i=jsonBuf.byteLength;i<jsonPad;i++) jsonChunk[i]=0x20; // spaces

  const binChunk = new Uint8Array(binLen);
  binChunk.set(new Uint8Array(pos.buffer), posOff);
  binChunk.set(new Uint8Array(nor.buffer), norOff);
  // remaining already 0

  const totalLen = 12 + 8 + jsonChunk.byteLength + 8 + binChunk.byteLength;

  const out = new ArrayBuffer(totalLen);
  const dv = new DataView(out);
  let off=0;
  // header
  dv.setUint32(off, 0x46546C67, true); off+=4; // 'glTF'
  dv.setUint32(off, 2, true); off+=4;
  dv.setUint32(off, totalLen, true); off+=4;
  // JSON chunk header
  dv.setUint32(off, jsonChunk.byteLength, true); off+=4;
  dv.setUint32(off, 0x4E4F534A, true); off+=4; // 'JSON'
  new Uint8Array(out, off, jsonChunk.byteLength).set(jsonChunk); off += jsonChunk.byteLength;
  // BIN chunk header
  dv.setUint32(off, binChunk.byteLength, true); off+=4;
  dv.setUint32(off, 0x004E4942, true); off+=4; // 'BIN\0'
  new Uint8Array(out, off, binChunk.byteLength).set(binChunk); off += binChunk.byteLength;

  const blob = new Blob([out], {type:"model/gltf-binary"});
  const url = URL.createObjectURL(blob);
  preview.mvUrl = url;
  return url;
}



/* ---------------------------
   Orca preset import (.orca_printer / .orca_filament)
---------------------------- */
function isZipArrayBuffer(ab){
  if(!ab || ab.byteLength<4) return false;
  const u8 = new Uint8Array(ab,0,4);
  return u8[0]===0x50 && u8[1]===0x4B && (u8[2]===0x03||u8[2]===0x05||u8[2]===0x07) && (u8[3]===0x04||u8[3]===0x06||u8[3]===0x08);
}
async function inflateRawBytes(u8){
  if(typeof DecompressionStream==="undefined") throw new Error("This browser can't unzip (no DecompressionStream).");
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([u8]).stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}
function readU16(dv, off){ return dv.getUint16(off,true); }
function readU32(dv, off){ return dv.getUint32(off,true); }

async function unzipArrayBuffer(ab){
  const dv = new DataView(ab);
  const u8 = new Uint8Array(ab);
  const SIG_EOCD = 0x06054b50;
  let eocd = -1;
  const maxBack = Math.min(u8.length-22, 0xFFFF + 22);
  for(let i=u8.length-22; i>=u8.length-maxBack; i--){
    if(readU32(dv,i)===SIG_EOCD){ eocd=i; break; }
  }
  if(eocd<0) throw new Error("ZIP: EOCD not found");
  const cdCount = readU16(dv, eocd+10);
  const cdOff  = readU32(dv, eocd+16);
  const out = {};
  const td = new TextDecoder("utf-8");
  let p = cdOff;
  const SIG_CDFH = 0x02014b50;
  const SIG_LFH  = 0x04034b50;

  for(let i=0;i<cdCount;i++){
    if(readU32(dv,p)!==SIG_CDFH) throw new Error("ZIP: bad central directory header");
    const method = readU16(dv,p+10);
    const compSize = readU32(dv,p+20);
    const nameLen = readU16(dv,p+28);
    const extraLen = readU16(dv,p+30);
    const cmtLen = readU16(dv,p+32);
    const lfhOff = readU32(dv,p+42);
    const nameBytes = u8.slice(p+46, p+46+nameLen);
    const name = td.decode(nameBytes);
    p = p + 46 + nameLen + extraLen + cmtLen;
    if(name.endsWith("/")) continue;

    if(readU32(dv,lfhOff)!==SIG_LFH) throw new Error("ZIP: bad local header");
    const lNameLen = readU16(dv, lfhOff+26);
    const lExtraLen = readU16(dv, lfhOff+28);
    const dataOff = lfhOff + 30 + lNameLen + lExtraLen;
    const comp = u8.slice(dataOff, dataOff + compSize);

    let raw;
    if(method===0){
      raw = comp;
    }else if(method===8){
      raw = await inflateRawBytes(comp);
    }else{
      continue; // unsupported
    }
    out[name] = raw;
  }
  return out;
}

/* ---------------------------
   OrcaSlicer preset import (bundles → profile)
   Notes:
   - This is an idea-driven importer (not Orca code).
   - Supports: .orca_printer, .orca_filament, .zip (Orca config bundles), and raw .json.
---------------------------- */
function ensureOrcaStore(){
  if(!ensureOrcaStore.loaded){
    ensureOrcaStore.loaded = true;
    try{
      const raw = localStorage.getItem("gcodeStudio_orcaProfiles_v1");
      if(raw){
        const obj = JSON.parse(raw);
        if(obj && typeof obj === "object"){
          state.orca = { printers:[], filaments:[], processes:[], files:{}, lastImported:"", ...obj };
        }
      }
    }catch(_){}
  }
  if(!state.orca) state.orca = { printers:[], filaments:[], processes:[], files:{}, lastImported:"" };
  if(!state.orca.files || typeof state.orca.files!=="object") state.orca.files = {};
  state.orca.printers  = Array.isArray(state.orca.printers)  ? state.orca.printers  : [];
  state.orca.filaments = Array.isArray(state.orca.filaments) ? state.orca.filaments : [];
  state.orca.processes = Array.isArray(state.orca.processes) ? state.orca.processes : [];
  return state.orca;
}
ensureOrcaStore.loaded = false;

function orcaFirst(list, id){
  if(!Array.isArray(list) || !list.length) return null;
  if(id){
    const hit = list.find(e=>e.id===id);
    if(hit) return hit;
  }
  return list[0];
}
function upsertOrcaEntry(list, entry){
  if(!entry || !entry.id) return;
  const i = list.findIndex(e=>e.id===entry.id);
  if(i>=0) list[i]=entry;
  else list.push(entry);
}

function safeJsonParse(text){
  try{ return JSON.parse(text); }catch(_){ return null; }
}
function guessOrcaType(obj){
  const t = String(obj?.type||obj?.profile_type||obj?.preset_type||"").toLowerCase();
  if(t.includes("filament")) return "filament";
  if(t.includes("process")) return "process";
  if(t.includes("machine") || t.includes("printer")) return "machine";
  // heuristic fallback
  if(obj?.filament_diameter || obj?.temperature || obj?.filament_type) return "filament";
  if(obj?.infill_density || obj?.layer_height || obj?.perimeter_speed) return "process";
  if(obj?.nozzle_diameter || obj?.printable_area || obj?.machine_start_gcode) return "machine";
  return "unknown";
}
function parseOrcaProfileJson(obj, idHint){
  const id = String(obj?.id || obj?.internal_id || obj?.uuid || idHint || ("orca_"+Math.random().toString(16).slice(2)));
  const name = String(obj?.name || obj?.preset_name || obj?.display_name || id);
  const type = guessOrcaType(obj);
  return { id, name, type, obj };
}

async function importOrcaFile(file){
  const orca = ensureOrcaStore();
  const ab = await file.arrayBuffer();
  const name = file.name || "import";
  const td = new TextDecoder("utf-8");

  const consume = (id, text)=>{
    const obj = safeJsonParse(text);
    if(!obj) return;
    const entry = parseOrcaProfileJson(obj, id);
    if(entry.type==="machine" || entry.type==="machine_model") upsertOrcaEntry(orca.printers, entry);
    else if(entry.type==="filament") upsertOrcaEntry(orca.filaments, entry);
    else if(entry.type==="process") upsertOrcaEntry(orca.processes, entry);
    orca.files[id]=text;
  };

  if(isZipArrayBuffer(ab)){
    const entries = await unzipArrayBuffer(ab); // {name: Uint8Array}
    for(const [fname, raw] of Object.entries(entries)){
      const low = fname.toLowerCase();
      if(!(low.endsWith(".json") || low.endsWith(".orca_printer") || low.endsWith(".orca_filament"))) continue;
      consume(fname, td.decode(raw));
    }
    orca.lastImported = name;
    return;
  }

  consume(name, td.decode(new Uint8Array(ab)));
  orca.lastImported = name;
}

async function importOrcaFilesFromInput(fileList){
  const files = Array.from(fileList||[]);
  if(!files.length) return;
  const orca = ensureOrcaStore();
  setStatus("Importing Orca presets…");
  try{
    for(const f of files) await importOrcaFile(f);
    try{ localStorage.setItem("gcodeStudio_orcaProfiles_v1", JSON.stringify(orca)); }catch(_){}
    try{ if(typeof saveState === "function") saveState(); }catch(_){}
    setStatus(`Imported Orca presets • printers:${orca.printers.length} filaments:${orca.filaments.length} processes:${orca.processes.length}`);
    toast("Orca presets imported");
  }catch(e){
    setStatus("Import error");
    toast(String(e?.message||e), "error");
    console.warn(e);
  }
}

function getOrcaNum(obj, key, def=null){
  const v = obj?.[key];
  const n = (typeof v==="number") ? v : (typeof v==="string" ? Number(v) : NaN);
  return isFinite(n) ? n : def;
}
function getOrcaStr(obj, key, def=""){
  const v = obj?.[key];
  return (v==null) ? def : String(v);
}
function parsePrintableArea(area){
  if(!Array.isArray(area) || area.length<3) return null;
  let minx=Infinity, miny=Infinity, maxx=-Infinity, maxy=-Infinity;
  for(const p of area){
    if(!Array.isArray(p) || p.length<2) continue;
    minx=Math.min(minx, +p[0]); miny=Math.min(miny, +p[1]);
    maxx=Math.max(maxx, +p[0]); maxy=Math.max(maxy, +p[1]);
  }
  if(!isFinite(minx) || !isFinite(maxx)) return null;
  return { w: maxx-minx, d: maxy-miny, minx, miny, maxx, maxy };
}

function mapOrcaToPrinterProfile(machineObj, filamentObj, processObj, base){
  const p = {...base};
  p.name = getOrcaStr(machineObj, "name", p.name);

  const area = parsePrintableArea(machineObj?.printable_area);
  if(area){
    p.bedW = Math.round(area.w);
    p.bedD = Math.round(area.d);
    p.origin = "lowerleft";
    p.offsetX = 0;
    p.offsetY = 0;
  }
  const h = getOrcaNum(machineObj, "printable_height", null);
  if(h!=null) p.bedH = Math.round(h);

  const noz = getOrcaNum(machineObj, "nozzle_diameter", null);
  if(noz!=null) p.nozzle = noz;
  p.lineWidth = +(Math.max(0.2, (p.nozzle||0.4) * 1.125)).toFixed(3);

  const fd = getOrcaNum(filamentObj, "filament_diameter", null) ?? getOrcaNum(filamentObj, "filament_dia", null);
  if(fd!=null) p.filamentDia = fd;

  const tNoz = getOrcaNum(filamentObj, "temperature", null) ?? getOrcaNum(filamentObj, "nozzle_temperature", null);
  if(tNoz!=null) p.tempNozzle = Math.round(tNoz);
  const tBed = getOrcaNum(filamentObj, "bed_temperature", null);
  if(tBed!=null) p.tempBed = Math.round(tBed);

  const lh = getOrcaNum(processObj, "layer_height", null);
  if(lh!=null) p.layerHeight = lh;
  const ps = getOrcaNum(processObj, "print_speed", null) ?? getOrcaNum(processObj, "outer_wall_speed", null);
  if(ps!=null) p.printSpeed = ps;
  const ts = getOrcaNum(processObj, "travel_speed", null);
  if(ts!=null) p.travelSpeed = ts;

  const rlen = getOrcaNum(processObj, "retraction_length", null) ?? getOrcaNum(processObj, "retract_length", null);
  if(rlen!=null) p.retract = rlen;
  const rs = getOrcaNum(processObj, "retraction_speed", null) ?? getOrcaNum(processObj, "retract_speed", null);
  if(rs!=null) p.retractSpeed = rs;

  if(machineObj?.machine_start_gcode) p.startGcode = String(machineObj.machine_start_gcode);
  if(machineObj?.machine_end_gcode) p.endGcode = String(machineObj.machine_end_gcode);

  return p;
}



function applyMeshTransform(mesh, tf){
  const s = Number(tf.scale ?? 1);
  const rx = rad(Number(tf.rxDeg ?? 0));
  const ry = rad(Number(tf.ryDeg ?? 0));
  const rz = rad(Number(tf.rzDeg ?? 0));
  const tx = Number(tf.tx ?? 0);
  const ty = Number(tf.ty ?? 0);
  const tz = Number(tf.tz ?? 0);

  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);

  // Rotation matrix Rz * Ry * Rx
  const m00 = cz*cy;
  const m01 = cz*sy*sx - sz*cx;
  const m02 = cz*sy*cx + sz*sx;

  const m10 = sz*cy;
  const m11 = sz*sy*sx + cz*cx;
  const m12 = sz*sy*cx - cz*sx;

  const m20 = -sy;
  const m21 = cy*sx;
  const m22 = cy*cx;

  const src = mesh.tris;
  const dst = new Float32Array(src.length);
  for(let i=0;i<src.length;i+=3){
    const x = src[i]*s, y = src[i+1]*s, z = src[i+2]*s;
    const X = m00*x + m01*y + m02*z + tx;
    const Y = m10*x + m11*y + m12*z + ty;
    const Z = m20*x + m21*y + m22*z + tz;
    dst[i]=X; dst[i+1]=Y; dst[i+2]=Z;
  }
  const bounds = computeMeshBounds(dst);
  return { ...mesh, tris: dst, bounds, index:null };
}

function bedAlignMesh(mesh){
  if(!mesh || !mesh.tris) return mesh;
  const b = mesh.bounds || computeMeshBounds(mesh.tris);
  const minz = (b.minz!=null) ? b.minz : (b.min?.z ?? 0);
  if(!isFinite(minz) || Math.abs(minz) < 1e-9) return { ...mesh, bounds: b };
  return applyMeshTransform({ ...mesh, bounds: b }, {tx:0, ty:0, tz: -minz, scale:1, rxDeg:0, ryDeg:0, rzDeg:0});
}

function thinPath(path, maxPts=4500){
  const arr = Array.isArray(path) ? path : [];
  if(arr.length<=maxPts) return arr;
  const step = Math.max(1, Math.floor(arr.length / maxPts));
  const out = [];
  for(let i=0;i<arr.length;i+=step) out.push(arr[i]);
  return out;
}


function centerMesh(mesh, centerXY=true, zeroZMin=true){
  const b = mesh.bounds || computeMeshBounds(mesh.tris);
  const cx = (b.min.x + b.max.x) * 0.5;
  const cy = (b.min.y + b.max.y) * 0.5;
  const cz = b.min.z;
  const src = mesh.tris;
  const dst = new Float32Array(src.length);
  for(let i=0;i<src.length;i+=3){
    dst[i]   = src[i]   - (centerXY ? cx : 0);
    dst[i+1] = src[i+1] - (centerXY ? cy : 0);
    dst[i+2] = src[i+2] - (zeroZMin ? cz : 0);
  }
  const bounds = computeMeshBounds(dst);
  return { ...mesh, tris: dst, bounds, index:null };
}

function buildMeshIndex(mesh, cellSize=10){
  const tris = mesh.tris;
  const b = mesh.bounds || computeMeshBounds(tris);
  const minX=b.min.x, minY=b.min.y, maxX=b.max.x, maxY=b.max.y;
  const cs = Math.max(1e-6, Number(cellSize)||10);
  const nx = Math.max(1, Math.ceil((maxX-minX)/cs));
  const ny = Math.max(1, Math.ceil((maxY-minY)/cs));
  const cells = new Map();
  const triCount = Math.floor(tris.length/9);
  function key(ix,iy){ return (iy<<16) ^ ix; }

  for(let ti=0; ti<triCount; ti++){
    const o = ti*9;
    const x1=tris[o], y1=tris[o+1];
    const x2=tris[o+3], y2=tris[o+4];
    const x3=tris[o+6], y3=tris[o+7];
    let tminX=Math.min(x1,x2,x3), tmaxX=Math.max(x1,x2,x3);
    let tminY=Math.min(y1,y2,y3), tmaxY=Math.max(y1,y2,y3);
    const ix0 = clamp(Math.floor((tminX-minX)/cs), 0, nx-1);
    const ix1 = clamp(Math.floor((tmaxX-minX)/cs), 0, nx-1);
    const iy0 = clamp(Math.floor((tminY-minY)/cs), 0, ny-1);
    const iy1 = clamp(Math.floor((tmaxY-minY)/cs), 0, ny-1);
    for(let iy=iy0; iy<=iy1; iy++){
      for(let ix=ix0; ix<=ix1; ix++){
        const k=key(ix,iy);
        let arr=cells.get(k);
        if(!arr){ arr=[]; cells.set(k, arr); }
        arr.push(ti);
      }
    }
  }
  mesh.index = { cs, minX, minY, nx, ny, cells };
  return mesh;
}

function meshTopZ(mesh, x, y){
  const tris = mesh.tris;
  const idx = mesh.index;
  if(!idx) return null;
  const ix = clamp(Math.floor((x - idx.minX)/idx.cs), 0, idx.nx-1);
  const iy = clamp(Math.floor((y - idx.minY)/idx.cs), 0, idx.ny-1);
  const k = (iy<<16) ^ ix;
  const list = idx.cells.get(k);
  if(!list || !list.length) return null;
  let best = -Infinity;
  for(let li=0; li<list.length; li++){
    const ti = list[li];
    const o = ti*9;
    const x1=tris[o],   y1=tris[o+1], z1=tris[o+2];
    const x2=tris[o+3], y2=tris[o+4], z2=tris[o+5];
    const x3=tris[o+6], y3=tris[o+7], z3=tris[o+8];

    const denom = (y2 - y3)*(x1 - x3) + (x3 - x2)*(y1 - y3);
    if(Math.abs(denom) < 1e-12) continue;
    const a = ((y2 - y3)*(x - x3) + (x3 - x2)*(y - y3)) / denom;
    const b = ((y3 - y1)*(x - x3) + (x1 - x3)*(y - y3)) / denom;
    const c = 1 - a - b;
    if(a>=-1e-6 && b>=-1e-6 && c>=-1e-6){
      const z = a*z1 + b*z2 + c*z3;
      if(z > best) best = z;
    }
  }
  return isFinite(best) ? best : null;
}


function rotatedUVBounds(bounds, angRad){
  const ux = Math.cos(angRad), uy = Math.sin(angRad);
  const vx = -Math.sin(angRad), vy = Math.cos(angRad);
  const corners = [
    [bounds.min.x, bounds.min.y],
    [bounds.min.x, bounds.max.y],
    [bounds.max.x, bounds.min.y],
    [bounds.max.x, bounds.max.y],
  ];
  let umin=Infinity, umax=-Infinity, vmin=Infinity, vmax=-Infinity;
  for(const [x,y] of corners){
    const u = x*ux + y*uy;
    const v = x*vx + y*vy;
    if(u<umin) umin=u; if(u>umax) umax=u;
    if(v<vmin) vmin=v; if(v>vmax) vmax=v;
  }
  return {ux,uy,vx,vy,umin,umax,vmin,vmax};
}

function surfaceRasterPath(mesh, opts, layerHeightHint=0.2, maxPtsOverride=null){
  const b = mesh.bounds || computeMeshBounds(mesh.tris);
  const ang = (Number(opts.angleDeg||0) * Math.PI/180);
  const uv = rotatedUVBounds(b, ang);
  const margin = Number(opts.margin||0);
  let u0 = uv.umin + margin, u1 = uv.umax - margin;
  let v0 = uv.vmin + margin, v1 = uv.vmax - margin;
  if(u1 < u0){ const t=u0; u0=u1; u1=t; }
  if(v1 < v0){ const t=v0; v0=v1; v1=t; }

  const spacing = Math.max(0.05, Number(opts.spacing||1.0));
  const step = Math.max(0.05, Number(opts.step||0.5));
  const zOff = Number(opts.zOffset||0);
  const serp = (opts.serpentine !== false);
  const maxPts = Math.max(1000, Number(maxPtsOverride ?? opts.maxPoints ?? 180000));

  const out = [];
  let reverse = false;

  // Ensure mesh has an index for meshTopZ
  if(!mesh.index) buildMeshIndex(mesh, Number(opts.cellSize||10));

  const mkPt = (x,y,z, travel=false)=>({
    x,y,z,
    meta: { layerHeight: layerHeightHint, travel }
  });

  let v = v0;
  while(v <= v1 + 1e-9){
    // sample one scanline
    const line = [];
    for(let u=u0; u <= u1 + 1e-9; u += step){
      const x = u*uv.ux + v*uv.vx;
      const y = u*uv.uy + v*uv.vy;
      const z = meshTopZ(mesh, x, y);
      if(z==null || !isFinite(z)) line.push(null);
      else line.push([x,y,z+zOff]);
      if(line.length > 300000) break;
    }
    if(serp && reverse) line.reverse();

    // split into contiguous segments where z is defined
    let seg = [];
    const flushSeg = ()=>{
      if(seg.length >= 2){
        // travel to first point if not the very first segment overall
        if(out.length){
          const [x0,y0,z0] = seg[0];
          out.push(mkPt(x0,y0,z0,true));
          for(let k=1;k<seg.length;k++){
            const [x,y,z] = seg[k];
            out.push(mkPt(x,y,z,false));
          }
        } else {
          for(let k=0;k<seg.length;k++){
            const [x,y,z] = seg[k];
            out.push(mkPt(x,y,z,false));
          }
        }
      }
      seg = [];
    };

    for(let i=0;i<line.length;i++){
      const p = line[i];
      if(p) seg.push(p);
      else flushSeg();
      if(out.length >= maxPts) break;
    }
    flushSeg();
    if(out.length >= maxPts) break;

    reverse = !reverse;
    v += spacing;
  }

  return out;
}


function drawWireframe2D(canvas, tris, bounds, rot=0, path=null){
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);
  if(!tris || tris.length<9 || !bounds) return;

  const cx = (bounds.min.x + bounds.max.x)*0.5;
  const cy = (bounds.min.y + bounds.max.y)*0.5;
  const cz = (bounds.min.z + bounds.max.z)*0.5;
  const sx = Math.sin(rot*0.9), cxr = Math.cos(rot*0.9);
  const sy = Math.sin(rot), cyr = Math.cos(rot);

  const triCount = Math.floor(tris.length/9);
  const stepTri = triCount > 1200 ? Math.ceil(triCount/1200) : 1;

  function proj(ix){
    const x0 = tris[ix]-cx, y0 = tris[ix+1]-cy, z0 = tris[ix+2]-cz;
    const x1 = cyr*x0 + sy*z0;
    const z1 = -sy*x0 + cyr*z0;
    const y2 = cxr*y0 - sx*z1;
    const z2 = sx*y0 + cxr*z1;
    const p = 1/(1 + z2*0.008);
    return [x1*p, y2*p];
  }

  let minPX=Infinity,minPY=Infinity,maxPX=-Infinity,maxPY=-Infinity;
  for(let ti=0; ti<triCount; ti+=stepTri){
    const o=ti*9;
    const A=proj(o), B=proj(o+3), C=proj(o+6);
    for(const P of [A,B,C]){
      if(P[0]<minPX) minPX=P[0]; if(P[1]<minPY) minPY=P[1];
      if(P[0]>maxPX) maxPX=P[0]; if(P[1]>maxPY) maxPY=P[1];
    }
  }
  const midX=(minPX+maxPX)*0.5, midY=(minPY+maxPY)*0.5;
  const spanX = Math.max(1e-6, maxPX-minPX);
  const spanY = Math.max(1e-6, maxPY-minPY);
  const s = Math.min(w/spanX, h/spanY) * 0.86;
  const ox = w*0.5, oy = h*0.54;

  const stroke = getComputedStyle(document.body).getPropertyValue("--text").trim() || "#fff";
  ctx.strokeStyle = stroke;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;

  ctx.beginPath();
  for(let ti=0; ti<triCount; ti+=stepTri){
    const o=ti*9;
    const A=proj(o), B=proj(o+3), C=proj(o+6);
    const ax = ox + (A[0]-midX) * s;
    const ay = oy - (A[1]-midY) * s;
    const bx = ox + (B[0]-midX) * s;
    const by = oy - (B[1]-midY) * s;
    const cx2= ox + (C[0]-midX) * s;
    const cy2= oy - (C[1]-midY) * s;
    ctx.moveTo(ax,ay); ctx.lineTo(bx,by);
    ctx.lineTo(cx2,cy2); ctx.lineTo(ax,ay);
  }
  ctx.stroke();
// optional path overlay (supports travel breaks)
if(path && path.length){
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for(let i=0;i<path.length;i++){
    const p = path[i];
    if(!p) continue;
    const P = projPoint(Number(p.x||0), Number(p.y||0), Number(p.z||0));
    const px = ox + (P[0]-midX) * s;
    const py = oy - (P[1]-midY) * s;
    const travel = !!(p.meta && p.meta.travel);
    if(i===0 || travel) ctx.moveTo(px,py);
    else ctx.lineTo(px,py);
  }
  const accent = getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#33ff88";
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.restore();
}
  ctx.globalAlpha = 1;
}

function drawMeshPreview2D(canvas, tris, bounds, rot=0, path=null, mode="wireframe"){
  mode = (mode||"wireframe").toLowerCase();
  if(mode==="wire" || mode==="wireframe") return drawWireframe2D(canvas, tris, bounds, rot, path);

  function clamp01(v){ return v<0?0:(v>1?1:v); }

  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);
  if(!tris || tris.length<9 || !bounds) return;

  const cx = (bounds.min.x + bounds.max.x)*0.5;
  const cy = (bounds.min.y + bounds.max.y)*0.5;
  const cz = (bounds.min.z + bounds.max.z)*0.5;
  const sx = Math.sin(rot*0.9), cxr = Math.cos(rot*0.9);
  const sy = Math.sin(rot), cyr = Math.cos(rot);

  const triCount = Math.floor(tris.length/9);
  const stepTri = triCount > 2400 ? Math.ceil(triCount/2400) : 1;

  function projPoint(x,y,z){
    const x0=x-cx, y0=y-cy, z0=z-cz;
    const x1 = cyr*x0 + sy*z0;
    const z1 = -sy*x0 + cyr*z0;
    const y2 = cxr*y0 - sx*z1;
    const z2 = sx*y0 + cxr*z1;
    return [x1,y2,z2];
  }

  // compute projected bounds for scaling
  let minPX=1e9,minPY=1e9,maxPX=-1e9,maxPY=-1e9;
  for(let ti=0; ti<triCount; ti+=stepTri){
    const o=ti*9;
    const A=projPoint(tris[o],tris[o+1],tris[o+2]);
    const B=projPoint(tris[o+3],tris[o+4],tris[o+5]);
    const C=projPoint(tris[o+6],tris[o+7],tris[o+8]);
    for(const P of [A,B,C]){
      if(P[0]<minPX) minPX=P[0]; if(P[1]<minPY) minPY=P[1];
      if(P[0]>maxPX) maxPX=P[0]; if(P[1]>maxPY) maxPY=P[1];
    }
  }
  const midX=(minPX+maxPX)*0.5, midY=(minPY+maxPY)*0.5;
  const spanX = Math.max(1e-6, maxPX-minPX);
  const spanY = Math.max(1e-6, maxPY-minPY);
  const s = Math.min(w/spanX, h/spanY) * 0.86;
  const ox = w*0.5, oy = h*0.54;

  // Build triangles with depth for painter sort
  const tris2 = [];
  for(let ti=0; ti<triCount; ti+=stepTri){
    const o=ti*9;
    const A=projPoint(tris[o],tris[o+1],tris[o+2]);
    const B=projPoint(tris[o+3],tris[o+4],tris[o+5]);
    const C=projPoint(tris[o+6],tris[o+7],tris[o+8]);

    const ax = ox + (A[0]-midX)*s, ay = oy - (A[1]-midY)*s;
    const bx = ox + (B[0]-midX)*s, by = oy - (B[1]-midY)*s;
    const cx2 = ox + (C[0]-midX)*s, cy2 = oy - (C[1]-midY)*s;

    // simple normal in camera space for shading
    const ux=B[0]-A[0], uy=B[1]-A[1], uz=B[2]-A[2];
    const vx=C[0]-A[0], vy=C[1]-A[1], vz=C[2]-A[2];
    const nx = uy*vz - uz*vy;
    const ny = uz*vx - ux*vz;
    const nz = ux*vy - uy*vx;
    const nl = Math.max(1e-6, Math.hypot(nx,ny,nz));
    // light from top-right-front
    const lx=0.45, ly=0.65, lz=0.62;
    const ndotl = (nx/lk(nl))*lx + (ny/lk(nl))*ly + (nz/lk(nl))*lz;
    const shade = clamp01(0.35 + 0.65*(ndotl*0.5+0.5));

    const zAvg = (A[2]+B[2]+C[2])/3;
    tris2.push({ax,ay,bx,by,cx:cx2,cy:cy2,z:zAvg,shade});
  }
  function lk(n){ return n; } // tiny helper to keep minified-like structure

  tris2.sort((a,b)=> a.z - b.z); // back to front

  const accent = getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#33ff88";
  const stroke = getComputedStyle(document.body).getPropertyValue("--text").trim() || "#fff";

  if(mode==="points"){
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = stroke;
    for(const t of tris2){
      ctx.fillRect(t.ax, t.ay, 1, 1);
      ctx.fillRect(t.bx, t.by, 1, 1);
      ctx.fillRect(t.cx, t.cy, 1, 1);
    }
  }else{
    // solid / shaded
    for(const t of tris2){
      ctx.beginPath();
      ctx.moveTo(t.ax,t.ay);
      ctx.lineTo(t.bx,t.by);
      ctx.lineTo(t.cx,t.cy);
      ctx.closePath();

      if(mode==="solid"){
        ctx.fillStyle = `rgba(255,255,255,${0.10 + 0.22*t.shade})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,0.10)`;
        ctx.stroke();
      }else{ // shaded
        ctx.fillStyle = `rgba(255,255,255,${0.08 + 0.30*t.shade})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(0,0,0,0.10)`;
        ctx.stroke();
      }
    }
  }

  // optional path overlay
  if(path && path.length){
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for(let i=0;i<path.length;i++){
      const p = path[i];
      if(!p) continue;
      const P = projPoint(Number(p.x||0), Number(p.y||0), Number(p.z||0));
      const px = ox + (P[0]-midX) * s;
      const py = oy - (P[1]-midY) * s;
      const travel = !!(p.meta && p.meta.travel);
      if(i===0 || travel) ctx.moveTo(px,py);
      else ctx.lineTo(px,py);
    }
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}




/* ---------------------------
   Node definitions (same as v2, unchanged)
---------------------------- */
/* ---------------------------
   Slicing utilities (MVP planar slicer)
   - Intersects mesh triangles with Z planes
   - Stitches segments into loops
   - Generates walls + infill + top/bottom as a single path with meta.role
---------------------------- */
function triPlaneZSegments(tris, z, eps=1e-9){
  const segs = [];
  for(let i=0;i<tris.length;i+=9){
    const ax=tris[i],   ay=tris[i+1], az=tris[i+2];
    const bx=tris[i+3], by=tris[i+4], bz=tris[i+5];
    const cx=tris[i+6], cy=tris[i+7], cz=tris[i+8];

    // Quick reject if all on one side
    const minz = Math.min(az,bz,cz);
    const maxz = Math.max(az,bz,cz);
    if(z < minz-eps || z > maxz+eps) continue;

    const pts = [];
    function edge(px,py,pz, qx,qy,qz){
      const dz = qz - pz;
      if(Math.abs(dz) < eps){
        // Edge nearly parallel to plane: ignore (handled by other edges)
        return;
      }
      const t = (z - pz) / dz;
      if(t >= -eps && t <= 1+eps){
        const x = px + (qx-px)*t;
        const y = py + (qy-py)*t;
        pts.push([x,y]);
      }
    }
    edge(ax,ay,az, bx,by,bz);
    edge(bx,by,bz, cx,cy,cz);
    edge(cx,cy,cz, ax,ay,az);

    if(pts.length >= 2){
      // keep two most distinct points
      let p0=pts[0], p1=pts[1];
      if(pts.length>2){
        // pick farthest pair
        let best=[p0,p1], bestD=-1;
        for(let a=0;a<pts.length;a++){
          for(let b=a+1;b<pts.length;b++){
            const dx=pts[a][0]-pts[b][0], dy=pts[a][1]-pts[b][1];
            const d=dx*dx+dy*dy;
            if(d>bestD){ bestD=d; best=[pts[a],pts[b]]; }
          }
        }
        p0=best[0]; p1=best[1];
      }
      const dx=p0[0]-p1[0], dy=p0[1]-p1[1];
      if((dx*dx+dy*dy) > 1e-12){
        segs.push([p0[0],p0[1], p1[0],p1[1]]);
      }
    }
  }
  return segs;
}

function _keyXY(x,y, q=1e-4){
  const kx = Math.round(x/q);
  const ky = Math.round(y/q);
  return kx + "," + ky;
}

function stitchSegmentsToLoops(segs, q=1e-4){
  // Build adjacency map endpoint-> list of segment indices + which end
  const adj = new Map();
  const used = new Array(segs.length).fill(false);
  function add(key, idx, end){
    if(!adj.has(key)) adj.set(key, []);
    adj.get(key).push([idx,end]);
  }
  for(let i=0;i<segs.length;i++){
    const s=segs[i];
    const k0=_keyXY(s[0],s[1],q);
    const k1=_keyXY(s[2],s[3],q);
    add(k0,i,0); add(k1,i,1);
  }

  const loops = [];
  for(let i=0;i<segs.length;i++){
    if(used[i]) continue;
    used[i]=true;
    const s=segs[i];
    // Start polyline from s[0]->s[1]
    let pts=[[s[0],s[1]],[s[2],s[3]]];
    let endKey=_keyXY(s[2],s[3],q);
    const startKey=_keyXY(s[0],s[1],q);

    let guard=0;
    while(guard++ < 20000){
      if(endKey === startKey) break;
      const options = adj.get(endKey) || [];
      let picked=null;
      for(const [si,end] of options){
        if(used[si]) continue;
        picked=[si,end]; break;
      }
      if(!picked) break;
      const [si,end] = picked;
      used[si]=true;
      const ss=segs[si];
      // If we arrived at endpoint 'end', we need to append the opposite endpoint
      const nx = (end===0)? ss[2] : ss[0];
      const ny = (end===0)? ss[3] : ss[1];
      pts.push([nx,ny]);
      endKey=_keyXY(nx,ny,q);
    }

    // close if last matches first
    const dx=pts[0][0]-pts[pts.length-1][0];
    const dy=pts[0][1]-pts[pts.length-1][1];
    const closed = (dx*dx+dy*dy) <= (q*q*4);
    if(closed && pts.length>=4){
      // normalize closure
      pts[pts.length-1]=pts[0];
      loops.push(pts);
    }
  }
  return loops;
}

function polyArea2D(pts){
  // pts assumed closed or open; handle both
  let a=0;
  const n=pts.length;
  for(let i=0;i<n-1;i++){
    const p=pts[i], q=pts[i+1];
    a += p[0]*q[1] - q[0]*p[1];
  }
  return a*0.5;
}
function polyCentroid2D(pts){
  const n = pts.length;
  let cx = 0, cy = 0;
  let area = 0;
  for(let i=0;i<n-1;i++){
    const p = pts[i], q = pts[i+1];
    const cross = p[0]*q[1] - q[0]*p[1];
    cx += (p[0] + q[0]) * cross;
    cy += (p[1] + q[1]) * cross;
    area += cross;
  }
  area *= 0.5;
  if(Math.abs(area) < 1e-9) return pts[0] ? [pts[0][0], pts[0][1]] : [0,0];
  const f = 1 / (6 * area);
  return [cx * f, cy * f];
}
function polyBounds2D(pts){
  let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  for(const p of pts){
    minx=Math.min(minx,p[0]); miny=Math.min(miny,p[1]);
    maxx=Math.max(maxx,p[0]); maxy=Math.max(maxy,p[1]);
  }
  return {minx,miny,maxx,maxy};
}
function pointInPoly(pt, poly){
  let inside = false;
  for(let i=0, j=poly.length-1; i<poly.length; j=i++){
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > pt[1]) !== (yj > pt[1]))
      && (pt[0] < (xj - xi) * (pt[1] - yi) / ((yj - yi) || 1e-9) + xi);
    if(intersect) inside = !inside;
  }
  return inside;
}

function normalizeLoopClosed(loop, eps=1e-6){
  if(!loop || loop.length < 3) return null;
  const pts = loop.map(p=>[Number(p[0]), Number(p[1])]);
  if(pts.length < 3) return null;
  const out=[pts[0]];
  for(let i=1;i<pts.length;i++){
    const p = pts[i];
    const prev = out[out.length-1];
    const dx = p[0]-prev[0], dy = p[1]-prev[1];
    if(dx*dx + dy*dy > eps*eps) out.push(p);
  }
  if(out.length < 3) return null;
  const first = out[0];
  const last = out[out.length-1];
  const dx = first[0]-last[0], dy = first[1]-last[1];
  if(dx*dx + dy*dy > eps*eps) out.push([first[0], first[1]]);
  else out[out.length-1] = [first[0], first[1]];
  if(out.length < 4) return null;
  return out;
}

function stripCollinear(loop, eps=1e-10){
  if(!loop || loop.length < 4) return loop;
  const n = loop.length-1;
  const out = [];
  for(let i=0;i<n;i++){
    const prev = loop[(i-1+n)%n];
    const cur = loop[i];
    const next = loop[(i+1)%n];
    const ax = cur[0] - prev[0];
    const ay = cur[1] - prev[1];
    const bx = next[0] - cur[0];
    const by = next[1] - cur[1];
    const cross = ax*by - ay*bx;
    const dot = ax*bx + ay*by;
    if(Math.abs(cross) <= eps && dot >= 0) continue;
    out.push(cur);
  }
  if(out.length < 3) return null;
  out.push([out[0][0], out[0][1]]);
  return out;
}

function segmentIntersection(ax,ay,bx,by,cx,cy,dx,dy, eps=1e-9){
  const rpx = bx-ax, rpy = by-ay;
  const spx = dx-cx, spy = dy-cy;
  const denom = (rpx*spy - rpy*spx);
  if(Math.abs(denom) < eps) return null;
  const t = ((cx-ax)*spy - (cy-ay)*spx) / denom;
  const u = ((cx-ax)*rpy - (cy-ay)*rpx) / denom;
  if(t <= eps || t >= 1-eps || u <= eps || u >= 1-eps) return null;
  return [ax + t*rpx, ay + t*rpy, t, u];
}

function splitSelfIntersections(loop, guard=0){
  if(!loop || loop.length < 4 || guard > 8) return loop ? [loop] : [];
  const pts = loop.slice(0,-1);
  const n = pts.length;
  for(let i=0;i<n;i++){
    const a0 = pts[i];
    const a1 = pts[(i+1)%n];
    for(let j=i+1;j<n;j++){
      if(Math.abs(i-j) <= 1) continue;
      if(i===0 && j===n-1) continue;
      const b0 = pts[j];
      const b1 = pts[(j+1)%n];
      const hit = segmentIntersection(a0[0],a0[1],a1[0],a1[1], b0[0],b0[1],b1[0],b1[1]);
      if(!hit) continue;
      const ip = [hit[0], hit[1]];
      const work = pts.slice();
      work.splice(i+1, 0, ip);
      let jAdj = j;
      if(jAdj > i) jAdj += 1;
      work.splice(jAdj+1, 0, ip);
      const aStart = i+1;
      const bStart = jAdj+1;
      const loop1 = work.slice(aStart, bStart+1);
      loop1.push([loop1[0][0], loop1[0][1]]);
      const loop2 = work.slice(bStart).concat(work.slice(0, aStart+1));
      loop2.push([loop2[0][0], loop2[0][1]]);
      const out = [];
      for(const sub of [loop1, loop2]){
        const cleaned = stripCollinear(sub);
        if(cleaned && Math.abs(polyArea2D(cleaned)) > 1e-9){
          out.push(...splitSelfIntersections(cleaned, guard+1));
        }
      }
      return out;
    }
  }
  return [loop];
}

function normalizeLoopOrientation(loop, ccw=true){
  if(!loop) return null;
  const area = polyArea2D(loop);
  if(ccw && area < 0) return loop.slice().reverse();
  if(!ccw && area > 0) return loop.slice().reverse();
  return loop;
}

function buildLoopRegions(loops){
  const cleaned = [];
  for(const loop of loops || []){
    let pts = normalizeLoopClosed(loop);
    if(!pts) continue;
    pts = stripCollinear(pts);
    if(!pts) continue;
    const parts = splitSelfIntersections(pts);
    for(const part of parts){
      const cleanPart = stripCollinear(part);
      if(!cleanPart) continue;
      const area = polyArea2D(cleanPart);
      if(Math.abs(area) < 1e-8) continue;
      cleaned.push({
        pts: cleanPart,
        area,
        absArea: Math.abs(area),
        bounds: polyBounds2D(cleanPart)
      });
    }
  }
  if(!cleaned.length) return [];
  cleaned.sort((a,b)=>b.absArea-a.absArea);
  for(let i=0;i<cleaned.length;i++){
    const loop = cleaned[i];
    loop.parent = null;
    const testPt = loop.pts[0];
    for(let j=0;j<cleaned.length;j++){
      if(i===j) continue;
      const cand = cleaned[j];
      if(cand.absArea <= loop.absArea) continue;
      if(testPt[0] < cand.bounds.minx || testPt[0] > cand.bounds.maxx || testPt[1] < cand.bounds.miny || testPt[1] > cand.bounds.maxy) continue;
      if(pointInPoly(testPt, cand.pts)){
        if(!loop.parent || cand.absArea < loop.parent.absArea) loop.parent = cand;
      }
    }
  }
  for(const loop of cleaned){
    let depth = 0;
    let cur = loop.parent;
    while(cur){ depth++; cur = cur.parent; }
    loop.depth = depth;
  }
  const regions = [];
  const regionForLoop = new Map();
  for(const loop of cleaned){
    if(loop.depth % 2 === 0){
      const outer = normalizeLoopOrientation(loop.pts, true);
      const region = {outer, holes:[]};
      regions.push(region);
      regionForLoop.set(loop, region);
    }
  }
  for(const loop of cleaned){
    if(loop.depth % 2 === 1){
      let parent = loop.parent;
      while(parent && parent.depth % 2 === 1){ parent = parent.parent; }
      const region = parent ? regionForLoop.get(parent) : null;
      if(region){
        region.holes.push(normalizeLoopOrientation(loop.pts, false));
      }
    }
  }
  return regions;
}

function lineLineIntersection(ax,ay, bx,by, cx,cy, dx,dy){
  // intersect lines AB and CD (infinite). Return [x,y] or null.
  const rpx = bx-ax, rpy = by-ay;
  const spx = dx-cx, spy = dy-cy;
  const denom = (rpx*spy - rpy*spx);
  if(Math.abs(denom) < 1e-10) return null;
  const t = ((cx-ax)*spy - (cy-ay)*spx) / denom;
  return [ax + t*rpx, ay + t*rpy];
}

function offsetPolyMiter(poly, offset){
  // poly is closed with last==first
  if(!poly || poly.length<4) return null;
  const area = polyArea2D(poly);
  const ccw = area > 0;
  const outwardSign = ccw ? 1 : -1;
  const d = offset;

  const out=[];
  const n = poly.length-1; // last repeats
  for(let i=0;i<n;i++){
    const p0 = poly[(i-1+n)%n];
    const p1 = poly[i];
    const p2 = poly[(i+1)%n];

    const e1x = p1[0]-p0[0], e1y = p1[1]-p0[1];
    const e2x = p2[0]-p1[0], e2y = p2[1]-p1[1];

    const l1 = Math.hypot(e1x,e1y) || 1;
    const l2 = Math.hypot(e2x,e2y) || 1;

    // outward normals
    let n1x = ( e1y / l1) * outwardSign;
    let n1y = (-e1x / l1) * outwardSign;
    let n2x = ( e2y / l2) * outwardSign;
    let n2y = (-e2x / l2) * outwardSign;

    // Offset edge lines: p0->p1 and p1->p2
    const a1x = p0[0] + n1x*d, a1y = p0[1] + n1y*d;
    const b1x = p1[0] + n1x*d, b1y = p1[1] + n1y*d;

    const a2x = p1[0] + n2x*d, a2y = p1[1] + n2y*d;
    const b2x = p2[0] + n2x*d, b2y = p2[1] + n2y*d;

    let ip = lineLineIntersection(a1x,a1y,b1x,b1y, a2x,a2y,b2x,b2y);
    if(!ip){
      // fallback: shift vertex
      ip = [p1[0] + (n1x+n2x)*0.5*d, p1[1] + (n1y+n2y)*0.5*d];
    }
    out.push(ip);
  }
  out.push(out[0]);
  return out;
}

function clipInfillLineToPoly(poly, p0x,p0y, dirx,diry){
  // Intersect infinite line p = p0 + dir*t with polygon edges; return sorted t values and points
  const hits=[];
  for(let i=0;i<poly.length-1;i++){
    const ax=poly[i][0], ay=poly[i][1];
    const bx=poly[i+1][0], by=poly[i+1][1];
    const rx=bx-ax, ry=by-ay;
    const denom = (rx*diry - ry*dirx);
    if(Math.abs(denom) < 1e-12) continue;
    const s = ((p0x-ax)*diry - (p0y-ay)*dirx) / denom;
    if(s < -1e-9 || s > 1+1e-9) continue;
    const ix = ax + rx*s;
    const iy = ay + ry*s;
    const t = ( (ix-p0x)*dirx + (iy-p0y)*diry ); // projection onto dir
    hits.push({t,x:ix,y:iy});
  }
  hits.sort((a,b)=>a.t-b.t);
  // Deduplicate near hits
  const out=[];
  for(const h of hits){
    if(out.length===0){ out.push(h); continue; }
    const prev=out[out.length-1];
    if(Math.abs(prev.t-h.t) > 1e-6) out.push(h);
  }
  return out;
}

function genInfillSegments(poly, spacing, angleRad, serpentine=true, role="infill", phase=0){
  if(!poly || poly.length<4) return [];
  const b = polyBounds2D(poly);
  const dirx=Math.cos(angleRad), diry=Math.sin(angleRad);
  const nx=-diry, ny=dirx; // normal
  // Project bbox corners onto normal to find sweep range
  const corners=[
    [b.minx,b.miny],[b.maxx,b.miny],[b.maxx,b.maxy],[b.minx,b.maxy]
  ];
  let minD=Infinity, maxD=-Infinity;
  for(const c of corners){
    const d = c[0]*nx + c[1]*ny;
    minD=Math.min(minD,d); maxD=Math.max(maxD,d);
  }
  // step over
  const segs=[];
  let lineIdx=0;
  for(let d=(minD-2*spacing + (phase||0)); d<=maxD+2*spacing; d+=spacing){
    const p0x = nx*d;
    const p0y = ny*d;
    const hits = clipInfillLineToPoly(poly, p0x,p0y, dirx,diry);
    if(hits.length<2) { lineIdx++; continue; }
    // Pair intersections
    const pairs=[];
    for(let i=0;i<hits.length-1;i+=2){
      const a=hits[i], c=hits[i+1];
      if(!c) break;
      pairs.push([a,c]);
    }
    // Build segments along line direction; serpentine flips direction each line
    const flip = serpentine && (lineIdx%2===1);
    for(const [a,c] of pairs){
      const A = flip ? c : a;
      const C = flip ? a : c;
      segs.push({x0:A.x,y0:A.y, x1:C.x,y1:C.y, role});
    }
    lineIdx++;
  }
  return segs;
}

function genInfillSegmentsWaves(poly, spacing, angleRad, serpentine, role, layerIndex, amp=0.35, wavelength=6){
  const base = genInfillSegments(poly, spacing, angleRad, serpentine, role, 0);
  const out = [];
  const nx = -Math.sin(angleRad), ny = Math.cos(angleRad);
  const A = Math.max(0, Number(amp)) * spacing;
  const WL = Math.max(1e-3, Number(wavelength));
  const ph = ((layerIndex||0)%2) ? 0.5 : 0.0;
  for(const s of base){
    const dx = s.x1 - s.x0, dy = s.y1 - s.y0;
    const len = Math.max(1e-6, Math.hypot(dx,dy));
    const steps = Math.max(2, Math.floor(len / Math.max(1, WL/2)));
    let px = s.x0, py = s.y0;
    for(let i=1;i<=steps;i++){
      const t = i/steps;
      const x = s.x0 + dx*t;
      const y = s.y0 + dy*t;
      const w = A * Math.sin(2*Math.PI*(t*len/WL + ph));
      const wx = x + nx*w;
      const wy = y + ny*w;
      out.push({x0:px, y0:py, x1:wx, y1:wy, role:s.role});
      px = wx; py = wy;
    }
  }
  return out;
}




function genConcentricLoops(poly, spacing){
  // Returns array of polygons (loops) inset repeatedly by spacing
  const loops=[];
  let cur = poly;
  let guard=0;
  while(cur && cur.length>=4 && guard<200){
    loops.push(cur);
    const next = offsetPolyMiter(cur, -spacing);
    if(!next) break;
    // stop when area collapses
    if(Math.abs(polyArea2D(next)) < spacing*spacing*2) break;
    cur = next;
    guard++;
  }
  return loops;
}

function genInfillSegmentsPattern(poly, spacing, angleRad, serpentine, role, pattern, layerIndex, phase=0){
  const pat = (pattern||"lines");

  // aliases
  if(pat==="rectilinear") return genInfillSegments(poly, spacing, angleRad, serpentine, role, phase);
  if(pat==="zigzag") return genInfillSegments(poly, spacing, angleRad, true, role, phase);

  if(pat==="lines") return genInfillSegments(poly, spacing, angleRad, serpentine, role, phase);

  if(pat==="diamond"){
    const A = genInfillSegments(poly, spacing, angleRad + Math.PI/4, serpentine, role, phase);
    const B = genInfillSegments(poly, spacing, angleRad + 3*Math.PI/4, serpentine, role, phase);
    return [...A, ...B];
  }

  if(pat==="cross"){
    const A = genInfillSegments(poly, spacing, angleRad, serpentine, role, phase);
    const B = genInfillSegments(poly, spacing, angleRad + Math.PI/2, serpentine, role, phase);
    return [...A, ...B];
  }

  if(pat==="grid"){
    // slightly denser than cross (keeps overlaps looking "grid-like")
    const s = spacing*0.92;
    const A = genInfillSegments(poly, s, angleRad, serpentine, role, phase);
    const B = genInfillSegments(poly, s, angleRad + Math.PI/2, serpentine, role, phase);
    return [...A, ...B];
  }

  if(pat==="triangles"){
    const s = spacing*1.08;
    const A = genInfillSegments(poly, s, angleRad, serpentine, role, phase);
    const B = genInfillSegments(poly, s, angleRad + Math.PI/3, serpentine, role, phase);
    const C = genInfillSegments(poly, s, angleRad + 2*Math.PI/3, serpentine, role, phase);
    return [...A, ...B, ...C];
  }

  if(pat==="octagrid"){
    const s = spacing*1.10;
    const A = genInfillSegments(poly, s, angleRad, serpentine, role, phase);
    const B = genInfillSegments(poly, s, angleRad + Math.PI/2, serpentine, role, phase);
    const C = genInfillSegments(poly, s, angleRad + Math.PI/4, serpentine, role, phase);
    const D = genInfillSegments(poly, s, angleRad + 3*Math.PI/4, serpentine, role, phase);
    return [...A, ...B, ...C, ...D];
  }

  if(pat==="honeycomb"){
    // Approximate hex pattern using three line families + a phase-shifted second pass.
    // This is not a true hex cell generator, but it reads like honeycomb at typical densities.
    const s = spacing*1.15;
    const baseA = genInfillSegments(poly, s, angleRad, serpentine, role, phase);
    const baseB = genInfillSegments(poly, s, angleRad + Math.PI/3, serpentine, role, phase);
    const baseC = genInfillSegments(poly, s, angleRad + 2*Math.PI/3, serpentine, role, phase);
    // Second pass with a rotated phase to break triangle regularity
    const shift = (layerIndex||0)%2 ? (Math.PI/6) : (-Math.PI/6);
    const altA = genInfillSegments(poly, s, angleRad + shift, serpentine, role, phase);
    return [...baseA, ...baseB, ...baseC, ...altA];
  }

  if(pat==="cubic"){
    // Layer-alternating (2.5D) "cubic-like": even layers grid, odd layers diagonals.
    const L = (layerIndex||0)|0;
    if((L%2)===0){
      const s = spacing*0.92;
      const A = genInfillSegments(poly, s, angleRad, serpentine, role, phase);
      const B = genInfillSegments(poly, s, angleRad + Math.PI/2, serpentine, role, phase);
      return [...A, ...B];
    }else{
      const s = spacing*1.02;
      const A = genInfillSegments(poly, s, angleRad + Math.PI/4, serpentine, role, phase);
      const B = genInfillSegments(poly, s, angleRad + 3*Math.PI/4, serpentine, role, phase);
      return [...A, ...B];
    }
  }

  
if(pat==="waves"){
  return genInfillSegmentsWaves(poly, spacing, angleRad, serpentine, role, layerIndex, 0.35, 6);
}

if(pat==="gyroid2d"){
  const A = genInfillSegmentsWaves(poly, spacing*1.05, angleRad, serpentine, role, layerIndex, 0.32, 7);
  const B = genInfillSegmentsWaves(poly, spacing*1.05, angleRad + Math.PI/2, serpentine, role, layerIndex, 0.32, 7);
  return [...A, ...B];
}

// concentric handled at path level (not segments)
  return genInfillSegments(poly, spacing, angleRad, serpentine, role, phase);
}


function pathFromSegments2D(segs, z, layer, layerHeight, role){
  const out=[];
  for(const s of segs){
    out.push({x:s.x0,y:s.y0,z, travel:true, layer, meta:{layerHeight, role: role || s.role || "infill"}});
    out.push({x:s.x1,y:s.y1,z, travel:false, layer, meta:{layerHeight, role: role || s.role || "infill"}});
  }
  return out;
}

function sliceMeshPlanar(mesh, opts){

function roleSpeedFor(role, o){
  const r = String(role||"");
  if(r==="bottom") return Number(o.bottomSpeed||o.firstLayerSpeed||o.wallSpeed||1800);
  if(r==="top") return Number(o.topSpeed||o.wallSpeed||1800);
  if(r==="infill") return Number(o.infillSpeed||2400);
  if(r==="walls"||r==="wall"||r==="inner_wall"||r==="outer_wall") return Number(o.wallSpeed||1800);
  return Number(o.wallSpeed||1800);
}
function roleFlowFor(role, o){
  const r = String(role||"");
  if(r==="bottom") return Number(o.bottomFlow||1.0);
  if(r==="top") return Number(o.topFlow||1.0);
  if(r==="infill") return Number(o.infillFlow||1.0);
  if(r==="walls"||r==="wall"||r==="inner_wall"||r==="outer_wall") return Number(o.wallFlow||1.0);
  return 1.0;
}

  // opts: layerHeight, lineWidth, perimeters, infillPct, infillAngle, infillPattern, topLayers, bottomLayers, serpentine, maxLayers, maxSegs, roleOrder
  if(!mesh || !mesh.tris) return [];
  const lh = Math.max(0.08, Number(opts.layerHeight||0.24));
  const lw = Math.max(0.2, Number(opts.lineWidth||0.45));
  const infillLW = Math.max(0.2, Number(opts.infillLineWidth||0) || lw);
  let per = Math.max(0, Math.floor(opts.perimeters||2));
  if(opts.detectThinWalls && per === 0) per = 1;
  const topN = Math.max(0, Math.floor(opts.topLayers||0));
  const botN = Math.max(0, Math.floor(opts.bottomLayers||0));
  const infPct = clamp(Number(opts.infillPct||0), 0, 100);
  const ang0 = (Number(opts.infillAngle||0) * Math.PI/180);
  const serp = !!opts.serpentine;
  const brick = !!opts.brickLayer;
  const solidPat = String(opts.solidPattern || opts.infillPattern || "lines");
  const infPat = String(opts.infillPattern || "lines");

const b = mesh.bounds || computeMeshBounds(mesh.tris);
const zMin = (b.minz ?? (b.min ? b.min.z : undefined));
const zMax = (b.maxz ?? (b.max ? b.max.z : undefined));
if(!isFinite(zMin) || !isFinite(zMax)) return [];

  // Always place the mesh on the bed for slicing:
// treat meshMinZ as z=0 in output space, and make the first printed layer at z=layerHeight.
const meshMinZ = zMin;
const meshMaxZ = zMax;
const height = Math.max(0, meshMaxZ - meshMinZ);

// Slice planes: intersect slightly below the nominal layer plane (to avoid degeneracy),
// but output z exactly at the nominal print height (so first layer is on the bed).
const eps = 1e-6;

const rawLayers = Math.max(1, Math.floor(height / lh + 1e-6));
const layers = Math.min(Math.max(1, rawLayers), Math.max(1, (opts.maxLayers|0)||600));
const lastLayer = layers - 1;

  const order = String(opts.roleOrder||"bottom,walls,infill,top").split(",").map(s=>s.trim()).filter(Boolean);
  const out = [];
  const holeCountByLayer = [];

  for(let L=0; L<layers; L++){
    const zOut = (L+1)*lh;
    let zPlane = meshMinZ + zOut - eps;
    zPlane = Math.min(meshMaxZ - eps, Math.max(meshMinZ + eps, zPlane));
    const segs = triPlaneZSegments(mesh.tris, zPlane);
    if(segs.length===0) continue;
    const loops = stitchSegmentsToLoops(segs);
    if(!loops.length) continue;
    const regions = buildLoopRegions(loops);
    if(!regions.length) continue;
    holeCountByLayer[L] = regions.reduce((sum, region)=>sum + (region.holes?.length || 0), 0);

    const isBottom = (L < botN);
    const isTop = (L >= (lastLayer - topN + 1));
    const roleSolid = isBottom ? "bottom" : (isTop ? "top" : null);

    // Walls (include outer loop as first perimeter, then inset)
    const wallsPaths = [];
    if(per>0){
      const emitWallLoop = (poly, loopRole, offsetDir)=>{
        let cur = poly;
        for(let k=0;k<per;k++){
          for(let i=0;i<cur.length;i++){
            const p=cur[i];
            const r = (k===0) ? loopRole : "wall_inner";
            wallsPaths.push({x:p[0], y:p[1], z:zOut, travel:(i===0), layer:L, meta:{layerHeight:lh, role:r}});
          }
          const off = offsetPolyMiter(cur, offsetDir);
          if(!off) break;
          cur = off;
        }
      };
      for(const region of regions){
        emitWallLoop(region.outer, "wall_outer", -lw);
        for(const hole of region.holes){
          emitWallLoop(hole, "wall_inner", lw);
        }
      }
    }

    // Infill / solid
    const fillPaths = [];
    const pct = roleSolid ? 100 : infPct;
    if(pct>0){
      const spacing = roleSolid ? (lw*0.95) : clamp(infillLW / Math.max(0.01, pct/100), infillLW*1.05, infillLW*12);
      const a1 = ang0 + (L%2)*Math.PI/2;
      let segA = [];
      const pat = roleSolid ? solidPat : infPat;
      for(const region of regions){
        const holeLoops = region.holes || [];
        if(pat==="concentric"){
          const loops2 = genConcentricLoops(region.outer, spacing);
          const filtered = holeLoops.length
            ? loops2.filter((lp)=>!holeLoops.some((hole)=>pointInPoly(polyCentroid2D(lp), hole)))
            : loops2;
          for(const lp of filtered){
            for(let i=0;i<lp.length;i++){
              const p=lp[i];
              fillPaths.push({x:p[0], y:p[1], z:zOut, travel:(i===0), layer:L, meta:{layerHeight:lh, role:(roleSolid||"infill")}});
            }
          }
        }else{
          const phase = brick ? ((L%2)? spacing*0.5 : 0) : 0;
          segA = genInfillSegmentsPattern(region.outer, spacing, a1, serp, (roleSolid||"infill"), pat, L, phase);
          if(holeLoops.length){
            segA = segA.filter((s)=>{
              const mid = [(s.x0 + s.x1) * 0.5, (s.y0 + s.y1) * 0.5];
              return !holeLoops.some((hole)=>pointInPoly(mid, hole));
            });
          }
          if(segA && segA.length) fillPaths.push(...pathFromSegments2D(segA, zOut, L, lh, roleSolid || "infill"));
        }
      }
}

    for(const r of order){
      if(r==="walls") out.push(...wallsPaths);
      else if(r==="wall_outer") out.push(...wallsPaths.filter(p=>p.meta?.role==="wall_outer"));
      else if(r==="wall_inner") out.push(...wallsPaths.filter(p=>p.meta?.role==="wall_inner"));
      else if(r==="infill") out.push(...fillPaths.filter(p=>p.meta?.role==="infill"));
      else if(r==="bottom") out.push(...fillPaths.filter(p=>p.meta?.role==="bottom"));
      else if(r==="top") out.push(...fillPaths.filter(p=>p.meta?.role==="top"));
    }

    if(out.length > ((opts.maxSegs|0)||240000)) break;
  }
  if(out.length){
    const maxHoles = holeCountByLayer.length ? Math.max(1, ...holeCountByLayer.map(v=>v||0)) : 1;
    out.overlays = ["featureType", "holeCount"];
    for(const p of out){
      if(!p?.meta || p.layer == null) continue;
      const count = holeCountByLayer[p.layer] || 0;
      const t = count / maxHoles;
      p.meta.visual = {field:"holeCount", t};
    }
  }
  return out;
}
