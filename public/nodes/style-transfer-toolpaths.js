(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { getPathInput, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Style Transfer for Toolpaths",
  tag: "creative",
  desc: "Stylize toolpaths with artistic patterns.",
  inputs: [
    {name:"toolpath", type:"toolpath"},
    {name:"contours", type:"contours"}
  ],
  outputs: [{name:"toolpath", type:"toolpath"}],
  initData: ()=>({
    style: "stipple",
    amp: 0.4,
    frequency: 1.2,
    seed: 42
  }),
  schema: [
    {key:"style", label:"Style", type:"select", options:[["stipple","Stipple"],["hatch","Hatch"],["calligraphy","Calligraphy"],["wobble","Wobble"]]},
    {key:"amp", label:"Amplitude", type:"number", min:0, max:2, step:0.1},
    {key:"frequency", label:"Frequency", type:"number", min:0.1, max:10, step:0.1},
    {key:"seed", label:"Seed", type:"int", min:0, max:99999, step:1}
  ],
  evaluate: (node, ctx)=>({ toolpath: getPathInput(ctx, node, "toolpath") })
});

})();
