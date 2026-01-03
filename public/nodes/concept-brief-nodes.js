(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.IDEA_NODE_UTILS = window.GCODE_STUDIO.IDEA_NODE_UTILS || window.GCODE_STUDIO.IDEA_NODE_UTILS_FALLBACK;
const {
  simpleNode,
  getMeshInput,
  getPathInput,
  getBounds,
  simpleReport,
  numOr,
  clamp
} = window.GCODE_STUDIO.IDEA_NODE_UTILS;

function buildPlateMesh(width, depth, height){
  const w = Math.max(1, Number(width || 120));
  const d = Math.max(1, Number(depth || 120));
  const h = Math.max(0.2, Number(height || 2));
  const hx = w * 0.5;
  const hy = d * 0.5;
  const z0 = 0;
  const z1 = h;

  const tris = [];
  const pushTri = (ax, ay, az, bx, by, bz, cx, cy, cz)=>{
    tris.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };
  const pushQuad = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz)=>{
    pushTri(ax, ay, az, bx, by, bz, cx, cy, cz);
    pushTri(cx, cy, cz, dx, dy, dz, ax, ay, az);
  };

  const x0 = -hx, x1 = hx;
  const y0 = -hy, y1 = hy;

  pushQuad(x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0);
  pushQuad(x0, y0, z1, x0, y1, z1, x1, y1, z1, x1, y0, z1);
  pushQuad(x0, y0, z0, x0, y0, z1, x1, y0, z1, x1, y0, z0);
  pushQuad(x1, y0, z0, x1, y0, z1, x1, y1, z1, x1, y1, z0);
  pushQuad(x1, y1, z0, x1, y1, z1, x0, y1, z1, x0, y1, z0);
  pushQuad(x0, y1, z0, x0, y1, z1, x0, y0, z1, x0, y0, z0);

  const arr = new Float32Array(tris);
  return { tris: arr, triCount: Math.floor(arr.length / 9), bounds: computeMeshBounds(arr), index: null };
}

function buildPlatePlan(id, meta){
  return {
    id,
    createdAt: new Date().toISOString(),
    ...meta
  };
}

simpleNode({
  name: "Pixel Mosaic Tile Generator",
  tag: "generator",
  desc: "Convert an image into a pixel-tile grid for multi-color tile plates.",
  inputs: [{name:"image", type:"image"}],
  outputs: [
    {name:"mesh", type:"mesh"},
    {name:"regions", type:"regions"},
    {name:"platePlan", type:"json"}
  ],
  initData: ()=>(
    {
      outputType:"tile",
      tileSizeMm:6,
      gridWidth:32,
      gridHeight:32,
      keepAspect:true,
      pixelStyle:"square",
      pixelGapMm:0.4,
      baseMm:2.5,
      pixelRaiseMm:1.2,
      maxColors:6,
      dither:"none",
      multiPlate:false,
      tilesPerPlate:100
    }
  ),
  schema: [
    {key:"outputType", label:"Output type", type:"select", options:[["tile","Tile Plate"],["puzzle","Puzzle Plate"],["separate","Separate Tiles"]]},
    {key:"tileSizeMm", label:"Tile size (mm)", type:"number", min:1, max:50, step:0.5},
    {key:"gridWidth", label:"Grid width", type:"number", min:1, max:200, step:1},
    {key:"gridHeight", label:"Grid height", type:"number", min:1, max:200, step:1},
    {key:"keepAspect", label:"Keep aspect", type:"checkbox"},
    {key:"pixelStyle", label:"Pixel style", type:"select", options:[["square","Square"],["rounded","Rounded"],["hex","Hex"]]},
    {key:"pixelGapMm", label:"Pixel gap (mm)", type:"number", min:0, max:5, step:0.1},
    {key:"baseMm", label:"Base thickness (mm)", type:"number", min:0.5, max:10, step:0.1},
    {key:"pixelRaiseMm", label:"Pixel raise (mm)", type:"number", min:0, max:5, step:0.1},
    {key:"maxColors", label:"Max colors", type:"number", min:1, max:24, step:1},
    {key:"dither", label:"Dither", type:"select", options:[["none","None"],["floyd","Floyd-Steinberg"]]},
    {key:"multiPlate", label:"Multi-plate", type:"checkbox"},
    {key:"tilesPerPlate", label:"Tiles per plate", type:"number", min:1, max:1000, step:1}
  ],
  evaluate: (node)=>{
    const d = node.data;
    const width = d.gridWidth * d.tileSizeMm;
    const height = d.gridHeight * d.tileSizeMm;
    const mesh = buildPlateMesh(width, height, d.baseMm + d.pixelRaiseMm);
    const platePlan = buildPlatePlan("pixel-mosaic", {
      outputType: d.outputType,
      tilesPerPlate: d.tilesPerPlate,
      multiPlate: d.multiPlate
    });
    return { mesh, regions: [], platePlan };
  }
});

