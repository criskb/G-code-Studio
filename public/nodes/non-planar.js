import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Non-Planar',
  def: {
  title:"Non-Planar", tag:"modifier",
  desc:"Warp Z along the path (non-planar). Use expressions with x,y,z,t,i,n,layer.",
  inputs:[{name:"in", type:"path"}],
  outputs:[{name:"out", type:"path"}],
  initData: ()=>({
    applyTo:"all",
    applyRole:"top",
    mode:"offset",            // offset | absolute
    zExpr:"2*sin(2*pi*t)",    // mm
    clamp:"none",             // none | minmax
    zMin: 0,
    zMax: 999,
  }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";
    mount.appendChild(grid2([
      field("Apply", elSelect(d.applyTo, [["all","All"],["walls","Walls"],["infill","Infill"],["top","Top"],["bottom","Bottom"]], v=>{ d.applyTo=v; markDirtyAuto(); saveState(); })),
      field("Role key", elInput(d.applyRole||"top", v=>{ d.applyRole=v; markDirtyAuto(); saveState(); }, "top"))
    ]));

    mount.appendChild(grid2([
      field("Mode", elSelect(d.mode, [["offset","Offset (z + f)"],["absolute","Absolute (z = f)"]], v=>{ d.mode=v; markDirtyAuto(); saveState(); })),
      field("Clamp", elSelect(d.clamp, [["none","None"],["minmax","Min/Max"]], v=>{ d.clamp=v; rerenderNode(node.id); markDirtyAuto(); saveState(); }))
    ]));
    mount.appendChild(field("Z expression (mm)", elInput(d.zExpr, v=>{ d.zExpr=v; markDirtyAuto(); saveState(); }, "e.g. 1.5*sin(x/10) + 1.5*cos(y/10)")));
    if(d.clamp==="minmax"){
      mount.appendChild(grid2([
        field("Z min", elNumber(d.zMin, v=>{ d.zMin=v||0; markDirtyAuto(); saveState(); }, 0.1)),
        field("Z max", elNumber(d.zMax, v=>{ d.zMax=v||0; markDirtyAuto(); saveState(); }, 0.1))
      ]));
    }
    const hint=document.createElement("div");
    hint.className="hint";
    hint.innerHTML = `Vars: <code>x</code>, <code>y</code>, <code>z</code>, <code>t</code>, <code>i</code>, <code>n</code>, <code>layer</code> + params. Tip: try <code>2*sin(x/12)</code> or <code>1.2*sin(2*pi*t*8)</code>.`;
    mount.appendChild(hint);
  },
  evaluate:(node, ctx)=>{
    const inp = ctx.getInput(node.id, "in");
    const path = (inp?.path || inp?.out || inp || []);
    if(!path.length) return { out: [] };
    const d=node.data;
    const pmap = ctx.pmap;
    const base = ctx.base;
    let fn;
    try{ fn = compileExpr(d.zExpr || "0"); }catch(e){ throw new Error("Non-Planar.zExpr: "+e.message); }
    const lh = path.find(p=>p?.meta?.layerHeight)?.meta?.layerHeight ?? 0.2;
    const out = path.map((pt, i)=>{
      const t = (path.length<=1) ? 0 : i/(path.length-1);
      const x = Number(pt.x ?? 0);
      const y = Number(pt.y ?? 0);
      const z = Number(pt.z ?? 0);
      const layer = (pt.layer!=null) ? (pt.layer|0) : Math.max(0, Math.floor(z/Math.max(0.01, lh)));
      let zNew = Number(fn(t, i, path.length, x, y, z, layer, pmap, base));
      if(d.mode==="offset") zNew = z + zNew;
      if(d.clamp==="minmax"){
        const mn = Number(d.zMin ?? 0);
        const mx = Number(d.zMax ?? 0);
        if(isFinite(mn) && isFinite(mx)) zNew = clamp(zNew, Math.min(mn,mx), Math.max(mn,mx));
      }
      return {...pt, z: zNew};
    });
    return { out };
  }
}
};
