window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Slicer Top/Bottom'] = {
  title:"Slicer Top/Bottom",
  defaultW:320,
  defaultH:280,
  tag:"slicer",
  desc:"Top and bottom skin settings.",
  inputs: [],
  outputs: [{name:"settings", type:"slicer_settings"}],
  initData: ()=>({
    topLayers:4,
    bottomLayers:4,
    solidPattern:"",
    ironing:false,
    skinOverlap:15,
    monotonic:false
  }),
  render:(node, mount)=>renderSchema(SCHEMA_SLICER_TOP_BOTTOM, node, mount),
  evaluate:(node)=>({ settings: { ...node.data } })
};
