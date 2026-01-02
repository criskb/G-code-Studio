window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Slicer Surface Raster'] = {
  title:"Slicer Surface Raster",
  defaultW:320,
  defaultH:240,
  tag:"slicer",
  desc:"Non-planar surface raster settings.",
  inputs: [],
  outputs: [{name:"surfaceRaster", type:"slicer_settings"}],
  initData: ()=>({
    spacing:1.0,
    step:0.6,
    angleDeg:0,
    margin:0,
    surfaceSerp:true,
    cellSize:0,
    maxPts:0
  }),
  render:(node, mount)=>renderSchema(SCHEMA_SLICER_SURFACE_RASTER, node, mount),
  evaluate:(node)=>{
    const settings = { ...node.data };
    return { settings, surfaceRaster: settings };
  }
};
