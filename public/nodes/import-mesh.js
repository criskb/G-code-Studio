import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Import Mesh',
  def: {
  title:"Import Mesh",
  defaultW:360,
  defaultH:520,
  tag:"mesh",
  desc:"Import an STL with an in-node preview. Outputs mesh + optional auto-path (surface raster or quick planar). Use Slicer for full control.",
  inputs: [],
  outputs: [{name:"mesh", type:"mesh"}, {name:"path", type:"path"}],
  initData: ()=>({
    bedAlign:true,
    centerXY:true,
    scale:1,
    rxDeg:0, ryDeg:0, rzDeg:0,
    tx:0, ty:0, tz:0,
    b64:"",
    pathMode:"surface",
    spacing:1.0, step:0.6, angleDeg:0, margin:0, zOffset:0, surfaceSerp:true, maxPts:0,
    q_layerHeight:0.24, q_lineWidth:0.45, q_perimeters:2, q_infillPct:18, q_infillPattern:"grid", q_infillAngle:45, q_topLayers:4, q_bottomLayers:4, q_serpentine:true, q_brickLayer:false, q_solidPattern:""
  }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";

    const file = document.createElement("input");
    file.type="file";
    file.accept=".stl,model/stl,application/sla";
    file.style.width="100%";
    for(const ev of ["pointerdown","mousedown","click"]){ file.addEventListener(ev, e=>e.stopPropagation()); }
    file.addEventListener("change", async ()=>{
      const f = file.files && file.files[0];
      if(!f) return;
      try{
        const buf = await f.arrayBuffer();
        d.b64 = b64FromArrayBuffer(buf);
        const mesh = parseSTL(buf);
        meshRuntimeCache.set(node.id, {mesh});
        toast("STL loaded");
        markDirtyAuto();
        saveState();
        refreshNodeContent(node.id);
      }catch(e){ console.warn(e); toast(e.message||String(e)); }
    });
    mount.appendChild(file);

    const box = document.createElement("div");
    box.className="miniBox";
    const canvas = document.createElement("canvas");
    canvas.width=520; canvas.height=260;
    box.appendChild(canvas);
    mount.appendChild(box);

    const form = document.createElement("div");
    renderSchema(SCHEMA_IMPORT_MESH_V2, node, form);
    mount.appendChild(form);

    const token = (node._meshPrevTok = (node._meshPrevTok||0)+1);
    function loop(t){
      if(node._meshPrevTok !== token) return;
      const runtime = meshRuntimeCache.get(node.id);
      let mesh = runtime?.mesh || null;
      if(!mesh && d.b64){
        try{ mesh = parseSTL(arrayBufferFromB64(d.b64)); }catch(_){ mesh=null; }
        if(mesh) meshRuntimeCache.set(node.id, {mesh});
      }
      if(mesh){
        let m = mesh;
        m = centerMesh(m, d.centerXY, false);
        m = applyMeshTransform(m, d);
        if(d.bedAlign) m = bedAlignMesh(m);
        drawWireframe2D(canvas, m.tris, m.bounds, t*0.001, null);
      }else{
        const ctx=canvas.getContext("2d");
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle="rgba(255,255,255,0.55)";
        ctx.font="12px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText("Choose an STL to preview", 14, 22);
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  },
  evaluate:(node, ctx)=>{
    const d=node.data;
    const runtime = meshRuntimeCache.get(node.id);
    let mesh = runtime?.mesh || null;
    if(!mesh && d.b64){
      try{ mesh = parseSTL(arrayBufferFromB64(d.b64)); }catch(_){ mesh=null; }
      if(mesh) meshRuntimeCache.set(node.id, {mesh});
    }
    if(!mesh) return { mesh:null };
    let m = mesh;
    m = centerMesh(m, d.centerXY, false);
    m = applyMeshTransform(m, d);
    if(d.bedAlign) m = bedAlignMesh(m);
    
// Optional auto-path
let path = [];
const pm = String(d.pathMode||"none");
if(pm==="surface"){
  path = surfaceRasterPath(m, { spacing:d.spacing, step:d.step, angleDeg:d.angleDeg, margin:d.margin, zOffset:d.zOffset, serpentine:!!d.surfaceSerp }, 0.2, (d.maxPts||0)? d.maxPts : null);
}else if(pm==="planar"){
  path = sliceMeshPlanar(m, { layerHeight:d.q_layerHeight, lineWidth:d.q_lineWidth, perimeters:d.q_perimeters, infillPct:d.q_infillPct, infillPattern:d.q_infillPattern, infillAngle:d.q_infillAngle, topLayers:d.q_topLayers, bottomLayers:d.q_bottomLayers, serpentine:!!d.q_serpentine, brickLayer:!!d.q_brickLayer, solidPattern:(d.q_solidPattern||"") });
}
annotatePathHints(path, d);
    return { mesh:m, path };

  }
};
