(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { getMeshInput, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "QR/Label Stamper",
  tag: "geometry",
  desc: "Stamp text or QR codes onto a mesh.",
  inputs: [
    {name:"mesh", type:"mesh"},
    {name:"textOrQR", type:"text"}
  ],
  outputs: [
    {name:"mesh", type:"mesh"},
    {name:"features", type:"features"}
  ],
  initData: ()=>({
    font: "Inter",
    size: 6,
    height: 0.6,
    placement: "top",
    applyTo: "topOnly"
  }),
  schema: [
    {key:"font", label:"Font", type:"text"},
    {key:"size", label:"Size", type:"number", min:1, max:30, step:0.5},
    {key:"height", label:"Height", type:"number", min:0.1, max:5, step:0.1},
    {key:"placement", label:"Placement", type:"select", options:[["top","Top"],["side","Side"],["bottom","Bottom"]]},
    {key:"applyTo", label:"Apply to", type:"select", options:[["topOnly","Top only"],["firstLayerOnly","First layer only"]]}
  ],
  evaluate: (node, ctx)=>{
    const mesh = getMeshInput(ctx, node, "mesh");
    return { mesh, features: [] };
  }
});

})();
