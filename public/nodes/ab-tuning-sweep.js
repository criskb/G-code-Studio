window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { parseNumberList, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "A/B Tuning Sweep",
  tag: "workflow",
  desc: "Generate job variants for tuning sweeps.",
  inputs: [{name:"baseGraphInputs", type:"graphInputs"}],
  outputs: [{name:"jobs", type:"jobs"}],
  initData: ()=>({
    temps: "190,200,210",
    speeds: "40,60",
    flow: "0.95,1.0",
    lh: "0.12,0.2"
  }),
  schema: [
    {key:"temps", label:"Temps", type:"text", placeholder:"e.g. 190,200"},
    {key:"speeds", label:"Speeds", type:"text", placeholder:"e.g. 40,60"},
    {key:"flow", label:"Flow", type:"text", placeholder:"e.g. 0.95,1.0"},
    {key:"lh", label:"Layer heights", type:"text", placeholder:"e.g. 0.12,0.2"}
  ],
  evaluate: (node, ctx)=>{
    const base = ctx.getInput(node.id, "baseGraphInputs") || {};
    const temps = parseNumberList(node.data.temps, []);
    const speeds = parseNumberList(node.data.speeds, []);
    const flows = parseNumberList(node.data.flow, []);
    const lhs = parseNumberList(node.data.lh, []);
    const jobs = [];
    for(const temp of temps){
      for(const speed of speeds){
        for(const flow of flows){
          for(const lh of lhs){
            jobs.push({
              label: `T${temp}-S${speed}-F${flow}-LH${lh}`,
              overrides: { temp, speed, flow, layerHeight: lh },
              base
            });
          }
        }
      }
    }
    return { jobs };
  }
});
