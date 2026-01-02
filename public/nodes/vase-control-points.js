import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Vase (Control Points)',
  def: {
  title:"Vase (Control Points)",
  tag:"generator",
  desc:"Design a vase by editing radius-vs-height control points. Outputs a revolved mesh (and optional spiral wall path).",
  inputs:[{name:"profile", type:"profile"}],
  outputs:[{name:"mesh", type:"mesh"},{name:"path", type:"path"}],
  initData:()=>({
    height:140,
    baseRadius:35,
    wall:1.2,
    segments:160,
    // profile control points (u in 0..1, r multiplier)
    points:[ {u:0.0, r:1.0}, {u:0.15, r:1.05}, {u:0.45, r:0.9}, {u:0.75, r:1.12}, {u:1.0, r:0.85} ],
    smooth:0.35,
    bedAlign:true,
    // spiral wall
    outputSpiralPath:true,
    layerHeight:0.24,
    turnsPerLayer:1.0,
    twistDeg:0,
  }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";
    // preview pad 2:3
    const pad=document.createElement("div");
    pad.className="imgNodePreview";
    pad.style.aspectRatio="2 / 3";
    const c=document.createElement("canvas");
    c.width=420; c.height=630;
    pad.appendChild(c);
    mount.appendChild(pad);

    function draw(){
      const ctx=c.getContext("2d");
      const W=c.width, H=c.height;
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle="rgba(255,255,255,0.04)";
      ctx.fillRect(0,0,W,H);

      // plot area with padding
      const px=18, py=18;
      const gx=px, gy=py, gw=W-2*px, gh=H-2*py;
      ctx.strokeStyle="rgba(255,255,255,0.18)";
      ctx.lineWidth=1;
      ctx.beginPath();
      ctx.rect(gx,gy,gw,gh);
      ctx.stroke();

      // axes labels
      ctx.fillStyle="rgba(255,255,255,0.55)";
      ctx.font="12px ui-sans-serif";
      ctx.fillText("Radius →", gx+8, gy+16);
      ctx.save();
      ctx.translate(gx+6, gy+gh-10);
      ctx.rotate(-Math.PI/2);
      ctx.fillText("Height ↑", 0,0);
      ctx.restore();

      // curve
      const pts = (d.points||[]).slice().sort((a,b)=>a.u-b.u);
      const toXY=(p)=>{
        const x = gx + (p.r*0.9)*gw; // r roughly 0..1.4
        const y = gy + (1-p.u)*gh;
        return {x,y};
      };

      // sample smooth curve
      ctx.strokeStyle="rgba(0,255,160,0.85)";
      ctx.lineWidth=2;
      ctx.beginPath();
      const N=140;
      for(let i=0;i<=N;i++){
        const u=i/N;
        const r = evalProfile(u, pts, d.smooth||0);
        const x = gx + (r*0.9)*gw;
        const y = gy + (1-u)*gh;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();

      // control points
      for(let i=0;i<pts.length;i++){
        const p=pts[i];
        const q=toXY(p);
        ctx.fillStyle="rgba(0,255,160,0.9)";
        ctx.beginPath(); ctx.arc(q.x,q.y,6,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle="rgba(0,0,0,0.35)";
        ctx.stroke();
      }

      ctx.fillStyle="rgba(255,255,255,0.55)";
      ctx.font="11px ui-sans-serif";
      ctx.fillText("Drag points. Double-click to add. Right-click a point to delete.", gx+8, gy+gh-10);
    }

    function evalProfile(u, pts, smooth){
      // piecewise linear, then a tiny smoothing (Catmull-ish by blending)
      if(!pts.length) return 1.0;
      if(u<=pts[0].u) return pts[0].r;
      if(u>=pts[pts.length-1].u) return pts[pts.length-1].r;
      let i=1;
      for(; i<pts.length; i++){
        if(u<=pts[i].u) break;
      }
      const p0=pts[i-1], p1=pts[i];
      const t=(u-p0.u)/Math.max(1e-9,(p1.u-p0.u));
      let r = p0.r + (p1.r-p0.r)*t;

      const s = clamp(Number(smooth||0), 0, 1);
      if(s>0){
        const pPrev = pts[Math.max(0,i-2)];
        const pNext = pts[Math.min(pts.length-1,i+1)];
        const rAlt = cubicHermite(u, pPrev, p0, p1, pNext);
        r = r*(1-s) + rAlt*s;
      }
      return clamp(r, 0.05, 2.0);
    }
    function cubicHermite(u, pPrev, p0, p1, pNext){
      // Map u to segment space
      const t = (u-p0.u)/Math.max(1e-9,(p1.u-p0.u));
      const m0 = (p1.r - pPrev.r) / Math.max(1e-9, (p1.u - pPrev.u));
      const m1 = (pNext.r - p0.r) / Math.max(1e-9, (pNext.u - p0.u));
      const h00 = (2*t*t*t - 3*t*t + 1);
      const h10 = (t*t*t - 2*t*t + t);
      const h01 = (-2*t*t*t + 3*t*t);
      const h11 = (t*t*t - t*t);
      const du = (p1.u - p0.u);
      return h00*p0.r + h10*m0*du + h01*p1.r + h11*m1*du;
    }

    function getPtsSorted(){ return (d.points||[]).slice().sort((a,b)=>a.u-b.u); }

    // interaction: drag
    let dragIndex=-1;
    const hitRadius=10;
    function pickPoint(mx,my){
      const pts=getPtsSorted();
      const px=18, py=18;
      const gx=px, gy=py, gw=c.width-2*px, gh=c.height-2*py;
      const toXY=(p)=>({x: gx + (p.r*0.9)*gw, y: gy + (1-p.u)*gh});
      let best=-1, bd=1e9;
      for(let i=0;i<pts.length;i++){
        const q=toXY(pts[i]);
        const dx=mx-q.x, dy=my-q.y;
        const dd=dx*dx+dy*dy;
        if(dd<bd && dd<hitRadius*hitRadius){ bd=dd; best=i; }
      }
      if(best<0) return -1;
      // map to original array index (by unique u+r)
      const orig = d.points.findIndex(p=>p.u===pts[best].u && p.r===pts[best].r);
      return orig>=0 ? orig : best;
    }
    function canvasToUR(mx,my){
      const px=18, py=18;
      const gx=px, gy=py, gw=c.width-2*px, gh=c.height-2*py;
      const rr = clamp((mx-gx)/gw, 0, 1) / 0.9;
      const uu = clamp(1-((my-gy)/gh), 0, 1);
      return {u:uu, r:rr};
    }

    c.addEventListener("mousedown", (e)=>{
      const rect=c.getBoundingClientRect();
      const mx=(e.clientX-rect.left)*(c.width/rect.width);
      const my=(e.clientY-rect.top)*(c.height/rect.height);
      const idx=pickPoint(mx,my);
      if(idx>=0){
        dragIndex=idx;
        e.preventDefault();
      }
    });
    window.addEventListener("mousemove", (e)=>{
      if(dragIndex<0) return;
      const rect=c.getBoundingClientRect();
      const mx=(e.clientX-rect.left)*(c.width/rect.width);
      const my=(e.clientY-rect.top)*(c.height/rect.height);
      const ur=canvasToUR(mx,my);
      d.points[dragIndex].u = ur.u;
      d.points[dragIndex].r = ur.r;
      saveState(); markDirtyAuto(); draw();
    });
    window.addEventListener("mouseup", ()=>{ dragIndex=-1; });

    c.addEventListener("dblclick", (e)=>{
      const rect=c.getBoundingClientRect();
      const mx=(e.clientX-rect.left)*(c.width/rect.width);
      const my=(e.clientY-rect.top)*(c.height/rect.height);
      const ur=canvasToUR(mx,my);
      d.points.push({u:ur.u, r:ur.r});
      saveState(); markDirtyAuto(); draw();
    });
    c.addEventListener("contextmenu", (e)=>{
      e.preventDefault();
      const rect=c.getBoundingClientRect();
      const mx=(e.clientX-rect.left)*(c.width/rect.width);
      const my=(e.clientY-rect.top)*(c.height/rect.height);
      const idx=pickPoint(mx,my);
      if(idx>=0 && (d.points||[]).length>2){
        d.points.splice(idx,1);
        saveState(); markDirtyAuto(); draw();
      }
    });

    mount.appendChild(dividerTiny());
    mount.appendChild(field("Height (mm)", elNumber(d.height??140, v=>{ d.height=v; markDirtyAuto(); saveState(); }, 1)));
    mount.appendChild(field("Base radius (mm)", elNumber(d.baseRadius??35, v=>{ d.baseRadius=v; markDirtyAuto(); saveState(); }, 0.1)));
    mount.appendChild(field("Wall (mm)", elNumber(d.wall??1.2, v=>{ d.wall=v; markDirtyAuto(); saveState(); }, 0.05)));
    mount.appendChild(field("Revolve segments", elNumber(d.segments??160, v=>{ d.segments=v; markDirtyAuto(); saveState(); }, 1)));
    mount.appendChild(field("Smooth", elNumber(d.smooth??0.35, v=>{ d.smooth=v; markDirtyAuto(); saveState(); draw(); }, 0.01)));
    mount.appendChild(field("Bed align", elToggle(!!d.bedAlign, v=>{ d.bedAlign=!!v; markDirtyAuto(); saveState(); })));

    mount.appendChild(dividerTiny());
    mount.appendChild(field("Output spiral wall path", elToggle(!!d.outputSpiralPath, v=>{ d.outputSpiralPath=!!v; markDirtyAuto(); saveState(); })));
    if(d.outputSpiralPath){
      mount.appendChild(field("Layer height", elNumber(d.layerHeight??0.24, v=>{ d.layerHeight=v; markDirtyAuto(); saveState(); }, 0.01)));
      mount.appendChild(field("Turns per layer", elNumber(d.turnsPerLayer??1.0, v=>{ d.turnsPerLayer=v; markDirtyAuto(); saveState(); }, 0.05)));
      mount.appendChild(field("Twist (deg)", elNumber(d.twistDeg??0, v=>{ d.twistDeg=v; markDirtyAuto(); saveState(); }, 1)));
    }

    // expose eval for draw
    node.runtime = node.runtime || {};
    node.runtime._evalProfile = (u)=>evalProfile(u, getPtsSorted(), d.smooth||0);
    draw();
  },
  evaluate:(node, ctx)=>{
    const d=node.data;
    const H = Math.max(1, Number(d.height||140));
    const R0 = Math.max(1, Number(d.baseRadius||35));
    const wall = Math.max(0.4, Number(d.wall||1.2));
    const seg = Math.max(24, Math.floor(Number(d.segments||160)));
    const pts = (d.points||[]).slice().sort((a,b)=>a.u-b.u);
    const prof = (node.runtime && node.runtime._evalProfile) ? node.runtime._evalProfile : ((u)=>1.0);

    // Build revolved surface (outer + inner)
    const tris=[];
    const addTri=(ax,ay,az,bx,by,bz,cx,cy,cz)=>{ tris.push(ax,ay,az,bx,by,bz,cx,cy,cz); };

    const rings = Math.max(2, Math.floor(H / 1.0)+2);
    for(let j=0;j<rings-1;j++){
      const u0=j/(rings-1), u1=(j+1)/(rings-1);
      const z0=u0*H, z1=u1*H;
      const rO0 = R0 * prof(u0);
      const rO1 = R0 * prof(u1);
      const rI0 = Math.max(0.1, rO0 - wall);
      const rI1 = Math.max(0.1, rO1 - wall);

      for(let i=0;i<seg;i++){
        const t0=i/seg, t1=(i+1)/seg;
        const a0=t0*Math.PI*2, a1=t1*Math.PI*2;
        const c0=Math.cos(a0), s0=Math.sin(a0);
        const c1=Math.cos(a1), s1=Math.sin(a1);

        // outer quad (two tris)
        const x00=rO0*c0, y00=rO0*s0;
        const x10=rO0*c1, y10=rO0*s1;
        const x01=rO1*c0, y01=rO1*s0;
        const x11=rO1*c1, y11=rO1*s1;
        addTri(x00,y00,z0, x10,y10,z0, x01,y01,z1);
        addTri(x10,y10,z0, x11,y11,z1, x01,y01,z1);

        // inner quad (flip winding)
        const xi00=rI0*c0, yi00=rI0*s0;
        const xi10=rI0*c1, yi10=rI0*s1;
        const xi01=rI1*c0, yi01=rI1*s0;
        const xi11=rI1*c1, yi11=rI1*s1;
        addTri(xi00,yi00,z0, xi01,yi01,z1, xi10,yi10,z0);
        addTri(xi10,yi10,z0, xi01,yi01,z1, xi11,yi11,z1);
      }
    }

    // bottom cap
    {
      const z=0;
      const rO=R0*prof(0);
      const rI=Math.max(0.1, rO-wall);
      for(let i=0;i<seg;i++){
        const a0=(i/seg)*Math.PI*2, a1=((i+1)/seg)*Math.PI*2;
        const c0=Math.cos(a0), s0=Math.sin(a0);
        const c1=Math.cos(a1), s1=Math.sin(a1);
        // ring cap between rI and rO
        addTri(rI*c0,rI*s0,z, rO*c1,rO*s1,z, rO*c0,rO*s0,z);
        addTri(rI*c0,rI*s0,z, rI*c1,rI*s1,z, rO*c1,rO*s1,z);
      }
    }

    // Convert to mesh struct
    const arr = new Float32Array(tris);
    let mesh = { tris: arr, triCount: Math.floor(arr.length/9), bounds: computeMeshBounds(arr), index:null };
    if(d.bedAlign) mesh = bedAlignMesh(mesh);

    // Optional spiral path (single wall)
    let path = [];
    if(d.outputSpiralPath){
      const lh = Math.max(0.01, Number(d.layerHeight||0.24));
      const layers = Math.max(1, Math.ceil(H/lh));
      const turnsPerLayer = Math.max(0.1, Number(d.turnsPerLayer||1.0));
      const twist = (Number(d.twistDeg||0)*Math.PI/180);
      const segPerTurn=180;
      const totalSeg = layers*turnsPerLayer*segPerTurn;
      for(let k=0;k<=totalSeg;k++){
        const u=k/Math.max(1,totalSeg);
        const z=u*H;
        const layer=Math.floor(z/lh);
        const theta = u*(layers*turnsPerLayer)*Math.PI*2 + twist*u;
        const rr = R0*prof(u);
        const X = rr*Math.cos(theta);
        const Y = rr*Math.sin(theta);
        path.push({X,Y,z,role:"wall",travel:false,layer});
      }
    }

    return { mesh, path, outMesh:mesh, outPath:path };
  }
}
};

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

function renderNodeEl(node){
  const def = NODE_DEFS[node.type];
  const el = document.createElement("div");
  el.className = "node" + (state.ui.selectedNodeId===node.id ? " selected" : "");
  el.dataset.nodeId = node.id;
  el.style.left = (node.x||0) + "px";
  el.style.top  = (node.y||0) + "px";
  el.style.width = (node.w||320) + "px";
  el.style.height = (node.h||220) + "px";

  const head = document.createElement("div");
  head.className="nodeHead";

  const title = document.createElement("div");
  title.className="nodeTitle";
  title.innerHTML = `<span style="color:var(--text)">${def.title}</span><span class="nodeTypePill">${def.tag}</span>`;
  head.appendChild(title);

  const btns = document.createElement("div");
  btns.className="nodeBtns";

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
if(node.type === "Studio View"){
  bDup.style.display = "none";
  bDel.style.display = "none";
}

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
    g.resizeStart = {sx:e.clientX, sy:e.clientY, w:node.w||320, h:node.h||220, zoom:state.ui.zoom};
    resize.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  resize.addEventListener("pointermove", (e)=>{
    if(g.resizingNodeId!==node.id) return;
    const dx = (e.clientX - g.resizeStart.sx)/g.resizeStart.zoom;
    const dy = (e.clientY - g.resizeStart.sy)/g.resizeStart.zoom;
    node.w = clamp(g.resizeStart.w + dx, 240, 2400);
    node.h = clamp(g.resizeStart.h + dy, 160, 2400);
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
  const w = def?.defaultW ?? 320;
  const h = def?.defaultH ?? 240;
  state.nodes[id] = { id, type, x:x??120, y:y??120, w, h, data:def.initData() };
  renderGraph();
  return id;
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
  if(Object.keys(state.nodes).length) return;
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
    if(!NODE_DEFS[n.type]){ delete s.nodes[id]; continue; }
    if(!n.data) n.data = NODE_DEFS[n.type].initData();
    if(n.w==null) n.w=320; if(n.h==null) n.h=240;
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
   Demos
---------------------------- */function demoPlanarSliceCubeV2(){
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

/* ---------------------------
   Geometry & Slicing v2
   - Import Mesh (preview) -> outputs mesh
   - Mesh Primitive (preview) -> outputs mesh
   - Slicer -> inputs mesh, outputs mesh + path
   Keep old Mesh Primitive & Mesh Import behavior as legacy (auto-migrated on load)
----------------------------*/
};
