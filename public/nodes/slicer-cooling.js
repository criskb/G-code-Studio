window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Slicer Cooling'] = {
  title:"Slicer Cooling",
  defaultW:300,
  defaultH:220,
  tag:"slicer",
  desc:"Cooling settings for planar slicing.",
  inputs: [],
  outputs: [{name:"settings", type:"slicer_settings"}],
  initData: ()=>({
    fanFirstLayer:0,
    fanOtherLayers:100,
    minLayerTime:0,
    slowDownBelow:0
  }),
  render:(node, mount)=>renderSchema(SCHEMA_SLICER_COOLING, node, mount),
  evaluate:(node)=>({ settings: { ...node.data } })
};
