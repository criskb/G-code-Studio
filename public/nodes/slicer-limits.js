window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Slicer Limits'] = {
  title:"Slicer Limits",
  defaultW:240,
  defaultH:180,
  tag:"slicer",
  desc:"Advanced safety limits for planar slicing.",
  inputs: [],
  outputs: [{name:"settings", type:"slicer_settings"}],
  initData: ()=>({
    maxLayers:0,
    maxSegs:0
  }),
  render:(node, mount)=>renderSchema(SCHEMA_SLICER_LIMITS, node, mount),
  evaluate:(node)=>({ settings: { ...node.data } })
};
