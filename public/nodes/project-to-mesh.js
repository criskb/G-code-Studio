import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Project to Mesh',
  def: {
  title:"Project to Mesh", tag:"modifier",
  desc:"Set Z from a mesh top-surface under each XY point (vertical projection). Great for non-planar.",
  inputs:[{name:"path", type:"path"}, {name:"mesh", type:"mesh"}],
  outputs:[{name:"out", type:"path"}],
  initData: ()=>({
    mode:"replace",
    offsetZ: 0,
    fallback:"keep",
  }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";
    mount.appendChild(grid2([
      field("Mode", elSelect(d.mode, [["replace","Replace Z = Zmesh + offset"],["offset","Offset Z += Zmesh + offset"]], v=>{ d.mode=v; markDirtyAuto(); saveState(); })),
      field("Fallback", elSelect(d.fallback, [["keep","Keep original Z"],["zero","Use 0"]], v=>{ d.fallback=v; markDirtyAuto(); saveState(); })),
    ]));
    mount.appendChild(field("Offset Z (mm)", elNumber(d.offsetZ, v=>{ d.offsetZ=Number(v||0); markDirtyAuto(); saveState(); }, 0.1)));
    const hint=document.createElement("div");
    hint.className="hint";
    hint.innerHTML = "Feeds on <b>mesh</b> + <b>path</b>. It takes each XY point and finds the highest triangle surface Z under that point. If no triangle covers XY, fallback applies.";
    mount.appendChild(hint);
  },
  evaluate:(node, ctx)=>{
    const d=node.data;
    const pin = ctx.getInput(node.id, "path");
    const min = ctx.getInput(node.id, "mesh");
    const path = (pin?.out || pin?.path || pin || []);
    const mesh = (min?.mesh || min?.out || min || null);
    if(!path || !path.length) return { out: [] };
    if(!mesh || !mesh.tris) return { out: Array.isArray(path) ? path : [] };
    if(!mesh.index) buildMeshIndex(mesh, 10);

    const out = [];
    for(let i=0;i<path.length;i++){
      const p = path[i];
      const x = Number(p.x ?? p.X ?? 0);
      const y = Number(p.y ?? p.Y ?? 0);
      const z0 = Number(p.z ?? 0);
      const zM = meshTopZ(mesh, x, y);
      let z = z0;
      if(zM==null){
        z = (d.fallback==="zero") ? 0 : z0;
      } else {
        const v = zM + Number(d.offsetZ||0);
        z = (d.mode==="replace") ? v : (z0 + v);
      }
      out.push({...p, x, y, z});
    }
    return { out };
  }
}
};