simpleNode({
  name: "Vector Badge / Keychain Builder",
  tag: "generator",
  desc: "Vectorize images into printable badges with borders and holes.",
  inputs: [{name:"image", type:"image"}],
  outputs: [
    {name:"mesh", type:"mesh"},
    {name:"regions", type:"regions"},
    {name:"svg", type:"svg"},
    {name:"platePlan", type:"json"}
  ],
  initData: ()=>({
    baseWidthMm:70,
    baseHeightMm:40,
    borderMm:2,
    holeCount:1,
    holeDiaMm:4,
    baseMm:2.4,
    colorLayerMmPerColor:0.6,
    hollow:false
  }),
  schema: [
    {key:"baseWidthMm", label:"Width (mm)", type:"number", min:10, max:200, step:1},
    {key:"baseHeightMm", label:"Height (mm)", type:"number", min:10, max:200, step:1},
    {key:"borderMm", label:"Border (mm)", type:"number", min:0, max:10, step:0.1},
    {key:"holeCount", label:"Hole count", type:"number", min:0, max:4, step:1},
    {key:"holeDiaMm", label:"Hole dia (mm)", type:"number", min:1, max:10, step:0.1},
    {key:"baseMm", label:"Base thickness (mm)", type:"number", min:0.5, max:8, step:0.1},
    {key:"colorLayerMmPerColor", label:"Layer per color (mm)", type:"number", min:0.1, max:2, step:0.1},
    {key:"hollow", label:"Hollow", type:"checkbox"}
  ],
  evaluate: (node)=>{
    const d = node.data;
    const mesh = buildPlateMesh(d.baseWidthMm, d.baseHeightMm, d.baseMm);
    const svg = `<svg width="${d.baseWidthMm}mm" height="${d.baseHeightMm}mm" viewBox="0 0 ${d.baseWidthMm} ${d.baseHeightMm}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${d.baseWidthMm}" height="${d.baseHeightMm}" rx="4" ry="4" /></svg>`;
    const platePlan = buildPlatePlan("vector-badge", { holes: d.holeCount, hollow: d.hollow });
    return { mesh, regions: [], svg, platePlan };
  }
});

simpleNode({
  name: "Sign Composer",
  tag: "generator",
  desc: "Compose signs from SVG, text, and icon inputs with drill-through support.",
  inputs: [
    {name:"svg", type:"svg"},
    {name:"regions", type:"regions"},
    {name:"text", type:"text"},
    {name:"icons", type:"icons"}
  ],
  outputs: [
    {name:"mesh", type:"mesh"},
    {name:"regions", type:"regions"},
    {name:"toolPlan", type:"json"}
  ],
  initData: ()=>({
    baseShape:"roundedRect",
    sizeMm:120,
    cornerRadiusMm:12,
    embossDepthMm:1.2,
    drillDiaMm:3
  }),
  schema: [
    {key:"baseShape", label:"Base shape", type:"select", options:[["roundedRect","Rounded rect"],["circle","Circle"],["custom","Custom SVG"]]},
    {key:"sizeMm", label:"Size (mm)", type:"number", min:20, max:400, step:1},
    {key:"cornerRadiusMm", label:"Corner radius (mm)", type:"number", min:0, max:50, step:1},
    {key:"embossDepthMm", label:"Emboss depth (mm)", type:"number", min:0, max:5, step:0.1},
    {key:"drillDiaMm", label:"Drill dia (mm)", type:"number", min:0, max:10, step:0.1}
  ],
  evaluate: (node, ctx)=>{
    const d = node.data;
    const mesh = buildPlateMesh(d.sizeMm, d.sizeMm, 3);
    const regions = ctx.getInput(node.id, "regions") || [];
    const toolPlan = buildPlatePlan("sign-composer", { drillDiaMm: d.drillDiaMm });
    return { mesh, regions, toolPlan };
  }
});

