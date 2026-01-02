window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Procedural Path Generator'] = {
  title:"Procedural Path Generator",
  tag:"path",
  desc:"Generate a toolpath from parametric formulas without a mesh.",
  inputs: [],
  outputs: [{name:"path", type:"path"}],
  initData:()=>({
    xExpr:"A*cos(2*pi*t)",
    yExpr:"A*sin(2*pi*t)",
    zExpr:"0",
    steps:600,
    layers:1,
    layerHeight:0.2,
    mode:"layered",
    travelPerLayer:true
  }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";
    mount.appendChild(grid2([
      field("x(t)", elInput(d.xExpr||"", v=>{ d.xExpr=v; markDirtyAuto(); saveState(); })),
      field("y(t)", elInput(d.yExpr||"", v=>{ d.yExpr=v; markDirtyAuto(); saveState(); }))
    ]));
    mount.appendChild(grid2([
      field("z(t)", elInput(d.zExpr||"0", v=>{ d.zExpr=v; markDirtyAuto(); saveState(); })),
      field("Steps", elNumber(d.steps||600, v=>{ d.steps=Math.max(2, Math.floor(v||2)); markDirtyAuto(); saveState(); }, 1))
    ]));
    mount.appendChild(grid2([
      field("Layers", elNumber(d.layers||1, v=>{ d.layers=Math.max(1, Math.floor(v||1)); markDirtyAuto(); saveState(); }, 1)),
      field("Layer height", elNumber(d.layerHeight||0.2, v=>{ d.layerHeight=Math.max(0.01, Number(v||0.2)); markDirtyAuto(); saveState(); }, 0.01))
    ]));
    mount.appendChild(grid2([
      field("Mode", elSelect(d.mode||"layered", [["layered","Layered"],["helical","Helical"]], v=>{ d.mode=v; markDirtyAuto(); saveState(); })),
      field("Travel per layer", elToggle(!!d.travelPerLayer, v=>{ d.travelPerLayer=!!v; markDirtyAuto(); saveState(); }))
    ]));
    const hint = document.createElement("div");
    hint.className="hint";
    hint.innerHTML = "Define paths with <code>t</code> in [0..1]. Vars: <code>t</code>, <code>i</code>, <code>n</code>, <code>layer</code>.";
    mount.appendChild(hint);
  },
  evaluate:(node, ctx)=>{
    const d=node.data;
    const steps = Math.max(2, Math.floor(d.steps||600));
    const layers = Math.max(1, Math.floor(d.layers||1));
    const lh = Math.max(0.01, Number(d.layerHeight||0.2));
    const fx = compileExpr(d.xExpr||"0");
    const fy = compileExpr(d.yExpr||"0");
    const fz = compileExpr(d.zExpr||"0");
    const base = baseFromProfile(ctx.defaultProfile || defaultPrinterFallback());
    const pts=[];
    if(d.mode === "helical"){
      for(let i=0;i<steps;i++){
        const t = i/(steps-1);
        const x = Number(fx(t,i,steps,0,0,0,0,ctx.pmap,base));
        const y = Number(fy(t,i,steps,0,0,0,0,ctx.pmap,base));
        const z = Number(fz(t,i,steps,x,y,0,0,ctx.pmap,base)) + t*layers*lh;
        pts.push({x,y,z, travel:(i===0), meta:{layerHeight: lh}});
      }
      return { path: pts };
    }
    for(let L=0; L<layers; L++){
      for(let i=0;i<steps;i++){
        const t = i/(steps-1);
        const x = Number(fx(t,i,steps,0,0,0,L,ctx.pmap,base));
        const y = Number(fy(t,i,steps,0,0,0,L,ctx.pmap,base));
        const z = Number(fz(t,i,steps,x,y,L*lh,L,ctx.pmap,base)) + L*lh;
        pts.push({x,y,z, layer:L, travel:(d.travelPerLayer && i===0), meta:{layerHeight: lh}});
      }
    }
    return { path: pts };
  }
};
