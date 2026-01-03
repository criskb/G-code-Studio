(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.IDEA_NODE_UTILS = window.GCODE_STUDIO.IDEA_NODE_UTILS || window.GCODE_STUDIO.IDEA_NODE_UTILS_FALLBACK;
const { getPathInput, simpleReport, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Bed Mesh Compensation",
  tag: "analysis",
  desc: "Apply bed mesh Z offsets and report corrections from the Bed Mesh adapter.",
  inputs: [
    {name:"toolpath", type:"toolpath"},
    {name:"bedMesh", type:"bedMesh"}
  ],
  outputs: [
    {name:"toolpath", type:"toolpath"},
    {name:"report", type:"report"}
  ],
  initData: ()=>({
    maxComp: 0.5,
    warnIfOver: 0.4
  }),
  schema: [
    {key:"maxComp", label:"Max compensation", type:"number", min:0, max:2, step:0.01},
    {key:"warnIfOver", label:"Warn if over", type:"number", min:0, max:2, step:0.01}
  ],
  evaluate: (node, ctx)=>{
    const toolpath = getPathInput(ctx, node, "toolpath");
    const report = simpleReport("Bed mesh", { maxComp: node.data.maxComp, warnIfOver: node.data.warnIfOver });
    return { toolpath, report };
  }
});

})();
