window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Slicer'] = {
  title:"Slicer",
  defaultW:360,
  defaultH:460,
  tag:"path",
  desc:"Slices a mesh into toolpaths. Inputs mesh → outputs mesh + path.",
  inputs: [
    {name:"mesh", type:"mesh"},
    {name:"quality", type:"slicer_settings"},
    {name:"walls", type:"slicer_settings"},
    {name:"infill", type:"slicer_settings"},
    {name:"topBottom", type:"slicer_settings"},
    {name:"skirtBrim", type:"slicer_settings"},
    {name:"speedsFlow", type:"slicer_settings"},
    {name:"retractionTravel", type:"slicer_settings"},
    {name:"cooling", type:"slicer_settings"},
    {name:"limits", type:"slicer_settings"},
    {name:"surfaceRaster", type:"slicer_settings"}
  ],
  outputs: [{name:"mesh", type:"mesh"}, {name:"path", type:"path"}],
  initData: ()=>({
  bedAlign:true, mode:"planar", originMode:"from_printer", scale:1, rotZ:0, zOffset:0
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
    const mergedSettings = {};
    for(const port of ["quality","walls","infill","topBottom","skirtBrim","speedsFlow","retractionTravel","cooling","limits","surfaceRaster"]){
      const input = ctx.getInput(node.id, port);
      if(!input) continue;
      const settings = input.settings || input;
      if(settings && typeof settings === "object") Object.assign(mergedSettings, settings);
    }
    const d = {
      ...DEFAULT_SLICER_SETTINGS,
      ...node.data,
      ...mergedSettings
    };
    const inp = ctx.getInput(node.id, "mesh");
    let mesh = (inp?.mesh || inp || null);
    if(!mesh || !mesh.tris) return { mesh:null, path:[] };

    let m = mesh;
    if(d.bedAlign) m = bedAlignMesh(m);

    let path = [];
    if(d.mode === "planar"){
      const maxLayers = d.maxLayers > 0 ? d.maxLayers : 900;
      const maxSegs = d.maxSegs > 0 ? d.maxSegs : 260000;
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
        maxLayers,
        maxSegs,
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
