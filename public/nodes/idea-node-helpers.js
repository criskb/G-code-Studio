(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

const clamp = (v, min, max)=>Math.max(min, Math.min(max, v));
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

function getBounds(mesh){
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

window.GCODE_STUDIO.IDEA_NODE_UTILS = {
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
})();
