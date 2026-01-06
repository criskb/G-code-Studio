window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

const PRIMITIVE_FILES = {
  cube: "Cube.stl",
  sphere: "Sphere.stl",
  cylinder: "Cylinder.stl",
  cone: "Cone.stl",
  torus: "Torus.stl",
  icosphere: "Icosphere.stl",
  dome: "dome.stl"
};
async function loadPrimitiveForNode(node, kind){
  const f = PRIMITIVE_FILES[kind];
  if(!f) return;
  try{
    const resp = await fetch(`/primitives/${f}`);
    const buf = await resp.arrayBuffer();
    const mesh = parseSTL(buf);
    meshRuntimeCache.set(node.id, {mesh});
    markDirtyAuto();
    saveState();
  }catch(_){
  }
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
    centerXY:true,
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
  <option value="sphere">Sphere</option>
  <option value="cylinder">Cylinder</option>
  <option value="cone">Cone</option>
  <option value="torus">Torus</option>
  <option value="icosphere">Icosphere</option>
  <option value="dome">Dome</option>
`;
kindSel.value = d.kind || "cube";
for(const ev of ["pointerdown","mousedown","click"]){ kindSel.addEventListener(ev, e=>e.stopPropagation()); }
kindSel.addEventListener("change", ()=>{
  d.kind = kindSel.value;
  saveState();
  loadPrimitiveForNode(node, d.kind);
  markDirtyAuto();
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
try{
  const rt = meshRuntimeCache.get(node.id);
  if(!rt || !rt.mesh){ loadPrimitiveForNode(node, d.kind); }
}catch(_){}
    const token = (node._meshPrevTok = (node._meshPrevTok||0)+1);
    function loop(t){
      if(node._meshPrevTok !== token) return;
      const rt = meshRuntimeCache.get(node.id);
      const mesh = rt && rt.mesh ? rt.mesh : null;
      if(mesh){
        let m = mesh;
        m = centerMesh(m, !!d.centerXY, true);
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
    const rt = meshRuntimeCache.get(node.id);
    let mesh = rt && rt.mesh ? rt.mesh : null;
    if(mesh){
      mesh = centerMesh(mesh, !!d.centerXY, true);
      if(d.bedAlign) mesh = bedAlignMesh(mesh);
    }
    return { mesh };
  }
};