simpleNode({
  name: "Desk Organizer Builder",
  tag: "generator",
  desc: "Create compartmented organizer trays from sketches.",
  inputs: [
    {name:"sketch2d", type:"sketch"},
    {name:"heightMap", type:"heightMap"}
  ],
  outputs: [
    {name:"mesh", type:"mesh"},
    {name:"slicingHints", type:"json"},
    {name:"platePlan", type:"json"}
  ],
  initData: ()=>({
    widthMm:140,
    depthMm:90,
    outerWallMm:2.4,
    wallHeightMm:30,
    baseMm:2,
    dividerThicknessMm:2
  }),
  schema: [
    {key:"widthMm", label:"Width (mm)", type:"number", min:40, max:400, step:1},
    {key:"depthMm", label:"Depth (mm)", type:"number", min:40, max:400, step:1},
    {key:"outerWallMm", label:"Outer wall (mm)", type:"number", min:1, max:10, step:0.1},
    {key:"wallHeightMm", label:"Wall height (mm)", type:"number", min:5, max:80, step:1},
    {key:"baseMm", label:"Base thickness (mm)", type:"number", min:0.5, max:8, step:0.1},
    {key:"dividerThicknessMm", label:"Divider thickness (mm)", type:"number", min:1, max:10, step:0.1}
  ],
  evaluate: (node)=>{
    const d = node.data;
    const mesh = buildPlateMesh(d.widthMm, d.depthMm, d.baseMm + d.wallHeightMm * 0.3);
    const slicingHints = buildPlatePlan("organizer-hints", { seamHint: "back" });
    const platePlan = buildPlatePlan("desk-organizer", { compartments: "custom" });
    return { mesh, slicingHints, platePlan };
  }
});

simpleNode({
  name: "Bas-Relief Composer",
  tag: "generator",
  desc: "Compress a mesh or image into a printable bas-relief.",
  inputs: [
    {name:"mesh", type:"mesh"},
    {name:"image", type:"image"}
  ],
  outputs: [
    {name:"mesh", type:"mesh"},
    {name:"heightMap", type:"heightMap"}
  ],
  initData: ()=>({
    maxDepthMm:6,
    curve:"s-curve",
    blurRadius:2,
    addFrame:false,
    frameMm:4
  }),
  schema: [
    {key:"maxDepthMm", label:"Max depth (mm)", type:"number", min:1, max:20, step:0.5},
    {key:"curve", label:"Compression curve", type:"select", options:[["linear","Linear"],["log","Log"],["s-curve","S-curve"]]},
    {key:"blurRadius", label:"Blur radius", type:"number", min:0, max:10, step:0.5},
    {key:"addFrame", label:"Add frame", type:"checkbox"},
    {key:"frameMm", label:"Frame (mm)", type:"number", min:0, max:20, step:0.5}
  ],
  evaluate: (node, ctx)=>{
    const inputMesh = getMeshInput(ctx, node, "mesh");
    const bounds = getBounds(inputMesh);
    const width = bounds ? Math.max(20, bounds.sizeX || 120) : 120;
    const depth = bounds ? Math.max(20, bounds.sizeY || 120) : 120;
    const mesh = buildPlateMesh(width, depth, node.data.maxDepthMm);
    const heightMap = { source: inputMesh ? "mesh" : "image", depth: node.data.maxDepthMm };
    return { mesh, heightMap };
  }
});

