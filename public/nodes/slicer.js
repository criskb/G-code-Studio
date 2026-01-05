window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Slicing Engine'] = {
  title:"Slicing Engine",
  defaultW:360,
  defaultH:460,
  tag:"path",
  desc:"Unified planar/HD/non-planar slicing into toolpaths.",
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
    {name:"surfaceRaster", type:"slicer_settings"},
    {name:"hdEngine", type:"slicer_settings"}
  ],
  outputs: [{name:"mesh", type:"mesh"}, {name:"path", type:"path"}, {name:"toolpath", type:"toolpath"}, {name:"features", type:"json"}, {name:"stats", type:"json"}],
  initData: ()=>({
  bedAlign:true, mode:"planar", originMode:"from_printer", scale:1, rotZ:0, zOffset:0
}),
  render:(node, mount)=>{
    mount.innerHTML="";
    const hint = document.createElement("div");
    hint.className="hint";
    hint.innerHTML = `Workflow: <b>(mesh)</b> → <b>Slicing Engine</b> → <b>(path)</b> → Export. Connect mesh and settings.`;
    mount.appendChild(hint);
    const form = document.createElement("div");
    renderSchema(SCHEMA_SLICER_V2, node, form);
    mount.appendChild(form);
  },
  evaluate:(node, ctx)=>{
    const mergedSettings = {};
    for(const port of ["quality","walls","infill","topBottom","skirtBrim","speedsFlow","retractionTravel","cooling","limits","surfaceRaster","hdEngine"]){
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
    let toolpath = { units:"mm", absoluteExtrusion:true, layers:[], stats:{ length_mm:0, extruded_mm3:0, time_s_est:0 } };
    let features = {};
    if(d.mode === "planar"){
      const maxLayers = d.maxLayers > 0 ? d.maxLayers : 900;
      const maxSegs = d.maxSegs > 0 ? d.maxSegs : 260000;
      path = sliceMeshPlanar(m, {
        layerHeight: d.layerHeight,
        lineWidth: d.lineWidth,
        detectThinWalls: d.detectThinWalls,
        pathSmoothing: d.pathSmoothing,
        maxChordError: d.maxChordError,
        preserveArcs: d.preserveArcs,
        seamMode: d.seamMode,
        perimeters: d.perimeters,
        minSegmentLen: d.minSegmentLen,
        elephantFootComp: d.elephantFootComp,
        wallOverlap: d.wallOverlap,
        infillPct: d.infillPct,
        infillAngle: d.infillAngle,
        infillPattern: d.infillPattern,
        solidPattern: d.solidPattern,
        skinOverlap: d.skinOverlap,
        topLayers: d.topLayers,
        bottomLayers: d.bottomLayers,
        serpentine: d.serpentine,
        brickLayer: d.brickLayer,
        infillLineWidth: d.infillLineWidth,
        maxLayers,
        maxSegs,
        roleOrder: "bottom,walls,infill,top"
      });
      features = { strategy:"planar", bounds: m.bounds || computeMeshBounds(m.tris), fidelityMode: d.fidelityMode };
    }else if(d.mode === "nonplanar_full"){
      try{
        const cs = Math.max(2, Number(d.cellSize||0) || (Number(d.spacing||1.0) * 2.0));
        if(!m.index || m.index.cs !== cs) buildMeshIndex(m, cs);
      }catch(_){}
      path = surfaceRasterFullPath(m, {
        spacing:d.spacing,
        step:d.step,
        angleDeg:d.angleDeg,
        margin:d.margin,
        zOffset:d.zOffset,
        serpentine: !!d.surfaceSerp,
        adaptiveBy: d.adaptiveBy,
        maxChordError: d.maxChordError,
        layerHeight: d.layerHeight,
        lineWidth: d.lineWidth,
        topLayers: d.topLayers,
        bottomLayers: d.bottomLayers,
        cellSize: d.cellSize,
        maxPts: (d.maxPts||0)? d.maxPts : null,
        maxLayers: d.maxLayers
      });
      annotatePathHints(path, d);
      features = { strategy:"nonplanar_full", bounds: m.bounds || computeMeshBounds(m.tris), fidelityMode: d.fidelityMode };
    }else{
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
        serpentine: !!d.surfaceSerp,
        adaptiveBy: d.adaptiveBy,
        maxChordError: d.maxChordError,
        lineWidth: d.lineWidth
      }, (ctx.base?.layerHeight||0.2), (d.maxPts||0)? d.maxPts : null);
      annotatePathHints(path, d);
      features = { strategy:"surface", bounds: m.bounds || computeMeshBounds(m.tris), fidelityMode: d.fidelityMode };
    }
    try{
      const prof = ctx.defaultProfile || defaultPrinterFallback();
      toolpath = toolpathFromPath(path, { ...prof, ...d });
    }catch(_){
      toolpath = { units:"mm", absoluteExtrusion:true, layers:[], stats:{ length_mm:0, extruded_mm3:0, time_s_est:0 } };
    }
    const stats = toolpath && toolpath.layers ? { moveCount: toolpath.layers.reduce((s, L)=> s + (L.moves?.length||0), 0), layerCount: toolpath.layers.length } : { moveCount:0, layerCount:0 };
    return { mesh:m, path, toolpath, features, stats };
  }
};
