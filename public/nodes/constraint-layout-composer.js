(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.IDEA_NODE_UTILS = window.GCODE_STUDIO.IDEA_NODE_UTILS || window.GCODE_STUDIO.IDEA_NODE_UTILS_FALLBACK;
const { numOr, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Constraint-based Layout Composer",
  tag: "workflow",
  desc: "Arrange parts on the build plate with constraints.",
  inputs: [
    {name:"meshes", type:"mesh[]"},
    {name:"constraints", type:"constraints"}
  ],
  outputs: [{name:"plateLayout", type:"layout"}],
  initData: ()=>({
    spacing: 5,
    alignmentAxes: "x,y",
    frontDirection: "+Y"
  }),
  schema: [
    {key:"spacing", label:"Spacing", type:"number", min:0, max:50, step:0.5},
    {key:"alignmentAxes", label:"Alignment axes", type:"text", placeholder:"x,y"},
    {key:"frontDirection", label:"Front direction", type:"select", options:[["+Y","+Y"],["-Y","-Y"],["+X","+X"],["-X","-X"]]}
  ],
  evaluate: (node, ctx)=>{
    const meshes = ctx.getInput(node.id, "meshes") || [];
    const spacing = numOr(node.data.spacing, 5);
    const plateLayout = meshes.map((mesh, index)=>({
      mesh,
      transform: { x: index * spacing, y: 0, z: 0, rotZ: 0 }
    }));
    return { plateLayout };
  }
});

})();
