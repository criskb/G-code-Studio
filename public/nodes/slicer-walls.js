window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Slicer Walls'] = {
  title:"Slicer Walls",
  defaultW:300,
  defaultH:280,
  tag:"slicer",
  desc:"Wall/shell configuration for planar slicing.",
  inputs: [],
  outputs: [{name:"walls", type:"slicer_settings"}],
  initData: ()=>({
    perimeters:2,
    spiralVase:false,
    seamMode:"nearest",
    wallOrdering:"inner>outer",
    gapFill:false,
    wallOverlap:15
  }),
  render:(node, mount)=>renderSchema(SCHEMA_SLICER_WALLS, node, mount),
  evaluate:(node)=>{
    const settings = { ...node.data };
    return { settings, walls: settings };
  }
};
