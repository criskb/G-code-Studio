import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Snake Wall',
  def: {
  title:"Snake Wall",
  tag:"modifier",
  desc:"Convert a path into a continuous 'snake mode' zig-zag wall (useful for fast fills without infill).",
  inputs:[{name:"in", type:"path"}],
  outputs:[{name:"out", type:"path"}],
  initData:()=>({ spacing:0.6, angleDeg:0 }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";
    mount.appendChild(field("Spacing (mm)", elNumber(d.spacing??0.6, v=>{ d.spacing=v; markDirtyAuto(); saveState(); }, 0.05)));
    mount.appendChild(field("Angle (deg)", elNumber(d.angleDeg??0, v=>{ d.angleDeg=v; markDirtyAuto(); saveState(); }, 1)));
    const tip=document.createElement("div");
    tip.className="hint";
    tip.innerHTML="<b>Tip</b><div>Best on simple bounding boxes / silhouettes. Pair with Travel Optimize.</div>";
    mount.appendChild(tip);
  },
  evaluate:(node, ctx)=>{
    const inp = ctx.getInput(node.id, "in");
    const path = (inp?.out || inp?.path || inp) || [];
    if(!Array.isArray(path) || path.length===0) return { out: [] };
    const d=node.data;
    const sp=Math.max(0.05, Number(d.spacing||0.6));
    const ang=rad(Number(d.angleDeg||0));
    // Compute bounds per layer
    const byLayer = new Map();
    for(const p of path){
      if(!p) continue;
      const L = p.layer ?? Math.floor(((p.z??p.Z??0) / (ctx.defaultProfile?.layerHeight||0.2)));
      const x=isFinite(p.X)?p.X:(p.x??0);
      const y=isFinite(p.Y)?p.Y:(p.y??0);
      if(!byLayer.has(L)) byLayer.set(L, {minx:x,maxx:x,miny:y,maxy:y, z:(p.z??p.Z??0)});
      const b=byLayer.get(L);
      b.minx=Math.min(b.minx,x); b.maxx=Math.max(b.maxx,x);
      b.miny=Math.min(b.miny,y); b.maxy=Math.max(b.maxy,y);
      b.z=(p.z??p.Z??b.z);
    }
    const out=[];
    const layers=[...byLayer.keys()].sort((a,b)=>a-b);
    for(const L of layers){
      const b=byLayer.get(L);
      const w=b.maxx-b.minx, h=b.maxy-b.miny;
      const n = Math.max(2, Math.floor((h)/sp));
      for(let i=0;i<=n;i++){
        const t=i/n;
        const y=b.miny + t*h;
        const x0=b.minx, x1=b.maxx;
        const flip=i%2===1;
        const xa=flip?x1:x0, xb=flip?x0:x1;
        // rotate around center
        const cx=(b.minx+b.maxx)/2, cy=(b.miny+b.maxy)/2;
        const rot=(x,y)=>{
          const dx=x-cx, dy=y-cy;
          return {X: cx + dx*Math.cos(ang)-dy*Math.sin(ang), Y: cy + dx*Math.sin(ang)+dy*Math.cos(ang)};
        };
        const A=rot(xa,y), B=rot(xb,y);
        out.push({X:A.X,Y:A.Y,z:b.z,role:"infill",travel:false,layer:L});
        out.push({X:B.X,Y:B.Y,z:b.z,role:"infill",travel:false,layer:L});
      }
    }
    return { out };
  }
}

};
