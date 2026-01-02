window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

function cloneToolpath(tp){
  return {
    units: tp.units || "mm",
    absoluteExtrusion: tp.absoluteExtrusion !== false,
    layers: (tp.layers || []).map(layer=>({
      z: layer.z,
      moves: (layer.moves || []).map(m=>({
        ...m,
        meta: (m.meta && typeof m.meta === "object") ? {...m.meta} : (m.meta ? {value:m.meta} : {})
      }))
    })),
    stats: {...(tp.stats || {})}
  };
}

function motionDefaults(profile){
  const base = profile || {};
  return {
    speedPrint: Number(base.speedPrint || 1800),
    speedTravel: Number(base.speedTravel || 6000),
    lineWidth: Number(base.lineWidth || 0.45),
    layerHeight: Number(base.layerHeight || 0.2),
    temp: Number(base.tempNozzle || 210),
    fan: Number(base.fanOtherLayers || 128)
  };
}

window.GCODE_STUDIO.NODE_DEFS['motion-planner-sim'] = {
  title:"Motion Planner Simulator",
  tag:"analysis",
  desc:"Annotates toolpath moves with motion timing and limits.",
  inputs:[
    {name:"toolpath", type:"toolpath"},
    {name:"machineProfile", type:"profile"}
  ],
  outputs:[
    {name:"motionAnnotatedToolpath", type:"toolpath"},
    {name:"timeReport", type:"json"},
    {name:"bottlenecks", type:"json"}
  ],
  initData:()=>({
    planner:"junctionDeviation",
    maxAccel:8000,
    jdValue:0.02,
    maxJerk:10,
    maxVf_mm3s:18
  }),
  render:(node, mount)=>{
    mount.innerHTML = "";
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.innerHTML = "Simulates speed limits and writes <code>meta.motion</code> for each move.";
    mount.appendChild(hint);
    const form = document.createElement("div");
    renderSchema(SCHEMA_MOTION_PLANNER_SIM, node, form);
    mount.appendChild(form);
  },
  evaluate:(node, ctx)=>{
    const tpIn = ctx.getInput(node.id, "toolpath");
    if(!tpIn || !tpIn.layers) return { motionAnnotatedToolpath:null, timeReport:{}, bottlenecks:[] };

    const d = node.data || {};
    const machineProfile = ctx.getInput(node.id, "machineProfile") || ctx.defaultProfile || defaultPrinterFallback();
    const defaults = motionDefaults(machineProfile);
    const tp = cloneToolpath(tpIn);

    let last = null;
    let totalTime = 0;
    let totalDist = 0;
    let maxSpeed = 0;
    let moveCount = 0;
    let travelCount = 0;
    let extrudeCount = 0;
    const slowMoves = [];

    for(const layer of tp.layers){
      for(const move of layer.moves){
        const x = move.x ?? last?.x ?? 0;
        const y = move.y ?? last?.y ?? 0;
        const z = move.z ?? last?.z ?? 0;
        const dx = last ? (x - last.x) : 0;
        const dy = last ? (y - last.y) : 0;
        const dz = last ? (z - last.z) : 0;
        const dist = Math.hypot(dx,dy,dz);

        const width = move.meta?.width ?? defaults.lineWidth;
        const height = move.meta?.height ?? defaults.layerHeight;
        const nominalF = Number(move.f || (move.kind === "travel" ? defaults.speedTravel : defaults.speedPrint));
        let speedMmMin = nominalF;
        let limitReason = "nominal";

        if(move.kind === "extrude" && width > 0 && height > 0 && d.maxVf_mm3s > 0){
          const maxSpeedMmS = d.maxVf_mm3s / (width * height);
          const maxSpeedMmMin = maxSpeedMmS * 60;
          if(speedMmMin > maxSpeedMmMin){
            speedMmMin = maxSpeedMmMin;
            limitReason = "maxVf_mm3s";
          }
        }

        const speedMmS = speedMmMin / 60;
        const dt = speedMmS > 0 ? dist / speedMmS : 0;
        totalTime += dt;
        totalDist += dist;
        maxSpeed = Math.max(maxSpeed, speedMmS);
        moveCount += 1;
        if(move.kind === "travel") travelCount += 1;
        if(move.kind === "extrude") extrudeCount += 1;

        move.meta = {
          ...move.meta,
          motion: {
            actualSpeed: speedMmS,
            dt,
            limitReason
          }
        };

        if(move.kind === "extrude" && speedMmS > 0){
          slowMoves.push({speed:speedMmS, x, y, z, reason:limitReason});
        }

        last = {x,y,z};
      }
    }

    slowMoves.sort((a,b)=>a.speed - b.speed);

    const timeReport = {
      totalTime_s: totalTime,
      moveCount,
      travelCount,
      extrudeCount,
      length_mm: totalDist,
      maxSpeed_mm_s: maxSpeed,
      avgSpeed_mm_s: moveCount ? (totalDist / Math.max(1e-6, totalTime)) : 0,
      planner: d.planner
    };

    return {
      motionAnnotatedToolpath: tp,
      timeReport,
      bottlenecks: slowMoves.slice(0, 6)
    };
  }
};
