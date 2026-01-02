import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Transform',
  def: {
    title:"Transform", tag:"modifier",
    desc:"Translate, rotate, scale a path.",
    inputs: [{name:"in", type:"path"}],
    outputs:[{name:"out", type:"path"}],
    initData: ()=>({tx:0, ty:0, scale:1.0, rotDeg:0}),
    render: (node, mount)=>{
      const d=node.data;
      mount.innerHTML="";
      mount.appendChild(grid2([
        field("Translate X", elNumber(d.tx, v=>{ d.tx=v||0; markDirtyAuto(); saveState(); }, 0.1)),
        field("Translate Y", elNumber(d.ty, v=>{ d.ty=v||0; markDirtyAuto(); saveState(); }, 0.1))
      ]));
      mount.appendChild(grid2([
        field("Scale", elNumber(d.scale, v=>{ d.scale=Math.max(0.0001, v||1); markDirtyAuto(); saveState(); }, 0.01)),
        field("Rotate (deg)", elNumber(d.rotDeg, v=>{ d.rotDeg=v||0; markDirtyAuto(); saveState(); }, 0.1))
      ]));
      const hint = document.createElement("div");
      hint.className="hint";
      hint.innerHTML = `Applied about (0,0).`;
      mount.appendChild(hint);
    },
    evaluate: (node, ctx)=>{
      const inp = ctx.getInput(node.id, "in");
      const path = (inp?.path || inp?.out || inp || []);
      const d=node.data;
      const a = rad(d.rotDeg||0);
      const ca=Math.cos(a), sa=Math.sin(a);
      const s = d.scale||1;
      const out = path.map(p=>{
        const x = (p.x*s), y=(p.y*s);
        const xr = x*ca - y*sa;
        const yr = x*sa + y*ca;
        return {...p, x:xr + (d.tx||0), y:yr + (d.ty||0)};
      });
      return { out };
    }
  }
};
