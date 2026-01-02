import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Inspector',
  def: {
  title:"Inspector",
  tag:"analysis",
  desc:"Quick debug: counts, layers, roles, bounds. Great for demos.",
  inputs:[{name:"path", type:"path"},{name:"mesh", type:"mesh"},{name:"gcode", type:"gcode"},{name:"profile", type:"profile"}],
  outputs:[],
  initData:()=>({ showGcodePreview:false, gcodeChars:3000 }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";
    const box=document.createElement("div");
    box.className="hint";
    const stats = node.runtime?.stats || null;
    box.innerHTML = stats ? mdToHtml(stats) : "<div class='muted'>Run graph to populate inspector.</div>";
    mount.appendChild(box);
    mount.appendChild(field("Show G-code preview", elToggle(!!d.showGcodePreview, v=>{ d.showGcodePreview=!!v; saveState(); markDirtyAuto(); })));
    if(d.showGcodePreview){
      const pre=document.createElement("pre");
      pre.className="gcodePreview";
      pre.style.maxHeight="180px";
      pre.style.overflow="auto";
      pre.textContent = String(node.runtime?.gcodePreview||"");
      mount.appendChild(pre);
    }
  },
  evaluate:(node, ctx)=>{
    const inpP = ctx.getInput(node.id,"path");
    const inpM = ctx.getInput(node.id,"mesh");
    const inpG = ctx.getInput(node.id,"gcode");
    const inpPr = ctx.getInput(node.id,"profile");
    const path = (inpP?.out || inpP?.path || inpP) || [];
    const mesh = (inpM?.mesh || inpM?.out || inpM) || null;
    const gcode = String(inpG?.out || inpG?.gcode || inpG || "");
    const prof = (inpPr?.profile || inpPr?.out || inpPr) || null;

    let nPts = Array.isArray(path) ? path.filter(Boolean).length : 0;
    let bounds = null;
    let layers = new Set();
    let roles = new Map();
    if(Array.isArray(path)){
      let minx=Infinity,miny=Infinity,minz=Infinity,maxx=-Infinity,maxy=-Infinity,maxz=-Infinity;
      for(const pt of path){
        if(!pt) continue;
        const x = isFinite(pt.X)? pt.X : (isFinite(pt.x)? pt.x : NaN);
        const y = isFinite(pt.Y)? pt.Y : (isFinite(pt.y)? pt.y : NaN);
        const z = isFinite(pt.z)? pt.z : NaN;
        if(isFinite(x)&&isFinite(y)&&isFinite(z)){
          minx=Math.min(minx,x); miny=Math.min(miny,y); minz=Math.min(minz,z);
          maxx=Math.max(maxx,x); maxy=Math.max(maxy,y); maxz=Math.max(maxz,z);
        }
        const layer = isFinite(pt.layer)? pt.layer : (isFinite(pt.meta?.layer)? pt.meta.layer : null);
        if(layer!=null) layers.add(layer);
        const role = String(pt.role || pt.meta?.role || (pt.travel?"travel":""));
        roles.set(role, (roles.get(role)||0)+1);
      }
      if(isFinite(minx)) bounds = {minx,miny,minz,maxx,maxy,maxz};
    }

    const roleList = Array.from(roles.entries()).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`- **${k||"(none)"}**: ${v} pts`).join("\n");
    const txt = `## Inspector\n`+
      `- **Points**: ${nPts}\n`+
      `- **Layers**: ${layers.size}\n`+
      (bounds? `- **Bounds**: X ${bounds.minx.toFixed(1)}..${bounds.maxx.toFixed(1)}, Y ${bounds.miny.toFixed(1)}..${bounds.maxy.toFixed(1)}, Z ${bounds.minz.toFixed(1)}..${bounds.maxz.toFixed(1)}\n` : "")+
      (prof? `- **Printer**: ${prof.name||"Profile"} (nozzle ${prof.nozzle||"?"} / bed ${prof.bedW||"?"}×${prof.bedD||"?"})\n` : "")+
      `\n### Roles\n${roleList || "- (none)"}`;

    node.runtime = node.runtime || {};
    node.runtime.stats = txt;
    node.runtime.gcodePreview = gcode ? gcode.slice(0, Math.max(200, Math.floor(node.data.gcodeChars||3000))) : "";
    return {};
  }
}

};
