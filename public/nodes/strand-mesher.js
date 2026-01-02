window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

function parseFeatureLimit(raw){
  if(Array.isArray(raw)) return raw.map(String);
  if(typeof raw === "string"){
    try{
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed)) return parsed.map(String);
    }catch(_){
      return raw.split(",").map(s=>s.trim()).filter(Boolean);
    }
  }
  return [];
}

function addRibbonSegment(geom, ax,ay,az, bx,by,bz, width){
  const dx = bx-ax, dy = by-ay;
  const len = Math.hypot(dx,dy) || 1;
  const nx = -dy/len, ny = dx/len;
  const hw = width/2;

  const p0 = [ax + nx*hw, ay + ny*hw, az];
  const p1 = [ax - nx*hw, ay - ny*hw, az];
  const p2 = [bx + nx*hw, by + ny*hw, bz];
  const p3 = [bx - nx*hw, by - ny*hw, bz];

  const idx = geom.positions.length / 3;
  geom.positions.push(...p0, ...p1, ...p2, ...p3);
  geom.indices.push(idx, idx+1, idx+2, idx+2, idx+1, idx+3);

  for(let i=0;i<4;i++) geom.normals.push(0,0,1);
}

window.GCODE_STUDIO.NODE_DEFS['strand-mesher'] = {
  title:"Strand Mesher (Filament Geometry)",
  tag:"preview",
  desc:"Generates a ribbon mesh from extrusion moves.",
  inputs:[
    {name:"toolpath", type:"toolpath"},
    {name:"profile", type:"profile"}
  ],
  outputs:[
    {name:"strandMesh", type:"mesh"},
    {name:"bounds", type:"json"},
    {name:"strandStats", type:"json"}
  ],
  initData:()=>({
    beadShape:"capsule",
    segmentsPerMm:2.0,
    cornerMiterLimit:1.5,
    overlapModel:"simple",
    limitToFeatures:"[\"perimeter\",\"top\",\"bridge\",\"infill\",\"support\"]"
  }),
  render:(node, mount)=>{
    mount.innerHTML = "";
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.innerHTML = "Builds a lightweight ribbon mesh for preview.";
    mount.appendChild(hint);
    const form = document.createElement("div");
    renderSchema(SCHEMA_STRAND_MESHER, node, form);
    mount.appendChild(form);
  },
  evaluate:(node, ctx)=>{
    const tpIn = ctx.getInput(node.id, "toolpath");
    if(!tpIn || !tpIn.layers) return { strandMesh:null, bounds:null, strandStats:{segmentCount:0} };

    const profile = ctx.getInput(node.id, "profile") || ctx.defaultProfile || defaultPrinterFallback();
    const d = node.data || {};
    const limitTo = parseFeatureLimit(d.limitToFeatures);

    const geom = { positions: [], indices: [], normals: [] };
    let minX=Infinity, minY=Infinity, minZ=Infinity;
    let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
    let segmentCount = 0;

    let last = null;
    for(const layer of tpIn.layers){
      for(const move of (layer.moves || [])){
        if(!last){
          last = {x:move.x, y:move.y, z:move.z};
          continue;
        }
        const isExtrude = move.kind === "extrude";
        const feature = move?.meta?.feature || move?.meta?.role || "";
        const allowed = !limitTo.length || limitTo.includes(String(feature));
        if(isExtrude && allowed){
          const width = Number(move?.meta?.width ?? profile?.lineWidth ?? 0.45);
          const dx = move.x - last.x;
          const dy = move.y - last.y;
          const dz = move.z - last.z;
          const dist = Math.hypot(dx, dy, dz);
          const segs = Math.max(1, Math.ceil(dist * Number(d.segmentsPerMm || 1)));
          for(let s=0; s<segs; s++){
            const t0 = s / segs;
            const t1 = (s + 1) / segs;
            const ax = last.x + dx * t0;
            const ay = last.y + dy * t0;
            const az = last.z + dz * t0;
            const bx = last.x + dx * t1;
            const by = last.y + dy * t1;
            const bz = last.z + dz * t1;
            addRibbonSegment(geom, ax, ay, az, bx, by, bz, width);
            minX = Math.min(minX, ax, bx);
            minY = Math.min(minY, ay, by);
            minZ = Math.min(minZ, az, bz);
            maxX = Math.max(maxX, ax, bx);
            maxY = Math.max(maxY, ay, by);
            maxZ = Math.max(maxZ, az, bz);
            segmentCount += 1;
          }
        }
        last = {x:move.x, y:move.y, z:move.z};
      }
    }

    if(segmentCount === 0){
      minX = minY = minZ = 0;
      maxX = maxY = maxZ = 0;
    }
    const bounds = {
      min:{x:minX, y:minY, z:minZ},
      max:{x:maxX, y:maxY, z:maxZ},
      minx:minX, miny:minY, minz:minZ, maxx:maxX, maxy:maxY, maxz:maxZ
    };

    const mesh = {
      positions: geom.positions,
      indices: geom.indices,
      normals: geom.normals,
      bounds
    };

    return {
      strandMesh: mesh,
      bounds,
      strandStats: {
        segmentCount,
        vertexCount: geom.positions.length / 3,
        triCount: geom.indices.length / 3
      },
      preview: {
        type:"mesh",
        mesh,
        mode:"shaded"
      }
    };
  }
};
