window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { getPathInput, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Top Surface Ironing",
  tag: "modifier",
  desc: "Generate ironing passes for top surfaces.",
  inputs: [{name:"toolpath", type:"toolpath"}],
  outputs: [{name:"toolpath", type:"toolpath"}],
  initData: ()=>({
    enableOn: "topOnly",
    ironingFlow: 0.12,
    speed: 15,
    pattern: "zigzag"
  }),
  schema: [
    {key:"enableOn", label:"Enable on", type:"select", options:[["topOnly","Top only"],["top+logos","Top + logos"]]},
    {key:"ironingFlow", label:"Ironing flow", type:"number", min:0.05, max:0.5, step:0.01},
    {key:"speed", label:"Speed", type:"number", min:5, max:100, step:1},
    {key:"pattern", label:"Pattern", type:"select", options:[["zigzag","Zigzag"],["lines","Lines"],["concentric","Concentric"]]}
  ],
  evaluate: (node, ctx)=>({ toolpath: getPathInput(ctx, node, "toolpath") })
});
