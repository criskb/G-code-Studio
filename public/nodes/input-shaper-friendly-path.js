window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { getPathInput, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Input Shaper Friendly Path",
  tag: "modifier",
  desc: "Smooth toolpath geometry for input shaper friendliness.",
  inputs: [
    {name:"toolpath", type:"toolpath"},
    {name:"resonanceProfile", type:"resonanceProfile"}
  ],
  outputs: [{name:"toolpath", type:"toolpath"}],
  initData: ()=>({
    strength: 0.4,
    onlyExternal: true,
    minFeatureSize: 1.0
  }),
  schema: [
    {key:"strength", label:"Strength", type:"number", min:0, max:1, step:0.05},
    {key:"onlyExternal", label:"Only external", type:"toggle"},
    {key:"minFeatureSize", label:"Min feature size", type:"number", min:0.1, max:5, step:0.1}
  ],
  evaluate: (node, ctx)=>({ toolpath: getPathInput(ctx, node, "toolpath") })
});