simpleNode({
  name: "Orbit Video Scan → Mesh",
  tag: "generator",
  desc: "Reconstruct a mesh from an orbit video or image set.",
  inputs: [
    {name:"video", type:"video"},
    {name:"imageSet", type:"imageSet"}
  ],
  outputs: [
    {name:"mesh", type:"mesh"},
    {name:"texture", type:"image"},
    {name:"confidenceMap", type:"image"}
  ],
  initData: ()=>({
    mode:"object",
    detail:"standard",
    watertight:true,
    cleanupLevel:2
  }),
  schema: [
    {key:"mode", label:"Mode", type:"select", options:[["object","Object"],["portrait","Portrait"]]},
    {key:"detail", label:"Detail", type:"select", options:[["draft","Draft"],["standard","Standard"],["high","High"]]},
    {key:"watertight", label:"Watertight", type:"checkbox"},
    {key:"cleanupLevel", label:"Cleanup level", type:"number", min:0, max:5, step:1}
  ],
  evaluate: (node)=>{
    const mesh = buildPlateMesh(80, 80, 60);
    const confidenceMap = { status: "placeholder", cleanupLevel: node.data.cleanupLevel };
    return { mesh, texture: null, confidenceMap };
  }
});

simpleNode({
  name: "Lightbox Panel Builder",
  tag: "generator",
  desc: "Create framed lightbox panels with layered inserts.",
  inputs: [
    {name:"image", type:"image"},
    {name:"text", type:"text"}
  ],
  outputs: [
    {name:"mesh", type:"mesh"},
    {name:"regions", type:"regions"},
    {name:"platePlan", type:"json"}
  ],
  initData: ()=>({
    panelWidthMm:160,
    panelHeightMm:100,
    frameThicknessMm:6,
    diffuserThicknessMm:2,
    mounting:"screws"
  }),
  schema: [
    {key:"panelWidthMm", label:"Panel width (mm)", type:"number", min:40, max:400, step:1},
    {key:"panelHeightMm", label:"Panel height (mm)", type:"number", min:40, max:400, step:1},
    {key:"frameThicknessMm", label:"Frame thickness (mm)", type:"number", min:2, max:20, step:0.5},
    {key:"diffuserThicknessMm", label:"Diffuser thickness (mm)", type:"number", min:0.5, max:10, step:0.1},
    {key:"mounting", label:"Mounting", type:"select", options:[["screws","Screws"],["keyhole","Keyhole"],["slots","Slots"]]}
  ],
  evaluate: (node)=>{
    const d = node.data;
    const mesh = buildPlateMesh(d.panelWidthMm, d.panelHeightMm, d.frameThicknessMm);
    const platePlan = buildPlatePlan("lightbox", { mounting: d.mounting });
    return { mesh, regions: [], platePlan };
  }
});

simpleNode({
  name: "Parametric Template Engine",
  tag: "generator",
  desc: "Template-based generator with batch support.",
  inputs: [
    {name:"params", type:"json"},
    {name:"csv", type:"csv"}
  ],
  outputs: [
    {name:"meshes", type:"mesh[]"},
    {name:"platePlan", type:"json"},
    {name:"profiles", type:"json"}
  ],
  initData: ()=>({
    template:"tag",
    itemsPerPlate:12,
    multiPlate:true
  }),
  schema: [
    {key:"template", label:"Template", type:"select", options:[["tag","Tag"],["label","Label"],["hinge","Hinge Box"]]},
    {key:"itemsPerPlate", label:"Items per plate", type:"number", min:1, max:200, step:1},
    {key:"multiPlate", label:"Multi-plate", type:"checkbox"}
  ],
  evaluate: (node)=>{
    const mesh = buildPlateMesh(60, 30, 3);
    const platePlan = buildPlatePlan("parametric-template", { itemsPerPlate: node.data.itemsPerPlate });
    const profiles = { layerHeight: 0.2, infill: 0.15 };
    return { meshes: [mesh], platePlan, profiles };
  }
});

