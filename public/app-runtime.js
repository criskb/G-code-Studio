const NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS;
const UI_NODE_TYPES = new Set(["Studio View", "Preview", "G-code Output"]);

/* ---------------------------
   Graph evaluation engine
---------------------------- */
let evalCache = new Map();
let evalDirty = true;
function buildLinkIndex(){
  const inputMap = new Map();
  for(const link of state.links){
    inputMap.set(link.to.node + ":" + link.to.port, link);
  }
  return {inputMap};
}
function evalNode(nodeId, ctx, stack=[]){
  if(evalCache.has(nodeId)) return evalCache.get(nodeId);
  const node = state.nodes[nodeId];
  if(!node) return null;
  if(stack.includes(nodeId)) throw new Error("Cycle detected: " + [...stack, nodeId].join(" → "));
  const def = NODE_DEFS[node.type];
  if(!def) throw new Error("Unknown node type: " + node.type);
  const out = def.evaluate(node, ctx);
  evalCache.set(nodeId, out);
  return out;
}
function evaluateGraph(){
  const t0 = performance.now();
  setStatus("Running…");
  evalCache = new Map();
  const {inputMap} = buildLinkIndex();
  const pmap = buildParamMap();
  const printerNode = Object.values(state.nodes).find(n=>n.type==="Printer");
  const profile = printerNode ? printerNode.data : defaultPrinterFallback();
  const base = baseFromProfile(profile);
  const ctx = {
    pmap, base,
    defaultProfile: profile,
    getInput: (nodeId, inputPort)=>{
      const link = inputMap.get(nodeId+":"+inputPort);
      if(!link) return null;
      const srcId = link.from.node;
      const srcPort = link.from.port;
      const res = evalNode(srcId, ctx);
      return res ? res[srcPort] : null;
    }
  };
  
  const exports = Object.values(state.nodes).filter(n=>n.type==="Export");

  if(!exports.length){
    // Preview-only mode: no Export node, but still evaluate upstream mesh/path for the preview
    let mesh = null;
    let path = [];
    for(const n of Object.values(state.nodes)){
      const def = NODE_DEFS[n.type];
      if(!def?.outputs?.length) continue;
      const wants = def.outputs.some(o=>o.type==="mesh" || o.type==="path");
      if(!wants) continue;
      const out = evalNode(n.id, ctx);
      if(out?.mesh) mesh = out.mesh;
      if(Array.isArray(out?.path)) path = out.path;
    }
    state.outputs.mesh = mesh;
    state.outputs.path = Array.isArray(path) ? path : [];
    state.outputs.gcode = "";
    state.outputs.stats = {points:(state.outputs.path?.length||0), length:0, e:0, timeMin:0};
    evalDirty = false;
    const dt = Math.round(performance.now() - t0);
    setStatus(`OK • ${dt}ms`);
    updateOutputUI();
    schedulePreviewUpdate();
    return "";
  }

  let lastOut = null;
  for(const ex of exports){
    lastOut = evalNode(ex.id, ctx) || lastOut;
  }
  const lastGcode = (lastOut?.gcode) || "";

  const gcodeNodes = Object.values(state.nodes).filter(n=>n.type==="G-code Output");
  for(const gcodeNode of gcodeNodes){
    evalNode(gcodeNode.id, ctx);
  }

  evalDirty = false;
  const dt = Math.round(performance.now() - t0);
  setStatus(`OK • ${dt}ms`);
  updateOutputUI();
  schedulePreviewUpdate();
  return lastGcode;
}

/* ---------------------------
   UI: Left panels
---------------------------- */
const nodeListEl = document.getElementById("nodeList");
const nodeSearchEl = document.getElementById("nodeSearch");
const btnAddQuick = document.getElementById("btnAddQuick");

// Node Picker (Space): searchable modal list
const npOverlay = document.getElementById("npOverlay");

// App Settings (persisted)
const appEl = document.querySelector(".app");
const SETTINGS_KEY = "gcodeStudio_appSettings_v1";
let appSettings = {
  showLib: false,
  spacePicker: true,
  spacePickerWhileTyping: false,
  pickerDelayMs: 140,
  spawnAtCursor: true
};

function loadAppSettings(){
  try{
    const raw = localStorage.getItem(SETTINGS_KEY);
    if(raw){
      const obj = JSON.parse(raw);
      if(obj && typeof obj==="object"){
        appSettings = {...appSettings, ...obj};
      }
    }
  }catch(_){}
  applyAppSettings();
}

function saveAppSettings(){
  try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings)); }catch(_){}
}

function applyAppSettings(){
  if(appEl){
    appEl.classList.toggle("showLib", !!appSettings.showLib);
  }
}

// Settings modal wiring
const settingsOverlay = document.getElementById("settingsOverlay");
const btnSettings = document.getElementById("btnSettings");
const setShowLib = document.getElementById("setShowLib");
const setSpacePicker = document.getElementById("setSpacePicker");
const setSpaceWhileTyping = document.getElementById("setSpaceWhileTyping");
const setPickerDelay = document.getElementById("setPickerDelay");
const setSpawnCursor = document.getElementById("setSpawnCursor");

function syncSettingsUI(){
  if(!settingsOverlay) return;
  setShowLib.checked = !!appSettings.showLib;
  setSpacePicker.checked = !!appSettings.spacePicker;
  setSpaceWhileTyping.checked = !!appSettings.spacePickerWhileTyping;
  setPickerDelay.value = String(Math.max(0, Math.min(400, Number(appSettings.pickerDelayMs)||0)));
  setSpawnCursor.checked = !!appSettings.spawnAtCursor;
}

function openSettings(){
  if(!settingsOverlay) return;
  syncSettingsUI();
  settingsOverlay?.classList?.add("open");
  settingsOverlay.setAttribute("aria-hidden","false");
}

function closeSettings(){
  if(!settingsOverlay) return;
  settingsOverlay?.classList?.remove("open");
  settingsOverlay.setAttribute("aria-hidden","true");
}

btnSettings?.addEventListener("click", (e)=>{ e.stopPropagation(); openSettings(); });

settingsOverlay?.addEventListener("mousedown", (e)=>{
  if(e.target === settingsOverlay) closeSettings();
});

function bindSetting(el, key, transform=(v)=>v){
  el?.addEventListener("change", ()=>{
    appSettings[key] = transform(el.type==="checkbox" ? el.checked : el.value);
    if(key==="pickerDelayMs") appSettings[key] = Math.max(0, Math.min(400, Number(appSettings[key])||0));
    applyAppSettings();
    saveAppSettings();
  });
}

bindSetting(setShowLib, "showLib", v=>!!v);
bindSetting(setSpacePicker, "spacePicker", v=>!!v);
bindSetting(setSpaceWhileTyping, "spacePickerWhileTyping", v=>!!v);
bindSetting(setPickerDelay, "pickerDelayMs", v=>Number(v));
bindSetting(setSpawnCursor, "spawnAtCursor", v=>!!v);

function canUseSpacePicker(){
  if(!appSettings.spacePicker) return false;
  if(isTyping() && !appSettings.spacePickerWhileTyping) return false;
  return true;
}

const npSearch  = document.getElementById("npSearch");
const npList    = document.getElementById("npList");

const nodePicker = {
  open:false,
  query:"",
  items:[],      // flattened list of {type, def, cat}
  filtered:[],   // indices into items
  sel:0,
  spawn:{x:140, y:120} // world coords
};

function nodeCat(def){
  const tag = (def.tag||"").toLowerCase();
  if(tag==="mesh") return "Mesh";
  if(tag==="path") return "Path & Slice";
  if(tag==="modifier") return "Modifiers";
  if(tag==="rules") return "Rules";
  if(tag==="printer") return "Printer";
  if(tag==="ui") return "UI";
  return "Other";
}

function rebuildNodePickerItems(){
  nodePicker.items = Object.entries(NODE_DEFS)
    .filter(([type, def]) => !def?.hidden)
    .map(([type, def]) => ({type, def, cat: nodeCat(def)}))
    .sort((a,b)=>{
      if(a.cat!==b.cat) return a.cat.localeCompare(b.cat);
      return (a.def.title||a.type).localeCompare(b.def.title||b.type);
    });
}

function getSpawnWorldFromPointer(){
  try{
    const rect = graphWrap.getBoundingClientRect();
    const lx = (state.ui.lastPtrX ?? rect.width*0.5);
    const ly = (state.ui.lastPtrY ?? rect.height*0.5);
    return appSettings.spawnAtCursor ? screenToWorld(lx, ly) : screenToWorld(rect.width*0.5, rect.height*0.5);
  }catch(_){
    return {x:140, y:120};
  }
}

function renderNodePicker(){
  const q = (npSearch.value||"").trim().toLowerCase();
  nodePicker.query = q;
  npList.innerHTML = "";

  const items = nodePicker.items;
  const filtered = [];
  for(let i=0;i<items.length;i++){
    const it = items[i];
    const hay = ((it.def.title||"")+" "+(it.def.desc||"")+" "+(it.def.tag||"")+" "+it.type).toLowerCase();
    if(!q || hay.includes(q)) filtered.push(i);
  }
  nodePicker.filtered = filtered;
  nodePicker.sel = Math.max(0, Math.min(nodePicker.sel, filtered.length-1));

  // grouped render
  let lastCat = "";
  filtered.forEach((idx, k)=>{
    const it = items[idx];
    if(it.cat !== lastCat){
      lastCat = it.cat;
      const sec = document.createElement("div");
      sec.className = "npSection";
      sec.textContent = lastCat;
      npList.appendChild(sec);
    }

    const row = document.createElement("div");
    row.className = "npItem" + (k===nodePicker.sel ? " sel" : "");
    row.dataset.k = String(k);

    const meta = document.createElement("div");
    meta.className = "npMeta";
    const t = document.createElement("div");
    t.className = "npTitle";
    t.textContent = it.def.title || it.type;
    const d = document.createElement("div");
    d.className = "npDesc";
    d.textContent = it.def.desc || it.type;
    meta.appendChild(t);
    meta.appendChild(d);

    const badges = document.createElement("div");
    badges.className = "npBadges";
    const tag = (it.def.tag||"").toUpperCase();
    if(tag){
      const b = document.createElement("div");
      b.className = "npBadge";
      b.textContent = tag;
      badges.appendChild(b);
    }
    if(it.def.inputs?.length){
      const b = document.createElement("div");
      b.className = "npBadge";
      b.textContent = "IN " + it.def.inputs.length;
      badges.appendChild(b);
    }
    if(it.def.outputs?.length){
      const b = document.createElement("div");
      b.className = "npBadge";
      b.textContent = "OUT " + it.def.outputs.length;
      badges.appendChild(b);
    }

    row.appendChild(meta);
    row.appendChild(badges);

    row.addEventListener("mousedown", (e)=>e.stopPropagation());
    row.addEventListener("click", (e)=>{
      e.stopPropagation();
      nodePicker.sel = Number(row.dataset.k)||0;
      addSelectedNodeFromPicker();
    });

    npList.appendChild(row);
  });

  // scroll selected into view
  const selEl = npList.querySelector(".npItem.sel");
  if(selEl){
    const box = npList.getBoundingClientRect();
    const r = selEl.getBoundingClientRect();
    if(r.top < box.top+8) npList.scrollTop -= (box.top - r.top) + 18;
    if(r.bottom > box.bottom-8) npList.scrollTop += (r.bottom - box.bottom) + 18;
  }
}

