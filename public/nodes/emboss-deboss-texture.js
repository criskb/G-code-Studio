(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { getMeshInput, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Emboss/Deboss Texture",
  tag: "geometry",
  desc: "Apply texture displacement or toolpath overlay.",
  inputs: [
    {name:"mesh", type:"mesh"},
    {name:"textureSource", type:"texture"}
  ],
  outputs: [
    {name:"mesh", type:"mesh"},
    {name:"toolpath", type:"toolpath"}
  ],
  initData: ()=>({
    depth: 0.4,
    scale: 1.0,
    wrapMode: "surface",
    applyToFaces: "paint"
  }),
  schema: [
    {key:"depth", label:"Depth", type:"number", min:-2, max:2, step:0.01},
    {key:"scale", label:"Scale", type:"number", min:0.1, max:5, step:0.1},
    {key:"wrapMode", label:"Wrap mode", type:"select", options:[["surface","Surface"],["planar","Planar"],["cylindrical","Cylindrical"]]},
    {key:"applyToFaces", label:"Apply to faces", type:"select", options:[["paint","Paint"],["all","All"]]}
  ],
  evaluate: (node, ctx)=>{
    const mesh = getMeshInput(ctx, node, "mesh");
    return { mesh, toolpath: [] };
  }
});

})();