simpleNode({
  name: "Palette & Region Editor",
  tag: "modifier",
  desc: "Merge, split, and recolor region data.",
  inputs: [
    {name:"regions", type:"regions"},
    {name:"palette", type:"palette"}
  ],
  outputs: [
    {name:"regions", type:"regions"},
    {name:"palette", type:"palette"},
    {name:"report", type:"report"}
  ],
  initData: ()=>({
    mergeByArea: true,
    simplifyTolerance: 0.2,
    dither: false
  }),
  schema: [
    {key:"mergeByArea", label:"Merge by area", type:"checkbox"},
    {key:"simplifyTolerance", label:"Simplify tol", type:"number", min:0, max:2, step:0.1},
    {key:"dither", label:"Dither", type:"checkbox"}
  ],
  evaluate: (node, ctx)=>{
    const regions = ctx.getInput(node.id, "regions") || [];
    const palette = ctx.getInput(node.id, "palette") || [];
    const report = simpleReport("Palette edits", { regions: regions.length, colors: palette.length });
    return { regions, palette, report };
  }
});

simpleNode({
  name: "Drill / Hardware Feature Pack",
  tag: "modifier",
  desc: "Apply standard hardware features like holes and nut traps.",
  inputs: [{name:"mesh", type:"mesh"}],
  outputs: [{name:"mesh", type:"mesh"}],
  initData: ()=>({
    featureType:"hole",
    throughAll:true,
    toleranceMm:0.2
  }),
  schema: [
    {key:"featureType", label:"Feature", type:"select", options:[["hole","Hole"],["countersink","Countersink"],["nutTrap","Nut trap"],["slot","Slot"]]},
    {key:"throughAll", label:"Through all", type:"checkbox"},
    {key:"toleranceMm", label:"Tolerance (mm)", type:"number", min:0, max:1, step:0.05}
  ],
  evaluate: (node, ctx)=>({ mesh: getMeshInput(ctx, node, "mesh") })
});

simpleNode({
  name: "Multi-Color ToolPlan Optimizer",
  tag: "planner",
  desc: "Generate optimized tool change plans for multi-color prints.",
  inputs: [
    {name:"regions", type:"regions"},
    {name:"palette", type:"palette"},
    {name:"printerCaps", type:"json"}
  ],
  outputs: [
    {name:"toolPlan", type:"json"},
    {name:"purgePlan", type:"json"},
    {name:"stats", type:"report"}
  ],
  initData: ()=>({
    strategy:"minSwaps",
    purgeIntoInfill:true
  }),
  schema: [
    {key:"strategy", label:"Strategy", type:"select", options:[["minSwaps","Min swaps"],["minWaste","Min waste"]]},
    {key:"purgeIntoInfill", label:"Purge into infill", type:"checkbox"}
  ],
  evaluate: (node, ctx)=>{
    const regions = ctx.getInput(node.id, "regions") || [];
    const stats = simpleReport("Tool plan stats", { regionCount: regions.length, strategy: node.data.strategy });
    return {
      toolPlan: buildPlatePlan("toolplan", { strategy: node.data.strategy }),
      purgePlan: buildPlatePlan("purgeplan", { purgeIntoInfill: node.data.purgeIntoInfill }),
      stats
    };
  }
});

simpleNode({
  name: "Adaptive Layer Height Synthesizer",
  tag: "modifier",
  desc: "Generate variable layer height schedules based on geometry.",
  inputs: [
    {name:"mesh", type:"mesh"},
    {name:"heightField", type:"heightMap"}
  ],
  outputs: [
    {name:"layerSchedule", type:"json"},
    {name:"mesh", type:"mesh"},
    {name:"hints", type:"json"}
  ],
  initData: ()=>({
    minLayer:0.12,
    maxLayer:0.32,
    sensitivity:0.5
  }),
  schema: [
    {key:"minLayer", label:"Min layer", type:"number", min:0.05, max:0.3, step:0.01},
    {key:"maxLayer", label:"Max layer", type:"number", min:0.1, max:1, step:0.01},
    {key:"sensitivity", label:"Sensitivity", type:"number", min:0, max:1, step:0.05}
  ],
  evaluate: (node, ctx)=>{
    const mesh = getMeshInput(ctx, node, "mesh");
    const bounds = getBounds(mesh);
    const height = bounds ? bounds.sizeZ || 30 : 30;
    const steps = Math.max(1, Math.floor(height / node.data.maxLayer));
    const layerSchedule = Array.from({length: steps}, (_, i)=>({ z: (i + 1) * node.data.maxLayer }));
    const hints = { minLayer: node.data.minLayer, maxLayer: node.data.maxLayer };
    return { layerSchedule, mesh, hints };
  }
});

