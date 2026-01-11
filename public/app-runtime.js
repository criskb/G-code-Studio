const NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS;
const UI_NODE_TYPES = new Set(["Studio View", "Preview", "G-code Output"]);
const EXPECTED_NODE_DEF_COUNT = 95;
const EXPECTED_NODE_TYPES = [
  "Preview",
  "G-code Output",
  "Printer",
  "Export",
  "Import Mesh",
  "SVG Import",
  "Path",
  "Mesh Primitive",
  "Transform",
  "Slicer",
];
const nodeDefDiagnostics = {
  total: 0,
  lowCount: false,
  missingTypes: [],
  warned: false,
};
function updateNodeDefDiagnostics(){
  const total = Object.keys(NODE_DEFS || {}).length;
  const missingTypes = EXPECTED_NODE_TYPES.filter((type)=>!NODE_DEFS?.[type]);
  const lowCount = total < EXPECTED_NODE_DEF_COUNT;
  nodeDefDiagnostics.total = total;
  nodeDefDiagnostics.lowCount = lowCount;
  nodeDefDiagnostics.missingTypes = missingTypes;
  return nodeDefDiagnostics;
}

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

function collectPreviewOutputs(){
  let mesh = state.outputs.mesh;
  let path = state.outputs.path;
  let toolpath = null;
  let previewToolpath = null;
  let previewMesh = null;
  let previewFallback = null;
  const hasExport = Object.values(state.nodes).some(n=>n.type==="Export");

  for(const n of Object.values(state.nodes)){
    const def = NODE_DEFS[n.type];
    if(!def?.outputs?.length) continue;
    const out = evalCache.get(n.id);
    if(!out) continue;
    for(const o of def.outputs){
      const val = out[o.name];
      if(!val) continue;
      if(o.type === "mesh") mesh = val;
      if(!hasExport && o.type === "path" && Array.isArray(val)) path = val;
      if(o.type === "toolpath") toolpath = val;
      if(o.type === "preview") previewFallback = val;
    }
    if(out.preview?.type === "toolpath") previewToolpath = out.preview;
    else if(out.preview?.type === "mesh") previewMesh = out.preview;
    else if(out.preview) previewFallback = out.preview;
  }

  if(previewToolpath?.toolpath) toolpath = previewToolpath.toolpath;
  if(previewMesh?.mesh) mesh = previewMesh.mesh;

  let preview = previewToolpath || previewFallback || null;
  if(preview && previewMesh?.mesh){
    preview = {...preview, mesh: previewMesh.mesh};
  }else if(!preview && previewMesh){
    preview = previewMesh;
  }

  state.outputs.mesh = mesh;
  state.outputs.preview = preview;
  state.outputs.toolpath = toolpath;

  if(toolpath){
    const printerNode = Object.values(state.nodes).find(n=>n.type==="Printer");
    const prof = printerNode?.data || {bedW:220, bedD:220, origin:"center"};
    const converted = toolpathToPath(toolpath, {maxMoves:200000, profile: prof});
    state.outputs.path = converted.path;
    state.outputs.previewWarning = converted.warning;
  }else{
    state.outputs.path = path || [];
    state.outputs.previewWarning = "";
  }
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
    let toolpath = null;
    let preview = null;
    for(const n of Object.values(state.nodes)){
      const def = NODE_DEFS[n.type];
      if(!def?.outputs?.length) continue;
      const wants = def.outputs.some(o=>o.type==="mesh" || o.type==="path" || o.type==="toolpath" || o.type==="preview");
      if(!wants) continue;
      const out = evalNode(n.id, ctx);
      for(const o of def.outputs){
        const val = out?.[o.name];
        if(!val) continue;
        if(o.type === "mesh") mesh = val;
        if(o.type === "path" && Array.isArray(val)) path = val;
        if(o.type === "toolpath") toolpath = val;
        if(o.type === "preview") preview = val;
      }
      if(out?.preview) preview = out.preview;
    }
    state.outputs.mesh = mesh;
    state.outputs.path = Array.isArray(path) ? path : [];
    state.outputs.toolpath = toolpath;
    state.outputs.preview = preview;
    state.outputs.gcode = "";
    collectPreviewOutputs();
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
  collectPreviewOutputs();
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
const btnParams = document.getElementById("btnParams");

// Node Picker (Space): searchable modal list
const npOverlay = document.getElementById("npOverlay");

// App Settings (persisted)
const appEl = document.querySelector(".app");
const SETTINGS_KEY = "gcodeStudio_appSettings_v1";
const USER_CONFIG_ENDPOINT = "/api/user-config";
const SHORTCUT_DEFAULTS = {
  openPicker: "Space",
  openPickerAlt: "Ctrl+KeyK",
  runGraph: "KeyG",
  deleteNode: "Delete",
  deleteNodeAlt: "Backspace",
  openSettings: "KeyS",
  openParams: "KeyP",
  fitView: "KeyF",
  centerView: "KeyC"
};
const THEME_DEFAULTS = {
  custom: false,
  bg0: "#0b0f14",
  bg1: "#0d141c",
  panel: "#0a0e14",
  panel2: "#0c121a",
  accent: "#42ffb3",
  accent2: "#6aa6ff",
  text: "#f5f7ff",
  muted: "#a7b0bb"
};
const GRAPH_BG_DEFAULTS = {
  pattern: "dots",
  dotSize: 28,
  dotOpacity: 0.18,
  gridSize: 32
};
let appSettings = {
  showLib: false,
  spacePicker: true,
  spacePickerWhileTyping: false,
  pickerDelayMs: 140,
  spawnAtCursor: true,
  theme: { ...THEME_DEFAULTS },
  graphBg: { ...GRAPH_BG_DEFAULTS },
  shortcuts: { ...SHORTCUT_DEFAULTS }
};

function normalizeAppSettings(){
  appSettings.theme = { ...THEME_DEFAULTS, ...(appSettings.theme || {}) };
  appSettings.graphBg = { ...GRAPH_BG_DEFAULTS, ...(appSettings.graphBg || {}) };
}

function loadAppSettings(){
  try{
    const raw = localStorage.getItem(SETTINGS_KEY);
    if(raw){
      const obj = JSON.parse(raw);
      if(obj && typeof obj==="object"){
        appSettings = {...appSettings, ...obj, shortcuts: {...SHORTCUT_DEFAULTS, ...(obj.shortcuts || {})}};
      }
    }
  }catch(_){}
  normalizeAppSettings();
  applyAppSettings();
}

function mergeUserConfig(cfg){
  if(!cfg || typeof cfg !== "object") return;
  if(cfg.appSettings && typeof cfg.appSettings === "object"){
    const merged = { ...appSettings, ...cfg.appSettings };
    merged.shortcuts = { ...SHORTCUT_DEFAULTS, ...(cfg.appSettings.shortcuts || {}), ...(appSettings.shortcuts || {}) };
    appSettings = merged;
    normalizeAppSettings();
  }
}

let saveUserConfigT = null;
function saveUserConfigDebounced(){
  clearTimeout(saveUserConfigT);
  saveUserConfigT = setTimeout(async ()=>{
    try{
      await fetch(USER_CONFIG_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appSettings })
      });
    }catch(_){}
  }, 250);
}

async function loadUserConfig(){
  try{
    const res = await fetch(USER_CONFIG_ENDPOINT, { cache: "no-store" });
    if(!res.ok) return;
    const cfg = await res.json();
    mergeUserConfig(cfg);
    applyAppSettings();
    saveAppSettings();
  }catch(_){}
}

function saveAppSettings(){
  try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings)); }catch(_){}
  saveUserConfigDebounced();
}

