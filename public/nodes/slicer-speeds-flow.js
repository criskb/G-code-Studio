window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Slicer Speeds/Flow'] = {
  title:"Slicer Speeds/Flow",
  defaultW:330,
  defaultH:300,
  tag:"slicer",
  desc:"Speed and flow defaults by role.",
  inputs: [],
  outputs: [{name:"settings", type:"slicer_settings"}],
  initData: ()=>({
    firstLayerSpeed:900,
    travelSpeed:6000,
    wallSpeed:1800,
    infillSpeed:2400,
    topSpeed:1500,
    bottomSpeed:1200,
    wallFlow:1.0,
    infillFlow:1.0,
    topFlow:1.0,
    bottomFlow:1.0
  }),
  render:(node, mount)=>renderSchema(SCHEMA_SLICER_SPEEDS_FLOW, node, mount),
  evaluate:(node)=>({ settings: { ...node.data } })
};
