window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Slicer Infill'] = {
  title:"Slicer Infill",
  defaultW:320,
  defaultH:280,
  tag:"slicer",
  desc:"Infill density, pattern, and angle settings.",
  inputs: [],
  outputs: [{name:"infill", type:"slicer_settings"}],
  initData: ()=>({
    infillPct:15,
    infillPattern:"grid",
    infillAngle:45,
    serpentine:true,
    brickLayer:false,
    infillLineWidth:0
  }),
  render:(node, mount)=>renderSchema(SCHEMA_SLICER_INFILL, node, mount),
  evaluate:(node)=>{
    const settings = { ...node.data };
    return { settings, infill: settings };
  }
};
