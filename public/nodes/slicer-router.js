window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

const SLICER_ROUTER_ENGINES = [
  { key:"cura", label:"CuraEngine (API)", type:"Slicer CuraEngine" },
  { key:"prusa", label:"PrusaSlicer", type:"Slicer PrusaSlicer" },
  { key:"kiri", label:"Kiri:Moto", type:"Slicer Kiri:Moto" },
  { key:"wasm", label:"CuraEngine WASM", type:"Slicer CuraEngine WASM" }
];

const SCHEMA_SLICER_ROUTER = [
  { kind:"group", title:"Engine", rows:[
    { items:[
      {key:"engine", label:"Engine", ui:"select", options:SLICER_ROUTER_ENGINES.map(e=>[e.key, e.label]), default:"cura"}
    ]}
  ]},
  ...(typeof SCHEMA_EXTERNAL_SLICER !== "undefined" ? SCHEMA_EXTERNAL_SLICER : [])
];

function getRouterEngine(key){
  return SLICER_ROUTER_ENGINES.find((engine)=>engine.key === key) || SLICER_ROUTER_ENGINES[0];
}

function buildRouterEngineData(data, key){
  const engine = getRouterEngine(key);
  if(engine.key === "cura"){
    return { endpoint: data?.curaEndpoint || "/api/slice/cura" };
  }
  if(engine.key === "prusa"){
    return { endpoint: data?.prusaEndpoint || "/api/slice/prusa" };
  }
  if(engine.key === "kiri"){
    return { mode: data?.kiriMode || "FDM" };
  }
  if(engine.key === "wasm"){
    return {
      maxTriangles: Number.isFinite(data?.wasmMaxTriangles) ? data.wasmMaxTriangles : 250000,
      timeoutMs: Number.isFinite(data?.wasmTimeoutMs) ? data.wasmTimeoutMs : 45000
    };
  }
  return { endpoint: "/api/slice/cura" };
}

window.GCODE_STUDIO.NODE_DEFS["Slicer Router"] = {
  title:"Slicer Router",
  defaultW:360,
  defaultH:360,
  tag:"slicer",
  desc:"Route external slicer inputs to CuraEngine, PrusaSlicer, Kiri:Moto, or CuraEngine WASM.",
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
  initData: ()=>({ engine:"cura" }),
  render:(node, mount)=>{
    mount.innerHTML = "";
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.innerHTML = "Routes mesh + settings to the selected slicer engine.";
    mount.appendChild(hint);
    renderSchema(SCHEMA_SLICER_ROUTER, node, mount);
  },
  evaluate:(node, ctx)=>{
    const engineKey = node.data?.engine || "cura";
    const engine = getRouterEngine(engineKey);
    const def = window.GCODE_STUDIO.NODE_DEFS?.[engine.type];
    if(!def?.evaluate){
      return { toolpath:null, path:[], stats:{ error:"Missing slicer engine." }, preview:null };
    }

    node.runtime = node.runtime || { engines:{} };
    if(!node.runtime.engines[engine.key]) node.runtime.engines[engine.key] = {};

    const proxyNode = {
      ...node,
      type: engine.type,
      data: buildRouterEngineData(node.data || {}, engine.key),
      runtime: node.runtime.engines[engine.key]
    };

    return def.evaluate(proxyNode, ctx);
  }
};