simpleNode({
  name: "Corner Flow Equalizer",
  tag: "modifier",
  desc: "Adjust flow and speed around sharp corners in G-code.",
  inputs: [{name:"gcode", type:"gcode"}],
  outputs: [{name:"gcode", type:"gcode"}],
  initData: ()=>({
    angleThreshold:60,
    feedrateScale:0.7,
    coastLengthMm:0.4
  }),
  schema: [
    {key:"angleThreshold", label:"Angle threshold", type:"number", min:10, max:170, step:1},
    {key:"feedrateScale", label:"Feedrate scale", type:"number", min:0.1, max:1, step:0.05},
    {key:"coastLengthMm", label:"Coast length (mm)", type:"number", min:0, max:3, step:0.1}
  ],
  evaluate: (node, ctx)=>({ gcode: ctx.getInput(node.id, "gcode") || "" })
});

simpleNode({
  name: "Resonance-Aware Speed Map",
  tag: "modifier",
  desc: "Adjust speeds to avoid ringing resonances.",
  inputs: [
    {name:"path", type:"path"},
    {name:"gcode", type:"gcode"}
  ],
  outputs: [
    {name:"gcode", type:"gcode"},
    {name:"speedHeatmap", type:"json"}
  ],
  initData: ()=>({
    resonanceHz:38,
    notchWidth:6,
    minSpeed:20,
    maxSpeed:120
  }),
  schema: [
    {key:"resonanceHz", label:"Resonance Hz", type:"number", min:5, max:120, step:1},
    {key:"notchWidth", label:"Notch width", type:"number", min:1, max:30, step:1},
    {key:"minSpeed", label:"Min speed", type:"number", min:1, max:100, step:1},
    {key:"maxSpeed", label:"Max speed", type:"number", min:10, max:300, step:1}
  ],
  evaluate: (node)=>{
    const speedHeatmap = { resonanceHz: node.data.resonanceHz, notchWidth: node.data.notchWidth };
    return { gcode: "", speedHeatmap };
  }
});

simpleNode({
  name: "Thermal Timekeeper",
  tag: "rules",
  desc: "Enforce min-layer-time and cooling rules on small layers.",
  inputs: [{name:"toolpath", type:"toolpath"}],
  outputs: [
    {name:"rulePlan", type:"json"},
    {name:"warnings", type:"report"}
  ],
  initData: ()=>({
    minLayerTime:8,
    fanBoost:true,
    parkMove:true
  }),
  schema: [
    {key:"minLayerTime", label:"Min layer time (s)", type:"number", min:1, max:60, step:1},
    {key:"fanBoost", label:"Fan boost", type:"checkbox"},
    {key:"parkMove", label:"Add park move", type:"checkbox"}
  ],
  evaluate: (node)=>{
    const warnings = simpleReport("Thermal warnings", { minLayerTime: node.data.minLayerTime });
    const rulePlan = buildPlatePlan("thermal", { fanBoost: node.data.fanBoost, parkMove: node.data.parkMove });
    return { rulePlan, warnings };
  }
});

