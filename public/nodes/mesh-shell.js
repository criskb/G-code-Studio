(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.IDEA_NODE_UTILS = window.GCODE_STUDIO.IDEA_NODE_UTILS || window.GCODE_STUDIO.IDEA_NODE_UTILS_FALLBACK;
const { getMeshInput, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Mesh Shell",
  tag: "mesh",
  desc: "Create a thickened shell or hollowed version of a mesh.",
  inputs: [{name:"mesh", type:"mesh"}],
  outputs: [{name:"mesh", type:"mesh"}],
  initData: ()=>({
    thickness: 1.2,
    mode: "inside",
    capHoles: true
  }),
  schema: [
    {key:"thickness", label:"Thickness", type:"number", min:0.1, max:10, step:0.1},
    {key:"mode", label:"Mode", type:"select", options:[["inside","Inside"],["outside","Outside"],["both","Both"]]},
    {key:"capHoles", label:"Cap holes", type:"toggle"}
  ],
  evaluate: (node, ctx)=>{
    const mesh = getMeshInput(ctx, node, "mesh");
    return { mesh: mesh ? { ...mesh, shell: {...node.data} } : null };
  }
});
})();
