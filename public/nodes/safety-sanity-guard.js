(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Safety/Sanity Guard",
  tag: "gcode",
  desc: "Validate G-code against machine safety limits using a Machine Profile adapter.",
  inputs: [
    {name:"gcode", type:"gcode"},
    {name:"machineProfile", type:"machineProfile"}
  ],
  outputs: [
    {name:"gcode", type:"gcode"},
    {name:"blockers", type:"warnings"}
  ],
  initData: ()=>({
    boundX: 220,
    boundY: 220,
    boundZ: 250,
    tempMin: 150,
    tempMax: 260,
    accelMin: 100,
    accelMax: 8000
  }),
  schema: [
    {key:"boundX", label:"Bounds X", type:"number", min:0, max:1000, step:1},
    {key:"boundY", label:"Bounds Y", type:"number", min:0, max:1000, step:1},
    {key:"boundZ", label:"Bounds Z", type:"number", min:0, max:1000, step:1},
    {key:"tempMin", label:"Temp min", type:"number", min:0, max:400, step:1},
    {key:"tempMax", label:"Temp max", type:"number", min:0, max:400, step:1},
    {key:"accelMin", label:"Accel min", type:"number", min:0, max:20000, step:10},
    {key:"accelMax", label:"Accel max", type:"number", min:0, max:20000, step:10}
  ],
  evaluate: (node, ctx)=>{
    const gcodeInput = ctx.getInput(node.id, "gcode");
    const gcode = typeof gcodeInput === "string" ? gcodeInput : "";
    const blockers = [];
    if(!gcode) blockers.push("No G-code input.");
    return { gcode, blockers };
  }
});

})();
