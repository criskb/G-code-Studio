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
const fmt = (n, d=2)=> (isFinite(n)? Number(n).toFixed(d) : "—");
const rad = (deg)=>deg * Math.PI / 180;
const uid = ()=> Math.random().toString(16).slice(2,10) + "-" + Math.random().toString(16).slice(2,6);
const safeName = (s)=> String(s||"").toLowerCase().replace(/[^a-z0-9\-_]+/g,"_").slice(0,48);
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

const NODE_DEFS = {};
const nodeRegistry = { api: {}, loaded: false };
window.GCODE_STUDIO = { NODE_DEFS, api: nodeRegistry.api };

function registerNodeModule(module, source){
  const payload = module?.default || module?.node || module;
  if(!payload){
    throw new Error("Node module has no export" + (source ? ` (${source})` : ""));
  }
  const type = payload.type || payload?.def?.type;
  const def = payload.def || payload;
  if(!type || !def){
    throw new Error("Node module missing type/def" + (source ? ` (${source})` : ""));
  }
  NODE_DEFS[type] = { ...def, type };
}
window.GCODE_STUDIO.registerNode = registerNodeModule;

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
      if(inp.type === fromType){
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
      // create link from source to this input
      state.links.push({id:uid(), from:{node:fromNode, port:fromPort, type:fromType}, to:{node:id, port:c.inputPort, type:fromType}});
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

async function loadNodes(){
  if(nodeRegistry.loaded) return NODE_DEFS;
  setStatus("Loading nodes…");
  let entries = [];
  try{
    const res = await fetch("/api/nodes");
    if(!res.ok) throw new Error(`Node manager: ${res.status} ${res.statusText}`);
    const data = await res.json();
    entries = Array.isArray(data.nodes) ? data.nodes : [];
  }catch(err){
    console.warn("Node manager error", err);
    toast("Node manager error: " + (err.message || String(err)));
  }

  const failures = [];
  await Promise.all(entries.map(async (entry)=>{
    try{
      const mod = await import(entry.module);
      registerNodeModule(mod, entry.module);
    }catch(err){
      failures.push(entry?.name || entry?.module || "unknown");
      console.warn("Failed to load node", entry, err);
    }
  }));

  if(failures.length){
    toast(`Failed to load ${failures.length} node(s). Check console for details.`);
  }

  nodeRegistry.loaded = true;
  setStatus(`Nodes: ${Object.keys(NODE_DEFS).length}`);
  return NODE_DEFS;
}

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
const prevLayerModeEl = document.getElementById("prevLayerMode");
const prevLayerEl = document.getElementById("prevLayer");
const prevLayerValEl = document.getElementById("prevLayerVal");

const previewFilter = {
  role: "all",
  layerMode: "all",
  layer: 0,
  maxLayer: 0,
  layerHeight: 0.2
};

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

function filterPreviewPath(path){
  if(!path || !path.length) return path || [];
  let out = path;

  // Role filter (supports grouped walls)
  const want = previewFilter.role;
  if(want && want !== "all"){
    out = out.filter(p=>{
      const r = (p.meta?.role || p.role || "").toString();
      if(want==="walls") return (r==="walls" || r==="wall_outer" || r==="wall_inner");
      return r === want;
    });
  }

  // Layer filter
  if(previewFilter.layerMode === "single"){
    const lh = previewFilter.layerHeight || (pickLayerHeight(path, null) || 0.2);
    const Lwant = previewFilter.layer|0;
    out = out.filter(p=> inferLayer(p, lh) === Lwant);
  }
  return out;
}

function bindPreviewControls(){
  if(!prevRoleEl || !prevLayerModeEl || !prevLayerEl) return;

  prevRoleEl.value = previewFilter.role;
  prevLayerModeEl.value = previewFilter.layerMode;
  prevLayerEl.value = String(previewFilter.layer);

  prevRoleEl.addEventListener("change", ()=>{
    previewFilter.role = prevRoleEl.value;
    schedulePreviewUpdate();
  });
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
      const mesh = state.outputs.mesh || null;
      if(mesh && mesh.tris && mesh.tris.length>=9){
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
}



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
    outputs: { gcode:"", path:[], mesh:null, stats:{points:0,length:0,e:0,timeMin:0} }
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

  // Filament swaps (HueForge-style: single color per layer range; pause/change at boundaries)
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

const rules = rulesBundle || {
    layerHeightHint: layerHDefault,
    injectEveryN: 1,
    speedFn: (t,i,n,x,y,z,layer,role)=> roleSpeedDefault(role, layer),
    flowFn: ()=> 1,
    enableTemp:false, tempFn:null,
    enableFan:false, fanFn:null
  };

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
  const tris = mesh.tris;
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
  if(!state.orca) state.orca = { printers:[], filaments:[], processes:[], files:{}, lastImported:"" };
  if(!state.orca.files || typeof state.orca.files!=="object") state.orca.files = {};
  state.orca.printers  = Array.isArray(state.orca.printers)  ? state.orca.printers  : [];
  state.orca.filaments = Array.isArray(state.orca.filaments) ? state.orca.filaments : [];
  state.orca.processes = Array.isArray(state.orca.processes) ? state.orca.processes : [];
  return state.orca;
}

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
function polyBounds2D(pts){
  let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  for(const p of pts){
    minx=Math.min(minx,p[0]); miny=Math.min(miny,p[1]);
    maxx=Math.max(maxx,p[0]); maxy=Math.max(maxy,p[1]);
  }
  return {minx,miny,maxx,maxy};
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
  const per = Math.max(0, Math.floor(opts.perimeters||2));
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

  for(let L=0; L<layers; L++){
    const zOut = (L+1)*lh;
    let zPlane = meshMinZ + zOut - eps;
    zPlane = Math.min(meshMaxZ - eps, Math.max(meshMinZ + eps, zPlane));
    const segs = triPlaneZSegments(mesh.tris, zPlane);
    if(segs.length===0) continue;
    const loops = stitchSegmentsToLoops(segs);
    if(!loops.length) continue;
    loops.sort((a,b)=>Math.abs(polyArea2D(b))-Math.abs(polyArea2D(a)));
    const outer = loops[0];

    const isBottom = (L < botN);
    const isTop = (L >= (lastLayer - topN + 1));
    const roleSolid = isBottom ? "bottom" : (isTop ? "top" : null);

    // Walls (include outer loop as first perimeter, then inset)
    const wallsPaths = [];
    if(per>0){
      let poly = outer;
      for(let k=0;k<per;k++){
        // emit current poly
        for(let i=0;i<poly.length;i++){
          const p=poly[i];
          const r = (k===0) ? "wall_outer" : "wall_inner";
        wallsPaths.push({x:p[0], y:p[1], z:zOut, travel:(i===0), layer:L, meta:{layerHeight:lh, role:r}});
        }
        // next inset
        const off = offsetPolyMiter(poly, -lw);
        if(!off) break;
        poly = off;
      }
    }

    // Infill / solid
    const fillPaths = [];
    const pct = roleSolid ? 100 : infPct;
    if(pct>0){
      const spacing = roleSolid ? (lw*0.95) : clamp(lw / Math.max(0.01, pct/100), lw*1.05, lw*12);
      const a1 = ang0 + (L%2)*Math.PI/2;
      let segA = [];
      const pat = (opts.infillPattern||"lines");
      if(pat==="concentric"){
        const loops2 = genConcentricLoops(outer, spacing);
        for(const lp of loops2){
          for(let i=0;i<lp.length;i++){
            const p=lp[i];
            fillPaths.push({x:p[0], y:p[1], z:zOut, travel:(i===0), layer:L, meta:{layerHeight:lh, role:(roleSolid||"infill")}});
          }
        }
      }else{
        const phase = brick ? ((L%2)? spacing*0.5 : 0) : 0;
      segA = genInfillSegmentsPattern(outer, spacing, a1, serp, (roleSolid||"infill"), pat, L, phase);
      }
      if(segA && segA.length) fillPaths.push(...pathFromSegments2D(segA, zOut, L, lh, roleSolid || "infill"));
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
  return out;
}

const SCHEMA_SLICER_V2 = [
  { kind:"group", title:"Input & Mode", rows:[
    { items:[
      {key:"bedAlign", label:"Bed align mesh", ui:"toggle", default:true},
      {key:"mode", label:"Mode", ui:"select", options:[
        ["planar","Planar (layers + shells + infill + top/bottom)"],
        ["surface","Surface raster (non-planar)"]
      ], default:"planar"},
    ]},
    { items:[
      {key:"originMode", label:"Origin", ui:"select", options:[
        ["from_printer","Use Printer origin"],
        ["center","Center on bed"],
        ["lowerleft","Lower-left on bed"]
      ], default:"from_printer"},
      {key:"scale", label:"Scale", ui:"number", min:0.01, max:100, step:0.01, default:1},
    ]},
    { items:[
      {key:"rotZ", label:"Rotate Z°", ui:"number", min:-180, max:180, step:1, default:0},
      {key:"zOffset", label:"Z offset", ui:"number", min:-50, max:50, step:0.01, default:0},
    ]},
  ], note:"<span class='hint'>This is a lightweight slicer inspired by Orca-style controls. Many settings affect output now (shells/infill/top/bottom/speeds/flows/skirt/brim). Some advanced items are UI-ready but not fully simulated yet.</span>" },

  /* ---------------- Planar ---------------- */
  { kind:"group", title:"Quality", when:"d.mode==='planar'", rows:[
    { items:[
      {key:"layerHeight", label:"Layer height", ui:"number", min:0.05, max:1.2, step:0.01, default:0.2},
      {key:"firstLayerHeight", label:"First layer height", ui:"number", min:0.05, max:1.2, step:0.01, default:0.24},
    ]},
    { items:[
      {key:"lineWidth", label:"Line width", ui:"number", min:0.2, max:1.2, step:0.01, default:0.45},
      {key:"firstLayerLineWidth", label:"First layer line width", ui:"number", min:0.2, max:1.6, step:0.01, default:0.50},
    ]},
    { items:[
      {key:"elephantFootComp", label:"Elephant foot comp", ui:"number", min:0, max:1.0, step:0.01, default:0.0},
      {key:"detectThinWalls", label:"Detect thin walls (UI)", ui:"toggle", default:false},
    ]},
  ]},

  { kind:"group", title:"Shells (Walls)", when:"d.mode==='planar'", rows:[
    { items:[
      {key:"perimeters", label:"Perimeters", ui:"number", min:0, max:12, step:1, default:2},
      {key:"spiralVase", label:"Spiral vase (UI)", ui:"toggle", default:false},
    ]},
    { items:[
      {key:"seamMode", label:"Seam (UI)", ui:"select", options:[
        ["nearest","Nearest"],["rear","Rear"],["random","Random"],["aligned","Aligned (UI)"]
      ], default:"nearest"},
      {key:"wallOrdering", label:"Wall ordering (UI)", ui:"select", options:[
        ["inner>outer","Inner → Outer"],["outer>inner","Outer → Inner (UI)"]
      ], default:"inner>outer"},
    ]},
    { items:[
      {key:"gapFill", label:"Gap fill (UI)", ui:"toggle", default:false},
      {key:"wallOverlap", label:"Infill overlap % (UI)", ui:"number", min:0, max:50, step:1, default:15},
    ]},
  ]},

  { kind:"group", title:"Infill", when:"d.mode==='planar'", rows:[
    { items:[
      {key:"infillPct", label:"Infill %", ui:"number", min:0, max:100, step:1, default:15},
      {key:"infillPattern", label:"Pattern", ui:"select", options:[
        ["lines","Lines"],["zigzag","Zigzag"],["rectilinear","Rectilinear"],
        ["cross","Cross"],["grid","Grid"],
        ["triangles","Triangles"],["octagrid","Octagrid"],
        ["honeycomb","Honeycomb (approx)"],
        ["waves","Waves"],["gyroid2d","Gyroid-like (2D)"],
        ["cubic","Cubic (alt)"],
        ["concentric","Concentric"]
      ], default:"grid"},
    ]},
    { items:[
      {key:"infillAngle", label:"Angle°", ui:"number", min:0, max:180, step:1, default:45},
      {key:"serpentine", label:"Serpentine", ui:"toggle", default:true},
    ]},
    { items:[
      {key:"brickLayer", label:"Brick-layer (phase shift)", ui:"toggle", default:false},
      {key:"infillLineWidth", label:"Infill line width (UI)", ui:"number", min:0.2, max:2.0, step:0.01, default:0},
    ]},
  ]},

  { kind:"group", title:"Top & Bottom (Skins)", when:"d.mode==='planar'", rows:[
    { items:[
      {key:"topLayers", label:"Top layers", ui:"number", min:0, max:60, step:1, default:4},
      {key:"bottomLayers", label:"Bottom layers", ui:"number", min:0, max:60, step:1, default:4},
    ]},
    { items:[
      {key:"solidPattern", label:"Skin pattern", ui:"select", options:[
        ["","(same as infill)"],["lines","Lines"],["zigzag","Zigzag"],["grid","Grid"],["concentric","Concentric"],
        ["waves","Waves"],["gyroid2d","Gyroid-like (2D)"]
      ], default:""},
      {key:"ironing", label:"Ironing (UI)", ui:"toggle", default:false},
    ]},
    { items:[
      {key:"skinOverlap", label:"Skin overlap % (UI)", ui:"number", min:0, max:50, step:1, default:15},
      {key:"monotonic", label:"Monotonic (UI)", ui:"toggle", default:false},
    ]},
  ]},

  { kind:"group", title:"Skirt / Brim", when:"d.mode==='planar'", rows:[
    { items:[
      {key:"skirtLines", label:"Skirt lines", ui:"number", min:0, max:20, step:1, default:0},
      {key:"skirtDistance", label:"Skirt distance", ui:"number", min:0, max:50, step:0.5, default:6},
    ]},
    { items:[
      {key:"brimWidth", label:"Brim width", ui:"number", min:0, max:50, step:0.5, default:0},
      {key:"brimLines", label:"Brim lines (UI)", ui:"number", min:0, max:50, step:1, default:0},
    ]},
  ], note:"Skirt/Brim are generated as simple offset rings on the first layer (approximation)." },

  { kind:"group", title:"Speeds & Flow", when:"d.mode==='planar'", rows:[
    { items:[
      {key:"firstLayerSpeed", label:"First layer speed", ui:"number", min:60, max:12000, step:10, default:900},
      {key:"travelSpeed", label:"Travel speed", ui:"number", min:300, max:30000, step:10, default:6000},
    ]},
    { items:[
      {key:"wallSpeed", label:"Wall speed", ui:"number", min:60, max:30000, step:10, default:1800},
      {key:"infillSpeed", label:"Infill speed", ui:"number", min:60, max:30000, step:10, default:2400},
    ]},
    { items:[
      {key:"topSpeed", label:"Top speed", ui:"number", min:60, max:30000, step:10, default:1500},
      {key:"bottomSpeed", label:"Bottom speed", ui:"number", min:60, max:30000, step:10, default:1200},
    ]},
    { items:[
      {key:"wallFlow", label:"Wall flow", ui:"number", min:0.1, max:2.0, step:0.01, default:1.0},
      {key:"infillFlow", label:"Infill flow", ui:"number", min:0.1, max:2.0, step:0.01, default:1.0},
    ]},
    { items:[
      {key:"topFlow", label:"Top flow", ui:"number", min:0.1, max:2.0, step:0.01, default:1.0},
      {key:"bottomFlow", label:"Bottom flow", ui:"number", min:0.1, max:2.0, step:0.01, default:1.0},
    ]},
  ], note:"These map into G-code defaults by <b>role</b> when no Rules node overrides speed/flow." },

  { kind:"group", title:"Retraction & Travel", when:"d.mode==='planar'", rows:[
    { items:[
      {key:"retract", label:"Retract length", ui:"number", min:0, max:20, step:0.01, default:0.8},
      {key:"retractSpeed", label:"Retract speed", ui:"number", min:60, max:30000, step:10, default:1800},
    ]},
    { items:[
      {key:"retractMinTravel", label:"Min travel for retract", ui:"number", min:0, max:50, step:0.1, default:1.0},
      {key:"zHop", label:"Z hop", ui:"number", min:0, max:10, step:0.01, default:0},
    ]},
    { items:[
      {key:"wipe", label:"Wipe (UI)", ui:"toggle", default:false},
      {key:"coast", label:"Coast (UI)", ui:"toggle", default:false},
    ]},
  ], note:"Retract/Z-hop are applied on travels in exported G-code (simple implementation)." },

  { kind:"group", title:"Cooling (UI)", when:"d.mode==='planar'", rows:[
    { items:[
      {key:"fanFirstLayer", label:"Fan first layer %", ui:"number", min:0, max:100, step:1, default:0},
      {key:"fanOtherLayers", label:"Fan other layers %", ui:"number", min:0, max:100, step:1, default:100},
    ]},
    { items:[
      {key:"minLayerTime", label:"Min layer time (UI)", ui:"number", min:0, max:120, step:1, default:0},
      {key:"slowDownBelow", label:"Slow down below (UI)", ui:"number", min:0, max:60, step:1, default:0},
    ]},
  ]},

  { kind:"group", title:"Advanced limits", when:"d.mode==='planar'", rows:[
    { items:[
      {key:"maxLayers", label:"Max layers (limit)", ui:"number", min:0, max:99999, step:1, default:0},
      {key:"maxSegs", label:"Max segments/layer (limit)", ui:"number", min:0, max:9999999, step:100, default:0},
    ]},
  ]},

  /* ---------------- Surface raster (non-planar) ---------------- */
  { kind:"group", title:"Surface raster", when:"d.mode==='surface'", rows:[
    { items:[
      {key:"spacing", label:"Raster spacing", ui:"number", min:0.1, max:10, step:0.05, default:1.0},
      {key:"step", label:"Sample step", ui:"number", min:0.05, max:5, step:0.05, default:0.6},
    ]},
    { items:[
      {key:"angleDeg", label:"Angle°", ui:"number", min:-180, max:180, step:1, default:0},
      {key:"margin", label:"Margin", ui:"number", min:0, max:50, step:0.1, default:0},
    ]},
    { items:[
      {key:"surfaceSerp", label:"Serpentine raster", ui:"toggle", default:true},
      {key:"cellSize", label:"Index cell (auto=0)", ui:"number", min:0, max:200, step:0.1, default:0},
      {key:"maxPts", label:"Max points (limit)", ui:"number", min:0, max:2000000, step:1000, default:0},
    ]},
  ]},
];

/* ---------------------------
   Nodes are loaded from /nodes via the node manager API
---------------------------- */

/* ---------------------------
   Geometry & Slicing v2
   - Import Mesh (preview) -> outputs mesh
   - Mesh Primitive (preview) -> outputs mesh
   - Slicer -> inputs mesh, outputs mesh + path
   Keep old Mesh Primitive & Mesh Import behavior as legacy (auto-migrated on load)
----------------------------*/

const SCHEMA_IMPORT_MESH_V2 = [
  {key:"bedAlign", label:"Bed align (minZ→0)", ui:"toggle"},
  {key:"centerXY", label:"Center XY", ui:"toggle"},
  {key:"scale", label:"Scale", ui:"number", min:0.01, max:100, step:0.01},
  {key:"rxDeg", label:"Rot X°", ui:"number", min:-180, max:180, step:1},
  {key:"ryDeg", label:"Rot Y°", ui:"number", min:-180, max:180, step:1},
  {key:"rzDeg", label:"Rot Z°", ui:"number", min:-180, max:180, step:1},
  {key:"tx", label:"Offset X", ui:"number", min:-9999, max:9999, step:0.1},
  {key:"ty", label:"Offset Y", ui:"number", min:-9999, max:9999, step:0.1},
  {key:"tz", label:"Offset Z", ui:"number", min:-9999, max:9999, step:0.1},
];

const SCHEMA_MESH_PRIMITIVE_V2 = [
  {key:"size", label:"Size (mm)", ui:"number", min:5, max:600, step:1},
  {key:"height", label:"Height (mm)", ui:"number", min:0.1, max:600, step:1},
  {key:"seg", label:"Segments", ui:"number", min:8, max:240, step:1},
  {key:"waveAmp", label:"Wave amp", ui:"number", min:0, max:80, step:0.5, when:(d)=>d.kind==="wavy"},
  {key:"waveFreq", label:"Wave freq", ui:"number", min:0.1, max:20, step:0.1, when:(d)=>d.kind==="wavy"},
  {key:"bedAlign", label:"Bed align (minZ→0)", ui:"toggle"},
];

const SCHEMA_SLICER_V2 = [
  { kind:"group", title:"Input & Mode", rows:[
    { items:[
      {key:"bedAlign", label:"Bed align mesh", ui:"toggle", default:true},
      {key:"mode", label:"Mode", ui:"select", options:[
        ["planar","Planar (layers + shells + infill + top/bottom)"],
        ["surface","Surface raster (non-planar)"]
      ], default:"planar"},
    ]},
    { items:[
      {key:"originMode", label:"Origin", ui:"select", options:[
        ["from_printer","Use Printer origin"],
        ["center","Center on bed"],
        ["lowerleft","Lower-left on bed"]
      ], default:"from_printer"},
      {key:"scale", label:"Scale", ui:"number", min:0.01, max:100, step:0.01, default:1},
    ]},
    { items:[
      {key:"rotZ", label:"Rotate Z°", ui:"number", min:-180, max:180, step:1, default:0},
      {key:"zOffset", label:"Z offset", ui:"number", min:-50, max:50, step:0.01, default:0},
    ]},
  ], note:"<span class='hint'>This is a lightweight slicer inspired by Orca-style controls. Many settings affect output now (shells/infill/top/bottom/speeds/flows/skirt/brim). Some advanced items are UI-ready but not fully simulated yet.</span>" },

  /* ---------------- Planar ---------------- */
  { kind:"group", title:"Quality", when:"d.mode==='planar'", rows:[
    { items:[
      {key:"layerHeight", label:"Layer height", ui:"number", min:0.05, max:1.2, step:0.01, default:0.2},
      {key:"firstLayerHeight", label:"First layer height", ui:"number", min:0.05, max:1.2, step:0.01, default:0.24},
    ]},
    { items:[
      {key:"lineWidth", label:"Line width", ui:"number", min:0.2, max:1.2, step:0.01, default:0.45},
      {key:"firstLayerLineWidth", label:"First layer line width", ui:"number", min:0.2, max:1.6, step:0.01, default:0.50},
    ]},
    { items:[
      {key:"elephantFootComp", label:"Elephant foot comp", ui:"number", min:0, max:1.0, step:0.01, default:0.0},
      {key:"detectThinWalls", label:"Detect thin walls (UI)", ui:"toggle", default:false},
    ]},
  ]},

  { kind:"group", title:"Shells (Walls)", when:"d.mode==='planar'", rows:[
    { items:[
      {key:"perimeters", label:"Perimeters", ui:"number", min:0, max:12, step:1, default:2},
      {key:"spiralVase", label:"Spiral vase (UI)", ui:"toggle", default:false},
    ]},
    { items:[
      {key:"seamMode", label:"Seam (UI)", ui:"select", options:[
        ["nearest","Nearest"],["rear","Rear"],["random","Random"],["aligned","Aligned (UI)"]
      ], default:"nearest"},
      {key:"wallOrdering", label:"Wall ordering (UI)", ui:"select", options:[
        ["inner>outer","Inner → Outer"],["outer>inner","Outer → Inner (UI)"]
      ], default:"inner>outer"},
    ]},
    { items:[
      {key:"gapFill", label:"Gap fill (UI)", ui:"toggle", default:false},
      {key:"wallOverlap", label:"Infill overlap % (UI)", ui:"number", min:0, max:50, step:1, default:15},
    ]},
  ]},

  { kind:"group", title:"Infill", when:"d.mode==='planar'", rows:[
    { items:[
      {key:"infillPct", label:"Infill %", ui:"number", min:0, max:100, step:1, default:15},
      {key:"infillPattern", label:"Pattern", ui:"select", options:[
        ["lines","Lines"],["zigzag","Zigzag"],["rectilinear","Rectilinear"],
        ["cross","Cross"],["grid","Grid"],
        ["triangles","Triangles"],["octagrid","Octagrid"],
        ["honeycomb","Honeycomb (approx)"],
        ["waves","Waves"],["gyroid2d","Gyroid-like (2D)"],
        ["cubic","Cubic (alt)"],
        ["concentric","Concentric"]
      ], default:"grid"},
    ]},
    { items:[
      {key:"infillAngle", label:"Angle°", ui:"number", min:0, max:180, step:1, default:45},
      {key:"serpentine", label:"Serpentine", ui:"toggle", default:true},
    ]},
    { items:[
      {key:"brickLayer", label:"Brick-layer (phase shift)", ui:"toggle", default:false},
      {key:"infillLineWidth", label:"Infill line width (UI)", ui:"number", min:0.2, max:2.0, step:0.01, default:0},
    ]},
  ]},

  { kind:"group", title:"Top & Bottom (Skins)", when:"d.mode==='planar'", rows:[
    { items:[
      {key:"topLayers", label:"Top layers", ui:"number", min:0, max:60, step:1, default:4},
      {key:"bottomLayers", label:"Bottom layers", ui:"number", min:0, max:60, step:1, default:4},
    ]},
    { items:[
      {key:"solidPattern", label:"Skin pattern", ui:"select", options:[
        ["","(same as infill)"],["lines","Lines"],["zigzag","Zigzag"],["grid","Grid"],["concentric","Concentric"],
        ["waves","Waves"],["gyroid2d","Gyroid-like (2D)"]
      ], default:""},
      {key:"ironing", label:"Ironing (UI)", ui:"toggle", default:false},
    ]},
    { items:[
      {key:"skinOverlap", label:"Skin overlap % (UI)", ui:"number", min:0, max:50, step:1, default:15},
      {key:"monotonic", label:"Monotonic (UI)", ui:"toggle", default:false},
    ]},
  ]},

  { kind:"group", title:"Skirt / Brim", when:"d.mode==='planar'", rows:[
    { items:[
      {key:"skirtLines", label:"Skirt lines", ui:"number", min:0, max:20, step:1, default:0},
      {key:"skirtDistance", label:"Skirt distance", ui:"number", min:0, max:50, step:0.5, default:6},
    ]},
    { items:[
      {key:"brimWidth", label:"Brim width", ui:"number", min:0, max:50, step:0.5, default:0},
      {key:"brimLines", label:"Brim lines (UI)", ui:"number", min:0, max:50, step:1, default:0},
    ]},
  ], note:"Skirt/Brim are generated as simple offset rings on the first layer (approximation)." },

  { kind:"group", title:"Speeds & Flow", when:"d.mode==='planar'", rows:[
    { items:[
      {key:"firstLayerSpeed", label:"First layer speed", ui:"number", min:60, max:12000, step:10, default:900},
      {key:"travelSpeed", label:"Travel speed", ui:"number", min:300, max:30000, step:10, default:6000},
    ]},
    { items:[
      {key:"wallSpeed", label:"Wall speed", ui:"number", min:60, max:30000, step:10, default:1800},
      {key:"infillSpeed", label:"Infill speed", ui:"number", min:60, max:30000, step:10, default:2400},
    ]},
    { items:[
      {key:"topSpeed", label:"Top speed", ui:"number", min:60, max:30000, step:10, default:1500},
      {key:"bottomSpeed", label:"Bottom speed", ui:"number", min:60, max:30000, step:10, default:1200},
    ]},
    { items:[
      {key:"wallFlow", label:"Wall flow", ui:"number", min:0.1, max:2.0, step:0.01, default:1.0},
      {key:"infillFlow", label:"Infill flow", ui:"number", min:0.1, max:2.0, step:0.01, default:1.0},
    ]},
    { items:[
      {key:"topFlow", label:"Top flow", ui:"number", min:0.1, max:2.0, step:0.01, default:1.0},
      {key:"bottomFlow", label:"Bottom flow", ui:"number", min:0.1, max:2.0, step:0.01, default:1.0},
    ]},
  ], note:"These map into G-code defaults by <b>role</b> when no Rules node overrides speed/flow." },

  { kind:"group", title:"Retraction & Travel", when:"d.mode==='planar'", rows:[
    { items:[
      {key:"retract", label:"Retract length", ui:"number", min:0, max:20, step:0.01, default:0.8},
      {key:"retractSpeed", label:"Retract speed", ui:"number", min:60, max:30000, step:10, default:1800},
    ]},
    { items:[
      {key:"retractMinTravel", label:"Min travel for retract", ui:"number", min:0, max:50, step:0.1, default:1.0},
      {key:"zHop", label:"Z hop", ui:"number", min:0, max:10, step:0.01, default:0},
    ]},
    { items:[
      {key:"wipe", label:"Wipe (UI)", ui:"toggle", default:false},
      {key:"coast", label:"Coast (UI)", ui:"toggle", default:false},
    ]},
  ], note:"Retract/Z-hop are applied on travels in exported G-code (simple implementation)." },

  { kind:"group", title:"Cooling (UI)", when:"d.mode==='planar'", rows:[
    { items:[
      {key:"fanFirstLayer", label:"Fan first layer %", ui:"number", min:0, max:100, step:1, default:0},
      {key:"fanOtherLayers", label:"Fan other layers %", ui:"number", min:0, max:100, step:1, default:100},
    ]},
    { items:[
      {key:"minLayerTime", label:"Min layer time (UI)", ui:"number", min:0, max:120, step:1, default:0},
      {key:"slowDownBelow", label:"Slow down below (UI)", ui:"number", min:0, max:60, step:1, default:0},
    ]},
  ]},

  { kind:"group", title:"Advanced limits", when:"d.mode==='planar'", rows:[
    { items:[
      {key:"maxLayers", label:"Max layers (limit)", ui:"number", min:0, max:99999, step:1, default:0},
      {key:"maxSegs", label:"Max segments/layer (limit)", ui:"number", min:0, max:9999999, step:100, default:0},
    ]},
  ]},

  /* ---------------- Surface raster (non-planar) ---------------- */
  { kind:"group", title:"Surface raster", when:"d.mode==='surface'", rows:[
    { items:[
      {key:"spacing", label:"Raster spacing", ui:"number", min:0.1, max:10, step:0.05, default:1.0},
      {key:"step", label:"Sample step", ui:"number", min:0.05, max:5, step:0.05, default:0.6},
    ]},
    { items:[
      {key:"angleDeg", label:"Angle°", ui:"number", min:-180, max:180, step:1, default:0},
      {key:"margin", label:"Margin", ui:"number", min:0, max:50, step:0.1, default:0},
    ]},
    { items:[
      {key:"surfaceSerp", label:"Serpentine raster", ui:"toggle", default:true},
      {key:"cellSize", label:"Index cell (auto=0)", ui:"number", min:0, max:200, step:0.1, default:0},
      {key:"maxPts", label:"Max points (limit)", ui:"number", min:0, max:2000000, step:1000, default:0},
    ]},
  ]},
];

/* ---------------------------
   Demos
---------------------------- */
function demoPlanarSliceCubeV2(){
  state = defaultState();
  const prim = addNode("Mesh Primitive", 120, 120);
  const slic = addNode("Slicer", 460, 140);
  const prn  = addNode("Printer", 780, 120);
  const exp  = addNode("Export", 980, 120);

  state.nodes[prim].data.kind = "cube";
  state.nodes[prim].data.size = 120;
  state.nodes[prim].data.height = 40;
  state.nodes[prim].data.bedAlign = true;

  state.nodes[slic].data.mode = "planar";
  state.nodes[slic].data.layerHeight = 0.24;
  state.nodes[slic].data.lineWidth = 0.45;
  state.nodes[slic].data.perimeters = 2;
  state.nodes[slic].data.infillPct = 18;
  state.nodes[slic].data.infillPattern = "grid";
  state.nodes[slic].data.topLayers = 4;
  state.nodes[slic].data.bottomLayers = 4;
  state.nodes[slic].data.bedAlign = true;

  connect(prim, 0, slic, 0);
  connect(slic, 1, exp, 0);
  connect(prn, 0, exp, 1);

  selectNode(exp);
  centerViewOn(prim);
  toast("Loaded demo: Planar Slice (v2) — Cube");
  markDirtyAuto();
}

function demoSTLPlanarSliceTemplateV2(){
  state = defaultState();
  const imp = addNode("Import Mesh", 120, 120);
  const slic = addNode("Slicer", 460, 140);
  const prn  = addNode("Printer", 780, 120);
  const exp  = addNode("Export", 980, 120);

  state.nodes[slic].data.mode = "planar";
  state.nodes[slic].data.layerHeight = 0.24;

  connect(imp, 0, slic, 0);
  connect(slic, 1, exp, 0);
  connect(prn, 0, exp, 1);

  selectNode(imp);
  centerViewOn(imp);
  toast("Loaded demo: STL Planar Slice (v2) — template");
  markDirtyAuto();
}


function demoFeaturePaintOptimize(){
  state = defaultState();
  const prim = addNode("Mesh Primitive", 100, 120);
  const slic = addNode("Slicer", 430, 140);
  const paint = addNode("Feature Paint", 720, 140);
  const opt = addNode("Travel Optimize", 940, 160);
  const prn  = addNode("Printer", 1160, 120);
  const exp  = addNode("Export", 1360, 120);
  const note = addNode("Note", 100, 470);
  const insp = addNode("Inspector", 720, 470);

  state.nodes[prim].data.kind = "cube";
  state.nodes[prim].data.size = 80;
  state.nodes[prim].data.height = 40;
  state.nodes[prim].data.bedAlign = true;

  state.nodes[slic].data.mode = "planar";
  state.nodes[slic].data.layerHeight = 0.24;
  state.nodes[slic].data.perimeters = 3;
  state.nodes[slic].data.infillPct = 18;
  state.nodes[slic].data.topLayers = 5;
  state.nodes[slic].data.bottomLayers = 5;
  state.nodes[slic].data.infillPattern = "gyroid2d";

  state.nodes[paint].data.rules = [
    {name:"Slow walls", when:'role=="walls" || role=="outer_wall" || role=="inner_wall"', role:"", speedMode:"mul", speedVal:0.75, flowMode:"mul", flowVal:1.00},
    {name:"Strong top", when:'role=="top"', role:"", speedMode:"mul", speedVal:0.65, flowMode:"mul", flowVal:1.05},
    {name:"Fast infill", when:'role=="infill"', role:"", speedMode:"mul", speedVal:1.25, flowMode:"mul", flowVal:1.00},
  ];

  state.nodes[note].data.title = "Demo: Feature Paint + Travel Optimize";
  state.nodes[note].data.text =
`This demo shows two experimental 'Orca-like' ideas:\n\n- **Feature Paint**: rule-based overrides by role/layer (speed + flow multipliers)\n- **Travel Optimize**: greedy per-layer segment reordering to cut travel\n\nGraph:\nMesh Primitive → Slicer → Feature Paint → Travel Optimize → Printer → Export\n\nTry editing Feature Paint rules:\n- Slow top layers: \`role==\"top\"\`\n- Only after layer 20: \`role==\"infill\" && layer>20\`\n- Only near end: \`t>0.8 && role==\"walls\"\`\n`;

  connect(prim, 0, slic, 0);
  connect(slic, 1, paint, 0);
  connect(paint, 0, opt, 0);
  connect(opt, 0, exp, 0);
  connect(prn, 0, exp, 1);

  // Inspector taps the exported machine path + mesh (for debug)
  connect(exp, 0, insp, 2); // gcode
  connect(slic, 1, insp, 0); // path
  connect(slic, 0, insp, 1); // mesh
  connect(prn, 0, insp, 3);  // profile

  selectNode(prim);
  centerViewOn(prim);
  toast("Loaded demo: Feature Paint + Travel Optimize");
  markDirtyAuto();
}



function demoFullControlRipple(){
  state = defaultState();
  const fc = addNode("FullControl Model", 120, 140);
  const prn= addNode("Printer", 470, 120);
  const z  = addNode("Z Warp", 700, 150);
  const exp= addNode("Export", 990, 120);
  const note=addNode("Note", 120, 470);

  state.nodes[fc].data.model="ripple_vase";
  state.nodes[fc].data.height=110;
  state.nodes[fc].data.radius=30;
  state.nodes[fc].data.rippleAmp=3.0;
  state.nodes[fc].data.ripples=11;
  state.nodes[fc].data.layerHeight=0.24;
  state.nodes[z].data.amplitude=0.7;
  state.nodes[z].data.wavelength=26;

  state.nodes[note].data.title="Demo: FullControl Ripple Vase (+ optional non-planar)";
  state.nodes[note].data.text =
`This is a **path-first** model (no mesh slicing).\n\nGraph:\nFullControl Model → (optional) Z Warp → Printer → Export\n\nTry:\n- Increase ripples for tighter texture\n- Use Z Warp for non-planar wave finish (small amplitude)\n`;

  connect(fc, 0, z, 0);
  connect(z, 0, exp, 0);
  connect(prn,0, exp, 1);

  selectNode(fc);
  centerViewOn(fc);
  toast("Loaded demo: FullControl Ripple Vase");
  markDirtyAuto();
}

function demoPolarFractions(){
  state = defaultState();
  const fc = addNode("FullControl Model", 120, 140);
  const arr= addNode("Polar Array", 460, 160);
  const prn= addNode("Printer", 720, 120);
  const exp= addNode("Export", 1010, 120);
  const note=addNode("Note", 120, 470);

  state.nodes[fc].data.model="polar_fractions";
  state.nodes[fc].data.denom=12;
  state.nodes[fc].data.numer=5;
  state.nodes[fc].data.rings=3;
  state.nodes[fc].data.ringStep=10;
  state.nodes[fc].data.height=20;
  state.nodes[fc].data.layerHeight=0.2;

  state.nodes[arr].data.copies=3;
  state.nodes[arr].data.merge=false;

  state.nodes[note].data.title="Demo: Fractional Engine (Polar)";
  state.nodes[note].data.text =
`Inspired by FullControl's polar/fractional demos.\n\nGraph:\nFullControl Model → Polar Array → Printer → Export\n\nTry:\n- denom 7 / numer 3 for different rhythms\n- copies 2–8 for kaleidoscope patterns\n`;

  connect(fc, 0, arr, 0);
  connect(arr,0, exp, 0);
  connect(prn,0, exp, 1);

  selectNode(fc);
  centerViewOn(fc);
  toast("Loaded demo: Polar Fractions");
  markDirtyAuto();
}

function demoPinSupport(){
  state = defaultState();
  const fc = addNode("FullControl Model", 120, 140);
  const prn= addNode("Printer", 470, 120);
  const exp= addNode("Export", 740, 120);
  const note=addNode("Note", 120, 470);

  state.nodes[fc].data.model="pin_support";
  state.nodes[fc].data.height=60;
  state.nodes[fc].data.pinBaseR=3.8;
  state.nodes[fc].data.pinTopR=0.6;
  state.nodes[fc].data.pinTurns=4;
  state.nodes[fc].data.layerHeight=0.2;

  state.nodes[note].data.title="Demo: Pin Support Challenge (taper)";
  state.nodes[note].data.text =
`A thin taper/spiral to stress-test cooling & extrusion.\n\nTips:\n- Slow down and add cooling\n- Use smaller layer height\n- Consider lowering flow slightly at the tip\n`;

  connect(fc,0, exp,0);
  connect(prn,0, exp,1);

  selectNode(fc);
  centerViewOn(fc);
  toast("Loaded demo: Pin Support");
  markDirtyAuto();
}

function demoZWarp(){
  state = defaultState();
  const prim = addNode("Mesh Primitive", 90, 120);
  const slic = addNode("Slicer", 420, 120);
  const warp = addNode("Z Warp", 710, 140);
  const prn  = addNode("Printer", 970, 120);
  const exp  = addNode("Export", 1180, 120);
  const note = addNode("Note", 90, 470);

  state.nodes[prim].data.kind = "cylinder";
  state.nodes[prim].data.radius = 35;
  state.nodes[prim].data.height = 70;
  state.nodes[prim].data.bedAlign = true;

  state.nodes[slic].data.mode = "planar";
  state.nodes[slic].data.layerHeight = 0.24;
  state.nodes[slic].data.perimeters = 2;
  state.nodes[slic].data.infillPct = 0;
  state.nodes[slic].data.topLayers = 6;
  state.nodes[slic].data.bottomLayers = 6;
  state.nodes[slic].data.solidPattern = "concentric";

  state.nodes[warp].data.mode = "sine2d";
  state.nodes[warp].data.amplitude = 0.9;
  state.nodes[warp].data.wavelength = 22;
  state.nodes[warp].data.affectTravel = false;
  state.nodes[warp].data.clampToBed = true;
  state.nodes[warp].data.zMin = 0;

  state.nodes[note].data.title = "Demo: Z Warp (Non-Planar Finish)";
  state.nodes[note].data.text =
`Turn planar skins into a wavy non-planar finish.\n\nGraph:\nMesh Primitive → Slicer → Z Warp → Printer → Export\n\nTry:\n- amplitude 0.3–1.5\n- wavelength 12–40\n- ripple mode for radial waves\n`;

  connect(prim, 0, slic, 0);
  connect(slic, 1, warp, 0);
  connect(warp, 0, exp, 0);
  connect(prn, 0, exp, 1);

  selectNode(prim);
  centerViewOn(prim);
  toast("Loaded demo: Z Warp");
  markDirtyAuto();
}


function demoFullControlNonplanarSpacer(){
  state = defaultState();
  const fc = addNode("FullControl Model", 120, 140);
  const prn= addNode("Printer", 470, 120);
  const exp= addNode("Export", 740, 120);
  const note=addNode("Note", 120, 470);

  state.nodes[fc].data.model="nonplanar_spacer";
  state.nodes[fc].data.height=18;
  state.nodes[fc].data.layerHeight=0.2;
  state.nodes[fc].data.spacerR=20;
  state.nodes[fc].data.spacerWall=4;
  state.nodes[fc].data.spacerWaveAmp=0.8;
  state.nodes[fc].data.spacerWaves=10;

  state.nodes[note].data.title="Demo: Nonplanar Spacer (wavy ring)";
  state.nodes[note].data.text =
`A simple ring spacer with a wavy/nonplanar outer wall.\n\nGraph:\nFullControl Model → Printer → Export\n\nTip:\n- Start with small wave amp (0.3–1.0mm)\n- Strong cooling helps on wavy Z\n`;

  connect(fc,0, exp,0);
  connect(prn,0, exp,1);

  selectNode(fc);
  centerViewOn(fc);
  toast("Loaded demo: Nonplanar Spacer");
  markDirtyAuto();
}

function demoCalibrationTower(){
  state = defaultState();
  const prim = addNode("Mesh Primitive", 90, 120);
  const slic = addNode("Slicer", 420, 120);
  const tower = addNode("Calibration Tower", 710, 120);
  const prn  = addNode("Printer", 980, 120);
  const exp  = addNode("Export", 1190, 120);
  const note = addNode("Note", 90, 470);

  state.nodes[prim].data.kind = "cube";
  state.nodes[prim].data.size = 20;
  state.nodes[prim].data.height = 120;
  state.nodes[prim].data.bedAlign = true;

  state.nodes[slic].data.mode = "planar";
  state.nodes[slic].data.layerHeight = 0.2;
  state.nodes[slic].data.perimeters = 2;
  state.nodes[slic].data.infillPct = 0;
  state.nodes[slic].data.topLayers = 0;
  state.nodes[slic].data.bottomLayers = 6;

  state.nodes[tower].data.by = "z";
  state.nodes[tower].data.target = "temp";
  state.nodes[tower].data.start = 230;
  state.nodes[tower].data.step = -5;
  state.nodes[tower].data.every = 10;
  state.nodes[tower].data.min = 190;
  state.nodes[tower].data.max = 260;

  state.nodes[note].data.title = "Demo: Temperature Tower (Rules)";
  state.nodes[note].data.text =
`Calibration Tower generates step-changes by height.\n\nGraph:\nMesh Primitive → Slicer → (rules) → Export\n\nSettings:\n- by Z\n- every 10mm\n- start 230°C, step -5°C\n\nConnect Calibration Tower → Export rules.\n`;

  connect(prim, 0, slic, 0);
  connect(slic, 1, exp, 0);
  connect(tower, 0, exp, 1);
  connect(prn, 0, exp, 2);

  selectNode(prim);
  centerViewOn(prim);
  toast("Loaded demo: Calibration Tower");
  markDirtyAuto();
}


function demoWeaveVase(){
  state = defaultState();
  const fc = addNode("FullControl Model", 120, 140);
  const weave = addNode("Weave Offset", 460, 160);
  const prn= addNode("Printer", 720, 120);
  const exp= addNode("Export", 1010, 120);
  const note=addNode("Note", 120, 470);

  state.nodes[fc].data.model="ripple_vase";
  state.nodes[fc].data.height=120;
  state.nodes[fc].data.radius=30;
  state.nodes[fc].data.rippleAmp=2.2;
  state.nodes[fc].data.ripples=10;
  state.nodes[weave].data.amp=0.7;
  state.nodes[weave].data.freq=9;

  state.nodes[note].data.title="Demo: Woven Vase (Weave Offset)";
  state.nodes[note].data.text =
`Add a weaving look by offsetting points along the path normal.\n\nGraph:\nFullControl Model → Weave Offset → Printer → Export\n\nTry:\n- amp 0.3–1.2\n- freq 5–14\n`;

  connect(fc,0, weave,0);
  connect(weave,0, exp,0);
  connect(prn,0, exp,1);

  selectNode(fc);
  centerViewOn(fc);
  toast("Loaded demo: Woven Vase");
  markDirtyAuto();
}

function demoThreadedTube(){
  state = defaultState();
  const fc = addNode("FullControl Model", 120, 140);
  const prn= addNode("Printer", 470, 120);
  const exp= addNode("Export", 740, 120);
  const note=addNode("Note", 120, 470);

  state.nodes[fc].data.model="threaded_tube";
  state.nodes[fc].data.height=60;
  state.nodes[fc].data.layerHeight=0.2;
  state.nodes[fc].data.tubeR=14;
  state.nodes[fc].data.tubeWall=2.6;
  state.nodes[fc].data.pitch=2.0;
  state.nodes[fc].data.threadDepth=0.7;

  state.nodes[note].data.title="Demo: Threaded Tube (path-first)";
  state.nodes[note].data.text =
`Inspired by FullControl-style threaded tubes. This is a simplified external thread.\n\nGraph:\nFullControl Model → Printer → Export\n\nTip:\n- Increase depth carefully (risk of collisions)\n`;

  connect(fc,0, exp,0);
  connect(prn,0, exp,1);

  selectNode(fc);
  centerViewOn(fc);
  toast("Loaded demo: Threaded Tube");
  markDirtyAuto();
}

function demoSnakeFill(){
  state = defaultState();
  const prim = addNode("Mesh Primitive", 120, 140);
  const slic = addNode("Slicer", 460, 120);
  const snake= addNode("Snake Wall", 720, 150);
  const prn = addNode("Printer", 720, 320);
  const exp = addNode("Export", 1010, 120);
  const note= addNode("Note", 120, 470);

  state.nodes[prim].data.primitive="cube";
  state.nodes[prim].data.size=40;
  state.nodes[slic].data.mode="planar";
  state.nodes[slic].data.infill=0; // let snake do the fill
  state.nodes[snake].data.spacing=0.8;

  state.nodes[note].data.title="Demo: Snake Mode Fill (fast zig-zag)";
  state.nodes[note].data.text =
`Snake Wall converts the sliced path bounds into a zig-zag fill.\n\nGraph:\nMesh Primitive → Slicer → Snake Wall → Export\n\nTip:\n- Use low infill in slicer (0%)\n- Works best on simple shapes\n`;

  connect(prim,0, slic,0);
  connect(slic,1, snake,0);
  connect(snake,0, exp,0);
  connect(prn,0, exp,1);

  selectNode(prim);
  centerViewOn(prim);
  toast("Loaded demo: Snake Fill");
  markDirtyAuto();
}


function demoHueforgeImage(){
  state = defaultState();
  const img = addNode("Image (HueForge)", 120, 140);
  const slic= addNode("Slicer", 470, 140);
  const prn = addNode("Printer", 780, 120);
  const exp = addNode("Export", 1040, 120);
  const note= addNode("Note", 120, 470);

  // build a small synthetic image (gradient + circle)
  const c=document.createElement("canvas");
  c.width=240; c.height=160;
  const ctx=c.getContext("2d");
  const g=ctx.createLinearGradient(0,0,c.width,0);
  g.addColorStop(0,"#101014");
  g.addColorStop(0.5,"#9aa0ab");
  g.addColorStop(1,"#f3f3f3");
  ctx.fillStyle=g; ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle="rgba(0,255,160,0.9)";
  ctx.beginPath(); ctx.arc(c.width*0.68, c.height*0.52, 42, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle="rgba(0,0,0,0.25)";
  ctx.font="bold 28px ui-sans-serif";
  ctx.fillText("HF", 22, 44);

  state.nodes[img].data.imgB64 = c.toDataURL("image/png");
  state.nodes[img].data.widthMM = 120;
  state.nodes[img].data.thicknessMin = 0.7;
  state.nodes[img].data.thicknessMax = 3.2;
  state.nodes[img].data.gamma = 1.6;
  state.nodes[img].data.layerHeight = 0.2;
  state.nodes[img].data.palette = [
    {name:"Black", hex:"#0b0b0c"},
    {name:"Gray", hex:"#6a6f7a"},
    {name:"White", hex:"#f2f2f2"},
    {name:"Neon Green", hex:"#00ffa0"},
  ];
  state.nodes[img].data.stops = [{layer:0,idx:0},{layer:10,idx:1},{layer:22,idx:2},{layer:34,idx:3}];
  state.nodes[img].data.autoStops=false;

  state.nodes[slic].data.mode="planar";
  state.nodes[slic].data.layerHeight=0.2;
  state.nodes[slic].data.perimeters=2;
  state.nodes[slic].data.infillPct=0;
  state.nodes[slic].data.topLayers=0;
  state.nodes[slic].data.bottomLayers=0;

  state.nodes[note].data.title="Demo: HueForge Image (relief + filament swaps)";
  state.nodes[note].data.text =
`This demo uses the Image (HueForge) node.\n\nGraph:\nImage (HueForge) → Slicer → Export\n\n- The image becomes a relief mesh (thickness varies by brightness)\n- Stops define swap-by-layer changes (M600 by default)\n\nTry:\n- tweak gamma / thickness range\n- adjust stops (layer → palette index)\n`;

  connect(img, 0, slic, 0);     // mesh
  connect(img, 1, exp, 1);      // rules
  connect(slic, 1, exp, 0);     // path
  connect(prn, 0, exp, 2);      // profile

  selectNode(img);
  centerViewOn(img);
  toast("Loaded demo: HueForge Image");
  markDirtyAuto();
}

const DEMOS = [
  { id:"hueforge_img", name:"Demo: HueForge Image (relief + swaps)", build: demoHueforgeImage },
  { id:"woven_vase", name:"Demo: Woven Vase (Weave Offset)", build: demoWeaveVase },
  { id:"thread_tube", name:"Demo: Threaded Tube", build: demoThreadedTube },
  { id:"snake_fill", name:"Demo: Snake Mode Fill", build: demoSnakeFill },
  { id:"fc_ripple", name:"Demo: FullControl Ripple Vase", build: demoFullControlRipple },
  { id:"fc_polar", name:"Demo: Fractional Engine (Polar)", build: demoPolarFractions },
  { id:"fc_pin", name:"Demo: Pin Support Challenge", build: demoPinSupport },
  { id:"fc_spacer", name:"Demo: Nonplanar Spacer (wavy ring)", build: demoFullControlNonplanarSpacer },
  { id:"z_warp", name:"Demo: Z Warp (Non-Planar Finish)", build: demoZWarp },
  { id:"cal_tower", name:"Demo: Calibration Tower (Temp steps)", build: demoCalibrationTower },
  { id:"feature_paint_opt", name:"Demo: Feature Paint + Travel Optimize (Orca-ish)", build: demoFeaturePaintOptimize },
  { id:"planar_slice_cube_v2", name:"Demo: Planar Slice (v2) — Cube (Primitive → Slicer)", build: demoPlanarSliceCubeV2 },
  { id:"stl_planar_slice_template_v2", name:"Demo: STL Planar Slice (v2) — template (Import → Slicer)", build: demoSTLPlanarSliceTemplateV2 },
  { id:"nonplanar_wave", name:"Demo: Non-Planar Wave (z warp + rules)", build: demoNonPlanarWave },
  { id:"spiral_vase", name:"Demo: Spiral Vase (rules + fan ramp)", build: demoSpiralVase },
  { id:"svg_heart", name:"Demo: SVG Heart (layered twist)", build: demoSVGHeart },
  { id:"lissajous", name:"Demo: Lissajous Layers (speed mod)", build: demoLissajous },
  { id:"mesh_dome_project", name:"Demo: Mesh Dome Projection (project path to surface)", build: demoMeshDomeProject },
  { id:"mesh_wavy_surface", name:"Demo: Wavy Surface (mesh primitive + projection + temp)", build: demoMeshWavySurface },
  { id:"mesh_surface_raster_dome", name:"Legacy: Surface Raster (Mesh outputs path) — Dome", build: demoMeshSurfaceRasterDome },
  { id:"mesh_surface_raster_wavy", name:"Legacy: Surface Raster (Mesh outputs path) — Wavy", build: demoMeshSurfaceRasterWavy },
  { id:"stl_surface_raster_template", name:"Demo: STL Surface Raster (upload STL) — template", build: demoSTLSurfaceRasterTemplate },
  { id:"array_repeat", name:"Demo: Array Repeat (grid tiles)", build: demoArrayRepeat },
  { id:"orca_import_starter", name:"Demo: Orca Import Starter (bundles → profile)", build: demoOrcaImportStarter },
];

const DEMO_DOCS = {
  z_warp: `Non-planar finish using **Z Warp**.

- Slicer makes planar skins
- Z Warp perturbs Z based on X,Y

Try amplitude 0.3–1.5mm.
`,
  cal_tower: `Calibration Tower generates step changes (temp/flow/speed/fan).

Use a tall primitive, connect to Export → rules.
`,
  feature_paint_opt: `Feature tuning + travel optimization.

- Edit Feature Paint rules to change speed/flow by role.
- Toggle Travel Optimize per-layer to see travel reductions.
- Use Inspector to verify role counts + bounds.
`,
  nonplanar_wave: `Non-planar demo.\n\nGraph: Path Generator → Z Warp (non-planar) → Rules → Printer → Export.\n\nTip examples:\n- Speed ramp: 1800 + 1200*sin(t*tau)\n- Flow taper: 1 - 0.15*t\n- Fan ramp: 255*t`,
  spiral_vase: `Spiral vase (continuous Z). Uses per-point rules for fan/temp ramps.\n\nTry:\n- fan(t)=clamp(255*t,0,255)\n- temp(t)=210+8*sin(t*tau)`,
  svg_heart: `SVG import → sampling → layered twist.\n\nLoad an SVG in the SVG node, then tweak sample step and layers.`,
  mesh_surface_raster_dome: `Surface raster from Mesh Primitive.\n\nSet Mesh Primitive → Path mode: Surface.\nExport will show non-planar toolpath on the mesh.`,
  stl_surface_raster_template: `Template for STL-based surface raster.\n\n1) Upload STL in the STL node.\n2) Choose raster spacing/angle.\n3) Project path to surface, then Export.`,
  orca_import_starter: `Import Orca presets.\n\n1) Add Orca Preset node.\n2) Import .orca_printer + .orca_filament.\n3) Select presets and run.\n\nExport will use the imported profile.`
};


function demoOrcaImportStarter(){
  demoBaseReset();
  const idMesh = uid(), idOrca = uid(), idExp = uid();
  const meshData = NODE_DEFS["Mesh Primitive"].initData();
  meshData.kind = "wavy";
  meshData.size = 140;
  meshData.seg = 40;
  meshData.height = 0;
  meshData.waveAmp = 6;
  meshData.waveFreq = 3;
  meshData.pathMode = "slice";
  meshData.slice_layerHeight = 0.24;
  meshData.slice_lineWidth = 0.45;
  meshData.slice_perimeters = 2;
  meshData.slice_infillPct = 15;
  meshData.slice_infillPattern = "grid";
  meshData.slice_topLayers = 4;
  meshData.slice_bottomLayers = 4;

  state.nodes[idMesh] = { id:idMesh, type:"Mesh Primitive", x:110, y:140, w:360, h:360, data: meshData };
  state.nodes[idOrca] = { id:idOrca, type:"Orca Preset", x:110, y:540, w:360, h:260, data: NODE_DEFS["Orca Preset"].initData() };
  state.nodes[idExp]  = { id:idExp, type:"Export", x:560, y:210, w:360, h:300, data: NODE_DEFS["Export"].initData() };

  state.links.push({ from:{node:idMesh, port:"path"}, to:{node:idExp, port:"path"} });
  state.links.push({ from:{node:idMesh, port:"mesh"}, to:{node:idExp, port:"mesh"} });
  state.links.push({ from:{node:idOrca, port:"profile"}, to:{node:idExp, port:"profile"} });

  state.ui.selectedNodeId = idOrca;
}


function demoNonPlanarWave(){
  demoBaseReset();
  const idPath = uid(), idNP=uid(), idRules=uid(), idPrn=uid(), idExp=uid();
  state.nodes[idPath] = { id:idPath, type:"Path", x:110, y:140, w:320, h:260, data: NODE_DEFS["Path"].initData() };
  state.nodes[idNP]   = { id:idNP, type:"Non-Planar", x:520, y:150, w:340, h:260, data: NODE_DEFS["Non-Planar"].initData() };
  state.nodes[idRules]= { id:idRules, type:"Rules", x:930, y:170, w:320, h:280, data: NODE_DEFS["Rules"].initData() };
  state.nodes[idPrn]  = { id:idPrn, type:"Printer", x:520, y:470, w:360, h:320, data: NODE_DEFS["Printer"].initData() };
  state.nodes[idExp]  = { id:idExp, type:"Export", x:1320, y:460, w:320, h:230, data: NODE_DEFS["Export"].initData() };

  // Path: a flat spiral (single layer) to make the non-planar Z warp visible
  const p = state.nodes[idPath].data;
  p.mode="spiral";
  p.radius=55;
  p.turns=5;
  p.stepsPerTurn=70;
  p.height=40;
  p.layerHeight=0.28;
  p.rotatePerLayerDeg=10;

  // Non-planar: add a wave based on XY
  const np = state.nodes[idNP].data;
  np.mode="offset";
  np.zExpr="1.4*sin(x/11) + 1.0*cos(y/15)";
  np.clamp="minmax";
  np.zMin=0;
  np.zMax=220;

  // Rules: gentle speed modulation
  const r = state.nodes[idRules].data;
  r.speedExpr="printSpeed*(0.7 + 0.3*sin(2*pi*t))";
  r.flowExpr="1";
  r.enableFan=true;
  r.fanExpr="255*t";
  r.enableTemp=false;

  state.links = [
    {id:uid(), from:{node:idPath, port:"path", type:"path"}, to:{node:idNP, port:"in", type:"path"}},
    {id:uid(), from:{node:idNP, port:"out", type:"path"}, to:{node:idExp, port:"path", type:"path"}},
    {id:uid(), from:{node:idRules, port:"rules", type:"rules"}, to:{node:idExp, port:"rules", type:"rules"}},
    {id:uid(), from:{node:idPrn, port:"profile", type:"profile"}, to:{node:idExp, port:"profile", type:"profile"}},
  ];

  populateUI();
  rerenderGraphAll();
  centerGraph();
  fitGraphView();
  markDirtyAuto();
}
function demoBaseReset(){
  state = defaultState();
  state.ui.theme = document.body.dataset.theme || "dark";
  state.ui.autoRun = true;
}
function demoSpiralVase(){
  demoBaseReset();
  const idPath = uid(), idNP=uid(), idRules=uid(), idPrn=uid(), idExp=uid();
  state.nodes[idPath] = { id:idPath, type:"Path", x:110, y:140, w:320, h:260, data: NODE_DEFS["Path"].initData() };
  state.nodes[idNP]  = { id:idNP, type:"Non-Planar", x:520, y:150, w:320, h:240, data: NODE_DEFS["Non-Planar"].initData() };
  state.nodes[idRules]= { id:idRules, type:"Rules", x:920, y:180, w:320, h:270, data: NODE_DEFS["Rules"].initData() };
  state.nodes[idPrn]  = { id:idPrn, type:"Printer", x:520, y:510, w:360, h:320, data: NODE_DEFS["Printer"].initData() };
  state.nodes[idExp]  = { id:idExp, type:"Export", x:1320, y:470, w:320, h:230, data: NODE_DEFS["Export"].initData() };
  const p = state.nodes[idPath].data;
  p.mode="spiral";
  p.spiral.height=160; p.spiral.radius=52; p.spiral.turns=160; p.spiral.waveAmp=9; p.spiral.waveFreq=11; p.spiral.layerHeight=0.24; p.spiral.stepsPerTurn=20;
  const np = state.nodes[idNP].data;
  np.mode="offset";
  np.zExpr="1.2*sin(x/10) + 0.8*cos(y/14)";
  np.clamp="minmax";
  np.zMin=0;
  np.zMax=220;

  const r = state.nodes[idRules].data;
  r.speedExpr = "printSpeed*(0.75 + 0.25*sin(2*pi*t))";
  r.flowExpr = "1";
  r.enableFan = true;
  r.fanExpr = "min(255, layer*10)";
  r.layerHeightHint = 0.24;
  r.injectEveryN = 2;
  const pr = state.nodes[idPrn].data;
  pr.name="Generic FDM (Spiral)";
  pr.bedW=220; pr.bedD=220; pr.origin="center"; pr.speedPrint=2400; pr.lineWidth=0.48; pr.tempNozzle=210; pr.tempBed=60;
  const ex = state.nodes[idExp].data; ex.fileName="demo_spiral_vase";
  state.links = [
    {id:uid(), from:{node:idPath, port:"path", type:"path"}, to:{node:idNP, port:"in", type:"path"}},
    {id:uid(), from:{node:idNP, port:"out", type:"path"}, to:{node:idExp, port:"path", type:"path"}},
    {id:uid(), from:{node:idRules, port:"rules", type:"rules"}, to:{node:idExp, port:"rules", type:"rules"}},
    {id:uid(), from:{node:idPrn, port:"profile", type:"profile"}, to:{node:idExp, port:"profile", type:"profile"}},
  ];
  state.ui.selectedNodeId = idExp;
}
function demoSVGHeart(){
  demoBaseReset();
  const idSvg = uid(), idXfm=uid(), idPrn=uid(), idExp=uid();
  state.nodes[idSvg] = { id:idSvg, type:"SVG Import", x:110, y:140, w:360, h:330, data: NODE_DEFS["SVG Import"].initData() };
  state.nodes[idXfm] = { id:idXfm, type:"Transform", x:520, y:200, w:320, h:220, data: NODE_DEFS["Transform"].initData() };
  state.nodes[idPrn] = { id:idPrn, type:"Printer", x:520, y:470, w:360, h:320, data: NODE_DEFS["Printer"].initData() };
  state.nodes[idExp] = { id:idExp, type:"Export", x:920, y:470, w:320, h:230, data: NODE_DEFS["Export"].initData() };
  const s = state.nodes[idSvg].data;
  s.sampleStep = 1.1; s.scaleMmPerUnit = 1.4; s.zMode = "layered"; s.layers = 34; s.layerHeight = 0.2; s.rotatePerLayerDeg = 3.5;
  const pr = state.nodes[idPrn].data;
  pr.name="Generic FDM (SVG)"; pr.origin="center"; pr.speedPrint=1900; pr.lineWidth=0.45; pr.tempNozzle=205; pr.tempBed=55;
  const ex = state.nodes[idExp].data; ex.fileName="demo_svg_heart";
  state.links = [
    {id:uid(), from:{node:idSvg, port:"path", type:"path"}, to:{node:idXfm, port:"in", type:"path"}},
    {id:uid(), from:{node:idXfm, port:"out", type:"path"}, to:{node:idExp, port:"path", type:"path"}},
    {id:uid(), from:{node:idPrn, port:"profile", type:"profile"}, to:{node:idExp, port:"profile", type:"profile"}},
  ];
  state.ui.selectedNodeId = idExp;
}
function demoLissajous(){
  demoBaseReset();
  const idPath = uid(), idNP=uid(), idRules=uid(), idPrn=uid(), idExp=uid();
  state.nodes[idPath] = { id:idPath, type:"Path", x:110, y:140, w:380, h:320, data: NODE_DEFS["Path"].initData() };
  state.nodes[idRules]= { id:idRules, type:"Rules", x:520, y:170, w:320, h:300, data: NODE_DEFS["Rules"].initData() };
  state.nodes[idPrn]  = { id:idPrn, type:"Printer", x:520, y:510, w:360, h:320, data: NODE_DEFS["Printer"].initData() };
  state.nodes[idExp]  = { id:idExp, type:"Export", x:920, y:510, w:320, h:230, data: NODE_DEFS["Export"].initData() };
  const p = state.nodes[idPath].data;
  p.mode="equation";
  p.equation.x = "A*sin(2*pi*3*t)";
  p.equation.y = "A*sin(2*pi*4*t + pi/2)";
  p.equation.steps = 520;
  p.equation.zMode = "layered";
  p.equation.layers = 60;
  p.equation.layerHeight = 0.18;
  p.equation.rotatePerLayerDeg = 2;
  const np = state.nodes[idNP].data;
  np.mode="offset";
  np.zExpr="1.2*sin(x/10) + 0.8*cos(y/14)";
  np.clamp="minmax";
  np.zMin=0;
  np.zMax=220;

  const r = state.nodes[idRules].data;
  r.speedExpr = "printSpeed*(0.5 + 0.5*(0.5+0.5*sin(2*pi*t)))";
  r.flowExpr = "1";
  r.enableTemp = true;
  r.tempExpr = "nozzleTemp - 5*sin(pi*layer/30)";
  r.layerHeightHint = 0.18;
  r.injectEveryN = 3;
  const pr = state.nodes[idPrn].data;
  pr.name="Generic FDM (Lissajous)"; pr.origin="center"; pr.speedPrint=2100; pr.lineWidth=0.42; pr.tempNozzle=210; pr.tempBed=50;
  const ex = state.nodes[idExp].data; ex.fileName="demo_lissajous_layers";
  state.links = [
    {id:uid(), from:{node:idPath, port:"path", type:"path"}, to:{node:idNP, port:"in", type:"path"}},
    {id:uid(), from:{node:idNP, port:"out", type:"path"}, to:{node:idExp, port:"path", type:"path"}},
    {id:uid(), from:{node:idRules, port:"rules", type:"rules"}, to:{node:idExp, port:"rules", type:"rules"}},
    {id:uid(), from:{node:idPrn, port:"profile", type:"profile"}, to:{node:idExp, port:"profile", type:"profile"}},
  ];
  state.ui.selectedNodeId = idExp;
}

function demoMeshDomeProject(){
  demoBaseReset();
  const idMesh=uid(), idPath=uid(), idProj=uid(), idRules=uid(), idPrn=uid(), idExp=uid();
  state.nodes[idMesh] = { id:idMesh, type:"Mesh Primitive", x:110, y:140, w:340, h:280, data: NODE_DEFS["Mesh Primitive"].initData() };
  state.nodes[idPath] = { id:idPath, type:"Path", x:110, y:470, w:320, h:260, data: NODE_DEFS["Path"].initData() };
  state.nodes[idProj] = { id:idProj, type:"Project to Mesh", x:520, y:460, w:340, h:220, data: NODE_DEFS["Project to Mesh"].initData() };
  state.nodes[idRules]= { id:idRules, type:"Rules", x:920, y:470, w:320, h:280, data: NODE_DEFS["Rules"].initData() };
  state.nodes[idPrn]  = { id:idPrn, type:"Printer", x:520, y:140, w:360, h:320, data: NODE_DEFS["Printer"].initData() };
  state.nodes[idExp]  = { id:idExp, type:"Export", x:1320, y:460, w:320, h:240, data: NODE_DEFS["Export"].initData() };

  const me = state.nodes[idMesh].data;
  me.kind="dome"; me.size=140; me.height=35; me.seg=52; me.cellSize=10;

  const p = state.nodes[idPath].data;
  p.mode="spiral";
  p.spiral.height = 0;
  p.spiral.layerHeight = 0.24;
  p.spiral.radius = 55;
  p.spiral.turns = 70;
  p.spiral.waveAmp = 0;
  p.spiral.waveFreq = 1;
  p.spiral.stepsPerTurn = 22;

  const pr = state.nodes[idProj].data;
  pr.mode="replace";
  pr.offsetZ = 0.0;
  pr.fallback="keep";

  const r = state.nodes[idRules].data;
  r.enableSpeed = true;
  r.speedExpr = "1200 + 500*sin(2*pi*t)";
  r.enableFlow = true;
  r.flowExpr = "1";
  r.enableTemp = false;
  r.enableFan = true;
  r.fanExpr = "200*(layer/120)";

  state.links = [
    {id:uid(), from:{node:idPath, port:"path", type:"path"}, to:{node:idProj, port:"path", type:"path"}},
    {id:uid(), from:{node:idMesh, port:"mesh", type:"mesh"}, to:{node:idProj, port:"mesh", type:"mesh"}},
    {id:uid(), from:{node:idProj, port:"out", type:"path"}, to:{node:idExp, port:"path", type:"path"}},
    {id:uid(), from:{node:idRules, port:"rules", type:"rules"}, to:{node:idExp, port:"rules", type:"rules"}},
    {id:uid(), from:{node:idPrn, port:"profile", type:"profile"}, to:{node:idExp, port:"profile", type:"profile"}},
    {id:uid(), from:{node:idMesh, port:"mesh", type:"mesh"}, to:{node:idExp, port:"mesh", type:"mesh"}},
  ];
  state.ui.selectedNodeId = idExp;
  renderGraph();
}

function demoMeshWavySurface(){
  demoBaseReset();
  const idMesh=uid(), idPath=uid(), idProj=uid(), idRules=uid(), idPrn=uid(), idExp=uid();
  state.nodes[idMesh] = { id:idMesh, type:"Mesh Primitive", x:110, y:140, w:340, h:300, data: NODE_DEFS["Mesh Primitive"].initData() };
  state.nodes[idPath] = { id:idPath, type:"Path", x:110, y:510, w:320, h:260, data: NODE_DEFS["Path"].initData() };
  state.nodes[idProj] = { id:idProj, type:"Project to Mesh", x:520, y:510, w:340, h:220, data: NODE_DEFS["Project to Mesh"].initData() };
  state.nodes[idRules]= { id:idRules, type:"Rules", x:920, y:530, w:320, h:300, data: NODE_DEFS["Rules"].initData() };
  state.nodes[idPrn]  = { id:idPrn, type:"Printer", x:520, y:140, w:360, h:340, data: NODE_DEFS["Printer"].initData() };
  state.nodes[idExp]  = { id:idExp, type:"Export", x:1320, y:520, w:320, h:240, data: NODE_DEFS["Export"].initData() };

  const me = state.nodes[idMesh].data;
  me.kind="wavy"; me.size=160; me.height=20; me.seg=58; me.waveAmp=10; me.waveFreq=3; me.cellSize=10;

  const p = state.nodes[idPath].data;
  p.mode="equation";
  p.equation.x="70*cos(2*pi*t*6)";
  p.equation.y="70*sin(2*pi*t*5)";
  p.equation.t0=0; p.equation.t1=1;
  p.equation.steps=5000;
  p.equation.zMode="layered";
  p.equation.z="0";
  p.equation.layers=1;
  p.equation.layerHeight=0.24;
  p.equation.rotatePerLayerDeg=0;

  const pr = state.nodes[idProj].data;
  pr.mode="replace";
  pr.offsetZ = 0.0;
  pr.fallback="keep";

  const r = state.nodes[idRules].data;
  r.enableSpeed = true;
  r.speedExpr = "900 + 800*(1-abs(2*t-1))";
  r.enableFlow = true;
  r.flowExpr = "0.95 + 0.15*sin(2*pi*t*8)";
  r.enableTemp = true;
  r.tempExpr = "210 + 8*sin(2*pi*t*2)";
  r.enableFan = true;
  r.fanExpr = "160 + 80*sin(2*pi*t*2)";
  r.injectEveryN = 3;

  state.links = [
    {id:uid(), from:{node:idPath, port:"path", type:"path"}, to:{node:idProj, port:"path", type:"path"}},
    {id:uid(), from:{node:idMesh, port:"mesh", type:"mesh"}, to:{node:idProj, port:"mesh", type:"mesh"}},
    {id:uid(), from:{node:idProj, port:"out", type:"path"}, to:{node:idExp, port:"path", type:"path"}},
    {id:uid(), from:{node:idRules, port:"rules", type:"rules"}, to:{node:idExp, port:"rules", type:"rules"}},
    {id:uid(), from:{node:idPrn, port:"profile", type:"profile"}, to:{node:idExp, port:"profile", type:"profile"}},
    {id:uid(), from:{node:idMesh, port:"mesh", type:"mesh"}, to:{node:idExp, port:"mesh", type:"mesh"}},
  ];
  state.ui.selectedNodeId = idExp;
  renderGraph();
}

function demoArrayRepeat(){
  demoBaseReset();
  const idPath=uid(), idRep=uid(), idRules=uid(), idPrn=uid(), idExp=uid();
  state.nodes[idPath] = { id:idPath, type:"Path", x:110, y:180, w:320, h:280, data: NODE_DEFS["Path"].initData() };
  state.nodes[idRep]  = { id:idRep, type:"Repeat", x:520, y:220, w:320, h:240, data: NODE_DEFS["Repeat"].initData() };
  state.nodes[idRules]= { id:idRules, type:"Rules", x:920, y:250, w:320, h:280, data: NODE_DEFS["Rules"].initData() };
  state.nodes[idPrn]  = { id:idPrn, type:"Printer", x:520, y:500, w:360, h:320, data: NODE_DEFS["Printer"].initData() };
  state.nodes[idExp]  = { id:idExp, type:"Export", x:1320, y:260, w:320, h:240, data: NODE_DEFS["Export"].initData() };

  const p = state.nodes[idPath].data;
  p.mode="equation";
  p.equation.x="18*cos(2*pi*t)";
  p.equation.y="18*sin(2*pi*t)";
  p.equation.steps=1200;
  p.equation.zMode="layered";
  p.equation.z="0";
  p.equation.layers=1;
  p.equation.layerHeight=0.22;

  const rep = state.nodes[idRep].data;
  rep.nx=4; rep.ny=3; rep.dx=55; rep.dy=55; rep.center=true;

  const r = state.nodes[idRules].data;
  r.enableSpeed=true;
  r.speedExpr="1800";
  r.enableFlow=true;
  r.flowExpr="1";
  r.enableFan=false;
  r.enableTemp=false;

  state.links = [
    {id:uid(), from:{node:idPath, port:"path", type:"path"}, to:{node:idRep, port:"in", type:"path"}},
    {id:uid(), from:{node:idRep, port:"out", type:"path"}, to:{node:idExp, port:"path", type:"path"}},
    {id:uid(), from:{node:idRules, port:"rules", type:"rules"}, to:{node:idExp, port:"rules", type:"rules"}},
    {id:uid(), from:{node:idPrn, port:"profile", type:"profile"}, to:{node:idExp, port:"profile", type:"profile"}},
  ];
  state.ui.selectedNodeId = idExp;
  renderGraph();
}


function demoMeshSurfaceRasterDome(){
  demoBaseReset();
  const idMesh=uid(), idRules=uid(), idPrn=uid(), idExp=uid();
  state.nodes[idMesh] = { id:idMesh, type:"Mesh Primitive", x:110, y:150, w:360, h:560, data: NODE_DEFS["Mesh Primitive"].initData() };
  const md = state.nodes[idMesh].data;
  md.type="dome";
  md.radius=55;
  md.height=35;
  md.res=60;
  md.surfacePathEnabled=true;
  md.spacing=1.2;
  md.step=0.8;
  md.angleDeg=35;
  md.zOffset=0.0;
  md.serpentine=true;
  md.cellSize=10;

  state.nodes[idRules]= { id:idRules, type:"Rules", x:560, y:210, w:320, h:290, data: NODE_DEFS["Rules"].initData() };
  const r = state.nodes[idRules].data;
  r.enableSpeed=true; r.speedExpr="printSpeed*(0.7 + 0.3*cos(2*pi*t))";
  r.enableFlow=false;
  r.enableTemp=false;
  r.enableFan=false;

  state.nodes[idPrn]  = { id:idPrn, type:"Printer", x:560, y:540, w:360, h:320, data: NODE_DEFS["Printer"].initData() };
  state.nodes[idExp]  = { id:idExp, type:"Export", x:960, y:420, w:340, h:260, data: NODE_DEFS["Export"].initData() };

  state.links = [
    {id:uid(), from:{node:idMesh, port:"path", type:"path"}, to:{node:idExp, port:"path", type:"path"}},
    {id:uid(), from:{node:idMesh, port:"mesh", type:"mesh"}, to:{node:idExp, port:"mesh", type:"mesh"}},
    {id:uid(), from:{node:idRules, port:"rules", type:"rules"}, to:{node:idExp, port:"rules", type:"rules"}},
    {id:uid(), from:{node:idPrn, port:"profile", type:"profile"}, to:{node:idExp, port:"profile", type:"profile"}},
  ];
  demoFinalize();
}

function demoMeshSurfaceRasterWavy(){
  demoBaseReset();
  const idMesh=uid(), idRules=uid(), idPrn=uid(), idExp=uid();
  state.nodes[idMesh] = { id:idMesh, type:"Mesh Primitive", x:110, y:150, w:360, h:560, data: NODE_DEFS["Mesh Primitive"].initData() };
  const md = state.nodes[idMesh].data;
  md.type="wavy";
  md.size=120;
  md.amp=6;
  md.freq=4;
  md.res=70;
  md.surfacePathEnabled=true;
  md.spacing=1.0;
  md.step=0.7;
  md.angleDeg=0;
  md.zOffset=0.0;
  md.serpentine=true;
  md.cellSize=10;

  state.nodes[idRules]= { id:idRules, type:"Rules", x:560, y:210, w:320, h:290, data: NODE_DEFS["Rules"].initData() };
  const r = state.nodes[idRules].data;
  r.enableSpeed=true; r.speedExpr="printSpeed*(0.55 + 0.45*sin(2*pi*t*2))";
  r.enableTemp=true; r.tempExpr="nozzleTemp + 8*sin(2*pi*t)";
  r.enableFan=false;

  state.nodes[idPrn]  = { id:idPrn, type:"Printer", x:560, y:540, w:360, h:320, data: NODE_DEFS["Printer"].initData() };
  state.nodes[idExp]  = { id:idExp, type:"Export", x:960, y:420, w:340, h:260, data: NODE_DEFS["Export"].initData() };

  state.links = [
    {id:uid(), from:{node:idMesh, port:"path", type:"path"}, to:{node:idExp, port:"path", type:"path"}},
    {id:uid(), from:{node:idMesh, port:"mesh", type:"mesh"}, to:{node:idExp, port:"mesh", type:"mesh"}},
    {id:uid(), from:{node:idRules, port:"rules", type:"rules"}, to:{node:idExp, port:"rules", type:"rules"}},
    {id:uid(), from:{node:idPrn, port:"profile", type:"profile"}, to:{node:idExp, port:"profile", type:"profile"}},
  ];
  demoFinalize();
}

function demoSTLSurfaceRasterTemplate(){
  demoBaseReset();
  const idMesh=uid(), idRules=uid(), idPrn=uid(), idExp=uid();
  state.nodes[idMesh] = { id:idMesh, type:"Mesh Import", x:110, y:150, w:360, h:640, data: NODE_DEFS["Mesh Import"].initData() };
  const md = state.nodes[idMesh].data;
  md.surfacePathEnabled=true;
  md.spacing=1.0;
  md.step=0.7;
  md.angleDeg=25;
  md.margin=0;
  md.zOffset=0.0;
  md.serpentine=true;
  md.cellSize=10;

  state.nodes[idRules]= { id:idRules, type:"Rules", x:560, y:230, w:320, h:290, data: NODE_DEFS["Rules"].initData() };
  const r = state.nodes[idRules].data;
  r.enableSpeed=true; r.speedExpr="printSpeed";
  r.enableFlow=false; r.enableTemp=false; r.enableFan=false;

  state.nodes[idPrn]  = { id:idPrn, type:"Printer", x:560, y:560, w:360, h:320, data: NODE_DEFS["Printer"].initData() };
  state.nodes[idExp]  = { id:idExp, type:"Export", x:960, y:470, w:340, h:260, data: NODE_DEFS["Export"].initData() };

  state.links = [
    {id:uid(), from:{node:idMesh, port:"path", type:"path"}, to:{node:idExp, port:"path", type:"path"}},
    {id:uid(), from:{node:idMesh, port:"mesh", type:"mesh"}, to:{node:idExp, port:"mesh", type:"mesh"}},
    {id:uid(), from:{node:idRules, port:"rules", type:"rules"}, to:{node:idExp, port:"rules", type:"rules"}},
    {id:uid(), from:{node:idPrn, port:"profile", type:"profile"}, to:{node:idExp, port:"profile", type:"profile"}},
  ];
  demoFinalize();
}



function addDemoNote(text){
  if(!text) return;
  // avoid multiple notes on reload
  const hasNote = Object.values(state.nodes||{}).some(n=>n.type==="Note");
  if(hasNote) return;
  const id = addNode("Note", 40, 110);
  state.nodes[id].data.text = String(text);
  state.nodes[id].data.compact = false;
}

function loadDemoById(id){
  const d = DEMOS.find(x=>x.id===id) || DEMOS[0];
  try{
    d.build();
    addDemoNote(DEMO_DOCS[d.id] || "");
    state = sanitizeImported(state);
  }catch(e){
    console.warn(e);
    toast("Demo failed: " + (e?.message||String(e)));
    state = sanitizeImported(defaultState());
    ensureDefaultGraph();
  }
  document.body.dataset.theme = state.ui.theme;
  document.getElementById("btnAuto").textContent = `Auto: ${state.ui.autoRun ? "ON" : "OFF"}`;
  renderParamEditor();
  renderNodeLibrary();
  renderGraph();
  clearOutputs();
  saveState();
  try{ evaluateGraph(); }catch(e){ console.warn(e); setStatus("Error"); toast(e.message||String(e)); }
  toast(d.name);
}

/* ---------------------------
   Top bar actions
---------------------------- */
document.getElementById("btnTheme").addEventListener("click", ()=>{
  state.ui.theme = (state.ui.theme==="dark") ? "light" : "dark";
  document.body.dataset.theme = state.ui.theme;
  saveState();
  renderNodeLibrary();
  renderGraph();
  updateOutputUI();
  schedulePreviewUpdate();
});
document.getElementById("btnFit").addEventListener("click", ()=>{
  const nodes = Object.values(state.nodes);
  if(!nodes.length) return;
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for(const n of nodes){
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + (n.w||320));
    maxY = Math.max(maxY, n.y + (n.h||220));
  }
  const rect = graphWrap.getBoundingClientRect();
  const pad = 80;
  const w = Math.max(1, maxX-minX);
  const h = Math.max(1, maxY-minY);
  const z = clamp(Math.min((rect.width-pad)/w, (rect.height-pad)/h), 0.35, 1.6);
  state.ui.zoom = z;
  const cx = (minX+maxX)/2;
  const cy = (minY+maxY)/2;
  state.ui.panX = rect.width/2 - cx*z;
  state.ui.panY = rect.height/2 - cy*z;
  applyGraphTransform(); requestLinkRedraw(); saveState();
  toast("Fit view");
});
document.getElementById("btnCenter").addEventListener("click", ()=>{
  const rect = graphWrap.getBoundingClientRect();
  let target = state.ui.selectedNodeId ? state.nodes[state.ui.selectedNodeId] : null;
  if(!target){
    const nodes = Object.values(state.nodes);
    if(!nodes.length) return;
    target = nodes[0];
  }
  const cx = (target.x + (target.w||320)/2);
  const cy = (target.y + (target.h||220)/2);
  state.ui.panX = rect.width/2 - cx*state.ui.zoom;
  state.ui.panY = rect.height/2 - cy*state.ui.zoom;
  applyGraphTransform(); requestLinkRedraw(); saveState();
  toast("Centered");
});

document.getElementById("btnAddNode").addEventListener("click", (e)=>{
  e.preventDefault();
  openNodePicker();
});

document.getElementById("btnAuto").addEventListener("click", ()=>{
  state.ui.autoRun = !state.ui.autoRun;
  document.getElementById("btnAuto").textContent = `Auto: ${state.ui.autoRun ? "ON" : "OFF"}`;
  saveState();
  toast(`Auto-run ${state.ui.autoRun ? "enabled" : "disabled"}`);
});
document.getElementById("btnRun").addEventListener("click", ()=>{
  try{ evaluateGraph(); toast("Graph ran"); }
  catch(e){ console.error(e); setStatus("Error"); toast(e.message||String(e)); }
});
document.getElementById("btnDownload").addEventListener("click", ()=>{
  if(!state.outputs.gcode){ try{ evaluateGraph(); }catch(e){} }
  if(!state.outputs.gcode){ toast("No output"); return; }
  const exp = Object.values(state.nodes).find(n=>n.type==="Export");
  const fname = exp?.data?.fileName || "gcode-studio_output";
  downloadText(`${safeName(fname)}.gcode`, state.outputs.gcode);
});
document.getElementById("btnSave").addEventListener("click", ()=>{
  downloadText("gcode-studio_project.json", JSON.stringify(state, null, 2));
});
document.getElementById("btnLoad").addEventListener("click", ()=>{
  document.getElementById("fileLoad").click();
});
document.getElementById("fileLoad").addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  e.target.value="";
  if(!file) return;
  try{
    const txt = await file.text();
    state = sanitizeImported(JSON.parse(txt));
    document.body.dataset.theme = state.ui.theme;
    document.getElementById("btnAuto").textContent = `Auto: ${state.ui.autoRun ? "ON" : "OFF"}`;
    renderParamEditor();
    renderNodeLibrary();
    renderGraph();
    updateOutputUI();
    schedulePreviewUpdate();
    saveState();
    toast("Imported");
  }catch(err){
    console.error(err);
    toast("Import failed");
  }
});
document.getElementById("btnNew").addEventListener("click", ()=>{
  state = defaultState();
  state.ui.theme = document.body.dataset.theme || "dark";
  document.getElementById("btnAuto").textContent = `Auto: ${state.ui.autoRun ? "ON" : "OFF"}`;
  ensureDefaultGraph();
  renderParamEditor();
  renderNodeLibrary();
  renderGraph();
  clearOutputs();
  saveState();
  toast("New project");
});
document.getElementById("btnClearOut").addEventListener("click", ()=>{
  clearOutputs();
  toast("Cleared output");
});
document.getElementById("btnCopy").addEventListener("click", async ()=>{
  try{ await navigator.clipboard.writeText(state.outputs.gcode || ""); toast("Copied"); }
  catch(e){ toast("Copy blocked"); }
});
document.getElementById("btnFitPreview").addEventListener("click", ()=> fitPreviewToData());

/* Demo UI */
const demoDropdown = document.getElementById("demoDropdown");
const btnDemo = document.getElementById("btnDemo");
const demoMenu = document.getElementById("demoMenu");

function populateDemoMenu(){
  demoMenu.innerHTML = "";
  for(const d of DEMOS){
    const item = document.createElement("button");
    item.type = "button";
    item.className = "menuItem";
    const left = document.createElement("span");
    left.textContent = d.name;
    const right = document.createElement("small");
    right.textContent = d.id;
    item.appendChild(left);
    item.appendChild(right);
    item.addEventListener("click", ()=>{
      demoMenu?.classList?.remove("open");
      loadDemoById(d.id);
    });
    demoMenu.appendChild(item);
  }
}

function toggleDemoMenu(){
  demoMenu.classList.toggle("open");
}

btnDemo.addEventListener("click", (e)=>{
  e.stopPropagation();
  toggleDemoMenu();
});

document.addEventListener("mousedown", (e)=>{
  if(!demoDropdown.contains(e.target)){
    demoMenu?.classList?.remove("open");
  }
});

/* ---------------------------
   Keyboard
---------------------------- */
window.addEventListener("keydown", (e)=>{
  // Close menus / overlays
  if(e.key==="Escape"){
    try{ demoMenu?.classList?.remove("open"); }catch(_){}
    try{ closeNodePicker(); }catch(_){}
    try{ closeSettings(); }catch(_){}
    return;
  }

  // Comfy-style node picker
  if((e.code==="Space" || e.key===" ") && canUseSpacePicker()){
    e.preventDefault();
    if(!nodePicker.open) openNodePicker("");
    return;
  }
  if((e.ctrlKey || e.metaKey) && (e.key==="k" || e.key==="K")){
    if(canUseSpacePicker()){
      e.preventDefault();
      if(!nodePicker.open) openNodePicker("");
    }
  }

  // Graph shortcuts
  if((e.key==="Delete" || e.key==="Backspace") && !isTyping()){
    const id = state.ui.selectedNodeId;
    if(id){ deleteNode(id); saveState(); markDirtyAuto(); }
  }
  if((e.key==="g"||e.key==="G") && !isTyping()){
    try{ evaluateGraph(); toast("Graph ran"); }catch(err){ toast(err.message||String(err)); }
  }
  if((e.key==="f"||e.key==="F") && !isTyping()){
    document.getElementById("btnFit").click();
  }
});

/* ---------------------------
   Boot
---------------------------- */
function ensureStudioViewNode(){
  try{
    const exists = Object.values(state.nodes).some(n=>n.type==="Studio View");
    if(exists) return;
    const id = addNode("Studio View", 1580, 80);
    const n = state.nodes[id];
    // Prefer node's own defaultSize if present
    const def = NODE_DEFS["Studio View"];
    if(def && def.defaultSize){
      n.w = def.defaultSize.w;
      n.h = def.defaultSize.h;
    }else{
      n.w = 560; n.h = 780;
    }
  }catch(e){ console.warn(e); }
}

function boot(){
  try{ loadAppSettings(); }catch(e){ console.warn(e); }
  try{ populateDemoMenu(); }catch(e){ console.warn(e); toast(e.message||String(e)); }

  try{ state = loadState(); }catch(e){ console.warn(e); state = defaultState(); toast(e.message||String(e)); }

  try{
    document.body.dataset.theme = state.ui.theme || "dark";
    document.getElementById("btnAuto").textContent = `Auto: ${state.ui.autoRun ? "ON" : "OFF"}`;
  }catch(e){ console.warn(e); }

  try{ ensureDefaultGraph(); }catch(e){ console.warn(e); toast(e.message||String(e)); }

  try{ ensureStudioViewNode(); }catch(e){ console.warn(e); }

  try{ renderParamEditor(); }catch(e){ console.warn(e); toast(e.message||String(e)); }

  try{ renderNodeLibrary(); }catch(e){ console.warn(e); toast("Library error: " + (e.message||String(e))); }

  try{ renderGraph(); applyGraphTransform(); }catch(e){ console.warn(e); toast("Graph render error: " + (e.message||String(e))); }
  try{ graphWrap.focus({preventScroll:true}); }catch(_){ }

  try{ updateOutputUI(); }catch(e){ console.warn(e); }

  // init preview (never block UI)
  try{
    const printerNode = Object.values(state.nodes).find(n=>n.type==="Printer");
    const prof = printerNode?.data || {bedW:220, bedD:220};
    initPreviewGL();
    if(preview.ok) buildBedBuffers(prof.bedW, prof.bedD);
  }catch(e){ console.warn(e); }

  try{ schedulePreviewUpdate(); }catch(e){ console.warn(e); }

  // If library still empty, show a hint
  try{
    if(nodeListEl && !nodeListEl.children.length){
      const msg = document.createElement("div");
      msg.className="hint";
      msg.innerHTML = `<b>Node Library is empty</b><div style="margin-top:6px;opacity:.75">Likely a startup error. Open DevTools Console for details.</div>`;
      nodeListEl.appendChild(msg);
    }
  }catch(e){}
}
// Studio dock: we reuse the existing Preview/Output UI but host it inside a node
var studioDock = { inited:false, panel:null, head:null, body:null };
function initStudioDock(){
  if(studioDock.inited) return;
  const rp = document.querySelector(".panel.right");
  studioDock.panel = rp || null;
  studioDock.head = rp ? rp.querySelector(".head") : null;
  studioDock.body = rp ? rp.querySelector(".body") : null;

  if(studioDock.head) studioDock.head.id = "studioDockHead";
  if(studioDock.body) studioDock.body.id = "studioDockBody";

  studioDock.inited = true;
}

// Prevent graph drag/pan from stealing interactions inside the preview widgets
function stopGraphGestures(el){
  if(!el) return;
  const evs = ["pointerdown","pointermove","pointerup","wheel","mousedown","mousemove","mouseup","touchstart","touchmove","touchend","click"];
  for(const ev of evs){
    el.addEventListener(ev, (e)=>{ e.stopPropagation(); }, {passive:false});
  }
}

Object.assign(nodeRegistry.api, {
  annotatePathHints,
  applyMeshTransform,
  arrayBufferFromB64,
  b64FromArrayBuffer,
  bedAlignMesh,
  buildFromImage,
  buildGcodeWithRules,
  buildMeshIndex,
  centerMesh,
  clamp,
  compileExpr,
  drawMeshPreview2D,
  drawWireframe2D,
  divider,
  dividerTiny,
  downloadText,
  elInput,
  elNumber,
  elSelect,
  elTextarea,
  elToggle,
  escapeHTML,
  field,
  fmt,
  genEquation,
  genFromSVG,
  genPolar,
  genSpiralVase,
  grid2,
  inferLayer,
  markDirtyAuto,
  meshRuntimeCache,
  meshTopZ,
  parseSTL,
  pickLayerHeight,
  refreshNodeContent,
  renderSchema,
  rerenderNode,
  rad,
  safeName,
  saveState,
  schedulePreviewUpdate,
  sliceMeshPlanar,
  stopGraphGestures,
  studioDock,
  surfaceRasterPath,
  toast,
  SCHEMA_EXPORT,
  SCHEMA_IMPORT_MESH_V2,
  SCHEMA_MESH_PRIMITIVE,
  SCHEMA_MESH_PRIMITIVE_V2,
  SCHEMA_NOTE,
  SCHEMA_PRINTER,
  SCHEMA_RULES,
  SCHEMA_SLICER_V2
});

async function startApp(){
  await loadNodes();
  boot();
}

startApp();

/* Redraw links on resize, and resize preview */
window.addEventListener("resize", ()=>{
  requestLinkRedraw();
  schedulePreviewUpdate();
});
graphWrap.addEventListener("contextmenu", (e)=> e.preventDefault());
