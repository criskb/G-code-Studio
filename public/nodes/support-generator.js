window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { getMeshInput, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Support Generator",
  tag: "slicer",
  desc: "Generate tree or grid supports as mesh/toolpath.",
  inputs: [
    {name:"mesh", type:"mesh"},
    {name:"supportRules", type:"rules"}
  ],
  outputs: [
    {name:"supportMesh", type:"mesh"},
    {name:"supportToolpath", type:"toolpath"}
  ],
  initData: ()=>({
    mode: "tree",
    angleThreshold: 50,
    interfaceLayers: 2,
    branchThickness: 1.4,
    detachEase: 0.6
  }),
  schema: [
    {key:"mode", label:"Mode", type:"select", options:[["tree","Tree"],["grid","Grid"]]},
    {key:"angleThreshold", label:"Angle threshold", type:"number", min:0, max:89, step:1},
    {key:"interfaceLayers", label:"Interface layers", type:"int", min:0, max:8, step:1},
    {key:"branchThickness", label:"Branch thickness", type:"number", min:0.2, max:5, step:0.1},
    {key:"detachEase", label:"Detach ease", type:"number", min:0, max:1, step:0.05}
  ],
  evaluate: (node, ctx)=>{
    const mesh = getMeshInput(ctx, node, "mesh");
    return {
      supportMesh: mesh ? { source: "support", baseMesh: mesh, params: {...node.data} } : null,
      supportToolpath: []
    };
  }
});
