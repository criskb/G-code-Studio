(function(){
const IDEA_NODE_UTILS_KEY = "__GCODE_STUDIO_IDEA_NODE_UTILS__";
const NODE_DEFS_KEY = "__GCODE_STUDIO_NODE_DEFS__";
const sharedNodeDefs = window[NODE_DEFS_KEY] || window.GCODE_STUDIO?.NODE_DEFS || {};
window[NODE_DEFS_KEY] = sharedNodeDefs;

const ensureIdeaUtils = (studio, ideaNodeUtils)=>{
  if(!studio) return;
  if(studio.NODE_DEFS && studio.NODE_DEFS !== sharedNodeDefs){
    Object.assign(sharedNodeDefs, studio.NODE_DEFS);
  }
  studio.NODE_DEFS = sharedNodeDefs;
  studio.IDEA_NODE_UTILS_FALLBACK = studio.IDEA_NODE_UTILS_FALLBACK || ideaNodeUtils;
  studio.IDEA_NODE_UTILS = studio.IDEA_NODE_UTILS || studio.IDEA_NODE_UTILS_FALLBACK;
};

let sharedIdeaNodeUtils = window[IDEA_NODE_UTILS_KEY];

if(!sharedIdeaNodeUtils){
  const clamp = (v, min, max)=>Math.max(min, Math.min(max, v));
  const numOr = (v, fallback)=>Number.isFinite(Number(v)) ? Number(v) : fallback;

  const parseNumberList = (input, fallback)=>{
    if(Array.isArray(input)) return input.map(Number).filter((n)=>Number.isFinite(n));
    if(typeof input !== "string") return fallback || [];
    return input
      .split(/[\s,]+/)
      .map((v)=>Number(v))
      .filter((v)=>Number.isFinite(v));
  };

  const getPathInput = (ctx, node, port)=>{
    const inp = ctx.getInput(node.id, port);
    return (inp?.out || inp?.path || inp) || [];
  };

  const getMeshInput = (ctx, node, port)=>{
    const inp = ctx.getInput(node.id, port);
    return inp?.mesh || inp?.out || inp || null;
  };

  const computeMeshBounds = (tris)=>{
    let minX=Infinity, minY=Infinity, minZ=Infinity;
    let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
    for(let i=0;i<tris.length;i+=3){
      const x = tris[i] ?? 0;
      const y = tris[i+1] ?? 0;
      const z = tris[i+2] ?? 0;
      minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
    }
    if(!isFinite(minX)) return null;
    return { min: {x:minX,y:minY,z:minZ}, max: {x:maxX,y:maxY,z:maxZ} };
  };

  const getBounds = (mesh)=>{
    if(!mesh) return null;
    if(mesh.bounds) return mesh.bounds;
    if(mesh.tris && mesh.tris.length) return computeMeshBounds(mesh.tris);
    return null;
  };

  const lengthBetween = (a, b)=>{
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
  };

  const summarizeToolpath = (path)=>{
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
  };

  const simpleReport = (title, details)=>({ title, ...details, createdAt: new Date().toISOString() });

  const simpleNode = ({
    name,
    tag,
    desc,
    inputs,
    outputs,
    initData,
    schema,
    evaluate
  })=>{
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
  };

  sharedIdeaNodeUtils = {
    clamp,
    numOr,
    parseNumberList,
    getPathInput,
    getMeshInput,
    getBounds,
    summarizeToolpath,
    simpleReport,
    simpleNode
  };
  window[IDEA_NODE_UTILS_KEY] = sharedIdeaNodeUtils;
}
let studioRef = window.GCODE_STUDIO || {};
ensureIdeaUtils(studioRef, sharedIdeaNodeUtils);
Object.defineProperty(window, "GCODE_STUDIO", {
  configurable: true,
  get(){
    return studioRef;
  },
  set(next){
    studioRef = next || {};
    ensureIdeaUtils(studioRef, sharedIdeaNodeUtils);
  }
});
window.GCODE_STUDIO = studioRef;
})();
