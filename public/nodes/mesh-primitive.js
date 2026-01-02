window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

function buildPrimitiveMesh(data){
  const d = data || {};
  const kind = d.kind || "cube";
  const size = Math.max(1, Number(d.size || 120));
  const height = Math.max(0.01, Number(d.height || 40));
  const seg = Math.max(6, Math.min(220, Math.floor(Number(d.seg || 40))));
  const waveAmp = Number(d.waveAmp || 0);
  const waveFreq = Number(d.waveFreq || 1);

  const tris = [];
  const pushTri = (ax, ay, az, bx, by, bz, cx, cy, cz)=>{
    tris.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };
  const pushQuad = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz)=>{
    pushTri(ax, ay, az, bx, by, bz, cx, cy, cz);
    pushTri(cx, cy, cz, dx, dy, dz, ax, ay, az);
  };

  if(kind === "cube"){
    const hx = size * 0.5;
    const hy = size * 0.5;
    const z0 = 0;
    const z1 = height;
    const x0 = -hx, x1 = hx;
    const y0 = -hy, y1 = hy;

    // bottom
    pushQuad(x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0);
    // top
    pushQuad(x0, y0, z1, x0, y1, z1, x1, y1, z1, x1, y0, z1);
    // sides
    pushQuad(x0, y0, z0, x0, y0, z1, x1, y0, z1, x1, y0, z0);
    pushQuad(x1, y0, z0, x1, y0, z1, x1, y1, z1, x1, y1, z0);
    pushQuad(x1, y1, z0, x1, y1, z1, x0, y1, z1, x0, y1, z0);
    pushQuad(x0, y1, z0, x0, y1, z1, x0, y0, z1, x0, y0, z0);
  }else{
    const half = size * 0.5;
    const step = size / seg;
    const radius = half;
    const twoPi = Math.PI * 2;
    for(let yi=0; yi<seg; yi++){
      const y0 = -half + yi * step;
      const y1 = y0 + step;
      for(let xi=0; xi<seg; xi++){
        const x0 = -half + xi * step;
        const x1 = x0 + step;

        const zAt = (x, y)=>{
          if(kind === "dome"){
            const r = Math.hypot(x, y);
            if(r >= radius) return 0;
            const t = Math.sqrt(Math.max(0, 1 - (r / radius) ** 2));
            return height * t;
          }
          const phaseX = (x / size) * waveFreq * twoPi;
          const phaseY = (y / size) * waveFreq * twoPi;
          return height + waveAmp * Math.sin(phaseX) * Math.sin(phaseY);
        };

        const z00 = zAt(x0, y0);
        const z10 = zAt(x1, y0);
        const z11 = zAt(x1, y1);
        const z01 = zAt(x0, y1);

        pushTri(x0, y0, z00, x1, y0, z10, x0, y1, z01);
        pushTri(x1, y0, z10, x1, y1, z11, x0, y1, z01);
      }
    }
  }

  const arr = new Float32Array(tris);
  return { tris: arr, triCount: Math.floor(arr.length / 9), bounds: computeMeshBounds(arr), index: null };
}

window.GCODE_STUDIO.NODE_DEFS['Mesh Primitive'] = {
  title:"Mesh Primitive",
  defaultW:360,
  defaultH:520,
  tag:"mesh",
  desc:"Procedural mesh generator with in-node preview. Outputs mesh + optional auto-path (surface raster or quick planar). Use Slicer for full control.",
  inputs: [],
  outputs: [{name:"mesh", type:"mesh"}, {name:"path", type:"path"}],
  initData: ()=>({
    kind:"cube",
    size:120,
    height:40,
    seg:40,
    waveAmp:8,
    waveFreq:3,
    bedAlign:true,
    previewMode:"wireframe"
  }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";

// Top selectors (primitive + preview style)
const top = document.createElement("div");
top.className = "miniTopRow";

const kindSel = document.createElement("select");
kindSel.innerHTML = `
  <option value="cube">Cube</option>
  <option value="dome">Dome</option>
  <option value="wavy">Wavy Plane</option>
`;
kindSel.value = d.kind || "cube";
for(const ev of ["pointerdown","mousedown","click"]){ kindSel.addEventListener(ev, e=>e.stopPropagation()); }
kindSel.addEventListener("change", ()=>{
  d.kind = kindSel.value;
  markDirtyAuto();
  saveState();
  refreshNodeContent(node.id);
});
top.appendChild(kindSel);

const styleSel = document.createElement("select");
styleSel.innerHTML = `
  <option value="wireframe">Wireframe</option>
  <option value="solid">Solid</option>
  <option value="shaded">Shaded</option>
  <option value="points">Points</option>
`;
styleSel.value = d.previewMode || "wireframe";
for(const ev of ["pointerdown","mousedown","click"]){ styleSel.addEventListener(ev, e=>e.stopPropagation()); }
styleSel.addEventListener("change", ()=>{
  d.previewMode = styleSel.value;
  markDirtyAuto();
  saveState();
});
top.appendChild(styleSel);

mount.appendChild(top);

const box = document.createElement("div");
box.className="miniBox r23";
const canvas = document.createElement("canvas");
canvas.width=480; canvas.height=720; // 2:3 base ratio
box.appendChild(canvas);
mount.appendChild(box);

// Make canvas resolution match element size for crisp preview
try{
  if(node._ro){ node._ro.disconnect(); node._ro=null; }
  node._ro = new ResizeObserver(()=>{
    const r = box.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const ww = Math.max(2, Math.floor(r.width * dpr));
    const hh = Math.max(2, Math.floor(r.height * dpr));
    if(canvas.width!==ww || canvas.height!==hh){
      canvas.width = ww; canvas.height = hh;
    }
  });
  node._ro.observe(box);
}catch(_){}

const form = document.createElement("div");
renderSchema(SCHEMA_MESH_PRIMITIVE_V2, node, form);
mount.appendChild(form);
    const token = (node._meshPrevTok = (node._meshPrevTok||0)+1);
    function loop(t){
      if(node._meshPrevTok !== token) return;
      let mesh = null;
      try{ mesh = buildPrimitiveMesh(d); }catch(_){ mesh = null; }
      if(mesh){
        let m = mesh;
        if(d.bedAlign) m = bedAlignMesh(m);
        drawMeshPreview2D(canvas, m.tris, m.bounds, t*0.001, null, d.previewMode||"wireframe");
      }else{
        const ctx=canvas.getContext("2d");
        ctx.clearRect(0,0,canvas.width,canvas.height);
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  },
  evaluate:(node, ctx)=>{
    const d=node.data;
    let mesh = null;
    try{ mesh = buildPrimitiveMesh(d); }catch(_){ mesh = null; }
    if(mesh && d.bedAlign) mesh = bedAlignMesh(mesh);
    return { mesh };
  }
};
