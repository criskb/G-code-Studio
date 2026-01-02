import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Slicer',
  def: {
  title:"Slicer",
  defaultW:360,
  defaultH:460,
  tag:"path",
  desc:"Slices a mesh into toolpaths. Inputs mesh → outputs mesh + path.",
  inputs: [{name:"mesh", type:"mesh"}],
  outputs: [{name:"mesh", type:"mesh"}, {name:"path", type:"path"}],
  initData: ()=>({
  bedAlign:true, mode:"planar", originMode:"from_printer", scale:1, rotZ:0, zOffset:0,
  layerHeight:0.2, firstLayerHeight:0.24, lineWidth:0.45, firstLayerLineWidth:0.50,
  perimeters:2, topLayers:4, bottomLayers:4,
  infillPct:15, infillPattern:"grid", infillAngle:45, serpentine:true, brickLayer:false, solidPattern:"",
  skirtLines:0, skirtDistance:6, brimWidth:0, brimLines:0,
  firstLayerSpeed:900, travelSpeed:6000, wallSpeed:1800, infillSpeed:2400, topSpeed:1500, bottomSpeed:1200,
  wallFlow:1.0, infillFlow:1.0, topFlow:1.0, bottomFlow:1.0,
  retract:0.8, retractSpeed:1800, retractMinTravel:1.0, zHop:0,
  fanFirstLayer:0, fanOtherLayers:100,
  spacing:1.0, step:0.6, angleDeg:0, margin:0, surfaceSerp:true, maxPts:0
}),
  render:(node, mount)=>{
    mount.innerHTML="";
    const hint = document.createElement("div");
    hint.className="hint";
    hint.innerHTML = `Workflow: <b>(mesh)</b> → <b>Slicer</b> → <b>(path)</b> → Export. Connect a mesh and run the graph.`;
    mount.appendChild(hint);
    const form = document.createElement("div");
    renderSchema(SCHEMA_SLICER_V2, node, form);
    mount.appendChild(form);
  },
  evaluate:(node, ctx)=>{
    const d=node.data;
    const inp = ctx.getInput(node.id, "mesh");
    let mesh = (inp?.mesh || inp || null);
    if(!mesh || !mesh.tris) return { mesh:null, path:[] };

    let m = mesh;
    if(d.bedAlign) m = bedAlignMesh(m);

    let path = [];
    if(d.mode === "planar"){
      path = sliceMeshPlanar(m, {
        layerHeight: d.layerHeight,
        lineWidth: d.lineWidth,
        perimeters: d.perimeters,
        infillPct: d.infillPct,
        infillAngle: d.infillAngle,
        infillPattern: d.infillPattern,
        topLayers: d.topLayers,
        bottomLayers: d.bottomLayers,
        serpentine: d.serpentine,
        maxLayers: 900,
        maxSegs: 260000,
        roleOrder: "bottom,walls,infill,top"
      });
    }else{
      
// Build/refresh a coarse spatial index for projection (cell size derived from spacing)
try{
  const cs = Math.max(2, Number(d.cellSize||0) || (Number(d.spacing||1.0) * 2.0));
  if(!m.index || m.index.cs !== cs) buildMeshIndex(m, cs);
}catch(_){}
path = surfaceRasterPath(m, {
  spacing:d.spacing,
  step:d.step,
  angleDeg:d.angleDeg,
  margin:d.margin,
  zOffset:d.zOffset,
  serpentine: !!d.surfaceSerp
}, (ctx.base?.layerHeight||0.2), (d.maxPts||0)? d.maxPts : null);
annotatePathHints(path, d);
}
    return { mesh:m, path };
  }
};
