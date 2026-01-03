(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { getPathInput, summarizeToolpath, simpleReport, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Retraction & Ooze Risk",
  tag: "modifier",
  desc: "Adjust retraction rules and report ooze risk.",
  inputs: [
    {name:"toolpath", type:"toolpath"},
    {name:"materialProfile", type:"materialProfile"}
  ],
  outputs: [
    {name:"toolpath", type:"toolpath"},
    {name:"oozeReport", type:"report"}
  ],
  initData: ()=>({
    minTravelForRetract: 1.5,
    tempSensitivity: 0.7,
    wipeDistance: 3.0,
    coastDistance: 0.2
  }),
  schema: [
    {key:"minTravelForRetract", label:"Min travel for retract", type:"number", min:0, max:20, step:0.1},
    {key:"tempSensitivity", label:"Temp sensitivity", type:"number", min:0, max:1, step:0.05},
    {key:"wipeDistance", label:"Wipe distance", type:"number", min:0, max:10, step:0.1},
    {key:"coastDistance", label:"Coast distance", type:"number", min:0, max:2, step:0.01}
  ],
  evaluate: (node, ctx)=>{
    const toolpath = getPathInput(ctx, node, "toolpath");
    const summary = summarizeToolpath(toolpath);
    return {
      toolpath,
      oozeReport: simpleReport("Ooze risk", { minTravelForRetract: node.data.minTravelForRetract, ...summary })
    };
  }
});

})();
