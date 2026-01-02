import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Mesh Primitive',
  def: {
  title:"Mesh Primitive",
  defaultW:360,
  defaultH:520,
  tag:"mesh",
  desc:"Procedural mesh generator with in-node preview. Outputs mesh + optional auto-path (surface raster or quick planar). Use Slicer for full control.",
  inputs: [],
  outputs: [{name:"mesh", type:"mesh"}, {name:"path", type:"path"}],
  initData: ()=>({
    kind:"cube",
    size:120,
    height:40,
    seg:40,
    waveAmp:8,
    waveFreq:3,
    bedAlign:true,
    previewMode:"wireframe"
  }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";

// Top selectors (primitive + preview style)
const top = document.createElement("div");
top.className = "miniTopRow";

const kindSel = document.createElement("select");
kindSel.innerHTML = `
  <option value="cube">Cube</option>
  <option value="dome">Dome</option>
  <option value="wavy">Wavy Plane</option>
`;
kindSel.value = d.kind || "cube";
for(const ev of ["pointerdown","mousedown","click"]){ kindSel.addEventListener(ev, e=>e.stopPropagation()); }
kindSel.addEventListener("change", ()=>{
  d.kind = kindSel.value;
  markDirtyAuto();
  saveState();
  refreshNodeContent(node.id);
});
top.appendChild(kindSel);

const styleSel = document.createElement("select");
styleSel.innerHTML = `
  <option value="wireframe">Wireframe</option>
  <option value="solid">Solid</option>
  <option value="shaded">Shaded</option>
  <option value="points">Points</option>
`;
styleSel.value = d.previewMode || "wireframe";
for(const ev of ["pointerdown","mousedown","click"]){ styleSel.addEventListener(ev, e=>e.stopPropagation()); }
styleSel.addEventListener("change", ()=>{
  d.previewMode = styleSel.value;
  markDirtyAuto();
  saveState();
});
top.appendChild(styleSel);

mount.appendChild(top);

const box = document.createElement("div");
box.className="miniBox r23";
const canvas = document.createElement("canvas");
canvas.width=480; canvas.height=720; // 2:3 base ratio
box.appendChild(canvas);
mount.appendChild(box);

// Make canvas resolution match element size for crisp preview
try{
  if(node._ro){ node._ro.disconnect(); node._ro=null; }
  node._ro = new ResizeObserver(()=>{
    const r = box.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const ww = Math.max(2, Math.floor(r.width * dpr));
    const hh = Math.max(2, Math.floor(r.height * dpr));
    if(canvas.width!==ww || canvas.height!==hh){
      canvas.width = ww; canvas.height = hh;
    }
  });
  node._ro.observe(box);
}catch(_){}

const form = document.createElement("div");
renderSchema(SCHEMA_MESH_PRIMITIVE_V2, node, form);
mount.appendChild(form);
    const token = (node._meshPrevTok = (node._meshPrevTok||0)+1);
    function loop(t){
      if(node._meshPrevTok !== token) return;
      const legacy = NODE_DEFS["Mesh Primitive (Legacy)"];
      const tmp = { id: node.id, type:"Mesh Primitive (Legacy)", data: {...d, surfacePathEnabled:false, pathMode:"surface"} };
      let out=null;
      try{ out = legacy.evaluate(tmp, {base:{layerHeight:0.2}}); }catch(_){ out=null; }
      const mesh = out?.mesh || null;
      if(mesh){
        let m = mesh;
        if(d.bedAlign) m = bedAlignMesh(m);
        drawMeshPreview2D(canvas, m.tris, m.bounds, t*0.001, null, d.previewMode||"wireframe");
      }else{
        const ctx=canvas.getContext("2d");
        ctx.clearRect(0,0,canvas.width,canvas.height);
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  },
  evaluate:(node, ctx)=>{
    const d=node.data;
    const legacy = NODE_DEFS["Mesh Primitive (Legacy)"];
    const tmp = { id: node.id, type:"Mesh Primitive (Legacy)", data: {...d, surfacePathEnabled:false, pathMode:"surface"} };
    const out = legacy.evaluate(tmp, ctx);
    let mesh = out?.mesh || null;
    if(mesh && d.bedAlign) mesh = bedAlignMesh(mesh);
    return { mesh };
  }
};
