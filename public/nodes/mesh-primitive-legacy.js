import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Mesh Primitive (Legacy)',
  def: {
  title:"Mesh Primitive (Legacy)", tag:"mesh",
  hidden: true,
  uiSchema:SCHEMA_MESH_PRIMITIVE,
  desc:"Procedural mesh generator for demos (dome / wavy plane).",
  inputs: [],
  outputs: [{name:"mesh", type:"mesh"}, {name:"path", type:"path"}],
  initData: ()=>({
      // Surface toolpath output
      surfacePathEnabled:true,
      pattern:"raster",
      spacing: 1.0,
      step: 0.6,
      angleDeg: 0,
      margin: 0,
      zOffset: 0,
      serpentine:true,
      maxPoints: 160000,

    kind:"dome",
    size:120,
    height:40,
    seg:40,
    waveAmp:8,
    waveFreq:3,
    cellSize:10,
// Path output mode:
// "none" -> no path output
// "surface" -> surface raster (non-planar on mesh)
// "slice" -> planar slice (walls/infill/top/bottom)
pathMode: "surface",

// Slice settings (used when pathMode==="slice")
slice_layerHeight: 0.24,
slice_lineWidth: 0.45,
slice_perimeters: 2,
slice_infillPct: 18,
slice_infillAngle: 45,
slice_infillPattern: "grid",
slice_topLayers: 4,
slice_bottomLayers: 4,
slice_serpentine: true}),
  render:(node, mount)=>renderSchema(NODE_DEFS[node.type].uiSchema, node, mount),
  evaluate:(node, ctx)=>{
    const d=node.data;
    const seg = Math.max(8, Math.floor(d.seg||40));
    const size = Number(d.size||120);
    const half = size*0.5;
    const h = Number(d.height||40);
    const tris = [];
if(d.kind==="cube"){
  // Watertight cube volume (size x size x height), bottom at z=0
  const sx = Number(d.size||120);
  const sy = Number(d.size||120);
  const sz = Number(d.height||40);
  const hx = sx*0.5, hy = sy*0.5;
  const x0=-hx, x1=hx, y0=-hy, y1=hy, z0=0, z1=sz;
  const t = [];
  function tri(ax,ay,az,bx,by,bz,cx,cy,cz){ t.push(ax,ay,az,bx,by,bz,cx,cy,cz); }

  // bottom (z0) - face normal down
  tri(x0,y0,z0, x1,y0,z0, x1,y1,z0);
  tri(x0,y0,z0, x1,y1,z0, x0,y1,z0);

  // top (z1) - face normal up
  tri(x0,y0,z1, x1,y1,z1, x1,y0,z1);
  tri(x0,y0,z1, x0,y1,z1, x1,y1,z1);

  // front (y1)
  tri(x0,y1,z0, x1,y1,z0, x1,y1,z1);
  tri(x0,y1,z0, x1,y1,z1, x0,y1,z1);

  // back (y0)
  tri(x0,y0,z0, x1,y0,z1, x1,y0,z0);
  tri(x0,y0,z0, x0,y0,z1, x1,y0,z1);

  // left (x0)
  tri(x0,y0,z0, x0,y1,z1, x0,y1,z0);
  tri(x0,y0,z0, x0,y0,z1, x0,y1,z1);

  // right (x1)
  tri(x1,y0,z0, x1,y1,z0, x1,y1,z1);
  tri(x1,y0,z0, x1,y1,z1, x1,y0,z1);

  const arr = new Float32Array(t);
  const mesh = { tris: arr, triCount: Math.floor(arr.length/9), bounds: computeMeshBounds(arr), index:null };
  buildMeshIndex(mesh, d.cellSize||10);
  // Path output according to mode
const mode = (d.pathMode || "surface");
let path = [];
if(mode === "surface"){
  if(d.surfacePathEnabled){
    path = surfaceRasterPath(mesh, d, (ctx.base?.layerHeight||0.2));
  }else{
    path = [];
  }
}else if(mode === "slice"){
  const opts = {
    layerHeight: d.slice_layerHeight,
    lineWidth: d.slice_lineWidth,
    perimeters: d.slice_perimeters,
    infillPct: d.slice_infillPct,
    infillAngle: d.slice_infillAngle,
    infillPattern: d.slice_infillPattern,
    topLayers: d.slice_topLayers,
    bottomLayers: d.slice_bottomLayers,
    serpentine: d.slice_serpentine,
    maxLayers: (d.slice_limitLayers||900),
    maxSegs: 260000,
    roleOrder: "bottom,walls,infill,top"
  };
  path = sliceMeshPlanar(mesh, opts);
}else{
  path = [];
}
return { mesh, path };
}


    function zAt(x,y){
      if(d.kind==="dome"){
        const r = Math.sqrt(x*x + y*y);
        const R = half;
        const k = clamp(1 - (r*r)/(R*R), 0, 1);
        return Math.sqrt(k) * h;
      } else {
        const a = Number(d.waveAmp||8);
        const f = Number(d.waveFreq||3);
        return a*Math.sin((x/half)*Math.PI*f) * Math.cos((y/half)*Math.PI*f) + h*0.2;
      }
    }
    for(let iy=0; iy<seg; iy++){
      for(let ix=0; ix<seg; ix++){
        const x0 = -half + (ix/seg)*size;
        const x1 = -half + ((ix+1)/seg)*size;
        const y0 = -half + (iy/seg)*size;
        const y1 = -half + ((iy+1)/seg)*size;
        const z00 = zAt(x0,y0), z10=zAt(x1,y0), z01=zAt(x0,y1), z11=zAt(x1,y1);
        tris.push(x0,y0,z00,  x1,y0,z10,  x1,y1,z11);
        tris.push(x0,y0,z00,  x1,y1,z11,  x0,y1,z01);
      }
    }
    const arr = new Float32Array(tris);
    const mesh = { tris: arr, triCount: Math.floor(arr.length/9), bounds: computeMeshBounds(arr), index:null };
    buildMeshIndex(mesh, d.cellSize||10);
    // Path output according to mode
const mode = (d.pathMode || "surface");
let path = [];
if(mode === "surface"){
  if(d.surfacePathEnabled){
    path = surfaceRasterPath(mesh, d, (ctx.base?.layerHeight||0.2));
  }else{
    path = [];
  }
}else if(mode === "slice"){
  const opts = {
    layerHeight: d.slice_layerHeight,
    lineWidth: d.slice_lineWidth,
    perimeters: d.slice_perimeters,
    infillPct: d.slice_infillPct,
    infillAngle: d.slice_infillAngle,
    infillPattern: d.slice_infillPattern,
    topLayers: d.slice_topLayers,
    bottomLayers: d.slice_bottomLayers,
    serpentine: d.slice_serpentine,
    maxLayers: 900,
    maxSegs: 260000,
    roleOrder: "bottom,walls,infill,top"
  };
  path = sliceMeshPlanar(mesh, opts);
}else{
  path = [];
}
return { mesh, path };
  }
}
};
