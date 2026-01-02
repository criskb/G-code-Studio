(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Feather Blend Boundary",
  tag: "multi-material",
  desc: "Blend material boundaries with micro-interleaving.",
  inputs: [
    {name:"boundaryCurve", type:"curve"},
    {name:"regionA", type:"region"},
    {name:"regionB", type:"region"}
  ],
  outputs: [{name:"blendedBoundaryToolpath", type:"toolpath"}],
  initData: ()=>({
    blendWidth: 1.2,
    microPattern: "dither",
    ratioCurve: "linear"
  }),
  schema: [
    {key:"blendWidth", label:"Blend width", type:"number", min:0.1, max:10, step:0.1},
    {key:"microPattern", label:"Micro pattern", type:"select", options:[["dither","Dither"],["hatch","Hatch"]]},
    {key:"ratioCurve", label:"Ratio curve", type:"select", options:[["linear","Linear"],["ease","Ease"]]}
  ],
  evaluate: ()=>({ blendedBoundaryToolpath: [] })
});

})();
