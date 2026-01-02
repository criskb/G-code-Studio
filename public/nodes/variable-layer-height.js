window.GCODE_STUDIO = window.GCODE_STUDIO || {};
const { clamp, numOr, getMeshInput, getBounds, simpleNode } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

simpleNode({
  name: "Variable Layer Height",
  tag: "slicer",
  desc: "Generate a variable layer plan based on mesh slope/curvature.",
  inputs: [
    {name:"mesh", type:"mesh"},
    {name:"profile", type:"profile"},
    {name:"paintMap", type:"field"}
  ],
  outputs: [
    {name:"layerPlan", type:"layerPlan"},
    {name:"stats", type:"stats"}
  ],
  initData: ()=>({
    minLH: 0.08,
    maxLH: 0.28,
    slopeSensitivity: 0.6,
    curvatureBias: 0.5,
    paintOverride: "none"
  }),
  schema: [
    {key:"minLH", label:"Min layer height", type:"number", min:0.02, max:1, step:0.01},
    {key:"maxLH", label:"Max layer height", type:"number", min:0.02, max:1, step:0.01},
    {key:"slopeSensitivity", label:"Slope sensitivity", type:"number", min:0, max:1, step:0.01},
    {key:"curvatureBias", label:"Curvature bias", type:"number", min:0, max:1, step:0.01},
    {key:"paintOverride", label:"Paint override", type:"select", options:[["none","None"],["force_min","Force min"],["force_max","Force max"]]}
  ],
  evaluate: (node, ctx)=>{
    const mesh = getMeshInput(ctx, node, "mesh");
    const bounds = getBounds(mesh);
    const minLH = numOr(node.data.minLH, 0.08);
    const maxLH = numOr(node.data.maxLH, 0.28);
    const height = bounds ? (bounds.max.z - bounds.min.z) : 0;
    const layerHeight = clamp((minLH + maxLH) / 2, minLH, maxLH);
    const layerCount = height > 0 ? Math.ceil(height / layerHeight) : 0;
    const layerPlan = [];
    for(let i=0;i<layerCount;i++){
      layerPlan.push({
        z: (bounds?.min.z ?? 0) + i * layerHeight,
        layerHeight,
        source: "variable_lh"
      });
    }
    return {
      layerPlan,
      stats: { layerCount, minLH, maxLH }
    };
  }
});