function applyAppSettings(){
  if(appEl){
    appEl.classList.toggle("showLib", !!appSettings.showLib);
  }
  applyThemeSettings();
  applyGraphBgSettings();
}

// Settings modal wiring
const settingsOverlay = document.getElementById("settingsOverlay");
const btnSettings = document.getElementById("btnSettings");
const setShowLib = document.getElementById("setShowLib");
const setSpacePicker = document.getElementById("setSpacePicker");
const setSpaceWhileTyping = document.getElementById("setSpaceWhileTyping");
const setPickerDelay = document.getElementById("setPickerDelay");
const setSpawnCursor = document.getElementById("setSpawnCursor");
const shortcutList = document.getElementById("shortcutList");
const setThemeCustom = document.getElementById("setThemeCustom");
const setThemeBg0 = document.getElementById("setThemeBg0");
const setThemeBg1 = document.getElementById("setThemeBg1");
const setThemePanel = document.getElementById("setThemePanel");
const setThemePanel2 = document.getElementById("setThemePanel2");
const setThemeAccent = document.getElementById("setThemeAccent");
const setThemeAccent2 = document.getElementById("setThemeAccent2");
const setThemeText = document.getElementById("setThemeText");
const setThemeMuted = document.getElementById("setThemeMuted");
const setGraphPattern = document.getElementById("setGraphPattern");
const setGraphDotSize = document.getElementById("setGraphDotSize");
const setGraphDotOpacity = document.getElementById("setGraphDotOpacity");
const setGraphGridSize = document.getElementById("setGraphGridSize");

const SHORTCUT_DEFS = [
  { key: "openPicker", label: "Open Node Picker", hint: "Space" },
  { key: "openPickerAlt", label: "Open Node Picker (Alt)", hint: "Ctrl/Cmd+K" },
  { key: "runGraph", label: "Run graph", hint: "G" },
  { key: "deleteNode", label: "Delete selected node", hint: "Delete" },
  { key: "deleteNodeAlt", label: "Delete selected node (Alt)", hint: "Backspace" },
  { key: "openSettings", label: "Open settings", hint: "S" },
  { key: "openParams", label: "Open params", hint: "P" },
  { key: "fitView", label: "Fit view", hint: "F" },
  { key: "centerView", label: "Center graph", hint: "C" }
];
let shortcutCapture = null;

function syncSettingsUI(){
  if(!settingsOverlay) return;
  setShowLib.checked = !!appSettings.showLib;
  setSpacePicker.checked = !!appSettings.spacePicker;
  setSpaceWhileTyping.checked = !!appSettings.spacePickerWhileTyping;
  setPickerDelay.value = String(Math.max(0, Math.min(400, Number(appSettings.pickerDelayMs)||0)));
  setSpawnCursor.checked = !!appSettings.spawnAtCursor;
  if(appSettings.theme){
    setThemeCustom.checked = !!appSettings.theme.custom;
    setThemeBg0.value = appSettings.theme.bg0 || "#0b0f14";
    setThemeBg1.value = appSettings.theme.bg1 || "#0d141c";
    setThemePanel.value = appSettings.theme.panel || "#0a0e14";
    setThemePanel2.value = appSettings.theme.panel2 || "#0c121a";
    setThemeAccent.value = appSettings.theme.accent || "#42ffb3";
    setThemeAccent2.value = appSettings.theme.accent2 || "#6aa6ff";
    setThemeText.value = appSettings.theme.text || "#f5f7ff";
    setThemeMuted.value = appSettings.theme.muted || "#a7b0bb";
  }
  if(appSettings.graphBg){
    setGraphPattern.value = appSettings.graphBg.pattern || "dots";
    setGraphDotSize.value = String(appSettings.graphBg.dotSize ?? 28);
    setGraphDotOpacity.value = String(Math.round((appSettings.graphBg.dotOpacity ?? 0.18) * 100));
    setGraphGridSize.value = String(appSettings.graphBg.gridSize ?? 32);
  }
  syncThemeControlState();
  renderShortcutList();
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
bindSetting(setThemeCustom, "theme", v=>({ ...appSettings.theme, custom: !!v }));
bindSetting(setThemeBg0, "theme", v=>({ ...appSettings.theme, bg0: v }));
bindSetting(setThemeBg1, "theme", v=>({ ...appSettings.theme, bg1: v }));
bindSetting(setThemePanel, "theme", v=>({ ...appSettings.theme, panel: v }));
bindSetting(setThemePanel2, "theme", v=>({ ...appSettings.theme, panel2: v }));
bindSetting(setThemeAccent, "theme", v=>({ ...appSettings.theme, accent: v }));
bindSetting(setThemeAccent2, "theme", v=>({ ...appSettings.theme, accent2: v }));
bindSetting(setThemeText, "theme", v=>({ ...appSettings.theme, text: v }));
bindSetting(setThemeMuted, "theme", v=>({ ...appSettings.theme, muted: v }));
bindSetting(setGraphPattern, "graphBg", v=>({ ...appSettings.graphBg, pattern: v }));
bindSetting(setGraphDotSize, "graphBg", v=>({ ...appSettings.graphBg, dotSize: Math.max(6, Math.min(80, Number(v)||28)) }));
bindSetting(setGraphDotOpacity, "graphBg", v=>({ ...appSettings.graphBg, dotOpacity: Math.max(0, Math.min(1, Number(v)/100 || 0)) }));
bindSetting(setGraphGridSize, "graphBg", v=>({ ...appSettings.graphBg, gridSize: Math.max(8, Math.min(120, Number(v)||32)) }));
setThemeCustom?.addEventListener("change", syncThemeControlState);

function syncThemeControlState(){
  const enabled = !!appSettings.theme?.custom;
  const inputs = [
    setThemeBg0,
    setThemeBg1,
    setThemePanel,
    setThemePanel2,
    setThemeAccent,
    setThemeAccent2,
    setThemeText,
    setThemeMuted
  ];
  inputs.forEach((el)=>{
    if(!el) return;
    el.disabled = !enabled;
    el.closest(".npItem")?.classList?.toggle("isDisabled", !enabled);
  });
}

function applyThemeSettings(){
  const root = document.documentElement;
  const theme = appSettings.theme || {};
  if(theme.custom){
    root.style.setProperty("--bg0", theme.bg0 || "#0b0f14");
    root.style.setProperty("--bg1", theme.bg1 || theme.bg0 || "#0b0f14");
    root.style.setProperty("--panel", theme.panel || "#0a0e14");
    root.style.setProperty("--panel2", theme.panel2 || theme.panel || "#0a0e14");
    root.style.setProperty("--accent", theme.accent || "#42ffb3");
    root.style.setProperty("--accent2", theme.accent2 || "#6aa6ff");
    root.style.setProperty("--text", theme.text || "#f5f7ff");
    root.style.setProperty("--muted", theme.muted || "#a7b0bb");
  }else{
    root.style.removeProperty("--bg0");
    root.style.removeProperty("--bg1");
    root.style.removeProperty("--panel");
    root.style.removeProperty("--panel2");
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent2");
    root.style.removeProperty("--text");
    root.style.removeProperty("--muted");
  }
}

function applyGraphBgSettings(){
  const graphBg = document.getElementById("graphBg");
  if(!graphBg) return;
  const opts = appSettings.graphBg || {};
  const pattern = opts.pattern || "dots";
  graphBg.classList.remove(
    "pattern-dots",
    "pattern-grid",
    "pattern-crosshatch",
    "pattern-diagonal",
    "pattern-squares",
    "pattern-checker",
    "pattern-diamond",
    "pattern-none"
  );
  graphBg.classList.add(`pattern-${pattern}`);
  const root = document.documentElement;
  root.style.setProperty("--graph-dot-size", `${opts.dotSize ?? 28}px`);
  root.style.setProperty("--graph-dot-opacity", String(opts.dotOpacity ?? 0.18));
  root.style.setProperty("--graph-grid-size", `${opts.gridSize ?? 32}px`);
}

function shortcutToLabel(code){
  if(!code) return "—";
  return code.replace(/Key/,"").replace(/Digit/,"").replace(/\+/g, " + ");
}

function renderShortcutList(){
  if(!shortcutList) return;
  shortcutList.innerHTML = "";
  for(const def of SHORTCUT_DEFS){
    const item = document.createElement("div");
    item.className = "npItem shortcutRow";

    const meta = document.createElement("div");
    meta.className = "npMeta";
    const title = document.createElement("div");
    title.className = "npTitle";
    title.textContent = def.label;
    const desc = document.createElement("div");
    desc.className = "npDesc";
    desc.textContent = `Default: ${def.hint}`;
    meta.appendChild(title);
    meta.appendChild(desc);

    const btn = document.createElement("button");
    btn.className = "btn shortcutBtn";
    btn.textContent = shortcutToLabel(appSettings.shortcuts?.[def.key]);
    btn.addEventListener("click", (e)=>{
      e.preventDefault();
      shortcutCapture = { key: def.key, button: btn };
      btn.classList.add("capture");
      btn.textContent = "Press key…";
    });

    item.appendChild(meta);
    item.appendChild(btn);
    shortcutList.appendChild(item);
  }
}

function eventToShortcut(ev){
  const parts = [];
  if(ev.ctrlKey) parts.push("Ctrl");
  if(ev.metaKey) parts.push("Meta");
  if(ev.altKey) parts.push("Alt");
  if(ev.shiftKey) parts.push("Shift");
  parts.push(ev.code);
  return parts.join("+");
}

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
  if(tag==="import") return "Import";
  if(tag==="mesh") return "Mesh";
  if(tag==="path") return "Path & Slice";
  if(tag==="slicer") return "Path & Slice";
  if(tag==="generator") return "Generators";
  if(tag==="modifier") return "Modifiers";
  if(tag==="rules") return "Rules";
  if(tag==="printer") return "Printer";
  if(tag==="ui") return "UI";
  if(tag==="analysis") return "Analysis";
  if(tag==="workflow") return "Workflow";
  if(tag==="multi-material") return "Multi-Material";
  if(tag==="gcode") return "G-code";
  if(tag==="geometry") return "Geometry";
  if(tag==="creative") return "Creative";
  return "Other";
}

