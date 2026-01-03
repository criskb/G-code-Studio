(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { getPathInput, summarizeToolpath, simpleReport, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Print Time & Cost Estimator",
  tag: "analysis",
  desc: "Estimate print time, filament, and energy cost.",
  inputs: [
    {name:"toolpath", type:"toolpath"},
    {name:"costProfile", type:"costProfile"}
  ],
  outputs: [
    {name:"timeReport", type:"report"},
    {name:"costReport", type:"report"}
  ],
  initData: ()=>({
    filamentPriceKg: 20,
    density: 1.24,
    wattage: 120,
    kWhPrice: 0.2
  }),
  schema: [
    {key:"filamentPriceKg", label:"Filament $/kg", type:"number", min:0, max:200, step:0.1},
    {key:"density", label:"Density (g/cc)", type:"number", min:0.5, max:2, step:0.01},
    {key:"wattage", label:"Wattage", type:"number", min:0, max:1000, step:1},
    {key:"kWhPrice", label:"kWh price", type:"number", min:0, max:2, step:0.01}
  ],
  evaluate: (node, ctx)=>{
    const toolpath = getPathInput(ctx, node, "toolpath");
    const summary = summarizeToolpath(toolpath);
    const timeMinutes = summary.length / 50;
    const energyKwh = (node.data.wattage * (timeMinutes / 60)) / 1000;
    const energyCost = energyKwh * node.data.kWhPrice;
    const costReport = simpleReport("Cost", { energyCost, filamentPriceKg: node.data.filamentPriceKg });
    const timeReport = simpleReport("Time", { timeMinutes, ...summary });
    return { timeReport, costReport };
  }
});

})();
