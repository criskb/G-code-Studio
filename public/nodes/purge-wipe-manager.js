(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.IDEA_NODE_UTILS = window.GCODE_STUDIO.IDEA_NODE_UTILS || window.GCODE_STUDIO.IDEA_NODE_UTILS_FALLBACK;
const { getPathInput, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Purge/Wipe Manager",
  tag: "multi-material",
  desc: "Insert purge and wipe routines for tool changes.",
  inputs: [
    {name:"toolpath", type:"toolpath"},
    {name:"toolsProfile", type:"toolsProfile"}
  ],
  outputs: [
    {name:"toolpath", type:"toolpath"},
    {name:"purgeStats", type:"stats"}
  ],
  initData: ()=>({
    wipeTower: "on",
    purgeVolume: 30,
    wipePathShape: "zigzag"
  }),
  schema: [
    {key:"wipeTower", label:"Wipe tower", type:"select", options:[["on","On"],["off","Off"]]},
    {key:"purgeVolume", label:"Purge volume", type:"number", min:0, max:200, step:1},
    {key:"wipePathShape", label:"Wipe path shape", type:"select", options:[["zigzag","Zigzag"],["line","Line"],["loop","Loop"]]}
  ],
  evaluate: (node, ctx)=>{
    const toolpath = getPathInput(ctx, node, "toolpath");
    return { toolpath, purgeStats: { purgeVolume: node.data.purgeVolume } };
  }
});

})();
