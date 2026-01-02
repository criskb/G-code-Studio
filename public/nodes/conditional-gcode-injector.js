window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Conditional G-code Injector",
  tag: "gcode",
  desc: "Insert conditional G-code macros into output.",
  inputs: [
    {name:"toolpath", type:"toolpath"},
    {name:"gcode", type:"gcode"}
  ],
  outputs: [{name:"gcode", type:"gcode"}],
  initData: ()=>({
    rulesJson: "[{\"when\":\"layerChange\",\"condition\":\"temp>210\",\"inject\":\"M106 S255\"}]"
  }),
  schema: [
    {key:"rulesJson", label:"Rules (JSON)", type:"textarea", placeholder:"[{\"when\":\"layerChange\",\"condition\":\"temp>210\",\"inject\":\"M106 S255\"}]"}
  ],
  evaluate: (node, ctx)=>{
    const gcodeInput = ctx.getInput(node.id, "gcode");
    const gcode = typeof gcodeInput === "string" ? gcodeInput : "";
    let rules = [];
    try {
      rules = JSON.parse(node.data.rulesJson || "[]");
    } catch(_){
      rules = [];
    }
    const injected = rules.length ? `; Conditional injector\n${gcode}` : gcode;
    return { gcode: injected };
  }
});
