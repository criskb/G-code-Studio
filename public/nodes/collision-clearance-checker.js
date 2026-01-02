window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { getPathInput, summarizeToolpath, simpleReport, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Collision & Clearance Checker",
  tag: "analysis",
  desc: "Detect potential collisions for the toolhead.",
  inputs: [
    {name:"toolpath", type:"toolpath"},
    {name:"machineProfile", type:"machineProfile"},
    {name:"printMesh", type:"mesh"}
  ],
  outputs: [
    {name:"collisionReport", type:"report"},
    {name:"toolpath", type:"toolpath"}
  ],
  initData: ()=>({
    gantryHeight: 35,
    nozzleOffsetX: 0,
    nozzleOffsetY: 0,
    nozzleOffsetZ: 0,
    clearanceMargin: 1.5
  }),
  schema: [
    {key:"gantryHeight", label:"Gantry height", type:"number", min:0, max:200, step:0.1},
    {key:"nozzleOffsetX", label:"Nozzle offset X", type:"number", min:-50, max:50, step:0.1},
    {key:"nozzleOffsetY", label:"Nozzle offset Y", type:"number", min:-50, max:50, step:0.1},
    {key:"nozzleOffsetZ", label:"Nozzle offset Z", type:"number", min:-50, max:50, step:0.1},
    {key:"clearanceMargin", label:"Clearance margin", type:"number", min:0, max:10, step:0.1}
  ],
  evaluate: (node, ctx)=>{
    const toolpath = getPathInput(ctx, node, "toolpath");
    const summary = summarizeToolpath(toolpath);
    return {
      toolpath,
      collisionReport: simpleReport("Collision scan", { clearanceMargin: node.data.clearanceMargin, ...summary })
    };
  }
});
