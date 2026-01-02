window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Slicer Skirt/Brim'] = {
  title:"Slicer Skirt/Brim",
  defaultW:300,
  defaultH:220,
  tag:"slicer",
  desc:"Skirt and brim generation settings.",
  inputs: [],
  outputs: [{name:"settings", type:"slicer_settings"}],
  initData: ()=>({
    skirtLines:0,
    skirtDistance:6,
    brimWidth:0,
    brimLines:0
  }),
  render:(node, mount)=>renderSchema(SCHEMA_SLICER_SKIRT_BRIM, node, mount),
  evaluate:(node)=>({ settings: { ...node.data } })
};
