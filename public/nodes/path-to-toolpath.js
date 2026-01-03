window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Path → Toolpath'] = {
  title:"Path → Toolpath",
  tag:"path",
  desc:"Wrap a path array into a minimal toolpath structure for toolpath-only modifiers.",
  inputs: [{name:"path", type:"path"}],
  outputs: [{name:"toolpath", type:"toolpath"}],
  initData: ()=>({}),
  render:(node, mount)=>{
    mount.innerHTML = "";
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.innerHTML = "Wraps path points into a single toolpath payload (layers + moves).";
    mount.appendChild(hint);
  },
  evaluate:(node, ctx)=>{
    const pathIn = ctx.getInput(node.id, "path");
    const pathRaw = pathIn?.path || pathIn?.out || pathIn || [];
    const path = Array.isArray(pathRaw) ? pathRaw.filter(Boolean) : [];
    const layers = [];
    let currentLayerId = null;
    let currentLayer = null;

    for(const pt of path){
      const z = Number.isFinite(pt?.z) ? pt.z : (currentLayer?.z ?? 0);
      const layerIndex = Number.isFinite(pt?.layer) ? pt.layer : null;
      const layerId = layerIndex !== null ? `L${layerIndex}` : `Z${z.toFixed(4)}`;
      if(layerId !== currentLayerId){
        currentLayer = { z, moves: [] };
        layers.push(currentLayer);
        currentLayerId = layerId;
      }
      const meta = (pt?.meta && typeof pt.meta === "object") ? {...pt.meta} : (pt?.meta ? {value:pt.meta} : {});
      if(!meta.role && pt?.role) meta.role = pt.role;
      if(!meta.role && meta.feature) meta.role = meta.feature;
      if(!meta.feature && meta.role) meta.feature = meta.role;
      const travel = !!pt?.travel || meta.feature === "travel" || meta.role === "travel";
      const move = {
        x: pt?.x ?? pt?.X ?? 0,
        y: pt?.y ?? pt?.Y ?? 0,
        z,
        kind: travel ? "travel" : "extrude",
        meta
      };
      if(pt?.f != null) move.f = pt.f;
      if(pt?.e != null) move.e = pt.e;
      currentLayer.moves.push(move);
    }

    const toolpath = {
      units: "mm",
      absoluteExtrusion: true,
      layers,
      stats: { length_mm:0, extruded_mm3:0, time_s_est:0 }
    };
    return { toolpath };
  }
};