function openNodePicker(prefill=""){
  if(nodePicker.open) return;
  rebuildNodePickerItems();
  nodePicker.spawn = getSpawnWorldFromPointer();
  nodePicker.sel = 0;
  nodePicker.open = true;

  npOverlay?.classList?.add("open");
  npOverlay.setAttribute("aria-hidden","false");
  npSearch.value = prefill || "";
  npSearch.focus();
  npSearch.select();
  renderNodePicker();
}

function closeNodePicker(){
  if(!nodePicker.open) return;
  nodePicker.open = false;
  npOverlay?.classList?.remove("open");
  npOverlay.setAttribute("aria-hidden","true");
  try{ graphWrap.focus(); }catch(_){}
}

function addSelectedNodeFromPicker(){
  const filtered = nodePicker.filtered;
  if(!filtered || !filtered.length){ toast("No nodes match your search."); return; }
  const idx = filtered[nodePicker.sel] ?? filtered[0];
  const it = nodePicker.items[idx];
  if(!it){ toast("Could not resolve selected node."); return; }

  const spawn = nodePicker.spawn || {x:140,y:120};
  const x = (isFinite(spawn.x) ? spawn.x : 140);
  const y = (isFinite(spawn.y) ? spawn.y : 120);

  try{
    const id = addNode(it.type, x, y);
    if(!id) throw new Error("addNode returned no id");
    selectNode(id);
    saveState();
    markDirtyAuto();
    closeNodePicker();
  }catch(err){
    console.error(err);
    toast("Failed to add node: " + (err?.message || err));
  }
}

npSearch?.addEventListener("input", ()=>{
  nodePicker.sel = 0;
  renderNodePicker();
});
npSearch?.addEventListener("keydown", (e)=>{
  if(e.key==="Escape"){ e.preventDefault(); closeNodePicker(); }
  if(e.key==="Enter"){ e.preventDefault(); addSelectedNodeFromPicker(); }
  if(e.key==="ArrowDown"){ e.preventDefault(); nodePicker.sel = Math.min(nodePicker.sel+1, nodePicker.filtered.length-1); renderNodePicker(); }
  if(e.key==="ArrowUp"){ e.preventDefault(); nodePicker.sel = Math.max(nodePicker.sel-1, 0); renderNodePicker(); }
});

npOverlay?.addEventListener("mousedown", (e)=>{
  // click outside closes
  if(e.target === npOverlay) closeNodePicker();
});


function renderNodeLibrary(){
  const q = (nodeSearchEl.value||"").trim().toLowerCase();
  nodeListEl.innerHTML = "";

  // Category mapping (Comfy-style grouping)
  const catOf = (def)=>{
    const tag = (def.tag||"").toLowerCase();
    if(tag==="mesh") return "Mesh";
    if(tag==="path") return "Path & Slice";
    if(tag==="modifier") return "Modifiers";
    if(tag==="rules") return "Rules";
    if(tag==="printer") return "Printer";
    if(tag==="export") return "Export";
    return "Other";
  };

  const entries = Object.entries(NODE_DEFS)
    .filter(([type, def])=> !def?.hidden)
    .map(([type, def])=>({type, def, cat:catOf(def)}))
    .sort((a,b)=> (a.cat===b.cat ? a.def.title.localeCompare(b.def.title) : a.cat.localeCompare(b.cat)));

  // Persist collapsed state in memory (per-session)
  if(!state.ui) state.ui = {};
  if(!state.ui.libCollapsed) state.ui.libCollapsed = {};

  const groups = new Map();
  for(const e of entries){
    const hay = (e.def.title+" "+e.def.desc+" "+e.def.tag+" "+e.type).toLowerCase();
    if(q && !hay.includes(q)) continue;
    if(!groups.has(e.cat)) groups.set(e.cat, []);
    groups.get(e.cat).push(e);
  }

  const frag = document.createDocumentFragment();
  for(const [cat, list] of groups){
    const group = document.createElement("div");
    group.className = "catGroup" + (state.ui.libCollapsed[cat] ? " collapsed" : "");

    const head = document.createElement("div");
    head.className = "catHead";
    head.innerHTML = `
      <div class="catTitle"><span class="chev"></span>${cat}</div>
      <div class="catCount">${list.length}</div>
    `;
    head.addEventListener("click", ()=>{
      state.ui.libCollapsed[cat] = !state.ui.libCollapsed[cat];
      renderNodeLibrary();
      saveState();
    });

    const body = document.createElement("div");
    body.className = "catBody";

    for(const {type, def} of list){
      const card = document.createElement("div");
      card.className = "nodeCard";
      card.innerHTML = `
        <div class="stack">
          <div class="name">${def.title}</div>
          <div class="desc">${def.desc}</div>
        </div>
        <div class="tag">${def.tag}</div>
      `;
      card.addEventListener("click", ()=>{
        try{
          const id = addNodeAtViewCenter(type);
          selectNode(id);
          toast(`Added: ${NODE_DEFS[type].title}`);
          saveState();
          markDirtyAuto();
        }catch(e){ console.warn(e); toast(e.message||String(e)); }
      });
      body.appendChild(card);
    }

    group.appendChild(head);
    group.appendChild(body);
    frag.appendChild(group);
  }

  nodeListEl.appendChild(frag);
}
nodeSearchEl.addEventListener("input", renderNodeLibrary);
btnAddQuick.addEventListener("click", ()=>{ openNodePicker(""); });
function renderParamEditor(){
  const wrap = document.getElementById("paramEditor");
  wrap.innerHTML = "";
  const table = document.createElement("div");
  table.style.display="flex";
  table.style.flexDirection="column";
  table.style.gap="8px";
  state.params.forEach((row, idx)=>{
    const r = document.createElement("div");
    r.style.display="grid";
    r.style.gridTemplateColumns="1fr 1.2fr 40px";
    r.style.gap="8px";
    const k = document.createElement("input");
    k.value=row.k||"";
    k.style.fontFamily="var(--mono)";
    k.style.fontSize="12px";
    k.disabled=!!row.locked;
    k.addEventListener("input", ()=>{
      row.k = k.value.replace(/\s+/g,"").slice(0,32);
      saveState(); markDirtyAuto();
    });
    const v = document.createElement("input");
    v.value=row.v||"";
    v.style.fontFamily="var(--mono)";
    v.style.fontSize="12px";
    v.disabled=!!row.locked;
    v.addEventListener("input", ()=>{
      row.v = v.value;
      saveState(); markDirtyAuto();
    });
    const x = document.createElement("button");
    x.className="btn";
    x.textContent = row.locked ? "•" : "×";
    x.disabled = !!row.locked;
    x.style.padding="8px 10px";
    x.style.borderRadius="12px";
    x.addEventListener("click", ()=>{
      if(row.locked) return;
      state.params.splice(idx,1);
      renderParamEditor();
      saveState(); markDirtyAuto();
    });
    r.appendChild(k); r.appendChild(v); r.appendChild(x);
    table.appendChild(r);
  });
  wrap.appendChild(table);
  const add = document.createElement("button");
  add.className="btn";
  add.style.marginTop="10px";
  add.textContent="Add param";
  add.addEventListener("click", ()=>{
    state.params.push({k:"P"+(state.params.length), v:"1"});
    renderParamEditor();
    saveState(); markDirtyAuto();
  });
  wrap.appendChild(add);
}

/* ---------------------------
   UI: Graph rendering + interactions (same as v2)
---------------------------- */
const g = {
  draggingNodeId: null, dragStart: null,
  resizingNodeId: null, resizeStart: null,
  panning: false, panStart: null,
  linking: null,
};

function applyGraphTransform(){
  const z = state.ui.zoom;
  nodesLayer.style.transform = `translate(${state.ui.panX}px, ${state.ui.panY}px) scale(${z})`;
  graphBg.style.transform = `translate(${state.ui.panX}px, ${state.ui.panY}px) scale(${z})`;
  zoomPill.textContent = `Zoom ${Math.round(z*100)}%`;
  requestLinkRedraw();
}
function screenToWorld(sx, sy){
  const z = state.ui.zoom;
  return { x: (sx - state.ui.panX)/z, y: (sy - state.ui.panY)/z };
}
function worldToScreen(wx, wy){
  const z = state.ui.zoom;
  return { x: wx*z + state.ui.panX, y: wy*z + state.ui.panY };
}

function ensureNodeFits(nodeId){
  const node = state?.nodes?.[nodeId];
  if(!node) return;
  const el = nodesLayer?.querySelector(`.node[data-node-id="${nodeId}"]`);
  if(!el) return;
  const head = el.querySelector(".nodeHead");
  const body = el.querySelector(".nodeBody");
  const wantH = (head?.offsetHeight||0) + (body?.scrollHeight||0) + 2;
  const def = NODE_DEFS[node.type] || {};
  const minH = def.minH || 140;
  const maxH = def.maxH || 1800;
  const curH = node.h || 240;
  const nextH = Math.max(curH, Math.min(maxH, Math.max(minH, wantH)));
  if(Math.abs(nextH - curH) > 1){
    node.h = nextH;
    el.style.height = nextH + "px";
    requestLinkRedraw();
  }
}

function ensureAllNodesFit(){
  for(const id in state.nodes) ensureNodeFits(id);
}

function renderGraph(){
  nodesLayer.innerHTML = "";
  for(const node of Object.values(state.nodes)){
    nodesLayer.appendChild(renderNodeEl(node));
  }
  applyGraphTransform();
  requestLinkRedraw();
  requestAnimationFrame(()=>{ ensureAllNodesFit(); });
}