simpleNode({
  name: "Seam Composer",
  tag: "modifier",
  desc: "Assign seam positions for procedural toolpaths or G-code.",
  inputs: [
    {name:"path", type:"path"},
    {name:"gcode", type:"gcode"}
  ],
  outputs: [
    {name:"path", type:"path"},
    {name:"gcode", type:"gcode"}
  ],
  initData: ()=>({
    mode:"hide",
    direction:"north",
    scatter:0.2
  }),
  schema: [
    {key:"mode", label:"Mode", type:"select", options:[["hide","Hide seam"],["scatter","Scatter"],["align","Align"]]},
    {key:"direction", label:"Direction", type:"select", options:[["north","North"],["back","Back"],["east","East"],["west","West"]]},
    {key:"scatter", label:"Scatter", type:"number", min:0, max:1, step:0.05}
  ],
  evaluate: (node, ctx)=>{
    const path = getPathInput(ctx, node, "path");
    return { path, gcode: ctx.getInput(node.id, "gcode") || "" };
  }
});

simpleNode({
  name: "Bridge & Overhang Assistant",
  tag: "analysis",
  desc: "Detect bridges/overhangs and emit support hints.",
  inputs: [{name:"mesh", type:"mesh"}],
  outputs: [
    {name:"mesh", type:"mesh"},
    {name:"pathModifiers", type:"json"},
    {name:"hints", type:"json"}
  ],
  initData: ()=>({
    overhangAngle:50,
    addCombRibs:true
  }),
  schema: [
    {key:"overhangAngle", label:"Overhang angle", type:"number", min:10, max:80, step:1},
    {key:"addCombRibs", label:"Add comb ribs", type:"checkbox"}
  ],
  evaluate: (node, ctx)=>{
    const mesh = getMeshInput(ctx, node, "mesh");
    const hints = buildPlatePlan("bridge-hints", { overhangAngle: node.data.overhangAngle });
    return { mesh, pathModifiers: [], hints };
  }
});

simpleNode({
  name: "Texture Painter",
  tag: "modifier",
  desc: "Apply micro-textures to top surfaces.",
  inputs: [{name:"mesh", type:"mesh"}],
  outputs: [{name:"paths", type:"path"}],
  initData: ()=>({
    texture:"stipple",
    scale:1,
    depth:0.2
  }),
  schema: [
    {key:"texture", label:"Texture", type:"select", options:[["stipple","Stipple"],["hatch","Hatch"],["knurl","Knurl"],["topo","Topographic"]]},
    {key:"scale", label:"Scale", type:"number", min:0.2, max:5, step:0.1},
    {key:"depth", label:"Depth (mm)", type:"number", min:0, max:1, step:0.05}
  ],
  evaluate: ()=>({ paths: [] })
});

simpleNode({
  name: "G-code Time Machine Debugger",
  tag: "analysis",
  desc: "Simulate G-code with breakpoints and timeline output.",
  inputs: [{name:"gcode", type:"gcode"}],
  outputs: [{name:"debugTimeline", type:"json"}],
  initData: ()=>({
    breakpoint:"Z>30",
    exportRange:false
  }),
  schema: [
    {key:"breakpoint", label:"Breakpoint", type:"text"},
    {key:"exportRange", label:"Export range", type:"checkbox"}
  ],
  evaluate: (node)=>({ debugTimeline: buildPlatePlan("debug", { breakpoint: node.data.breakpoint }) })
});

simpleNode({
  name: "HD Preview Renderer",
  tag: "visualizer",
  desc: "Render high-fidelity filament previews with overlays.",
  inputs: [
    {name:"paths", type:"path"},
    {name:"gcode", type:"gcode"}
  ],
  outputs: [
    {name:"renderHints", type:"json"},
    {name:"overlays", type:"json"}
  ],
  initData: ()=>({
    mode:"ribbons",
    msaa:true,
    heatmap:"speed"
  }),
  schema: [
    {key:"mode", label:"Mode", type:"select", options:[["ribbons","Ribbons"],["volumetric","Volumetric"],["heatmap","Heatmap"]]},
    {key:"msaa", label:"MSAA", type:"checkbox"},
    {key:"heatmap", label:"Heatmap", type:"select", options:[["speed","Speed"],["flow","Flow"],["retractions","Retractions"]]}
  ],
  evaluate: (node)=>({
    renderHints: buildPlatePlan("hd-preview", { mode: node.data.mode }),
    overlays: { heatmap: node.data.heatmap }
  })
});

})();
