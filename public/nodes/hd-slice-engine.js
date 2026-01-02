window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

function hdSliceBoundsFromMesh(mesh, profile){
  if(mesh?.bounds) return mesh.bounds;
  if(mesh?.tris){
    return computeMeshBounds(mesh.tris);
  }
  if(mesh?.positions){
    const tris = meshToTris(mesh);
    if(tris && tris.length) return computeMeshBounds(tris);
  }
  const bedW = profile?.bedW || 220;
  const bedD = profile?.bedD || 220;
  return {min:{x:0,y:0,z:0}, max:{x:bedW,y:bedD,z:40}, minx:0, miny:0, minz:0, maxx:bedW, maxy:bedD, maxz:40};
}

function makeDemoToolpathFromBounds(bounds, params, profile){
  const { minx, miny, minz, maxx, maxy, maxz } = bounds;
  const lh = Number(params.layerHeight ?? 0.2);
  const w = Number(params.lineWidth ?? (profile?.lineWidth || 0.45));
  const h = lh;
  const layers = [];
  let eAbs = 0;

  const inset = 5;
  const x0 = minx + inset, y0 = miny + inset;
  const x1 = maxx - inset, y1 = maxy - inset;

  const perim = [
    [x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]
  ];

  for(let z = minz + lh; z <= maxz + 0.0001; z += lh){
    const moves = [];
    moves.push({ kind:"travel", x:perim[0][0], y:perim[0][1], z, f:7200, meta:{feature:"travel"} });
    for(let i=1;i<perim.length;i++){
      const [x,y] = perim[i];
      const dx = x - perim[i-1][0];
      const dy = y - perim[i-1][1];
      const dist = Math.hypot(dx,dy);
      const eInc = dist * (w*h) / 2.4;
      eAbs += eInc;
      moves.push({ kind:"extrude", x,y,z, e:eAbs, f:1800, meta:{feature:"perimeter", width:w, height:h, tool:0} });
    }
    const step = 6;
    for(let yy = y0+step; yy < y1-step; yy += step){
      moves.push({ kind:"travel", x:x0+1, y:yy, z, f:7200, meta:{feature:"travel"} });
      const dist = (x1-1) - (x0+1);
      eAbs += dist * (w*h) / 2.8;
      moves.push({ kind:"extrude", x:x1-1, y:yy, z, e:eAbs, f:2400, meta:{feature:"infill", width:w, height:h, tool:0} });
    }
    layers.push({ z: +z.toFixed(4), moves });
  }

  return { units:"mm", absoluteExtrusion:true, layers, stats:{length_mm:0, extruded_mm3:0, time_s_est:0} };
}

function toolpathStats(toolpath){
  let len = 0;
  let last = null;
  let moves = 0;
  for(const layer of (toolpath.layers||[])){
    for(const mv of (layer.moves||[])){
      if(last){
        const dx = (mv.x ?? last.x) - last.x;
        const dy = (mv.y ?? last.y) - last.y;
        const dz = (mv.z ?? last.z) - last.z;
        len += Math.hypot(dx,dy,dz);
      }
      last = {x:mv.x ?? last?.x ?? 0, y:mv.y ?? last?.y ?? 0, z:mv.z ?? last?.z ?? 0};
      moves += 1;
    }
  }
  return { moveCount:moves, length_mm:len };
}

window.GCODE_STUDIO.NODE_DEFS['hd-slice-engine'] = {
  title:"HD Slice Engine (Adaptive Fidelity)",
  tag:"path",
  desc:"Adaptive fidelity slicer. Outputs a toolpath, features, and stats.",
  inputs:[
    {name:"mesh", type:"mesh"},
    {name:"profile", type:"profile"},
    {name:"modifiers", type:"json"}
  ],
  outputs:[
    {name:"toolpath", type:"toolpath"},
    {name:"features", type:"json"},
    {name:"stats", type:"json"}
  ],
  initData:()=>({
    fidelityMode:"balanced",
    layerHeight:0.2,
    lineWidth:0.45,
    maxChordError:0.05,
    minSegmentLen:0.08,
    adaptiveBy:"both",
    preserveArcs:true
  }),
  render:(node, mount)=>{
    mount.innerHTML = "";
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.innerHTML = "Mesh → HD Slice → Toolpath. MVP emits a demo toolpath using mesh bounds.";
    mount.appendChild(hint);
    const form = document.createElement("div");
    renderSchema(SCHEMA_HD_SLICE_ENGINE, node, form);
    mount.appendChild(form);
  },
  evaluate:(node, ctx)=>{
    const d = node.data || {};
    const meshInput = ctx.getInput(node.id, "mesh");
    const profile = ctx.getInput(node.id, "profile") || ctx.defaultProfile || defaultPrinterFallback();
    let mesh = meshInput?.mesh || meshInput || null;
    if(!mesh){
      return {
        toolpath: { units:"mm", absoluteExtrusion:true, layers:[], stats:{length_mm:0, extruded_mm3:0, time_s_est:0} },
        features: { note:"No mesh input." },
        stats: { moveCount:0, layerCount:0 }
      };
    }

    const bounds = hdSliceBoundsFromMesh(mesh, profile);
    const toolpath = makeDemoToolpathFromBounds(bounds, d, profile);
    const stats = toolpathStats(toolpath);

    return {
      toolpath,
      features: { strategy:"demo", bounds, fidelityMode:d.fidelityMode },
      stats: { ...stats, layerCount: toolpath.layers.length }
    };
  }
};
