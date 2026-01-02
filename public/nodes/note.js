window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Note'] = {
  title:"Note",
  uiSchema:SCHEMA_NOTE,
  desc:"Demo instructions / documentation. Does not affect the graph.",
  tag:"docs",
  inputs:[],
  outputs:[],
  initData:()=>({
    title:"Demo note",
    compact:false,
    text:"Use this node to describe how the current demo is wired.\n\nTip: In Preview, use Role + Layer filters to inspect walls/infill/top/bottom.\n"
  }),
  render:(node, mount)=>renderSchema(NODE_DEFS[node.type].uiSchema, node, mount),
  evaluate:(node, ctx)=>({})
};
