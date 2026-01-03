(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.IDEA_NODE_UTILS = window.GCODE_STUDIO.IDEA_NODE_UTILS || window.GCODE_STUDIO.IDEA_NODE_UTILS_FALLBACK;
const { getMeshInput, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Mesh Decimate",
  tag: "mesh",
  desc: "Reduce triangle count while preserving shape.",
  inputs: [{name:"mesh", type:"mesh"}],
  outputs: [{name:"mesh", type:"mesh"}],
  initData: ()=>({
    targetRatio: 0.5,
    preserveBorders: true,
    maxError: 0.5
  }),
  schema: [
    {key:"targetRatio", label:"Target ratio", type:"number", min:0.05, max:1, step:0.01},
    {key:"preserveBorders", label:"Preserve borders", type:"toggle"},
    {key:"maxError", label:"Max error", type:"number", min:0, max:5, step:0.1}
  ],
  evaluate: (node, ctx)=>{
    const mesh = getMeshInput(ctx, node, "mesh");
    return { mesh: mesh ? { ...mesh, decimate: {...node.data} } : null };
  }
});
})();
