(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { getPathInput, simpleReport, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Pressure Advance Estimator",
  tag: "analysis",
  desc: "Estimate pressure advance from toolpath changes.",
  inputs: [
    {name:"toolpath", type:"toolpath"},
    {name:"machineProfile", type:"machineProfile"},
    {name:"materialProfile", type:"materialProfile"}
  ],
  outputs: [
    {name:"suggestions", type:"report"},
    {name:"toolpath", type:"toolpath"}
  ],
  initData: ()=>({
    assumedElasticity: 0.6,
    targetCornerSharpness: 0.7
  }),
  schema: [
    {key:"assumedElasticity", label:"Assumed elasticity", type:"number", min:0, max:2, step:0.05},
    {key:"targetCornerSharpness", label:"Target corner sharpness", type:"number", min:0, max:1, step:0.05}
  ],
  evaluate: (node, ctx)=>{
    const toolpath = getPathInput(ctx, node, "toolpath");
    const suggestions = simpleReport("Pressure advance", { assumedElasticity: node.data.assumedElasticity });
    return { suggestions, toolpath };
  }
});

})();
