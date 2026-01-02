window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Z Warp'] = {
  title:"Z Warp",
  tag:"modifier",
  desc:"Non-planar effect: warp Z by sine / ripple / noise based on X,Y (experimental).",
  inputs:[{name:"in", type:"path"}],
  outputs:[{name:"out", type:"path"}],
  initData:()=>({
    mode:"sine2d",
    amplitude:1.2,
    wavelength:40,
    phaseDeg:0,
    axis:"xy",
    affectTravel:false,
    clampToBed:true,
    zMin:0
  }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";
    mount.appendChild(field("Mode", elSelect(d.mode||"sine2d", [
      ["sine2d","Sine 2D (sin(x)+cos(y))"],
      ["ripple","Radial ripple"],
      ["tilt","Tilt plane (ax+by)"]
    ], v=>{ d.mode=v; markDirtyAuto(); saveState(); })));
    mount.appendChild(field("Amplitude (mm)", elNumber(d.amplitude??1.2, v=>{ d.amplitude=v; markDirtyAuto(); saveState(); }, 0.01)));
    mount.appendChild(field("Wavelength (mm)", elNumber(d.wavelength??40, v=>{ d.wavelength=v; markDirtyAuto(); saveState(); }, 0.1)));
    mount.appendChild(field("Phase (deg)", elNumber(d.phaseDeg??0, v=>{ d.phaseDeg=v; markDirtyAuto(); saveState(); }, 1)));
    mount.appendChild(field("Affect travel", elToggle(!!d.affectTravel, v=>{ d.affectTravel=!!v; markDirtyAuto(); saveState(); })));
    mount.appendChild(field("Clamp to bed", elToggle(!!d.clampToBed, v=>{ d.clampToBed=!!v; markDirtyAuto(); saveState(); })));
    mount.appendChild(field("Min Z", elNumber(d.zMin??0, v=>{ d.zMin=v; markDirtyAuto(); saveState(); }, 0.01)));
    const h=document.createElement("div");
    h.className="hint";
    h.style.marginTop="8px";
    h.innerHTML = "<b style='color:var(--text)'>Tip</b><div>Put this AFTER a planar slicer to turn planar top layers into a wavy non-planar finish. Use small amplitude (0.3–1.5mm).</div>";
    mount.appendChild(h);
  },
  evaluate:(node, ctx)=>{
    const inp = ctx.getInput(node.id, "in");
    const path = (inp?.out || inp?.path || inp) || null;
    if(!Array.isArray(path) || path.length===0) return { out: [] };

    const d=node.data;
    const A = Number(d.amplitude||0);
    const L = Math.max(1e-6, Number(d.wavelength||40));
    const ph = (Number(d.phaseDeg||0) * Math.PI/180);
    const k = (2*Math.PI)/L;

    const out = path.map(pt=>{
      if(!pt) return pt;
      const isTravel = !!pt.travel;
      if(isTravel && !d.affectTravel) return pt;
      const x = isFinite(pt.X)? pt.X : (isFinite(pt.x)? pt.x : 0);
      const y = isFinite(pt.Y)? pt.Y : (isFinite(pt.y)? pt.y : 0);
      const z0 = isFinite(pt.z)? pt.z : 0;

      let dz=0;
      if(d.mode==="sine2d"){
        dz = A*(Math.sin(k*x + ph) + Math.cos(k*y + ph))*0.5;
      }else if(d.mode==="ripple"){
        const r = Math.hypot(x, y);
        dz = A*Math.sin(k*r + ph);
      }else if(d.mode==="tilt"){
        dz = A*((x+y)/L);
      }
      let z = z0 + dz;
      if(d.clampToBed){
        const zmin = Number(d.zMin||0);
        if(z < zmin) z = zmin;
      }
      return {...pt, z};
    });

    return { out };
  }
};
