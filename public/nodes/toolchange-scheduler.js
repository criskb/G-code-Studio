window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Toolchange Scheduler",
  tag: "multi-material",
  desc: "Reorder tool usage to reduce swaps.",
  inputs: [{name:"features", type:"features"}],
  outputs: [{name:"features", type:"features"}],
  initData: ()=>({
    minimizeToolchanges: true,
    maxTravelPenalty: 1.5,
    colorBleedPenalty: 0.7
  }),
  schema: [
    {key:"minimizeToolchanges", label:"Minimize toolchanges", type:"toggle"},
    {key:"maxTravelPenalty", label:"Max travel penalty", type:"number", min:0, max:5, step:0.1},
    {key:"colorBleedPenalty", label:"Color bleed penalty", type:"number", min:0, max:2, step:0.1}
  ],
  evaluate: (node, ctx)=>{
    const features = ctx.getInput(node.id, "features") || [];
    return { features };
  }
});
