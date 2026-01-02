(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { getPathInput, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Overhang/Bridge Planner",
  tag: "modifier",
  desc: "Apply bridge rules to toolpath segments.",
  inputs: [
    {name:"toolpath", type:"toolpath"},
    {name:"mesh", type:"mesh"}
  ],
  outputs: [{name:"toolpath", type:"toolpath"}],
  initData: ()=>({
    bridgeSpeed: 25,
    bridgeFlow: 0.9,
    fanBoost: 0.3,
    bridgeAngleStrategy: "maxSpan"
  }),
  schema: [
    {key:"bridgeSpeed", label:"Bridge speed", type:"number", min:5, max:200, step:1},
    {key:"bridgeFlow", label:"Bridge flow", type:"number", min:0.2, max:2, step:0.01},
    {key:"fanBoost", label:"Fan boost", type:"number", min:0, max:1, step:0.05},
    {key:"bridgeAngleStrategy", label:"Angle strategy", type:"select", options:[["maxSpan","Max span"],["minSpan","Min span"],["auto","Auto"]]}
  ],
  evaluate: (node, ctx)=>({ toolpath: getPathInput(ctx, node, "toolpath") })
});

})();
