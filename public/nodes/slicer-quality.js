window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Slicer Quality'] = {
  title:"Slicer Quality",
  defaultW:300,
  defaultH:260,
  tag:"slicer",
  desc:"Quality-related slicing settings (layer height, line width).",
  inputs: [],
  outputs: [{name:"quality", type:"slicer_settings"}],
  initData: ()=>({
    layerHeight:0.2,
    firstLayerHeight:0.24,
    lineWidth:0.45,
    firstLayerLineWidth:0.50,
    elephantFootComp:0.0,
    detectThinWalls:false
  }),
  render:(node, mount)=>renderSchema(SCHEMA_SLICER_QUALITY, node, mount),
  evaluate:(node)=>{
    const settings = { ...node.data };
    return { settings, quality: settings };
  }
};
