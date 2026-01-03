(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.IDEA_NODE_UTILS = window.GCODE_STUDIO.IDEA_NODE_UTILS || window.GCODE_STUDIO.IDEA_NODE_UTILS_FALLBACK;
const { simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Adaptive Infill Field",
  tag: "slicer",
  desc: "Generate infill toolpath with varying density.",
  inputs: [
    {name:"mesh", type:"mesh"},
    {name:"field", type:"field"}
  ],
  outputs: [{name:"infillToolpath", type:"toolpath"}],
  initData: ()=>({
    minDensity: 0.1,
    maxDensity: 0.6,
    pattern: "gyroid",
    skinDistance: 1.2
  }),
  schema: [
    {key:"minDensity", label:"Min density", type:"number", min:0, max:1, step:0.01},
    {key:"maxDensity", label:"Max density", type:"number", min:0, max:1, step:0.01},
    {key:"pattern", label:"Pattern", type:"select", options:[["gyroid","Gyroid"],["grid","Grid"],["lines","Lines"]]},
    {key:"skinDistance", label:"Skin distance", type:"number", min:0, max:5, step:0.1}
  ],
  evaluate: ()=>({ infillToolpath: [] })
});

})();
