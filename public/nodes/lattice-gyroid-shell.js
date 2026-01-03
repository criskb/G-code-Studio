(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.IDEA_NODE_UTILS = window.GCODE_STUDIO.IDEA_NODE_UTILS || window.GCODE_STUDIO.IDEA_NODE_UTILS_FALLBACK;
const { getMeshInput, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Lattice/Gyroid Shell",
  tag: "geometry",
  desc: "Generate lattice shell geometry or toolpath.",
  inputs: [
    {name:"mesh", type:"mesh"},
    {name:"thickness", type:"number"}
  ],
  outputs: [
    {name:"mesh", type:"mesh"},
    {name:"toolpath", type:"toolpath"}
  ],
  initData: ()=>({
    cellSize: 4,
    thickness: 1.2,
    blendToWalls: 0.4
  }),
  schema: [
    {key:"cellSize", label:"Cell size", type:"number", min:1, max:20, step:0.1},
    {key:"thickness", label:"Thickness", type:"number", min:0.2, max:10, step:0.1},
    {key:"blendToWalls", label:"Blend to walls", type:"number", min:0, max:1, step:0.05}
  ],
  evaluate: (node, ctx)=>{
    const mesh = getMeshInput(ctx, node, "mesh");
    return { mesh, toolpath: [] };
  }
});

})();
