(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.IDEA_NODE_UTILS = window.GCODE_STUDIO.IDEA_NODE_UTILS || window.GCODE_STUDIO.IDEA_NODE_UTILS_FALLBACK;
const { getPathInput, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Why Did It Fail? Analyzer",
  tag: "analysis",
  desc: "Flag common print failure risks. Feed Machine Profile + Material Profile adapters for context.",
  inputs: [
    {name:"toolpath", type:"toolpath"},
    {name:"mesh", type:"mesh"},
    {name:"machineProfile", type:"machineProfile"},
    {name:"materialProfile", type:"materialProfile"}
  ],
  outputs: [
    {name:"warnings", type:"warnings"},
    {name:"toolpath", type:"toolpath"}
  ],
  initData: ()=>({
    maxVf: 12,
    minFeature: 0.3,
    maxOverhang: 60,
    minLayerTime: 8
  }),
  schema: [
    {key:"maxVf", label:"Max volumetric flow", type:"number", min:1, max:50, step:0.1},
    {key:"minFeature", label:"Min feature", type:"number", min:0.05, max:2, step:0.01},
    {key:"maxOverhang", label:"Max overhang", type:"number", min:0, max:89, step:1},
    {key:"minLayerTime", label:"Min layer time", type:"number", min:0, max:120, step:1}
  ],
  evaluate: (node, ctx)=>{
    const toolpath = getPathInput(ctx, node, "toolpath");
    const warnings = [];
    if(toolpath.length < 2) warnings.push("Toolpath is empty.");
    if(node.data.minLayerTime > 0) warnings.push(`Check layer times below ${node.data.minLayerTime}s.`);
    return { warnings, toolpath };
  }
});

})();
