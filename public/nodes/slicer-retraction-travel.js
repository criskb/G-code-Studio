window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Slicer Retraction/Travel'] = {
  title:"Slicer Retraction/Travel",
  defaultW:320,
  defaultH:260,
  tag:"slicer",
  desc:"Retraction and travel behavior settings.",
  inputs: [],
  outputs: [{name:"settings", type:"slicer_settings"}],
  initData: ()=>({
    retract:0.8,
    retractSpeed:1800,
    retractMinTravel:1.0,
    zHop:0,
    wipe:false,
    coast:false
  }),
  render:(node, mount)=>renderSchema(SCHEMA_SLICER_RETRACTION_TRAVEL, node, mount),
  evaluate:(node)=>({ settings: { ...node.data } })
};
