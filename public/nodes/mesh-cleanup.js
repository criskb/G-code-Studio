(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.IDEA_NODE_UTILS = window.GCODE_STUDIO.IDEA_NODE_UTILS || window.GCODE_STUDIO.IDEA_NODE_UTILS_FALLBACK;
const { getMeshInput, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Mesh Cleanup",
  tag: "mesh",
  desc: "Remove tiny shells, fix winding, and clean up mesh artifacts.",
  inputs: [{name:"mesh", type:"mesh"}],
  outputs: [{name:"mesh", type:"mesh"}],
  initData: ()=>({
    minComponentSize: 2,
    fixNormals: true,
    weldTolerance: 0.01
  }),
  schema: [
    {key:"minComponentSize", label:"Min component size", type:"number", min:0, max:100, step:0.1},
    {key:"fixNormals", label:"Fix normals", type:"toggle"},
    {key:"weldTolerance", label:"Weld tolerance", type:"number", min:0, max:1, step:0.001}
  ],
  evaluate: (node, ctx)=>{
    const mesh = getMeshInput(ctx, node, "mesh");
    return { mesh: mesh ? { ...mesh, cleanup: {...node.data} } : null };
  }
});
})();