function rebuildNodePickerItems(){
  const diagnostics = updateNodeDefDiagnostics();
  if((diagnostics.lowCount || diagnostics.missingTypes.length) && !nodeDefDiagnostics.warned){
    nodeDefDiagnostics.warned = true;
    const missingText = diagnostics.missingTypes.length
      ? `Missing types: ${diagnostics.missingTypes.join(", ")}.`
      : "No core node types missing.";
    console.warn(
      `[Node defs] Expected at least ${EXPECTED_NODE_DEF_COUNT} node defs, found ${diagnostics.total}. ${missingText} ` +
      "Check the DevTools Console for script load errors."
    );
  }
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
  const diagnostics = updateNodeDefDiagnostics();

  // Category mapping (Comfy-style grouping)
  const catOf = (def)=>{
    const tag = (def.tag||"").toLowerCase();
    if(tag==="import") return "Import";
    if(tag==="mesh") return "Mesh";
    if(tag==="path") return "Path & Slice";
    if(tag==="slicer") return "Path & Slice";
    if(tag==="generator") return "Generators";
    if(tag==="modifier") return "Modifiers";
    if(tag==="rules") return "Rules";
    if(tag==="printer") return "Printer";
    if(tag==="export") return "Export";
    if(tag==="analysis") return "Analysis";
    if(tag==="workflow") return "Workflow";
    if(tag==="multi-material") return "Multi-Material";
    if(tag==="gcode") return "G-code";
    if(tag==="geometry") return "Geometry";
    if(tag==="creative") return "Creative";
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
  if(diagnostics.lowCount || diagnostics.missingTypes.length){
    const msg = document.createElement("div");
    msg.className = "hint";
    const missingText = diagnostics.missingTypes.length
      ? `Missing core nodes: ${diagnostics.missingTypes.join(", ")}.`
      : "Some node scripts may have failed to load.";
    msg.innerHTML = `<b>Node count looks low</b><div style="margin-top:6px;opacity:.75">Found ${diagnostics.total} nodes, expected ~${EXPECTED_NODE_DEF_COUNT}. ${missingText} Check the DevTools Console for script load errors.</div>`;
    frag.appendChild(msg);
  }
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
function renderParamEditorInto(wrap){
  if(!wrap) return;
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

function renderParamEditor(){
  renderParamEditorInto(document.getElementById("paramEditor"));
  renderParamEditorInto(document.getElementById("paramEditorOverlay"));
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
  graphBg.style.transform = `none`;
  const opts = appSettings.graphBg || {};
  const dot = Math.max(2, Number(opts.dotSize ?? 28)) * z;
  const grid = Math.max(2, Number(opts.gridSize ?? 32)) * z;
  const root = document.documentElement;
  root.style.setProperty("--graph-dot-size", `${dot}px`);
  root.style.setProperty("--graph-grid-size", `${grid}px`);
  graphBg.style.backgroundPosition = `${Math.round(state.ui.panX)}px ${Math.round(state.ui.panY)}px`;
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

  function findOutputDotAt(x, y){
    const t = document.elementFromPoint(x, y);
    if(!t) return null;
    if(t.classList?.contains("dot") && t.dataset?.dir==="out") return t;
    const rowOut = t.closest?.(".portRow.out");
    if(rowOut){
      const d = rowOut.querySelector?.(".dot.out");
      if(d) return d;
    }
    const anyDot = t.closest?.(".dot.out");
    return anyDot || null;
  }

  function beginLinkDrag(e){
    e.stopPropagation();
    e.preventDefault();
    selectNode(nodeId);

    if(dir === "in"){
      disconnectInput();
    }

    ensureLinks();
    g.linking = { pointerId: e.pointerId, fromNode: nodeId, fromPort: portName, fromType: portType, fromDir: dir, x: e.clientX, y: e.clientY };
    setLinkTargetHighlights(portType, dir);
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

      if(g.linking.fromDir === "out"){
        const inDot = findInputDotAt(ev.clientX, ev.clientY);
        if(inDot){
          const toNode = inDot.dataset.nodeId;
          const toPort = inDot.dataset.portName;
          const toType = inDot.dataset.portType;

          if(!isTypeCompatible(toType, g.linking.fromType)){
            toast("Type mismatch");
          } else {
            const linkType = normalizePortType(g.linking.fromType);
            const links = ensureLinks();
            const existing = links.findIndex(L=>L?.to?.node===toNode && L?.to?.port===toPort);
            if(existing>=0) links.splice(existing, 1);
            links.push({
              id: uid(),
              from: { node: g.linking.fromNode, port: g.linking.fromPort, type: linkType },
              to:   { node: toNode,              port: toPort,              type: linkType }
            });
            saveState(); markDirtyAuto();
            toast("Connected");
          }
        }
      } else {
        const outDot = findOutputDotAt(ev.clientX, ev.clientY);
        if(outDot){
          const fromNode = outDot.dataset.nodeId;
          const fromPort = outDot.dataset.portName;
          const fromType = outDot.dataset.portType;

          if(!isTypeCompatible(fromType, g.linking.fromType)){
            toast("Type mismatch");
          } else {
            const linkType = normalizePortType(g.linking.fromType);
            const links = ensureLinks();
            const existing = links.findIndex(L=>L?.to?.node===g.linking.fromNode && L?.to?.port===g.linking.fromPort);
            if(existing>=0) links.splice(existing, 1);
            links.push({
              id: uid(),
              from: { node: fromNode,           port: fromPort,           type: linkType },
              to:   { node: g.linking.fromNode, port: g.linking.fromPort, type: linkType }
            });
            saveState(); markDirtyAuto();
            toast("Connected");
          }
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
function setLinkTargetHighlights(fromType, fromDir){
  document.body.classList.add("linking");
  document.body.classList.remove("linking-from-in", "linking-from-out");
  document.body.classList.add(fromDir === "in" ? "linking-from-in" : "linking-from-out");
  const targetDir = fromDir === "in" ? "out" : "in";
  const dots = nodesLayer.querySelectorAll(`.dot.${targetDir}`);
  dots.forEach(d=>{
    const ok = isTypeCompatible(d.dataset.portType, fromType);
    d.classList.toggle("canDrop", ok);
    d.classList.toggle("cantDrop", !ok);
  });
}
function clearLinkTargetHighlights(){
  document.body.classList.remove("linking");
  document.body.classList.remove("linking-from-in", "linking-from-out");
  const dots = nodesLayer.querySelectorAll(".dot");
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
  state.outputs.toolpath = null;
  state.outputs.preview = null;
  state.outputs.previewWarning = "";
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
    if(!out || !inp || !isTypeCompatible(out.type, inp.type)) return false;
    const normalized = normalizePortType(out.type);
    L.from.type = normalized;
    L.to.type = normalized;
    return true;
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
      gl_PointSize = 10.0;
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
  varying vec3 vPos;
  void main(){
    vN = aNor;
    vPos = aPos;
    gl_Position = uVP * vec4(aPos, 1.0);
  }
`;
const fs2 = `
  precision mediump float;
  varying vec3 vN;
  varying vec3 vPos;
  uniform vec3 uLight;
  uniform vec3 uEye;
  uniform vec3 uBase;
  uniform float uAlpha;
  void main(){
    vec3 N = normalize(vN);
    vec3 L = normalize(uLight);
    vec3 V = normalize(uEye - vPos);
    vec3 H = normalize(L + V);
    float diff = max(0.0, dot(N, L));
    float spec = pow(max(dot(N, H), 0.0), 48.0);
    float ambient = 0.18;
    vec3 color = uBase * (ambient + diff) + vec3(0.5) * spec;
    gl_FragColor = vec4(color, uAlpha);
  }
`;
const prog2 = glCreateProgram(gl, vs2, fs2);
preview.progSolid = prog2;
preview.aPos2 = gl.getAttribLocation(prog2, "aPos");
preview.aNor = gl.getAttribLocation(prog2, "aNor");
preview.uVP2 = gl.getUniformLocation(prog2, "uVP");
preview.uLight = gl.getUniformLocation(prog2, "uLight");
preview.uEye = gl.getUniformLocation(prog2, "uEye");
preview.uBase = gl.getUniformLocation(prog2, "uBase");
preview.uAlpha = gl.getUniformLocation(prog2, "uAlpha");

 const vsR = `
   attribute vec3 aPos;
   attribute vec3 aNor;
   attribute vec4 aCol;
   uniform mat4 uVP;
   varying vec3 vN;
   varying vec3 vPos;
   varying vec4 vCol;
   void main(){
     vN = aNor;
     vPos = aPos;
     vCol = aCol;
     gl_Position = uVP * vec4(aPos, 1.0);
   }
 `;
 const fsR = `
   precision mediump float;
   varying vec3 vN;
   varying vec3 vPos;
   varying vec4 vCol;
   uniform vec3 uLight;
   uniform vec3 uEye;
   void main(){
     vec3 N = normalize(vN);
     vec3 L = normalize(uLight);
     vec3 V = normalize(uEye - vPos);
     vec3 H = normalize(L + V);
     float diff = max(0.0, dot(N, L));
     float spec = pow(max(dot(N, H), 0.0), 42.0);
     float ambient = 0.22;
     vec3 c = vCol.rgb * (ambient + diff) + vec3(0.35) * spec;
     gl_FragColor = vec4(c, vCol.a);
   }
 `;
 const progR = glCreateProgram(gl, vsR, fsR);
 preview.progRibbon = progR;
 preview.aPosR = gl.getAttribLocation(progR, "aPos");
 preview.aNorR = gl.getAttribLocation(progR, "aNor");
 preview.aColR = gl.getAttribLocation(progR, "aCol");
 preview.uVPR = gl.getUniformLocation(progR, "uVP");
 preview.uLightR = gl.getUniformLocation(progR, "uLight");
 preview.uEyeR = gl.getUniformLocation(progR, "uEye");

  preview.buf = gl.createBuffer();
  preview.colBuf = gl.createBuffer();
  preview.gridBuf = gl.createBuffer();
  preview.bedBuf = gl.createBuffer();
  preview.toolBuf = gl.createBuffer();
  preview.meshBuf = gl.createBuffer();
  preview.meshTriPosBuf = gl.createBuffer();
  preview.meshTriNorBuf = gl.createBuffer();
  preview.pathTriBuf = gl.createBuffer();
  preview.pathTriColBuf = gl.createBuffer();
  preview.pathRibbonPosBuf = gl.createBuffer();
  preview.pathRibbonNorBuf = gl.createBuffer();
  preview.pathRibbonColBuf = gl.createBuffer();

  gl.enableVertexAttribArray(preview.aPos);
  gl.bindBuffer(gl.ARRAY_BUFFER, preview.buf);
  gl.vertexAttribPointer(preview.aPos, 3, gl.FLOAT, false, 0, 0);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0,0,0,0);

  bindPreviewCanvasControls();
  if(typeof bindPreviewControls === "function"){
    bindPreviewControls();
  }
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
    if(preview.uEye) gl.uniform3f(preview.uEye, eye.x, eye.y, eye.z);
  }
  if(preview.progRibbon && preview.uVPR){
    gl.useProgram(preview.progRibbon);
    gl.uniformMatrix4fv(preview.uVPR, false, vp);
    if(preview.uEyeR) gl.uniform3f(preview.uEyeR, eye.x, eye.y, eye.z);
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

const FEATURE_ROLE_ALIASES = {
  perimeter: "wall_outer",
  perimeters: "wall_outer",
  inner_perimeter: "wall_inner",
  outer_perimeter: "wall_outer",
  internal_perimeter: "wall_inner",
  external_perimeter: "wall_outer",
  wall: "walls",
  walls: "walls",
  wall_outer: "wall_outer",
  wall_inner: "wall_inner",
  outer_wall: "wall_outer",
  inner_wall: "wall_inner",
  skin: "top",
  top_skin: "top",
  bottom_skin: "bottom",
  gap_fill: "infill",
  sparse_infill: "infill",
  solid_infill: "top",
  dense_infill: "top",
  bridge: "top",
  support: "support",
  support_interface: "support",
  skirt: "travel",
  brim: "travel",
  raft: "bottom"
};

function normalizeFeatureRole(raw){
  if(!raw) return "";
  const r = String(raw).toLowerCase().trim();
  const key = r.replace(/[\s-]+/g, "_");
  return FEATURE_ROLE_ALIASES[key] || FEATURE_ROLE_ALIASES[r] || key;
}

function tToRGBA(t){
  const tt = Math.max(0, Math.min(1, t));
  const r = Math.round(220 * tt + 30);
  const g = Math.round(120 * (1 - Math.abs(tt - 0.5) * 2) + 60);
  const b = Math.round(240 * (1 - tt) + 15);
  return [r/255, g/255, b/255, 0.95];
}

function getPreviewColor(pt){
  const overlay = previewFilter?.overlay || "featureType";
  if(overlay && overlay !== "featureType" && overlay !== "role"){
    const vis = pt?.meta?.visual;
    if(vis && (vis.field === overlay || !vis.field)){
      if(Array.isArray(vis.color)) return vis.color;
      if(Number.isFinite(vis.t)) return tToRGBA(vis.t);
    }
  }
  const role = (pt.meta && pt.meta.role) ? pt.meta.role : (pt.role||"");
  return roleToRGBA(normalizeFeatureRole(role));
}

function extractFeatureRole(source){
  if(!source || typeof source !== "object") return "";
  return source.role
    ?? source.feature
    ?? source.featureType
    ?? source.type
    ?? source.kind
    ?? source.extrusionRole
    ?? source.extrusion_role
    ?? source.pathType
    ?? source.tag
    ?? "";
}

function normalizePreviewPath(path){
  if(!Array.isArray(path)) return [];
  return path.map((pt)=>{
    if(!pt) return null;
    const meta = (pt.meta && typeof pt.meta === "object") ? {...pt.meta} : {};
    if(!meta.role){
      const roleFromMeta = extractFeatureRole(meta);
      const roleFromPt = extractFeatureRole(pt);
      meta.role = roleFromMeta || roleFromPt || meta.feature || pt.feature || meta.featureType || pt.featureType || "";
    }
    if(meta.role) meta.role = normalizeFeatureRole(meta.role);
    const out = {...pt, meta};
    if(!out.role && meta.role) out.role = meta.role;
    return out;
  });
}

function toolpathToPath(toolpath, options){
  if(!toolpath) return {path:[], warning:""};
  if(Array.isArray(toolpath)){
    return {path: normalizePreviewPath(toolpath), warning:""};
  }
  if(!toolpath.layers){
    if(Array.isArray(toolpath.path)){
      return {path: normalizePreviewPath(toolpath.path), warning:""};
    }
    if(Array.isArray(toolpath.moves)){
      toolpath = {layers:[{z: toolpath.z ?? 0, moves: toolpath.moves}]};
    }else{
      return {path:[], warning:""};
    }
  }
  const maxMoves = options?.maxMoves ?? 200000;
  const profile = options?.profile || null;
  let moveCount = 0;
  for(const layer of toolpath.layers){ moveCount += (layer.moves||[]).length; }
  const step = moveCount > maxMoves ? Math.ceil(moveCount / maxMoves) : 1;
  const warning = step > 1 ? `Preview decimated: ${moveCount.toLocaleString()} moves → every ${step}th.` : "";
  const path = [];
  let idx = 0;
  let last = null;
  const layerHeight = (toolpath.layers?.length > 1)
    ? Math.abs((toolpath.layers[1].z ?? 0) - (toolpath.layers[0].z ?? 0)) || 0.2
    : 0.2;

  for(let li=0; li<toolpath.layers.length; li++){
    const layer = toolpath.layers[li];
    const layerZ = layer.z ?? last?.z ?? 0;
    for(const move of (layer.moves || [])){
      idx += 1;
      if(step > 1 && (idx % step) !== 0) continue;
      const x = move.x ?? last?.x ?? 0;
      const y = move.y ?? last?.y ?? 0;
      const z = move.z ?? layerZ ?? last?.z ?? 0;
      const pos = profile ? toMachineXY(x, y, profile) : {X:x, Y:y};
      const meta = (move.meta && typeof move.meta === "object") ? {...move.meta} : (move.meta ? {value:move.meta} : {});
      if(!meta.role){
        meta.role = extractFeatureRole(meta) || extractFeatureRole(move) || meta.feature || move.feature || "";
      }
      if(meta.role) meta.role = normalizeFeatureRole(meta.role);
      if(meta.layerHeight == null) meta.layerHeight = layerHeight;
      const travel = move.kind === "travel" || meta.feature === "travel" || meta.role === "travel" || move.type === "travel";
      path.push({x:pos.X, y:pos.Y, X:pos.X, Y:pos.Y, z, layer: li, travel, meta, role: meta.role});
      last = {x, y, z};
    }
  }
  return {path, warning};
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
  const pos = [];
  const col = [];
  const triPos = [];
  const triCol = [];
  const ribPos = [];
  const ribNor = [];
  const ribCol = [];
  let last = null;
  const useHd = typeof previewLineSettings !== "undefined" && previewLineSettings?.mode === "hd";

  const pushVertex = (pt)=>{
    const X = pt.X ?? pt.x ?? 0;
    const Y = pt.Y ?? pt.y ?? 0;
    const Z = pt.z ?? 0;
    pos.push(X, Y, Z);
    const rgba = getPreviewColor(pt);
    col.push(rgba[0], rgba[1], rgba[2], rgba[3]);
  };

  const pushRibbon = (a, b, width, height)=>{
    const ax = a.X ?? a.x ?? 0;
    const ay = a.Y ?? a.y ?? 0;
    const az = a.z ?? 0;
    const bx = b.X ?? b.x ?? 0;
    const by = b.Y ?? b.y ?? 0;
    const bz = b.z ?? 0;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if(len <= 1e-6) return;
    const half = Math.max(0.001, width * 0.5);
    const rx = -dy / len;
    const ry =  dx / len;
    const ca = getPreviewColor(a);
    const cb = getPreviewColor(b);
    const bottomZA = az - height;
    const bottomZB = bz - height;
    const base = Math.max(half * 12, len * 0.5);
    const zoomAdj = Math.max(0.5, Math.min(2.0, 220 / Math.max(1, preview.cam.radius)));
    const samples = Math.max(8, Math.min(200, Math.floor(base * zoomAdj)));
    let u0 = -1;
    let x0 = u0 * half;
    const denomW = half*half || 1e-9;
    const denomH = height*height || 1e-9;
    let zRelA0 = height * Math.sqrt(Math.max(0, 1 - (x0*x0)/denomW));
    let zRelB0 = height * Math.sqrt(Math.max(0, 1 - (x0*x0)/denomW));
    let A0x = ax + rx * x0;
    let A0y = ay + ry * x0;
    let A0z = bottomZA + zRelA0 + 0.001;
    let B0x = bx + rx * x0;
    let B0y = by + ry * x0;
    let B0z = bottomZB + zRelB0 + 0.001;
    let nxA0 = (x0) / denomW;
    let nzA0 = (zRelA0) / denomH;
    let nxB0 = (x0) / denomW;
    let nzB0 = (zRelB0) / denomH;
    let nA0x = rx*nxA0, nA0y = ry*nxA0, nA0z = nzA0;
    let nB0x = rx*nxB0, nB0y = ry*nxB0, nB0z = nzB0;
    if(nA0z < 0){ nA0x=-nA0x; nA0y=-nA0y; nA0z=-nA0z; }
    if(nB0z < 0){ nB0x=-nB0x; nB0y=-nB0y; nB0z=-nB0z; }
    let nlA0 = Math.hypot(nA0x,nA0y,nA0z) || 1;
    let nlB0 = Math.hypot(nB0x,nB0y,nB0z) || 1;
    nA0x/=nlA0; nA0y/=nlA0; nA0z/=nlA0;
    nB0x/=nlB0; nB0y/=nlB0; nB0z/=nlB0;
    for(let i=1;i<=samples;i++){
      const u = (i / samples) * 2 - 1;
      const x1 = u * half;
      const zRelA1 = height * Math.sqrt(Math.max(0, 1 - (x1*x1)/denomW));
      const zRelB1 = height * Math.sqrt(Math.max(0, 1 - (x1*x1)/denomW));
      const A1x = ax + rx * x1;
      const A1y = ay + ry * x1;
      const A1z = bottomZA + zRelA1 + 0.001;
      const B1x = bx + rx * x1;
      const B1y = by + ry * x1;
      const B1z = bottomZB + zRelB1 + 0.001;
      const nxA1 = (x1) / denomW;
      const nzA1 = (zRelA1) / denomH;
      const nxB1 = (x1) / denomW;
      const nzB1 = (zRelB1) / denomH;
      let nA1x = rx*nxA1, nA1y = ry*nxA1, nA1z = nzA1;
      let nB1x = rx*nxB1, nB1y = ry*nxB1, nB1z = nzB1;
      if(nA1z < 0){ nA1x=-nA1x; nA1y=-nA1y; nA1z=-nA1z; }
      if(nB1z < 0){ nB1x=-nB1x; nB1y=-nB1y; nB1z=-nB1z; }
      const nlA1 = Math.hypot(nA1x,nA1y,nA1z) || 1;
      const nlB1 = Math.hypot(nB1x,nB1y,nB1z) || 1;
      nA1x/=nlA1; nA1y/=nlA1; nA1z/=nlA1;
      nB1x/=nlB1; nB1y/=nlB1; nB1z/=nlB1;
      ribPos.push(A0x,A0y,A0z,  B0x,B0y,B0z,  A1x,A1y,A1z);
      ribNor.push(nA0x,nA0y,nA0z,  nB0x,nB0y,nB0z,  nA1x,nA1y,nA1z);
      ribCol.push(ca[0],ca[1],ca[2],ca[3],  cb[0],cb[1],cb[2],cb[3],  ca[0],ca[1],ca[2],ca[3]);
      ribPos.push(A1x,A1y,A1z,  B0x,B0y,B0z,  B1x,B1y,B1z);
      ribNor.push(nA1x,nA1y,nA1z,  nB0x,nB0y,nB0z,  nB1x,nB1y,nB1z);
      ribCol.push(ca[0],ca[1],ca[2],ca[3],  cb[0],cb[1],cb[2],cb[3],  cb[0],cb[1],cb[2],cb[3]);
      A0x=A1x; A0y=A1y; A0z=A1z; B0x=B1x; B0y=B1y; B0z=B1z;
      nA0x=nA1x; nA0y=nA1y; nA0z=nA1z; nB0x=nB1x; nB0y=nB1y; nB0z=nB1z;
    }
  };

  for(const p of machinePath){
    if(!p){
      last = null;
      continue;
    }
    if(last){
      pushVertex(last);
      pushVertex(p);
      if(useHd){
        const travelSeg = !!(p.travel || (p.meta && (p.meta.feature === "travel" || p.meta.role === "travel")));
        if(!travelSeg){
          const width = Math.max(0.15, Number(p.meta?.lineWidth || p.meta?.width || previewLineSettings?.width || 0.6));
          const height = Math.max(0.05, Number(p.meta?.layerHeight || p.meta?.height || 0.2));
          pushRibbon(last, p, width, height);
        }
      }
    }
    last = p;
  }

  uploadBuffer(preview.buf, new Float32Array(pos));
  uploadBuffer(preview.colBuf, new Float32Array(col));
  preview.counts.path = pos.length / 3;
  uploadBuffer(preview.pathTriBuf, new Float32Array(triPos));
  uploadBuffer(preview.pathTriColBuf, new Float32Array(triCol));
  preview.counts.pathTris = triPos.length / 3;
  uploadBuffer(preview.pathRibbonPosBuf, new Float32Array(ribPos));
  uploadBuffer(preview.pathRibbonNorBuf, new Float32Array(ribNor));
  uploadBuffer(preview.pathRibbonColBuf, new Float32Array(ribCol));
  preview.counts.pathRibbonTris = ribPos.length / 3;

  // tool dot at last point
  const tool = new Float32Array(3);
  if(last){
    tool[0]=last.X ?? last.x ?? 0;
    tool[1]=last.Y ?? last.y ?? 0;
    tool[2]=last.z ?? 0;
    preview.toolPos = {x: tool[0], y: tool[1], z: tool[2]};
  } else {
    tool[0]=preview.bed.w/2; tool[1]=preview.bed.d/2; tool[2]=0;
    preview.toolPos = {x: tool[0], y: tool[1], z: tool[2]};
  }
  uploadBuffer(preview.toolBuf, tool);
  preview.counts.tool = 1;
}


function setPreviewMesh(meshModel, profile, offsetX=0, offsetY=0){
  const gl = preview.gl;
  if(!gl){ return; }

  // cache hash for MV (tri count + bounds)
  try{
    const trisHash = meshToTris(meshModel) || new Float32Array(0);
    const b = meshModel?.bounds || (trisHash.length ? computeMeshBounds(trisHash) : null);
    const h = `${trisHash.length||0}|${b?.minx||0},${b?.miny||0},${b?.minz||0}|${b?.maxx||0},${b?.maxy||0},${b?.maxz||0}`;
    preview.lastMeshHash = h;
  }catch(_){}

  const tris = meshToTris(meshModel);
  if(!meshModel || !tris || tris.length<9){
    uploadBuffer(preview.meshBuf, new Float32Array(0));
    preview.counts.mesh = 0;
    uploadBuffer(preview.meshTriPosBuf, new Float32Array(0));
    uploadBuffer(preview.meshTriNorBuf, new Float32Array(0));
    preview.countsTris = 0;
    return;
  }

  const triCount = Math.floor(tris.length/9);
  const px = Math.max(1, (glCanvas?.width||800) * (glCanvas?.height||600));
  const maxTris = Math.max(20000, Math.min(80000, Math.floor(px / 20)));
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
    lines.push(A.X+offsetX, A.Y+offsetY, az,  B.X+offsetX, B.Y+offsetY, bz);
    lines.push(B.X+offsetX, B.Y+offsetY, bz,  C.X+offsetX, C.Y+offsetY, cz);
    lines.push(C.X+offsetX, C.Y+offsetY, cz,  A.X+offsetX, A.Y+offsetY, az);

    // normal (flat)
    const ux = ((B.X+offsetX) - (A.X+offsetX)), uy = ((B.Y+offsetY) - (A.Y+offsetY)), uz = (bz - az);
    const vx = ((C.X+offsetX) - (A.X+offsetX)), vy = ((C.Y+offsetY) - (A.Y+offsetY)), vz = (cz - az);
    let nx = uy*vz - uz*vy;
    let ny = uz*vx - ux*vz;
    let nz = ux*vy - uy*vx;
    if(nz < 0){ nx=-nx; ny=-ny; nz=-nz; }
    const nl = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
    nx/=nl; ny/=nl; nz/=nl;

    posTri.push(A.X+offsetX, A.Y+offsetY, az,  B.X+offsetX, B.Y+offsetY, bz,  C.X+offsetX, C.Y+offsetY, cz);
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
const meshTris = meshToTris(mesh);
if(mesh && meshTris && meshTris.length>=9){
  const b = mesh.bounds || computeMeshBounds(meshTris);
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

  if(!pts.length && !(mesh && meshTris && meshTris.length>=9)){
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

function bindPreviewCanvasControls(){
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

  const previewCtl = window.__GCODE_STUDIO_PREVIEW__;
  if(previewCtl?.scrub?.playing && previewCtl?.scrub?.follow && preview.toolPos){
    const target = preview.cam.target;
    target.x += (preview.toolPos.x - target.x) * 0.08;
    target.y += (preview.toolPos.y - target.y) * 0.08;
    target.z += (preview.toolPos.z - target.z) * 0.08;
  }

  updateVP();

  // Draw grid
  gl.enableVertexAttribArray(preview.aPos);
  const text = getComputedStyle(document.body).getPropertyValue("--text").trim();
  setColor("#ffffff", 0.60);
  gl.bindBuffer(gl.ARRAY_BUFFER, preview.gridBuf);
  gl.vertexAttribPointer(preview.aPos, 3, gl.FLOAT, false, 0, 0);
  setConstACol(gl, hexToRGBAf("#ffffff", 0.70));
  gl.drawArrays(gl.LINES, 0, preview.counts.grid);

  // Draw bed border
  setColor(text, 0.22);
  gl.bindBuffer(gl.ARRAY_BUFFER, preview.bedBuf);
  gl.vertexAttribPointer(preview.aPos, 3, gl.FLOAT, false, 0, 0);
  setConstACol(gl, hexToRGBAf(text||"#ffffff", 0.18));
  gl.drawArrays(gl.LINES, 0, preview.counts.bed);


// Draw mesh (wireframe/solid)
if(previewMeshSettings.render !== "off"){
  if(previewMeshSettings.render !== "solid" && preview.counts.mesh>1){
    setColor(text, 0.14);
    gl.bindBuffer(gl.ARRAY_BUFFER, preview.meshBuf);
    gl.vertexAttribPointer(preview.aPos, 3, gl.FLOAT, false, 0, 0);
    setConstACol(gl, hexToRGBAf(text||"#ffffff", 0.14));
    gl.drawArrays(gl.LINES, 0, preview.counts.mesh);
  }

  if(previewMeshSettings.render !== "wire" && preview.countsTris>2 && preview.progSolid){
    gl.useProgram(preview.progSolid);
    gl.bindBuffer(gl.ARRAY_BUFFER, preview.meshTriPosBuf);
    if(preview.aPos2 >= 0){
      gl.enableVertexAttribArray(preview.aPos2);
      gl.vertexAttribPointer(preview.aPos2, 3, gl.FLOAT, false, 0, 0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, preview.meshTriNorBuf);
    if(preview.aNor >= 0){
      gl.enableVertexAttribArray(preview.aNor);
      gl.vertexAttribPointer(preview.aNor, 3, gl.FLOAT, false, 0, 0);
    }
    gl.uniform3f(preview.uLight, 0.3, 0.6, 1.0);
    gl.uniform3f(preview.uBase, 0.75, 0.85, 1.0);
    gl.uniform1f(preview.uAlpha, previewMeshSettings.alpha);
    gl.drawArrays(gl.TRIANGLES, 0, preview.countsTris);
    gl.useProgram(preview.prog);
  }
}

  // Draw path
  // Per-point colors by role

  const accent = getComputedStyle(document.body).getPropertyValue("--accent").trim();
  const accent2 = getComputedStyle(document.body).getPropertyValue("--accent2").trim();
  if(typeof previewLineSettings !== "undefined" && previewLineSettings?.mode === "hd" && preview.counts.pathRibbonTris>2 && preview.progRibbon){
    gl.useProgram(preview.progRibbon);
    gl.bindBuffer(gl.ARRAY_BUFFER, preview.pathRibbonPosBuf);
    if(preview.aPosR>=0){ gl.enableVertexAttribArray(preview.aPosR); gl.vertexAttribPointer(preview.aPosR, 3, gl.FLOAT, false, 0, 0); }
    gl.bindBuffer(gl.ARRAY_BUFFER, preview.pathRibbonNorBuf);
    if(preview.aNorR>=0){ gl.enableVertexAttribArray(preview.aNorR); gl.vertexAttribPointer(preview.aNorR, 3, gl.FLOAT, false, 0, 0); }
    gl.bindBuffer(gl.ARRAY_BUFFER, preview.pathRibbonColBuf);
    if(preview.aColR>=0){ gl.enableVertexAttribArray(preview.aColR); gl.vertexAttribPointer(preview.aColR, 4, gl.FLOAT, false, 0, 0); }
    gl.uniform3f(preview.uLightR, 0.25, 0.55, 1.0);
    gl.drawArrays(gl.TRIANGLES, 0, preview.counts.pathRibbonTris);
    gl.useProgram(preview.prog);
    setColor(accent2, 0.55);
    gl.bindBuffer(gl.ARRAY_BUFFER, preview.buf);
    gl.vertexAttribPointer(preview.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(preview.aCol);
    gl.bindBuffer(gl.ARRAY_BUFFER, preview.colBuf);
    gl.vertexAttribPointer(preview.aCol, 4, gl.FLOAT, false, 0, 0);
    if(preview.counts.path>1) gl.drawArrays(gl.LINES, 0, preview.counts.path);
  }else{
    setColor(accent2, 0.35);
    gl.bindBuffer(gl.ARRAY_BUFFER, preview.buf);
    gl.vertexAttribPointer(preview.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(preview.aCol);
    gl.bindBuffer(gl.ARRAY_BUFFER, preview.colBuf);
    gl.vertexAttribPointer(preview.aCol, 4, gl.FLOAT, false, 0, 0);
    if(preview.counts.path>1) gl.drawArrays(gl.LINES, 0, preview.counts.path);

    setColor(accent, 0.85);
    if(preview.counts.path>1) gl.drawArrays(gl.LINES, 0, preview.counts.path);
  }

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
    const previewPath = state.outputs.preview?.path;
    const __pAll2 = Array.isArray(previewPath) ? previewPath : (state.outputs.path||[]);
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
    const mesh = state.outputs.preview?.mesh || state.outputs.mesh || null;
    try{
      if(mesh && mesh.glbUrl){
        mv.style.display = "block";
        mv.src = mesh.glbUrl;
      }else if(mesh && meshToTris(mesh)?.length >= 9){
        mv.style.display = "block";
        const url = meshToObjectURL_GLb(mesh);
        mv.src = url;
      }else{
        mv.removeAttribute("src");
      }
    }catch(err){ console.warn(err); }
    glCanvas.style.display="none";
    fallback2d.style.display="none";
    return;
  }
}

  let prof = null;
  for(const n of Object.values(state.nodes)){
    const out = evalCache.get(n.id);
    if(out?.profile) prof = out.profile;
  }
  if(!prof){
    const printerNode = Object.values(state.nodes).find(n=>n.type==="Printer");
    prof = printerNode?.data || {bedW:220, bedD:220, origin:"center"};
  }
  if(prof.bedW !== preview.bed.w || prof.bedD !== preview.bed.d){
    buildBedBuffers(prof.bedW, prof.bedD);
  }
  const previewPayload = state.outputs.preview || null;
  const previewMesh = previewPayload?.mesh || state.outputs.mesh || null;
  const previewToolpath = previewPayload?.toolpath || state.outputs.toolpath || null;
  const previewPath = previewPayload?.path;
  const overlayRaw = previewPayload?.overlays || state.outputs.path?.overlays || (previewToolpath ? ["featureType"] : []);
  const overlays = Array.isArray(overlayRaw)
    ? overlayRaw
    : (overlayRaw && typeof overlayRaw === "object")
      ? Object.keys(overlayRaw)
      : (typeof overlayRaw === "string" ? [overlayRaw] : []);

  updatePreviewOverlayOptions(overlays);
  updatePreviewLegend(previewPayload?.legend || null);
  

  let pathForPreview = Array.isArray(previewPath) ? previewPath : (state.outputs.path||[]);
  let warning = "";
  if(previewToolpath){
    const converted = toolpathToPath(previewToolpath, {maxMoves:200000, profile: prof});
    pathForPreview = converted.path;
    warning = converted.warning;
  }
  pathForPreview = normalizePreviewPath(pathForPreview);
  updatePreviewWarning(previewPayload?.warning || warning);
  updatePreviewControlsFromPath(pathForPreview);
  const filtered = filterPreviewPath(pathForPreview);
  const bedCx = (prof.bedW||220)/2;
  const bedCy = (prof.bedD||220)/2;
  const pathMachine = filtered.map(p=>{
    if(!p) return null;
    if(p.X!=null && p.Y!=null) return p;
    const m = toMachineXY(p.x||0, p.y||0, prof);
    return {...p, X:m.X, Y:m.Y};
  });
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const p of pathMachine){
    if(!p) continue;
    const X = p.X ?? p.x ?? 0;
    const Y = p.Y ?? p.y ?? 0;
    minX=Math.min(minX,X); maxX=Math.max(maxX,X);
    minY=Math.min(minY,Y); maxY=Math.max(maxY,Y);
  }
  const mesh = previewMesh || null;
  const meshTris = meshToTris(mesh);
  if(mesh && meshTris && meshTris.length>=9){
    const b = mesh.bounds || computeMeshBounds(meshTris);
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
  }
  const cx = (isFinite(minX)&&isFinite(maxX)) ? (minX+maxX)/2 : bedCx;
  const cy = (isFinite(minY)&&isFinite(maxY)) ? (minY+maxY)/2 : bedCy;
  const offX = bedCx - cx;
  const offY = bedCy - cy;
  const pathShifted = pathMachine.map(p=>{
    if(!p) return null;
    return {...p, X:(p.X ?? p.x ?? 0)+offX, Y:(p.Y ?? p.y ?? 0)+offY};
  });
  setPreviewMesh(previewMesh, prof, offX, offY);
  setPreviewPath(pathShifted);
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
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  for(let x=0;x<w;x+=40){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for(let y=0;y<h;y+=40){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
  ctx.globalAlpha = 1;
  const pad=24;
  ctx.globalAlpha = 0.25;
  ctx.strokeRect(pad, pad, w-2*pad, h-2*pad);
  ctx.globalAlpha = 1;
  const clean = machinePath.filter(Boolean);
  if(!clean.length) return;
  const xs = clean.map(p=>p.X ?? p.x);
  const ys = clean.map(p=>p.Y ?? p.y);
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const minY=Math.min(...ys), maxY=Math.max(...ys);
  const sx=(w-2*pad)/Math.max(1e-6,(maxX-minX));
  const sy=(h-2*pad)/Math.max(1e-6,(maxY-minY));
  const s=Math.min(sx,sy);
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--accent").trim();
  ctx.lineWidth = 2;
  let drawing = false;
  let idx = 0;
  for(const p of machinePath){
    if(!p){
      if(drawing){
        ctx.stroke();
        drawing = false;
      }
      continue;
    }
    const X = pad + ((xs[idx]-minX) * s);
    const Y = h - (pad + ((ys[idx]-minY) * s));
    idx += 1;
    if(!drawing){
      ctx.beginPath();
      ctx.moveTo(X,Y);
      drawing = true;
    }else{
      ctx.lineTo(X,Y);
    }
  }
  if(drawing) ctx.stroke();
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
document.getElementById("btnToggleLib").addEventListener("click", ()=>{
  appSettings.showLib = !appSettings.showLib;
  applyAppSettings();
  saveAppSettings();
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
const paramOverlay = document.getElementById("paramOverlay");

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

function openParamsOverlay(){
  renderParamEditor();
  paramOverlay?.classList?.add("open");
  paramOverlay?.setAttribute("aria-hidden","false");
}
function closeParamsOverlay(){
  paramOverlay?.classList?.remove("open");
  paramOverlay?.setAttribute("aria-hidden","true");
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
paramOverlay?.addEventListener("mousedown", (e)=>{
  if(e.target === paramOverlay) closeParamsOverlay();
});

btnParams?.addEventListener("click", (e)=>{
  e.preventDefault();
  openParamsOverlay();
});

/* ---------------------------
   Keyboard
---------------------------- */
window.addEventListener("keydown", (e)=>{
  if(shortcutCapture){
    e.preventDefault();
    const key = shortcutCapture.key;
    const btn = shortcutCapture.button;
    if(e.key === "Escape"){
      shortcutCapture = null;
      if(btn){
        btn.classList.remove("capture");
        btn.textContent = shortcutToLabel(appSettings.shortcuts[key]);
      }
      return;
    }
    appSettings.shortcuts[key] = eventToShortcut(e);
    shortcutCapture = null;
    if(btn){
      btn.classList.remove("capture");
      btn.textContent = shortcutToLabel(appSettings.shortcuts[key]);
    }
    saveAppSettings();
    return;
  }

  // Close menus / overlays
  if(e.key==="Escape"){
    try{ demoMenu?.classList?.remove("open"); }catch(_){}
    try{ closeNodePicker(); }catch(_){}
    try{ closeSettings(); }catch(_){}
    try{ closeNodeProps(); }catch(_){}
    try{ closeParamsOverlay(); }catch(_){}
    return;
  }

  const shortcut = eventToShortcut(e);
  const shortcuts = appSettings.shortcuts || SHORTCUT_DEFAULTS;

  // Comfy-style node picker
  if(shortcut === shortcuts.openPicker && canUseSpacePicker()){
    e.preventDefault();
    if(!nodePicker.open) openNodePicker("");
    return;
  }
  if(shortcut === shortcuts.openPickerAlt){
    if(canUseSpacePicker()){
      e.preventDefault();
      if(!nodePicker.open) openNodePicker("");
    }
  }

  // Graph shortcuts
  if((shortcut === shortcuts.deleteNode || shortcut === shortcuts.deleteNodeAlt) && !isTyping()){
    const id = state.ui.selectedNodeId;
    if(id){ deleteNode(id); saveState(); markDirtyAuto(); }
  }
  if(shortcut === shortcuts.runGraph && !isTyping()){
    try{ evaluateGraph(); toast("Graph ran"); }catch(err){ toast(err.message||String(err)); }
  }
  if(shortcut === shortcuts.openSettings && !isTyping()){
    e.preventDefault();
    openSettings();
  }
  if(shortcut === shortcuts.openParams && !isTyping()){
    e.preventDefault();
    openParamsOverlay();
  }
  if(shortcut === shortcuts.fitView && !isTyping()){
    e.preventDefault();
    document.getElementById("btnFit").click();
  }
  if(shortcut === shortcuts.centerView && !isTyping()){
    e.preventDefault();
    document.getElementById("btnCenter").click();
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

async function boot(){
  try{ loadAppSettings(); }catch(e){ console.warn(e); }
  try{ await loadUserConfig(); }catch(e){ console.warn(e); }
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
  try{
    const rightBody = document.querySelector('.panel.right .body');
    const tabPrev = document.getElementById('tabPrev');
    const tabG = document.getElementById('tabGcode');
    const setView = (v)=>{
      rightBody?.classList?.toggle('view-preview', v==='preview');
      rightBody?.classList?.toggle('view-gcode', v==='gcode');
      tabPrev?.classList?.toggle('active', v==='preview');
      tabG?.classList?.toggle('active', v==='gcode');
    };
    tabPrev?.addEventListener('click', ()=> setView('preview'));
    tabG?.addEventListener('click', ()=> setView('gcode'));
    setView('preview');
  }catch(e){ console.warn(e); }
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
