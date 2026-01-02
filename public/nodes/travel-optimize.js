import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Travel Optimize',
  def: {
  title:"Travel Optimize",
  tag:"modifier",
  desc:"Greedy per-layer segment reordering to reduce travel time (experimental).",
  inputs:[{name:"in", type:"path"}],
  outputs:[{name:"out", type:"path"}],
  initData:()=>({ perLayer:true, keepFirst:true }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";
    mount.appendChild(field("Per layer", elToggle(!!d.perLayer, v=>{ d.perLayer=!!v; markDirtyAuto(); saveState(); })));
    mount.appendChild(field("Keep first segment", elToggle(!!d.keepFirst, v=>{ d.keepFirst=!!v; markDirtyAuto(); saveState(); })));
    mount.appendChild(dividerTiny());
    const h=document.createElement("div");
    h.className="hint";
    h.innerHTML = "<div><b style='color:var(--text)'>Tip</b></div><div>Works best when the input path is segment pairs (travel→print) like the Slicer/Export machinePath.</div>";
    mount.appendChild(h);
  },
  evaluate:(node, ctx)=>{
    const inp = ctx.getInput(node.id, "in");
    const path = (inp?.out || inp?.path || inp) || null;
    if(!Array.isArray(path) || path.length<2) return { out: path||[] };

    // Split into segments: (a travel) -> (b print) where b is extrusion endpoint.
    const segs=[];
    for(let i=1;i<path.length;i++){
      const a=path[i-1], b=path[i];
      if(!a||!b) continue;
      const atr=!!a.travel, btr=!!b.travel;
      if(atr && !btr){
        const layer = isFinite(b.layer)? b.layer : (isFinite(b.meta?.layer)? b.meta.layer : inferLayer(b, ctx.base?.layerHeight||0.2));
        segs.push({a, b, layer});
      }
    }
    if(segs.length<2) return { out: path };

    const byLayer = new Map();
    for(const s of segs){
      const k = node.data.perLayer ? s.layer : 0;
      if(!byLayer.has(k)) byLayer.set(k, []);
      byLayer.get(k).push(s);
    }

    const out=[];
    const layers = Array.from(byLayer.keys()).sort((a,b)=>a-b);
    for(const k of layers){
      const list = byLayer.get(k);
      if(!list || list.length===0) continue;

      const used = new Array(list.length).fill(false);
      let cur = list[0];
      if(node.data.keepFirst){
        used[0]=true;
        out.push({...cur.a},{...cur.b});
      }else{
        // pick nearest to (0,0)
        let best=0, bd=Infinity;
        for(let i=0;i<list.length;i++){
          const s=list[i];
          const dx=(s.a.X??s.a.x??0), dy=(s.a.Y??s.a.y??0);
          const dd=dx*dx+dy*dy;
          if(dd<bd){ bd=dd; best=i; }
        }
        used[best]=true;
        cur=list[best];
        out.push({...cur.a},{...cur.b});
      }

      // greedy nearest next by travel start
      for(let step=0; step<list.length-1; step++){
        const cx = cur.b.X ?? cur.b.x ?? 0;
        const cy = cur.b.Y ?? cur.b.y ?? 0;
        let best=-1, bd=Infinity;
        for(let i=0;i<list.length;i++){
          if(used[i]) continue;
          const s=list[i];
          const sx = s.a.X ?? s.a.x ?? 0;
          const sy = s.a.Y ?? s.a.y ?? 0;
          const dx=sx-cx, dy=sy-cy;
          const dd=dx*dx+dy*dy;
          if(dd<bd){ bd=dd; best=i; }
        }
        if(best<0) break;
        used[best]=true;
        cur=list[best];
        out.push({...cur.a},{...cur.b});
      }
    }

    // Preserve any non-segment points (fallback: if mismatch, just return reordered segments)
    return { out };
  }
}
};
