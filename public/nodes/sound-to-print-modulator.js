window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { getPathInput, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Sound-to-Print Modulator",
  tag: "creative",
  desc: "Modulate toolpath using audio data.",
  inputs: [
    {name:"audio", type:"audio"},
    {name:"toolpath", type:"toolpath"}
  ],
  outputs: [{name:"toolpath", type:"toolpath"}],
  initData: ()=>({
    band: "mid",
    amp: 0.3,
    smoothing: 0.6
  }),
  schema: [
    {key:"band", label:"Band", type:"select", options:[["bass","Bass"],["mid","Mid"],["high","High"]]},
    {key:"amp", label:"Amplitude", type:"number", min:0, max:2, step:0.1},
    {key:"smoothing", label:"Smoothing", type:"number", min:0, max:1, step:0.05}
  ],
  evaluate: (node, ctx)=>({ toolpath: getPathInput(ctx, node, "toolpath") })
});
