(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Thin Wall Strategy",
  tag: "slicer",
  desc: "Handle thin walls via gap fill or variable width.",
  inputs: [
    {name:"features", type:"features"},
    {name:"contours", type:"contours"}
  ],
  outputs: [
    {name:"features", type:"features"},
    {name:"toolpath", type:"toolpath"}
  ],
  initData: ()=>({
    mode: "gapFill",
    minWidth: 0.25,
    maxWidth: 0.6
  }),
  schema: [
    {key:"mode", label:"Mode", type:"select", options:[["gapFill","Gap fill"],["variableWidth","Variable width"],["drop","Drop"]]},
    {key:"minWidth", label:"Min width", type:"number", min:0.1, max:1, step:0.01},
    {key:"maxWidth", label:"Max width", type:"number", min:0.1, max:2, step:0.01}
  ],
  evaluate: (node, ctx)=>{
    const features = ctx.getInput(node.id, "features") || [];
    return { features, toolpath: [] };
  }
});

})();
