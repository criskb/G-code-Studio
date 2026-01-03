(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { getPathInput, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Travel Optimizer",
  tag: "modifier",
  desc: "Optimize travel moves with combing and seam avoidance.",
  inputs: [
    {name:"toolpath", type:"toolpath"},
    {name:"geometryContours", type:"contours"}
  ],
  outputs: [{name:"toolpath", type:"toolpath"}],
  initData: ()=>({
    combing: "infill",
    avoidPerimeters: true,
    zHopRules: "nearPerimeters",
    retractRules: "auto"
  }),
  schema: [
    {key:"combing", label:"Combing", type:"select", options:[["off","Off"],["infill","Infill"],["all","All"]]},
    {key:"avoidPerimeters", label:"Avoid perimeters", type:"toggle"},
    {key:"zHopRules", label:"Z-hop rules", type:"select", options:[["off","Off"],["nearPerimeters","Near perimeters"],["always","Always"]]},
    {key:"retractRules", label:"Retract rules", type:"select", options:[["auto","Auto"],["always","Always"],["never","Never"]]}
  ],
  evaluate: (node, ctx)=>({ toolpath: getPathInput(ctx, node, "toolpath") })
});

})();
