window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Calibration Tower'] = {
  title:"Calibration Tower",
  tag:"rules",
  desc:"Auto-generate step changes (temp/flow/speed) by height or layer (tower testing).",
  inputs:[{name:"profile", type:"profile"}],
  outputs:[{name:"rules", type:"rules"}],
  initData:()=>({
    by:"z",
    target:"temp",
    start:220,
    step:-5,
    every:5,      // mm or layers
    min:180,
    max:260
  }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";
    mount.appendChild(field("Axis", elSelect(d.by||"z", [["z","Z height (mm)"],["layer","Layer index"]], v=>{ d.by=v; markDirtyAuto(); saveState(); })));
    mount.appendChild(field("Target", elSelect(d.target||"temp", [["temp","Nozzle temp (°C)"],["flow","Flow multiplier"],["speed","Speed multiplier"],["fan","Fan %"]], v=>{ d.target=v; markDirtyAuto(); saveState(); })));
    mount.appendChild(field("Start", elNumber(d.start??220, v=>{ d.start=v; markDirtyAuto(); saveState(); }, 0.01)));
    mount.appendChild(field("Step", elNumber(d.step??-5, v=>{ d.step=v; markDirtyAuto(); saveState(); }, 0.01)));
    mount.appendChild(field("Every", elNumber(d.every??5, v=>{ d.every=v; markDirtyAuto(); saveState(); }, 0.1)));
    mount.appendChild(field("Clamp min", elNumber(d.min??0, v=>{ d.min=v; markDirtyAuto(); saveState(); }, 0.01)));
    mount.appendChild(field("Clamp max", elNumber(d.max??999, v=>{ d.max=v; markDirtyAuto(); saveState(); }, 0.01)));

    const h=document.createElement("div");
    h.className="hint";
    h.style.marginTop="8px";
    h.innerHTML = "<b style='color:var(--text)'>Use</b><div>Connect to Export → rules. Pair with a tall primitive (tower). For temp towers: by Z, every 5mm, step -5°C.</div>";
    mount.appendChild(h);
  },
  evaluate:(node, ctx)=>{
    const d=node.data;
    const by = d.by || "z";
    const every = Math.max(1e-6, Number(d.every||5));
    const start = Number(d.start||0);
    const step = Number(d.step||0);
    const mn = Number(d.min ?? -1e9);
    const mx = Number(d.max ??  1e9);
    const tgt = d.target || "temp";
    const base = ctx.base || baseFromProfile(ctx.defaultProfile || {});

    const stepVal = (ax)=>{
      const idx = Math.floor(ax / every);
      return clamp(start + idx*step, mn, mx);
    };

    const rules = { enableSpeed:false, enableFlow:false, enableTemp:false, enableFan:false };
    if(tgt==="temp"){
      rules.enableTemp=true;
      rules.tempFn = (t,i,n,x,y,z,layer)=> stepVal(by==="z"? z : layer);
    }else if(tgt==="fan"){
      rules.enableFan=true;
      rules.fanFn = (t,i,n,x,y,z,layer)=> stepVal(by==="z"? z : layer);
    }else if(tgt==="flow"){
      rules.enableFlow=true;
      rules.flowFn = (t,i,n,x,y,z,layer)=> stepVal(by==="z"? z : layer);
    }else if(tgt==="speed"){
      rules.enableSpeed=true;
      rules.speedFn = (t,i,n,x,y,z,layer)=> (base.printSpeed||1800) * stepVal(by==="z"? z : layer);
    }
    return { rules };
  }
};
