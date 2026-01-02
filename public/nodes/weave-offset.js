import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Weave Offset',
  def: {
  title:"Weave Offset",
  tag:"modifier",
  desc:"Wavy XY offset along the path (great for woven / organic looks).",
  inputs:[{name:"in", type:"path"}],
  outputs:[{name:"out", type:"path"}],
  initData:()=>({ amp:0.6, freq:6, phaseDeg:0, axis:"normal" }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";
    mount.appendChild(field("Amplitude (mm)", elNumber(d.amp??0.6, v=>{ d.amp=v; markDirtyAuto(); saveState(); }, 0.05)));
    mount.appendChild(field("Frequency", elNumber(d.freq??6, v=>{ d.freq=v; markDirtyAuto(); saveState(); }, 1)));
    mount.appendChild(field("Phase (deg)", elNumber(d.phaseDeg??0, v=>{ d.phaseDeg=v; markDirtyAuto(); saveState(); }, 1)));
    mount.appendChild(field("Axis", elSelect(d.axis||"normal", [["normal","Normal"],["x","X"],["y","Y"]], v=>{ d.axis=v; markDirtyAuto(); saveState(); })));
  },
  evaluate:(node, ctx)=>{
    const inp = ctx.getInput(node.id, "in");
    const path = (inp?.out || inp?.path || inp) || [];
    if(!Array.isArray(path) || path.length===0) return { out: [] };
    const d=node.data;
    const A=Number(d.amp||0);
    const f=Math.max(0, Number(d.freq||0));
    const ph=rad(Number(d.phaseDeg||0));
    if(A===0 || f===0) return { out: path.slice() };
    const out=[];
    const N=path.length;
    for(let i=0;i<N;i++){
      const p=path[i];
      if(!p){ continue; }
      const x=isFinite(p.X)?p.X:(p.x??0);
      const y=isFinite(p.Y)?p.Y:(p.y??0);
      // tangent approx
      const p0=path[Math.max(0,i-1)]||p;
      const p1=path[Math.min(N-1,i+1)]||p;
      const x0=isFinite(p0.X)?p0.X:(p0.x??0);
      const y0=isFinite(p0.Y)?p0.Y:(p0.y??0);
      const x1=isFinite(p1.X)?p1.X:(p1.x??0);
      const y1=isFinite(p1.Y)?p1.Y:(p1.y??0);
      const tx=x1-x0, ty=y1-y0;
      const l=Math.hypot(tx,ty)||1;
      const nx=-ty/l, ny=tx/l;
      const w = A*Math.sin(ph + (i/(N-1||1))*Math.PI*2*f);
      let X=x, Y=y;
      if((d.axis||"normal")==="normal"){ X=x+nx*w; Y=y+ny*w; }
      else if(d.axis==="x"){ X=x+w; }
      else if(d.axis==="y"){ Y=y+w; }
      out.push({...p, X, Y});
    }
    return { out };
  }
}
};