function hexToRgba(hex, alpha){
  if(!hex) return null;
  const raw = hex.replace("#", "").trim();
  if(raw.length !== 6) return null;
  const r = parseInt(raw.slice(0,2), 16);
  const g = parseInt(raw.slice(2,4), 16);
  const b = parseInt(raw.slice(4,6), 16);
  if(!isFinite(r) || !isFinite(g) || !isFinite(b)) return null;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyNodeViewStyle(el, head, node){
  const view = node.view || {};
  el.style.background = "";
  head.style.background = "";
  head.style.borderBottomColor = "";
  if(view.tint){
    const strength = Math.max(0, Math.min(0.6, Number(view.tintStrength ?? 0.12)));
    const bg = hexToRgba(view.tint, strength);
    if(bg) el.style.background = bg;
  }
  if(view.header){
    const headerStrength = Math.max(0, Math.min(0.8, Number(view.headerStrength ?? 0.18)));
    const headBg = hexToRgba(view.header, headerStrength);
    if(headBg){
      head.style.background = headBg;
      head.style.borderBottomColor = hexToRgba(view.header, Math.min(1, headerStrength + 0.2));
    }
  }
}

function renderNodeEl(node){
  const def = NODE_DEFS[node.type];
  const el = document.createElement("div");
  el.className = "node" + (state.ui.selectedNodeId===node.id ? " selected" : "");
  el.dataset.nodeId = node.id;
  el.style.left = (node.x||0) + "px";
  el.style.top  = (node.y||0) + "px";
  el.style.width = (node.w || DEFAULT_NODE_W) + "px";
  el.style.height = (node.h || DEFAULT_NODE_H) + "px";

  const head = document.createElement("div");
  head.className="nodeHead";

  const title = document.createElement("div");
  title.className="nodeTitle";
  title.innerHTML = `<span style="color:var(--text)">${def.title}</span><span class="nodeTypePill">${def.tag}</span>`;
  head.appendChild(title);

  const btns = document.createElement("div");
  btns.className="nodeBtns";

  const bProps = document.createElement("button");
  bProps.className="nodeBtn";
  bProps.title="Properties";
  bProps.textContent="⚙";
  for(const ev of ["pointerdown","mousedown","click"]){
    bProps.addEventListener(ev, (e)=> e.stopPropagation());
  }
  bProps.addEventListener("click", (e)=>{
    openNodeProps(node.id);
  });

  const bDup = document.createElement("button");
  bDup.className="nodeBtn";
  bDup.title="Duplicate";
  bDup.textContent="⎘";
  bDup.addEventListener("click", (e)=>{
    e.stopPropagation();
    const n2 = duplicateNode(node.id);
    selectNode(n2);
    saveState(); markDirtyAuto();
    toast("Duplicated");
  });

  const bDel = document.createElement("button");
  bDel.className="nodeBtn";
  bDel.title="Delete";
  bDel.textContent="×";
  bDel.addEventListener("click", (e)=>{
    e.stopPropagation();
    deleteNode(node.id);
    saveState(); markDirtyAuto();
    toast("Deleted");
  });


// Singleton UI nodes: keep them safe (can't duplicate/delete)
if(UI_NODE_TYPES.has(node.type)){
  bDup.style.display = "none";
  bDel.style.display = "none";
}

  btns.appendChild(bProps);
  btns.appendChild(bDup);
  btns.appendChild(bDel);
  head.appendChild(btns);

  head.addEventListener("pointerdown", (e)=>{
    if(e.button===2) return;
    selectNode(node.id);
    g.draggingNodeId = node.id;
    g.dragStart = {sx:e.clientX, sy:e.clientY, x:node.x, y:node.y, zoom:state.ui.zoom};
    head.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  head.addEventListener("pointermove", (e)=>{
    if(!g.draggingNodeId || g.draggingNodeId!==node.id) return;
    const dx = (e.clientX - g.dragStart.sx)/g.dragStart.zoom;
    const dy = (e.clientY - g.dragStart.sy)/g.dragStart.zoom;
    node.x = g.dragStart.x + dx;
    node.y = g.dragStart.y + dy;
    el.style.left = node.x + "px";
    el.style.top  = node.y + "px";
    requestLinkRedraw();
    saveStateThrottled();
  });
  head.addEventListener("pointerup", (e)=>{
    if(g.draggingNodeId===node.id){
      g.draggingNodeId = null;
      g.dragStart = null;
      try{ head.releasePointerCapture(e.pointerId);}catch(_){}
      saveState();
    }
  });

  el.addEventListener("pointerdown", (e)=>{
    if(e.button===2) return;
    selectNode(node.id);
  });

  applyNodeViewStyle(el, head, node);


const body = document.createElement("div");
body.className="nodeBody";

const portsLeft = document.createElement("div");
portsLeft.className = "portsLeft";

const portsRight = document.createElement("div");
portsRight.className = "portsRight";

if(def.inputs?.length){
  for(const inp of def.inputs){
    portsLeft.appendChild(portRow(node.id, inp.name, inp.type, "in"));
  }
}
if(def.outputs?.length){
  for(const out of def.outputs){
    portsRight.appendChild(portRow(node.id, out.name, out.type, "out"));
  }
}

const content = document.createElement("div");
content.className="nodeContent";
if(def.uiSchema){ renderSchema(def.uiSchema, node, content); } else { def.render(node, content); }

body.appendChild(portsLeft);
body.appendChild(content);
body.appendChild(portsRight);

  const resize = document.createElement("div");
  resize.className="resizeHandle";
  resize.title="Resize";

  resize.addEventListener("pointerdown", (e)=>{
    e.stopPropagation();
    selectNode(node.id);
    g.resizingNodeId = node.id;
    g.resizeStart = {
      sx: e.clientX,
      sy: e.clientY,
      w: node.w || DEFAULT_NODE_W,
      h: node.h || DEFAULT_NODE_H,
      zoom: state.ui.zoom
    };
    resize.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  resize.addEventListener("pointermove", (e)=>{
    if(g.resizingNodeId!==node.id) return;
    const dx = (e.clientX - g.resizeStart.sx)/g.resizeStart.zoom;
    const dy = (e.clientY - g.resizeStart.sy)/g.resizeStart.zoom;
    node.w = Math.max(240, g.resizeStart.w + dx);
    node.h = Math.max(160, g.resizeStart.h + dy);
    el.style.width = node.w + "px";
    el.style.height = node.h + "px";
    requestLinkRedraw();
    saveStateThrottled();
  });
  resize.addEventListener("pointerup", (e)=>{
    if(g.resizingNodeId===node.id){
      g.resizingNodeId=null;
      g.resizeStart=null;
      try{ resize.releasePointerCapture(e.pointerId);}catch(_){}
      saveState();
    }
  });

  el.appendChild(head);
  el.appendChild(body);
  el.appendChild(resize);
  return el;
}

// Re-render a node's UI content (for schema when/visibility changes)
const __nodeRefreshPending = new Set();
let __nodeRefreshTimer = null;

function scheduleRefreshNodeContent(nodeId){
  if(!nodeId) return;
  __nodeRefreshPending.add(String(nodeId));
  clearTimeout(__nodeRefreshTimer);
  __nodeRefreshTimer = setTimeout(()=>{
    const ids = Array.from(__nodeRefreshPending);
    __nodeRefreshPending.clear();
    for(const id of ids) refreshNodeContent(id);
  }, 0);
}

function refreshNodeContent(nodeId){
  const node = state?.nodes?.[nodeId];
  if(!node) return;
  const def = NODE_DEFS[node.type];
  if(!def) return;
  const el = nodesLayer?.querySelector(`.node[data-node-id="${nodeId}"]`);
  if(!el) return;
  const content = el.querySelector(".nodeContent");
  if(!content) return;
  const st = content.scrollTop || 0;
  content.innerHTML = "";
  try{
    if(def.uiSchema) renderSchema(def.uiSchema, node, content);
    else if(def.render) def.render(node, content);
  }catch(err){
    console.warn(err);
    const h = document.createElement("div");
    h.className="hint";
    h.innerHTML = "UI render error: " + (err.message||String(err));
    content.appendChild(h);
  }
  content.scrollTop = st;
  requestAnimationFrame(()=> ensureNodeFits(nodeId));
}


function portRow(nodeId, portName, portType, dir){
  const row = document.createElement("div");
  row.className = "portRow " + dir;

  const dot = document.createElement("div");
  dot.className = "dot " + dir;
  dot.dataset.nodeId = nodeId;
  dot.dataset.portName = portName;
  dot.dataset.portType = portType;
  dot.dataset.dir = dir;

  const label = document.createElement("div");
  label.className = "portLabel";
  label.textContent = portName;

  function ensureLinks(){
    if(!Array.isArray(state.links)) state.links = [];
    return state.links;
  }

  function disconnectInput(){
    const links = ensureLinks();
    const linkIdx = links.findIndex(L=>L?.to?.node===nodeId && L?.to?.port===portName);
    if(linkIdx>=0){
      links.splice(linkIdx, 1);
      saveState(); markDirtyAuto();
      toast("Disconnected");
      requestLinkRedraw();
      return true;
    }
    return false;
  }

  function findInputDotAt(x, y){
    const t = document.elementFromPoint(x, y);
    if(!t) return null;
    if(t.classList?.contains("dot") && t.dataset?.dir==="in") return t;
    const rowIn = t.closest?.(".portRow.in");
    if(rowIn){
      const d = rowIn.querySelector?.(".dot.in");
      if(d) return d;
    }
    const anyDot = t.closest?.(".dot.in");
    return anyDot || null;
  }

  function beginLinkDrag(e){
    e.stopPropagation();
    e.preventDefault();
    selectNode(nodeId);

    if(dir === "in"){
      disconnectInput();
      return;
    }

    ensureLinks();
    g.linking = { pointerId: e.pointerId, fromNode: nodeId, fromPort: portName, fromType: portType, x: e.clientX, y: e.clientY };
    setLinkTargetHighlights(portType);
    requestLinkRedraw();

    try{ dot.setPointerCapture(e.pointerId); }catch(_){}

    const onMove = (ev)=>{
      if(!g.linking || ev.pointerId !== g.linking.pointerId) return;
      ev.preventDefault();
      g.linking.x = ev.clientX;
      g.linking.y = ev.clientY;
      requestLinkRedraw();
    };

    const onUp = (ev)=>{
      if(!g.linking || ev.pointerId !== g.linking.pointerId) return;
      ev.preventDefault();
      try{ dot.releasePointerCapture(ev.pointerId); }catch(_){}

      const inDot = findInputDotAt(ev.clientX, ev.clientY);
      if(inDot){
        const toNode = inDot.dataset.nodeId;
        const toPort = inDot.dataset.portName;
        const toType = inDot.dataset.portType;

        if(toType !== g.linking.fromType){
          toast("Type mismatch");
        } else {
          const links = ensureLinks();
          const existing = links.findIndex(L=>L?.to?.node===toNode && L?.to?.port===toPort);
          if(existing>=0) links.splice(existing, 1);
          links.push({
            id: uid(),
            from: { node: g.linking.fromNode, port: g.linking.fromPort, type: g.linking.fromType },
            to:   { node: toNode,              port: toPort,              type: toType }
          });
          saveState(); markDirtyAuto();
          toast("Connected");
        }
      }

      g.linking = null;
      clearLinkTargetHighlights();
      requestLinkRedraw();

      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
    };

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
  }

  dot.addEventListener("pointerdown", beginLinkDrag);
  label.addEventListener("pointerdown", beginLinkDrag);

  if(dir==="in"){
    row.appendChild(dot);
    row.appendChild(label);
  } else {
    row.appendChild(label);
    row.appendChild(dot);
    row.style.justifyContent = "flex-end";
  }
  return row;
}

function selectNode(id){
  state.ui.selectedNodeId = id;
  for(const el of nodesLayer.querySelectorAll(".node")){
    el.classList.toggle("selected", el.dataset.nodeId===id);
  }
  saveStateThrottled();
}
function rerenderNode(nodeId){
  const node = state.nodes[nodeId];
  if(!node) return;
  const old = nodesLayer.querySelector(`.node[data-node-id="${nodeId}"]`);
  if(old){
    const fresh = renderNodeEl(node);
    old.replaceWith(fresh);
    requestLinkRedraw();
  }
}

/* ---------------------------
   Link drawing (same as v2)
---------------------------- */
let linkRedrawQueued = false;
function requestLinkRedraw(){
  if(linkRedrawQueued) return;
  linkRedrawQueued = true;
  requestAnimationFrame(()=>{
    linkRedrawQueued = false;
    drawLinks();
  });
}

/* ---- Link type coloring + target highlights ---- */
const TYPE_COLORS = {
  path:   "rgba(106,166,255,0.92)",
  mesh:   "rgba(255,176,82,0.92)",
  rules:  "rgba(190,120,255,0.92)",
  profile:"rgba(85,255,175,0.92)",
  number: "rgba(255,255,255,0.82)"
};
function colorForType(t){
  return TYPE_COLORS[t] || (getComputedStyle(document.body).getPropertyValue("--accent").trim() || "rgba(66,255,179,0.95)");
}
function setLinkTargetHighlights(fromType){
  document.body.classList.add("linking");
  const dots = nodesLayer.querySelectorAll(".dot.in");
  dots.forEach(d=>{
    const ok = (d.dataset.portType === fromType);
    d.classList.toggle("canDrop", ok);
    d.classList.toggle("cantDrop", !ok);
  });
}
function clearLinkTargetHighlights(){
  document.body.classList.remove("linking");
  const dots = nodesLayer.querySelectorAll(".dot.in");
  dots.forEach(d=>{
    d.classList.remove("canDrop","cantDrop");
  });
}
function drawBezier(ctx, x1,y1,x2,y2, w, mode, col){
  const dx = Math.abs(x2-x1);
  const c1x = x1 + Math.min(180, dx*0.5);
  const c2x = x2 - Math.min(180, dx*0.5);
  const c1y = y1;
  const c2y = y2;

  const accent = getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#42ffb3";
  const stroke = col || accent;

  ctx.lineCap = "round";

  if(mode==="ghost"){
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = w;
    ctx.setLineDash([6,6]);
    ctx.beginPath();
    ctx.moveTo(x1,y1);
    ctx.bezierCurveTo(c1x,c1y,c2x,c2y,x2,y2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if(mode==="broken"){
    ctx.save();
    ctx.strokeStyle = "rgba(255,80,80,0.92)";
    ctx.lineWidth = w;
    ctx.setLineDash([8,6]);
    ctx.beginPath();
    ctx.moveTo(x1,y1);
    ctx.bezierCurveTo(c1x,c1y,c2x,c2y,x2,y2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.save();
  // outline
  ctx.strokeStyle = "rgba(0,0,0,0.26)";
  ctx.lineWidth = w + 3;
  ctx.beginPath();
  ctx.moveTo(x1,y1);
  ctx.bezierCurveTo(c1x,c1y,c2x,c2y,x2,y2);
  ctx.stroke();

  // main stroke
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = w;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1,y1);
  ctx.bezierCurveTo(c1x,c1y,c2x,c2y,x2,y2);
  ctx.stroke();
  ctx.restore();
}
function drawLinks(){
  try{
    const rect = graphWrap.getBoundingClientRect();
const px = devicePixelRatio || 1;
const w = Math.floor(rect.width * px);
const h = Math.floor(rect.height * px);
if(linkCanvas.width !== w || linkCanvas.height !== h){
  linkCanvas.width = w;
  linkCanvas.height = h;
  linkCanvas.style.width = rect.width + "px";
  linkCanvas.style.height = rect.height + "px";
}
const ctx = linkCanvas.getContext("2d");
ctx.setTransform(px,0,0,px,0,0);
ctx.clearRect(0,0,rect.width,rect.height);

    const getNodeCenter = (nodeId)=>{
      const el = nodesLayer.querySelector(`.node[data-node-id="${nodeId}"]`);
      if(!el) return null;
      const r = el.getBoundingClientRect();
      return { x:(r.left+r.right)/2 - rect.left, y:(r.top+r.bottom)/2 - rect.top };
    };

    const getDotCenter = (nodeId, portName, dir)=>{
      let dot = nodesLayer.querySelector(`.dot[data-node-id="${nodeId}"][data-port-name="${portName}"][data-dir="${dir}"]`);
      if(!dot){
        dot = nodesLayer.querySelector(`.dot.${dir}[data-node-id="${nodeId}"][data-port-name="${portName}"]`);
      }
      if(!dot){
        const row = nodesLayer.querySelector(`.portRow.${dir} .dot[data-node-id="${nodeId}"][data-port-name="${portName}"]`);
        if(row) dot = row;
      }
      if(!dot) return null;
      const r = dot.getBoundingClientRect();
      return { x: (r.left + r.right)/2 - rect.left, y: (r.top + r.bottom)/2 - rect.top };
    };

    for(const L of (state.links||[])){
      if(!L?.from || !L?.to) continue;
      const aDot = getDotCenter(L.from.node, L.from.port, "out");
      const bDot = getDotCenter(L.to.node, L.to.port, "in");
      const a = aDot || getNodeCenter(L.from.node);
      const b = bDot || getNodeCenter(L.to.node);
      if(!a || !b) continue;

      const col = colorForType(L.from.type || L.to.type);
      const broken = (!aDot || !bDot);
      drawBezier(ctx, a.x, a.y, b.x, b.y, broken ? 2.0 : 2.4, broken ? "broken" : "link", col);
    }

    if(g.linking){
      const a = getDotCenter(g.linking.fromNode, g.linking.fromPort, "out") || getNodeCenter(g.linking.fromNode);
      if(a){
        const bx = g.linking.x - rect.left;
        const by = g.linking.y - rect.top;
        drawBezier(ctx, a.x, a.y, bx, by, 2.0, "ghost", null);
      }
    }
  }catch(e){
    console.warn("drawLinks error:", e);
    try{
      const rect = graphWrap.getBoundingClientRect();
      const ctx = linkCanvas.getContext("2d");
      ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
      ctx.clearRect(0,0,rect.width,rect.height);
    }catch(_){}
  }
}

/* ---------------------------
   Pan/zoom graph
---------------------------- */
const keys = {space:false, spaceDownAt:0, spaceUsedForPan:false};
function isTyping(){
  const a = document.activeElement;
  return a && (a.tagName==="INPUT" || a.tagName==="TEXTAREA" || a.isContentEditable);
}
graphWrap.addEventListener("wheel", (e)=>{
  e.preventDefault();
  const rect = graphWrap.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const before = screenToWorld(mx, my);
  const zoomFactor = Math.exp(-e.deltaY * 0.0012);
  const z = clamp(state.ui.zoom * zoomFactor, 0.25, 2.8);
  state.ui.zoom = z;
  const after = worldToScreen(before.x, before.y);
  state.ui.panX += (mx - after.x);
  state.ui.panY += (my - after.y);
  applyGraphTransform();
  requestLinkRedraw();
  saveStateThrottled();
}, {passive:false});

// Focus graph on background click (so Space works even if you previously typed in an input)
graphWrap.addEventListener("pointerdown", (e)=>{
  const t = e.target;
  const tid = t && t.id;
  if(t === graphWrap || tid==="graphBg" || tid==="linkCanvas"){
    try{
      const a = document.activeElement;
      if(a && (a.tagName==="INPUT" || a.tagName==="TEXTAREA" || a.isContentEditable)) a.blur();
    }catch(_){}
    try{ graphWrap.focus({preventScroll:true}); }catch(_){}
  }
}, {capture:true});

graphWrap.addEventListener("pointerdown", (e)=>{
  if(e.button===2) return;
  if(keys.space){
    keys.spaceUsedForPan = true;
    g.panning = true;
    g.panStart = {sx:e.clientX, sy:e.clientY, panX:state.ui.panX, panY:state.ui.panY};
    graphWrap.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
});
graphWrap.addEventListener("pointermove", (e)=>{
  if(!g.panning) return;
  const dx = e.clientX - g.panStart.sx;
  const dy = e.clientY - g.panStart.sy;
  state.ui.panX = g.panStart.panX + dx;
  state.ui.panY = g.panStart.panY + dy;
  applyGraphTransform();
  requestLinkRedraw();
  saveStateThrottled();
});
graphWrap.addEventListener("pointerup", (e)=>{
  if(g.panning){
    g.panning = false;
    g.panStart = null;
    try{ graphWrap.releasePointerCapture(e.pointerId);}catch(_){}
    saveState();
  }
});
graphWrap.addEventListener("mousedown", (e)=>{
  if(e.button!==1) return;
  e.preventDefault();
  g.panning = true;
  g.panStart = {sx:e.clientX, sy:e.clientY, panX:state.ui.panX, panY:state.ui.panY};
  const move = (ev)=>{
    const dx = ev.clientX - g.panStart.sx;
    const dy = ev.clientY - g.panStart.sy;
    state.ui.panX = g.panStart.panX + dx;
    state.ui.panY = g.panStart.panY + dy;
    applyGraphTransform(); requestLinkRedraw(); saveStateThrottled();
  };
  const up = ()=>{
    g.panning=false; g.panStart=null;
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    saveState();
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
});

/* ---------------------------
   Node CRUD
---------------------------- */
function addNode(type, x, y){
  const def = NODE_DEFS[type];
  const id = uid();
  const w = def?.defaultW ?? DEFAULT_NODE_W;
  const h = def?.defaultH ?? DEFAULT_NODE_H;
  state.nodes[id] = { id, type, x:x??120, y:y??120, w, h, data:def.initData() };
  renderGraph();
  return id;
}


// Demo helper: connect nodes by port index or name (used by demo library)
function resolvePortName(nodeId, isOutput, portRef){
  const n = state.nodes[nodeId];
  const def = n ? NODE_DEFS[n.type] : null;
  const ports = (isOutput ? def?.outputs : def?.inputs) || [];
  if(typeof portRef === "number"){
    return ports[portRef]?.name || (isOutput ? "out" : "in");
  }
  if(typeof portRef === "string" && portRef) return portRef;
  return isOutput ? (ports[0]?.name || "out") : (ports[0]?.name || "in");
}
function resolvePortType(nodeId, isOutput, portName){
  const n = state.nodes[nodeId];
  const def = n ? NODE_DEFS[n.type] : null;
  const ports = (isOutput ? def?.outputs : def?.inputs) || [];
  const p = ports.find(pp=>pp.name===portName) || ports[0];
  return p?.type || "any";
}

function connect(fromNodeId, outPort, toNodeId, inPort){
  const fromPort = resolvePortName(fromNodeId, true, outPort);
  const toPort   = resolvePortName(toNodeId, false, inPort);
  const type     = resolvePortType(fromNodeId, true, fromPort);
  if(!Array.isArray(state.links)) state.links = [];
  state.links.push({ id:uid(), from:{ node:fromNodeId, port:fromPort, type }, to:{ node:toNodeId, port:toPort, type } });
  return true;
}




// Center the graph view on a node (used by demos)
function centerViewOn(nodeId){
  const rect = graphWrap.getBoundingClientRect();
  const target = (typeof nodeId === "string") ? state.nodes[nodeId] : nodeId;
  if(!target) return;
  const cx = (target.x + (target.w || DEFAULT_NODE_W) / 2);
  const cy = (target.y + (target.h || DEFAULT_NODE_H) / 2);
  state.ui.panX = rect.width/2 - cx*state.ui.zoom;
  state.ui.panY = rect.height/2 - cy*state.ui.zoom;
  applyGraphTransform();
  requestLinkRedraw();
  saveState();
}
function addNodeAtViewCenter(type){
  const rect = graphWrap.getBoundingClientRect();
  const center = screenToWorld(rect.width*0.5, rect.height*0.5);
  // Nudge so multiple adds don't stack perfectly
  const nudge = { x:(Math.random()-0.5)*60, y:(Math.random()-0.5)*40 };
  return addNode(type, center.x + nudge.x, center.y + nudge.y);
}

function duplicateNode(id){
  const n = state.nodes[id];
  if(!n) return null;
  const id2 = uid();
  state.nodes[id2] = { id:id2, type:n.type, x:(n.x||0)+30, y:(n.y||0)+30, w:n.w, h:n.h, data: JSON.parse(JSON.stringify(n.data)) };
  renderGraph();
  return id2;
}
function deleteNode(id){
  if(!state.nodes[id]) return;
  delete state.nodes[id];
  state.links = state.links.filter(L=>L.from.node!==id && L.to.node!==id);
  if(state.ui.selectedNodeId===id) state.ui.selectedNodeId=null;
  renderGraph();
}
function ensureDefaultGraph(){
  const hasGraphNodes = Object.values(state.nodes).some(n=>!UI_NODE_TYPES.has(n.type));
  if(hasGraphNodes) return;
  state.nodes = {};
  state.links = [];
  const idPath = addNode("Path", 110, 140);
  const idXfm  = addNode("Transform", 520, 160);
  const idNP   = addNode("Non-Planar", 920, 170);
  const idRules= addNode("Rules", 1320, 190);
  const idPrn  = addNode("Printer", 520, 470);
  const idExp  = addNode("Export", 1320, 450);
  state.links.push(
    {id:uid(), from:{node:idPath, port:"path", type:"path"}, to:{node:idXfm, port:"in", type:"path"}},
    {id:uid(), from:{node:idXfm, port:"out", type:"path"}, to:{node:idNP, port:"in", type:"path"}},
    {id:uid(), from:{node:idNP, port:"out", type:"path"}, to:{node:idRules, port:"in", type:"path"}},
    {id:uid(), from:{node:idNP, port:"out", type:"path"}, to:{node:idExp, port:"path", type:"path"}},
    {id:uid(), from:{node:idRules, port:"rules", type:"rules"}, to:{node:idExp, port:"rules", type:"rules"}},
    {id:uid(), from:{node:idPrn, port:"profile", type:"profile"}, to:{node:idExp, port:"profile", type:"profile"}},
  );
  state.ui.selectedNodeId = idExp;
  renderGraph();
}

/* ---------------------------
   Output panel updates
---------------------------- */
function updateOutputUI(){
  const gcode = state.outputs.gcode || "";
  const stats = state.outputs.stats || {points:0,length:0,e:0,timeMin:0};
  const exp = Object.values(state.nodes).find(n=>n.type==="Export");
  const cap = exp?.data?.capPreviewChars ?? 200000;
  gcodePre.textContent = gcode ? gcode.slice(0, cap) : "No output yet. Click “Run graph”.";
  chipPts.textContent = String(stats.points||0);
  chipLen.textContent = fmt(stats.length||0, 1);
  chipE.textContent = fmt(stats.e||0, 1);
  chipT.textContent = fmt(stats.timeMin||0, 1);
  outPill.textContent = gcode ? "Ready" : "No output";
}
function clearOutputs(){
  state.outputs.gcode = "";
  state.outputs.path = [];
  state.outputs.mesh = null;
  state.outputs.stats = {points:0,length:0,e:0,timeMin:0};
  updateOutputUI();
  schedulePreviewUpdate();
}

/* ---------------------------
   Auto-run debouncer
---------------------------- */
let autoTimer = null;
function markDirtyAuto(){
  evalDirty = true;
  if(!state.ui.autoRun) return;
  clearTimeout(autoTimer);
  autoTimer = setTimeout(()=>{
    try{ evaluateGraph(); }catch(e){ console.warn(e); setStatus("Error"); toast(e.message||String(e)); }
  }, 220);
}

/* ---------------------------
   Persistence
---------------------------- */
function saveState(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){}
}
let saveT=null;
function saveStateThrottled(){
  clearTimeout(saveT);
  saveT = setTimeout(saveState, 120);
}
function sanitizeImported(obj){
  const base = defaultState();
  const s = {...base, ...obj};
  s.ui = {...base.ui, ...(obj?.ui||{})};
  s.params = Array.isArray(obj?.params) ? obj.params.map(r=>({k:String(r.k??""), v:String(r.v??""), locked:!!r.locked})) : base.params;
  if(!s.params.some(p=>p.k==="pi")) s.params.unshift({k:"pi", v:String(Math.PI), locked:true});
  if(!s.params.some(p=>p.k==="tau")) s.params.unshift({k:"tau", v:String(Math.PI*2), locked:true});
  s.nodes = (obj?.nodes && typeof obj.nodes==="object") ? obj.nodes : {};
  const legacyTypeMap = {
    "FullControl Model": "Control Experiement",
    "Image (HueForge)": "Image"
  };
  s.links = Array.isArray(obj?.links) ? obj.links : [];
  s.outputs = {...base.outputs, ...(obj?.outputs||{})};
  s.orca = {...base.orca, ...(obj?.orca||{})};
  if(!s.orca || typeof s.orca!=="object") s.orca = {...base.orca};
  if(!s.orca.files || typeof s.orca.files!=="object") s.orca.files = {};
  s.orca.printers = Array.isArray(s.orca.printers) ? s.orca.printers : [];
  s.orca.filaments = Array.isArray(s.orca.filaments) ? s.orca.filaments : [];
  s.orca.processes = Array.isArray(s.orca.processes) ? s.orca.processes : [];

  s.ui.zoom = clamp(Number(s.ui.zoom||1), 0.25, 2.8);
  s.ui.panX = Number(s.ui.panX||60);
  s.ui.panY = Number(s.ui.panY||80);
  for(const [id, n] of Object.entries(s.nodes)){
    if(legacyTypeMap[n.type]) n.type = legacyTypeMap[n.type];
    if(!NODE_DEFS[n.type]){ delete s.nodes[id]; continue; }
    if(!n.data) n.data = NODE_DEFS[n.type].initData();
    if(n.w == null) n.w = DEFAULT_NODE_W;
    if(n.h == null) n.h = DEFAULT_NODE_H;
  }
  s.links = s.links.filter(L=>{
    const a = s.nodes[L.from?.node];
    const b = s.nodes[L.to?.node];
    if(!a || !b) return false;
    const defA = NODE_DEFS[a.type], defB = NODE_DEFS[b.type];
    const out = defA.outputs?.find(p=>p.name===L.from.port);
    const inp = defB.inputs?.find(p=>p.name===L.to.port);
    return out && inp && out.type===inp.type;
  });
  return s;
}
function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return defaultState();
    return sanitizeImported(JSON.parse(raw));
  }catch(e){
    return defaultState();
  }
}

/* ---------------------------
   Preview: Offline WebGL orbit line renderer
---------------------------- */
function cssToRGB01(css){
  css = (css||"").trim();
  // rgba(r,g,b,a) or rgb
  const m = css.match(/rgba?\(([^)]+)\)/i);
  if(m){
    const parts = m[1].split(",").map(s=>s.trim());
    const r = Number(parts[0]||0)/255;
    const g = Number(parts[1]||0)/255;
    const b = Number(parts[2]||0)/255;
    const a = parts[3]!=null ? Number(parts[3]) : 1;
    return [r,g,b,a];
  }
  // hex
  const h = css.replace("#","").trim();
  if(h.length===3){
    const r=parseInt(h[0]+h[0],16)/255, g=parseInt(h[1]+h[1],16)/255, b=parseInt(h[2]+h[2],16)/255;
    return [r,g,b,1];
  }
  if(h.length===6){
    const r=parseInt(h.slice(0,2),16)/255, g=parseInt(h.slice(2,4),16)/255, b=parseInt(h.slice(4,6),16)/255;
    return [r,g,b,1];
  }
  return [1,1,1,1];
}
function v3(x=0,y=0,z=0){ return {x,y,z}; }
function add(a,b){ return v3(a.x+b.x,a.y+b.y,a.z+b.z); }
function sub(a,b){ return v3(a.x-b.x,a.y-b.y,a.z-b.z); }
function mul(a,s){ return v3(a.x*s,a.y*s,a.z*s); }
function dot(a,b){ return a.x*b.x+a.y*b.y+a.z*b.z; }
function cross(a,b){ return v3(a.y*b.z-a.z*b.y, a.z*b.x-a.x*b.z, a.x*b.y-a.y*b.x); }
function len(a){ return Math.sqrt(dot(a,a)); }
function norm(a){ const l=len(a)||1; return mul(a,1/l); }

function mat4Identity(){
  return new Float32Array([1,0,0,0,  0,1,0,0,  0,0,1,0,  0,0,0,1]);
}
function mat4Mul(a,b){
  const o = new Float32Array(16);
  for(let c=0;c<4;c++){
    for(let r=0;r<4;r++){
      o[c*4+r] =
        a[0*4+r]*b[c*4+0] +
        a[1*4+r]*b[c*4+1] +
        a[2*4+r]*b[c*4+2] +
        a[3*4+r]*b[c*4+3];
    }
  }
  return o;
}
function mat4Perspective(fovyRad, aspect, near, far){
  const f = 1/Math.tan(fovyRad/2);
  const nf = 1/(near - far);
  const o = new Float32Array(16);
  o[0]=f/aspect; o[1]=0; o[2]=0; o[3]=0;
  o[4]=0; o[5]=f; o[6]=0; o[7]=0;
  o[8]=0; o[9]=0; o[10]=(far+near)*nf; o[11]=-1;
  o[12]=0; o[13]=0; o[14]=(2*far*near)*nf; o[15]=0;
  return o;
}
function mat4LookAt(eye, target, up){
  const f = norm(sub(target, eye));
  const s = norm(cross(f, up));
  const u = cross(s, f);

  const o = mat4Identity();
  o[0]=s.x; o[4]=s.y; o[8]=s.z;
  o[1]=u.x; o[5]=u.y; o[9]=u.z;
  o[2]=-f.x; o[6]=-f.y; o[10]=-f.z;

  o[12]=-dot(s, eye);
  o[13]=-dot(u, eye);
  o[14]=dot(f, eye);
  return o;
}

const preview = {
  ok:false,
  gl:null,
  prog:null,
  progSolid:null,
  aNor:0,
  uVP2:null,
  uLight:null,
  uBase:null,
  uAlpha:null,
  aPos:0,
  aPos2:0,
  uVP:null,
  uColor:null,
  buf:null,
  gridBuf:null,
  bedBuf:null,
  toolBuf:null,
  meshBuf:null,
  meshTriPosBuf:null,
  meshTriNorBuf:null,
  countsTris:0,
  lastMeshHash:"",
  mvUrl:"",
  counts:{ path:0, grid:0, bed:0, tool:0 },
  vp:null,
  cam:{
    target: v3(110,110,35),
    yaw: rad(45),
    pitch: rad(35),
    radius: 420,
  },
  drag:{
    active:false,
    mode:"rotate", // rotate | pan
    x:0,y:0,
    startYaw:0,startPitch:0,
    startTarget:null,
  },
  bed:{w:220, d:220},
};

function glCreateShader(gl, type, src){
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)){
    const info = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("Shader compile error: "+info);
  }
  return sh;
}
function glCreateProgram(gl, vsSrc, fsSrc){
  const vs = glCreateShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = glCreateShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS)){
    const info = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("Program link error: "+info);
  }
  gl.deleteShader(vs); gl.deleteShader(fs);
  return p;
}
function initPreviewGL(){
  if(preview.ok) return true;

  const gl = glCanvas.getContext("webgl", {antialias:true, alpha:true, premultipliedAlpha:false});
  if(!gl){
    preview.ok = false;
    glCanvas.style.display="none";
    fallback2d.style.display="block";
    return false;
  }

  const vs = `
    attribute vec3 aPos;
attribute vec4 aCol;
uniform mat4 uVP;
varying vec4 vCol;
void main(){
  vCol = aCol;
  gl_Position = uVP * vec4(aPos, 1.0);
  gl_PointSize = 7.0;
}
  `;
  const fs = `
    precision mediump float;
uniform vec4 uColor; // fallback constant when attribute disabled
varying vec4 vCol;
void main(){
  gl_FragColor = vCol;
}
  `;
  const prog = glCreateProgram(gl, vs, fs);
  gl.useProgram(prog);

  preview.gl = gl;
  preview.prog = prog;
  preview.aPos = gl.getAttribLocation(prog, "aPos");
  preview.aCol = gl.getAttribLocation(prog, "aCol");
  preview.uVP = gl.getUniformLocation(prog, "uVP");
  preview.uColor = gl.getUniformLocation(prog, "uColor");


// Solid mesh program (flat shaded)
const vs2 = `
  attribute vec3 aPos;
  attribute vec3 aNor;
  uniform mat4 uVP;
  varying vec3 vN;
  void main(){
    vN = aNor;
    gl_Position = uVP * vec4(aPos, 1.0);
  }
`;
const fs2 = `
  precision mediump float;
  varying vec3 vN;
  uniform vec3 uLight;
  uniform vec3 uBase;
  uniform float uAlpha;
  void main(){
    vec3 N = normalize(vN);
    float d = max(0.0, dot(N, normalize(uLight)));
    float a = 0.25 + 0.75*d;
    gl_FragColor = vec4(uBase * a, uAlpha);
  }
`;
const prog2 = glCreateProgram(gl, vs2, fs2);
preview.progSolid = prog2;
preview.aNor = gl.getAttribLocation(prog2, "aNor");
preview.uVP2 = gl.getUniformLocation(prog2, "uVP");
preview.uLight = gl.getUniformLocation(prog2, "uLight");
preview.uBase = gl.getUniformLocation(prog2, "uBase");
preview.uAlpha = gl.getUniformLocation(prog2, "uAlpha");

  preview.buf = gl.createBuffer();
  preview.colBuf = gl.createBuffer();
  preview.gridBuf = gl.createBuffer();
  preview.bedBuf = gl.createBuffer();
  preview.toolBuf = gl.createBuffer();
  preview.meshBuf = gl.createBuffer();
  preview.meshTriPosBuf = gl.createBuffer();
  preview.meshTriNorBuf = gl.createBuffer();

  gl.enableVertexAttribArray(preview.aPos);
  gl.bindBuffer(gl.ARRAY_BUFFER, preview.buf);
  gl.vertexAttribPointer(preview.aPos, 3, gl.FLOAT, false, 0, 0);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearColor(0,0,0,0);

  bindPreviewControls();
  bindPreviewMeshControls();
  applyPreviewLegendColors();
  preview.ok = true;
  requestAnimationFrame(drawPreviewLoop);
  return true;
}

function resizePreviewCanvas(){
  const dpr = Math.min(2, window.devicePixelRatio||1);
  const w = glCanvas.clientWidth|0;
  const h = glCanvas.clientHeight|0;
  const cw = Math.max(2, Math.floor(w*dpr));
  const ch = Math.max(2, Math.floor(h*dpr));
  if(glCanvas.width!==cw || glCanvas.height!==ch){
    glCanvas.width=cw; glCanvas.height=ch;
  }
}

function computeEye(){
  const c = preview.cam;
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
  // Z-up, yaw around Z, pitch toward Z
  const dir = v3(cy*cp, sy*cp, sp);
  const eye = sub(c.target, mul(dir, c.radius));
  return {eye, dir};
}

function updateVP(){
  const gl = preview.gl;
  const c = preview.cam;
  const {eye} = computeEye();
  const aspect = glCanvas.width / glCanvas.height;
  const proj = mat4Perspective(rad(50), aspect, 0.5, 8000);
  const view = mat4LookAt(eye, c.target, v3(0,0,1));
  const vp = mat4Mul(proj, view);
  preview.vp = vp;
  gl.useProgram(preview.prog);
  gl.uniformMatrix4fv(preview.uVP, false, vp);
  if(preview.progSolid && preview.uVP2){
    gl.useProgram(preview.progSolid);
    gl.uniformMatrix4fv(preview.uVP2, false, vp);
  }
  // restore line program by default
  gl.useProgram(preview.prog);
}

function setColor(css, alphaOverride){
  const gl = preview.gl;
  const rgba = cssToRGB01(css);
  if(alphaOverride!=null) rgba[3]=alphaOverride;
  gl.uniform4f(preview.uColor, rgba[0], rgba[1], rgba[2], rgba[3]);
}


function setConstACol(gl, rgba){
  // when attribute arrays are disabled, this constant is used
  gl.disableVertexAttribArray(preview.aCol);
  gl.vertexAttrib4f(preview.aCol, rgba[0], rgba[1], rgba[2], rgba[3]);
}




function hexToRGBf(hex){
  const c = cssToRGBA(hex);
  return {r:c.r/255, g:c.g/255, b:c.b/255};
}

function hexToRGBAf(hex, a=1){
  let h = (hex||"#ffffff").toString().trim();
  if(h[0]==="#") h=h.slice(1);
  if(h.length===3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  const r = parseInt(h.slice(0,2),16)/255;
  const g = parseInt(h.slice(2,4),16)/255;
  const b = parseInt(h.slice(4,6),16)/255;
  return [r,g,b,a];
}

const ROLE_COLORS = {
  top:      "#42ffb3",  // electric green (accent)
  bottom:   "#ffb84a",  // warm amber
  infill:   "#b56bff",  // violet
  wall_outer:"#5ee7ff", // cyan
  wall_inner:"#2ea7ff", // blue
  walls:    "#5ee7ff",
  travel:   "#ffffff",
};
function applyPreviewLegendColors(){
  const els = document.querySelectorAll(".pcLegend i[data-role]");
  els.forEach(el=>{
    const r = el.getAttribute("data-role");
    const hex = ROLE_COLORS[r] || ROLE_COLORS[(r||"").toLowerCase()] || "#dfe7ff";
    el.style.background = hex;
  });
}


function roleToRGBA(role){
  const r = (role||"").toString();
  const key = ROLE_COLORS[r] ? r : (ROLE_COLORS[r.toLowerCase()] ? r.toLowerCase() : null);
  const hex = key ? ROLE_COLORS[key] : "#dfe7ff";
  const a = (key==="travel") ? 0.25 : 0.95;
  return hexToRGBAf(hex, a);
}



function uploadBuffer(buf, arr){
  const gl = preview.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
}

function buildBedBuffers(w,d){
  preview.bed = {w,d};
  const border = new Float32Array([
    0,0,0,  w,0,0,
    w,0,0,  w,d,0,
    w,d,0,  0,d,0,
    0,d,0,  0,0,0,
  ]);
  uploadBuffer(preview.bedBuf, border);
  preview.counts.bed = border.length/3;

  const step = 20;
  const lines = [];
  for(let x=0;x<=w;x+=step){
    lines.push(x,0,0, x,d,0);
  }
  for(let y=0;y<=d;y+=step){
    lines.push(0,y,0, w,y,0);
  }
  const grid = new Float32Array(lines);
  uploadBuffer(preview.gridBuf, grid);
  preview.counts.grid = grid.length/3;

  // Fit cam around bed by default
  preview.cam.target = v3(w/2, d/2, 35);
  preview.cam.radius = Math.max(w,d) * 1.9;
}

function setPreviewPath(machinePath){
  // machinePath points: {X,Y,z, meta:{role}}
  const gl = preview.gl;
  if(!gl) return;
  const n = machinePath.length;

  const pos = new Float32Array(n*3);
  const col = new Float32Array(n*4);

  for(let i=0;i<n;i++){
    const p = machinePath[i];
    if(!p){
      pos[i*3+0]=0; pos[i*3+1]=0; pos[i*3+2]=0;
      col[i*4+0]=0.8; col[i*4+1]=0.8; col[i*4+2]=0.8; col[i*4+3]=0.15;
      continue;
    }
    const X = p.X ?? p.x ?? 0;
    const Y = p.Y ?? p.y ?? 0;
    const Z = p.z ?? 0;
    pos[i*3+0]=X;
    pos[i*3+1]=Y;
    pos[i*3+2]=Z;

    const role = (p.meta && p.meta.role) ? p.meta.role : (p.role||"");
    const rgba = roleToRGBA(role);
    col[i*4+0]=rgba[0];
    col[i*4+1]=rgba[1];
    col[i*4+2]=rgba[2];
    col[i*4+3]=rgba[3];
  }

  uploadBuffer(preview.buf, pos);
  uploadBuffer(preview.colBuf, col);
  preview.counts.path = n;

  // tool dot at last point
  const tool = new Float32Array(3);
  if(n){
    tool[0]=pos[(n-1)*3+0];
    tool[1]=pos[(n-1)*3+1];
    tool[2]=pos[(n-1)*3+2];
  } else {
    tool[0]=preview.bed.w/2; tool[1]=preview.bed.d/2; tool[2]=0;
  }
  uploadBuffer(preview.toolBuf, tool);
  preview.counts.tool = 1;
}


function setPreviewMesh(meshModel, profile){
  const gl = preview.gl;
  if(!gl){ return; }

  // cache hash for MV (tri count + bounds)
  try{
    const b = meshModel?.bounds || (meshModel?.tris ? computeMeshBounds(meshModel.tris) : null);
    const h = `${meshModel?.tris?.length||0}|${b?.minx||0},${b?.miny||0},${b?.minz||0}|${b?.maxx||0},${b?.maxy||0},${b?.maxz||0}`;
    preview.lastMeshHash = h;
  }catch(_){}

  if(!meshModel || !meshModel.tris || meshModel.tris.length<9){
    uploadBuffer(preview.meshBuf, new Float32Array(0));
    preview.counts.mesh = 0;
    uploadBuffer(preview.meshTriPosBuf, new Float32Array(0));
    uploadBuffer(preview.meshTriNorBuf, new Float32Array(0));
    preview.countsTris = 0;
    return;
  }

  const tris = meshModel.tris;
  const triCount = Math.floor(tris.length/9);
  const maxTris = 50000;
  const step = triCount > maxTris ? Math.ceil(triCount/maxTris) : 1;

  // Wireframe lines
  const lines = [];
  // Solid triangles
  const posTri = [];
  const norTri = [];

  for(let ti=0; ti<triCount; ti+=step){
    const o = ti*9;
    const ax = tris[o+0], ay = tris[o+1], az = tris[o+2];
    const bx = tris[o+3], by = tris[o+4], bz = tris[o+5];
    const cx = tris[o+6], cy = tris[o+7], cz = tris[o+8];

    const A = toMachineXY(ax, ay, profile);
    const B = toMachineXY(bx, by, profile);
    const C = toMachineXY(cx, cy, profile);

    // wire lines
    lines.push(A.X, A.Y, az,  B.X, B.Y, bz);
    lines.push(B.X, B.Y, bz,  C.X, C.Y, cz);
    lines.push(C.X, C.Y, cz,  A.X, A.Y, az);

    // normal (flat)
    const ux = (B.X - A.X), uy = (B.Y - A.Y), uz = (bz - az);
    const vx = (C.X - A.X), vy = (C.Y - A.Y), vz = (cz - az);
    let nx = uy*vz - uz*vy;
    let ny = uz*vx - ux*vz;
    let nz = ux*vy - uy*vx;
    const nl = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
    nx/=nl; ny/=nl; nz/=nl;

    posTri.push(A.X, A.Y, az,  B.X, B.Y, bz,  C.X, C.Y, cz);
    norTri.push(nx,ny,nz,  nx,ny,nz,  nx,ny,nz);
  }

  const arr = new Float32Array(lines);
  uploadBuffer(preview.meshBuf, arr);
  preview.counts.mesh = arr.length/3;

  const arrP = new Float32Array(posTri);
  const arrN = new Float32Array(norTri);
  uploadBuffer(preview.meshTriPosBuf, arrP);
  uploadBuffer(preview.meshTriNorBuf, arrN);
  preview.countsTris = arrP.length/3;
}

function fitPreviewToData(){
  const pts = state.outputs.path || [];
  const printerNode = Object.values(state.nodes).find(n=>n.type==="Printer");
  const prof = printerNode?.data || {bedW:220, bedD:220};

  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const p of pts){
    const X = p.X ?? p.x ?? 0;
    const Y = p.Y ?? p.y ?? 0;
    const Z = p.z ?? 0;
    minX=Math.min(minX,X); maxX=Math.max(maxX,X);
    minY=Math.min(minY,Y); maxY=Math.max(maxY,Y);
    minZ=Math.min(minZ,Z); maxZ=Math.max(maxZ,Z);
  }

// Include mesh bounds (if present) so fit centers on imported geometry too
const mesh = state.outputs.mesh;
if(mesh && mesh.tris && mesh.tris.length>=9){
  const b = mesh.bounds || computeMeshBounds(mesh.tris);
  const corners = [
    [b.min.x, b.min.y],
    [b.max.x, b.min.y],
    [b.min.x, b.max.y],
    [b.max.x, b.max.y],
  ];
  for(const c of corners){
    const M = toMachineXY(c[0], c[1], prof);
    minX = Math.min(minX, M.X); maxX = Math.max(maxX, M.X);
    minY = Math.min(minY, M.Y); maxY = Math.max(maxY, M.Y);
  }
  minZ = Math.min(minZ, b.min.z);
  maxZ = Math.max(maxZ, b.max.z);
}

  if(!pts.length && !(mesh && mesh.tris && mesh.tris.length>=9)){
    preview.cam.target = v3(prof.bedW/2, prof.bedD/2, 35);
    preview.cam.radius = Math.max(prof.bedW, prof.bedD)*1.9;
    return;
  }
  const cx=(minX+maxX)/2, cy=(minY+maxY)/2, cz=(minZ+maxZ)/2;
  const dx=maxX-minX, dy=maxY-minY, dz=maxZ-minZ;
  preview.cam.target = v3(cx,cy,cz);
  preview.cam.radius = Math.max(80, Math.sqrt(dx*dx+dy*dy+dz*dz) * 1.6);
  toast("Fit preview");
}

function bindPreviewControls(){
  glCanvas.addEventListener("contextmenu", (e)=>e.preventDefault());

  glCanvas.addEventListener("pointerdown", (e)=>{
    glCanvas.setPointerCapture(e.pointerId);
    preview.drag.active = true;
    preview.drag.x = e.clientX;
    preview.drag.y = e.clientY;
    preview.drag.startYaw = preview.cam.yaw;
    preview.drag.startPitch = preview.cam.pitch;
    preview.drag.startTarget = {...preview.cam.target};
    preview.drag.mode = (e.shiftKey || e.button===2) ? "pan" : "rotate";
    e.preventDefault();
  });

  glCanvas.addEventListener("pointermove", (e)=>{
    if(!preview.drag.active) return;
    const dx = e.clientX - preview.drag.x;
    const dy = e.clientY - preview.drag.y;

    if(preview.drag.mode==="rotate"){
      preview.cam.yaw = preview.drag.startYaw + dx*0.006;
      preview.cam.pitch = clamp(preview.drag.startPitch + -dy*0.006, rad(-85), rad(85));
    } else {
      // pan along camera right/up
      const {eye} = computeEye();
      const forward = norm(sub(preview.cam.target, eye));
      const right = norm(cross(forward, v3(0,0,1)));
      const up = norm(cross(right, forward));

      const panScale = preview.cam.radius * 0.0018;
      const move = add(mul(right, -dx*panScale), mul(up, dy*panScale));
      preview.cam.target = add(preview.drag.startTarget, move);
    }
  });

  glCanvas.addEventListener("pointerup", (e)=>{
    preview.drag.active = false;
    try{ glCanvas.releasePointerCapture(e.pointerId);}catch(_){}
  });

  glCanvas.addEventListener("wheel", (e)=>{
    e.preventDefault();
    const zf = Math.exp(e.deltaY * 0.0012);
    preview.cam.radius = clamp(preview.cam.radius * zf, 20, 8000);
  }, {passive:false});

  glCanvas.addEventListener("dblclick", ()=> fitPreviewToData());
}

function drawPreviewLoop(){
  if(!preview.ok) return;
  resizePreviewCanvas();
  const gl = preview.gl;
  gl.viewport(0,0,glCanvas.width, glCanvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  updateVP();

  // Draw grid
  gl.enableVertexAttribArray(preview.aPos);
  const text = getComputedStyle(document.body).getPropertyValue("--text").trim();
  setColor(text, 0.18);
  gl.bindBuffer(gl.ARRAY_BUFFER, preview.gridBuf);
  gl.vertexAttribPointer(preview.aPos, 3, gl.FLOAT, false, 0, 0);
  setConstACol(gl, hexToRGBAf(getComputedStyle(document.body).getPropertyValue("--text").trim()||"#ffffff", 0.18));
  gl.drawArrays(gl.LINES, 0, preview.counts.grid);

  // Draw bed border
  setColor(text, 0.28);
  gl.bindBuffer(gl.ARRAY_BUFFER, preview.bedBuf);
  gl.vertexAttribPointer(preview.aPos, 3, gl.FLOAT, false, 0, 0);
  setConstACol(gl, hexToRGBAf(getComputedStyle(document.body).getPropertyValue("--text").trim()||"#ffffff", 0.28));
  gl.drawArrays(gl.LINES, 0, preview.counts.bed);


// Draw mesh (wireframe)
if(preview.counts.mesh>1){
  setColor(text, 0.14);
  gl.bindBuffer(gl.ARRAY_BUFFER, preview.meshBuf);
  gl.vertexAttribPointer(preview.aPos, 3, gl.FLOAT, false, 0, 0);
  setConstACol(gl, hexToRGBAf(text||"#ffffff", 0.14));
  gl.drawArrays(gl.LINES, 0, preview.counts.mesh);
}

  // Draw path
  // Per-point colors by role

  const accent = getComputedStyle(document.body).getPropertyValue("--accent").trim();
  const accent2 = getComputedStyle(document.body).getPropertyValue("--accent2").trim();
  setColor(accent2, 0.35);
  gl.bindBuffer(gl.ARRAY_BUFFER, preview.buf);
  gl.vertexAttribPointer(preview.aPos, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(preview.aCol);
  gl.bindBuffer(gl.ARRAY_BUFFER, preview.colBuf);
  gl.vertexAttribPointer(preview.aCol, 4, gl.FLOAT, false, 0, 0);
  if(preview.counts.path>1) gl.drawArrays(gl.LINE_STRIP, 0, preview.counts.path);

  setColor(accent, 0.85);
  if(preview.counts.path>1) gl.drawArrays(gl.LINE_STRIP, 0, preview.counts.path);

  // Tool point
  setColor("rgba(255,255,255,0.9)", 0.9);
  gl.bindBuffer(gl.ARRAY_BUFFER, preview.toolBuf);
  gl.vertexAttribPointer(preview.aPos, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.POINTS, 0, preview.counts.tool);

  requestAnimationFrame(drawPreviewLoop);
}

function updatePreview(){
  // Use WebGL if possible, else fallback 2D
  const ok = initPreviewGL();
  if(!ok){
    // Basic 2D fallback (same as v2 style, but still not interactive)
    fallback2d.style.display="block";
    glCanvas.style.display="none";
    const __pAll2=(state.outputs.path||[]);
    updatePreviewControlsFromPath(__pAll2);
    draw2dFallback(filterPreviewPath(__pAll2));
    return;
  }
  fallback2d.style.display="none";
  glCanvas.style.display="block";

// If Model-Viewer mode is active, update its mesh source and skip GL drawing (toolpath overlay not supported there yet)
if(previewMeshSettings.viewer === "mv"){
  const mv = document.getElementById("mvPreview");
  if(mv && customElements.get("model-viewer")){
    const mesh = state.outputs.mesh || null;
    try{
      if(mesh && mesh.tris && mesh.tris.length>=9){
        mv.style.display = "block";
        const url = meshToObjectURL_GLb(mesh);
        mv.src = url;
      }else{
        mv.removeAttribute("src");
      }
    }catch(err){ console.warn(err); }
  }
  glCanvas.style.display="none";
  fallback2d.style.display="none";
  return;
}

  const printerNode = Object.values(state.nodes).find(n=>n.type==="Printer");
  const prof = printerNode?.data || {bedW:220, bedD:220};
  if(prof.bedW !== preview.bed.w || prof.bedD !== preview.bed.d){
    buildBedBuffers(prof.bedW, prof.bedD);
  }
  setPreviewMesh(state.outputs.mesh||null, prof);
  const __pAll = (state.outputs.path||[]);
  updatePreviewControlsFromPath(__pAll);
  setPreviewPath(filterPreviewPath(__pAll));
}

let previewDirty = true;
function schedulePreviewUpdate(){
  previewDirty = true;
  requestAnimationFrame(()=>{ if(previewDirty){ previewDirty=false; updatePreview(); }});
}
function draw2dFallback(machinePath){
  const c = fallback2d;
  const w = c.clientWidth || c.parentElement.clientWidth;
  const h = c.clientHeight || c.parentElement.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio||1);
  c.width = Math.floor(w * dpr);
  c.height = Math.floor(h * dpr);
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--text").trim();
  ctx.lineWidth = 1;
  for(let x=0;x<w;x+=40){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for(let y=0;y<h;y+=40){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
  ctx.globalAlpha = 1;
  const pad=24;
  ctx.globalAlpha = 0.25;
  ctx.strokeRect(pad, pad, w-2*pad, h-2*pad);
  ctx.globalAlpha = 1;
  if(!machinePath.length) return;
  const xs = machinePath.map(p=>p.X ?? p.x);
  const ys = machinePath.map(p=>p.Y ?? p.y);
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const minY=Math.min(...ys), maxY=Math.max(...ys);
  const sx=(w-2*pad)/Math.max(1e-6,(maxX-minX));
  const sy=(h-2*pad)/Math.max(1e-6,(maxY-minY));
  const s=Math.min(sx,sy);
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--accent").trim();
  ctx.lineWidth = 2;
  ctx.beginPath();
  for(let i=0;i<machinePath.length;i++){
    const X = pad + ((xs[i]-minX) * s);
    const Y = h - (pad + ((ys[i]-minY) * s));
    if(i===0) ctx.moveTo(X,Y); else ctx.lineTo(X,Y);
  }
  ctx.stroke();
}

/* ---------------------------
   Workflows (demo library)
---------------------------- */
let WORKFLOWS = [];

async function loadWorkflows(){
  try{
    const res = await fetch("/workflows/index.json", { cache: "no-store" });
    if(!res.ok) throw new Error(`Workflow index load failed (${res.status})`);
    const data = await res.json();
    WORKFLOWS = Array.isArray(data) ? data : [];
  }catch(err){
    console.warn(err);
    WORKFLOWS = [];
  }
  populateDemoMenu();
}

function addWorkflowNote(text){
  if(!text) return;
  const hasNote = Object.values(state.nodes||{}).some(n=>n.type==="Note");
  if(hasNote) return;
  const id = addNode("Note", 40, 110);
  state.nodes[id].data.text = String(text);
  state.nodes[id].data.compact = false;
}

async function loadWorkflowById(id){
  const wf = WORKFLOWS.find(x=>x.id===id) || WORKFLOWS[0];
  if(!wf) return;
  try{
    const res = await fetch(`/workflows/${wf.file}`, { cache: "no-store" });
    if(!res.ok) throw new Error(`Workflow load failed (${res.status})`);
    const raw = await res.json();
    state = sanitizeImported(raw);
    addWorkflowNote(wf.note || "");
    ensureUiNodes();
  }catch(e){
    console.warn(e);
    toast("Workflow failed: " + (e?.message||String(e)));
    state = sanitizeImported(defaultState());
    ensureDefaultGraph();
    ensureUiNodes();
  }
  document.body.dataset.theme = state.ui.theme;
  document.getElementById("btnAuto").textContent = `Auto: ${state.ui.autoRun ? "ON" : "OFF"}`;
  renderParamEditor();
  renderNodeLibrary();
  renderGraph();
  clearOutputs();
  saveState();
  try{ evaluateGraph(); }catch(e){ console.warn(e); setStatus("Error"); toast(e.message||String(e)); }
  toast(wf?.name || "Loaded workflow");
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
    maxX = Math.max(maxX, n.x + (n.w || DEFAULT_NODE_W));
    maxY = Math.max(maxY, n.y + (n.h || DEFAULT_NODE_H));
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
  const cx = (target.x + (target.w || DEFAULT_NODE_W) / 2);
  const cy = (target.y + (target.h || DEFAULT_NODE_H) / 2);
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
const nodePropsOverlay = document.getElementById("nodePropsOverlay");
const nodePropsTitle = document.getElementById("nodePropsTitle");
const nodePropsContent = document.getElementById("nodePropsContent");

function populateDemoMenu(){
  demoMenu.innerHTML = "";
  if(!WORKFLOWS.length){
    const item = document.createElement("div");
    item.className = "menuItem";
    item.textContent = "No workflows found.";
    item.style.opacity = "0.6";
    demoMenu.appendChild(item);
    return;
  }
  for(const d of WORKFLOWS){
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
      loadWorkflowById(d.id);
    });
    demoMenu.appendChild(item);
  }
}

function closeNodeProps(){
  nodePropsOverlay?.classList?.remove("open");
}

function openNodeProps(nodeId){
  const node = state.nodes[nodeId];
  if(!node) return;
  const def = NODE_DEFS[node.type];
  if(nodePropsTitle) nodePropsTitle.textContent = `${def?.title || node.type} Properties`;
  if(!node.view) node.view = {};
  if(nodePropsContent){
    nodePropsContent.innerHTML = "";
    const view = node.view;

    const makeRow = (labelText, input)=>{
      const row = document.createElement("div");
      row.className = "propsRow";
      const label = document.createElement("label");
      label.textContent = labelText;
      row.appendChild(label);
      row.appendChild(input);
      nodePropsContent.appendChild(row);
      return row;
    };

    const tintToggle = document.createElement("input");
    tintToggle.type = "checkbox";
    tintToggle.checked = !!view.tint;
    tintToggle.addEventListener("change", ()=>{
      if(tintToggle.checked){
        view.tint = view.tint || "#20262c";
      }else{
        delete view.tint;
      }
      tintColor.disabled = !view.tint;
      tintStrength.disabled = !view.tint;
      renderGraph();
      saveState();
    });
    makeRow("Tinted background", tintToggle);

    const tintColor = document.createElement("input");
    tintColor.type = "color";
    tintColor.value = view.tint || "#20262c";
    tintColor.disabled = !view.tint;
    tintColor.addEventListener("input", ()=>{
      view.tint = tintColor.value;
      renderGraph();
      saveState();
    });
    makeRow("Tint color", tintColor);

    const tintStrength = document.createElement("input");
    tintStrength.type = "range";
    tintStrength.min = "0";
    tintStrength.max = "0.6";
    tintStrength.step = "0.02";
    tintStrength.value = String(view.tintStrength ?? 0.12);
    tintStrength.disabled = !view.tint;
    tintStrength.addEventListener("input", ()=>{
      view.tintStrength = Number(tintStrength.value);
      renderGraph();
      saveState();
    });
    makeRow("Tint strength", tintStrength);

    const headerToggle = document.createElement("input");
    headerToggle.type = "checkbox";
    headerToggle.checked = !!view.header;
    headerToggle.addEventListener("change", ()=>{
      if(headerToggle.checked){
        view.header = view.header || "#22303a";
      }else{
        delete view.header;
      }
      headerColor.disabled = !view.header;
      headerStrength.disabled = !view.header;
      renderGraph();
      saveState();
    });
    makeRow("Tint header", headerToggle);

    const headerColor = document.createElement("input");
    headerColor.type = "color";
    headerColor.value = view.header || "#22303a";
    headerColor.disabled = !view.header;
    headerColor.addEventListener("input", ()=>{
      view.header = headerColor.value;
      renderGraph();
      saveState();
    });
    makeRow("Header color", headerColor);

    const headerStrength = document.createElement("input");
    headerStrength.type = "range";
    headerStrength.min = "0";
    headerStrength.max = "0.8";
    headerStrength.step = "0.02";
    headerStrength.value = String(view.headerStrength ?? 0.18);
    headerStrength.disabled = !view.header;
    headerStrength.addEventListener("input", ()=>{
      view.headerStrength = Number(headerStrength.value);
      renderGraph();
      saveState();
    });
    makeRow("Header strength", headerStrength);

    if(node.type === "Note"){
      const titleInput = document.createElement("input");
      titleInput.type = "text";
      titleInput.value = node.data?.title || "";
      titleInput.addEventListener("input", ()=>{
        node.data.title = titleInput.value;
        rerenderNode(node.id);
        saveState();
      });
      makeRow("Note title", titleInput);

      const compactToggle = document.createElement("input");
      compactToggle.type = "checkbox";
      compactToggle.checked = !!node.data?.compact;
      compactToggle.addEventListener("change", ()=>{
        node.data.compact = compactToggle.checked;
        rerenderNode(node.id);
        saveState();
      });
      makeRow("Compact header", compactToggle);
    }

    const resetBtn = document.createElement("button");
    resetBtn.className = "btn";
    resetBtn.textContent = "Reset view";
    resetBtn.addEventListener("click", ()=>{
      delete node.view;
      renderGraph();
      saveState();
    });
    nodePropsContent.appendChild(resetBtn);
  }
  nodePropsOverlay?.classList?.add("open");
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
nodePropsOverlay?.addEventListener("mousedown", (e)=>{
  if(e.target === nodePropsOverlay) closeNodeProps();
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
    try{ closeNodeProps(); }catch(_){}
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
function ensureUiNodes(){
  try{
    const previewExists = Object.values(state.nodes).some(n=>n.type==="Preview");
    const gcodeExists = Object.values(state.nodes).some(n=>n.type==="G-code Output");
    const studioNode = Object.values(state.nodes).find(n=>n.type==="Studio View");
    const linkGcodeOutput = (gcodeId)=>{
      if(!gcodeId) return;
      if(state.links.some(L=>L.to.node===gcodeId && L.to.port==="gcode")) return;
      const exportNode = Object.values(state.nodes).find(n=>n.type==="Export");
      if(exportNode) connect(exportNode.id, "gcode", gcodeId, "gcode");
    };

    if(studioNode && (!previewExists && !gcodeExists)){
      const {x, y, w, h} = studioNode;
      deleteNode(studioNode.id);
      const previewId = addNode("Preview", x ?? 1580, y ?? 80);
      const gcodeId = addNode("G-code Output", x ?? 1580, (y ?? 80) + ((h ?? 680) + 40));
      const previewDef = NODE_DEFS["Preview"];
      const gcodeDef = NODE_DEFS["G-code Output"];
      if(previewDef?.defaultSize){
        state.nodes[previewId].w = previewDef.defaultSize.w;
        state.nodes[previewId].h = previewDef.defaultSize.h;
      }
      if(gcodeDef?.defaultSize){
        state.nodes[gcodeId].w = gcodeDef.defaultSize.w;
        state.nodes[gcodeId].h = gcodeDef.defaultSize.h;
      }
      linkGcodeOutput(gcodeId);
      return;
    }

    if(!previewExists){
      const id = addNode("Preview", 1580, 80);
      const n = state.nodes[id];
      const def = NODE_DEFS["Preview"];
      if(def?.defaultSize){
        n.w = def.defaultSize.w;
        n.h = def.defaultSize.h;
      }
    }
    if(!gcodeExists){
      const id = addNode("G-code Output", 1580, 880);
      const n = state.nodes[id];
      const def = NODE_DEFS["G-code Output"];
      if(def?.defaultSize){
        n.w = def.defaultSize.w;
        n.h = def.defaultSize.h;
      }
      linkGcodeOutput(id);
    }else{
      const existing = Object.values(state.nodes).find(n=>n.type==="G-code Output");
      linkGcodeOutput(existing?.id);
    }
  }catch(e){ console.warn(e); }
}

function boot(){
  try{ loadAppSettings(); }catch(e){ console.warn(e); }
  try{ loadWorkflows(); }catch(e){ console.warn(e); toast(e.message||String(e)); }

  try{ state = loadState(); }catch(e){ console.warn(e); state = defaultState(); toast(e.message||String(e)); }

  try{
    document.body.dataset.theme = state.ui.theme || "dark";
    document.getElementById("btnAuto").textContent = `Auto: ${state.ui.autoRun ? "ON" : "OFF"}`;
  }catch(e){ console.warn(e); }

  try{ ensureDefaultGraph(); }catch(e){ console.warn(e); toast(e.message||String(e)); }

  try{ ensureUiNodes(); }catch(e){ console.warn(e); }

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
// Docked Preview + G-code panels (hosted inside nodes)
var previewDock = { inited:false, panel:null, body:null };
var gcodeDock = { inited:false, panel:null, body:null };
function initPreviewDock(){
  if(previewDock.inited) return;
  const rp = document.querySelector(".panel.right");
  previewDock.panel = rp || null;
  previewDock.body = rp ? rp.querySelector("#previewPanel") : null;
  previewDock.inited = true;
}
function initGcodeDock(){
  if(gcodeDock.inited) return;
  const rp = document.querySelector(".panel.right");
  gcodeDock.panel = rp || null;
  gcodeDock.body = rp ? rp.querySelector("#gcodePanel") : null;
  gcodeDock.inited = true;
}

// Prevent graph drag/pan from stealing interactions inside the preview widgets
function stopGraphGestures(el){
  if(!el) return;
  const evs = ["pointerdown","pointermove","pointerup","wheel","mousedown","mousemove","mouseup","touchstart","touchmove","touchend","click"];
  for(const ev of evs){
    el.addEventListener(ev, (e)=>{ e.stopPropagation(); }, {passive:false});
  }
}

boot();

/* Redraw links on resize, and resize preview */
window.addEventListener("resize", ()=>{
  requestLinkRedraw();
  schedulePreviewUpdate();
});
graphWrap.addEventListener("contextmenu", (e)=> e.preventDefault());
