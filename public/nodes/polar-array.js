window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Polar Array'] = {
  title:"Polar Array",
  tag:"modifier",
  desc:"Replicate a path around a center by polar array.",
  inputs:[{name:"in", type:"path"}],
  outputs:[{name:"out", type:"path"}],
  initData:()=>({
    copies:6,
    centerX:0,
    centerY:0,
    rotateDeg:0,
    merge:false
  }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";
    mount.appendChild(field("Copies", elNumber(d.copies??6, v=>{ d.copies=v; markDirtyAuto(); saveState(); }, 1)));
    mount.appendChild(field("Center X", elNumber(d.centerX??0, v=>{ d.centerX=v; markDirtyAuto(); saveState(); }, 0.1)));
    mount.appendChild(field("Center Y", elNumber(d.centerY??0, v=>{ d.centerY=v; markDirtyAuto(); saveState(); }, 0.1)));
    mount.appendChild(field("Rotation (deg)", elNumber(d.rotateDeg??0, v=>{ d.rotateDeg=v; markDirtyAuto(); saveState(); }, 1)));
    mount.appendChild(field("Merge (no travels)", elToggle(!!d.merge, v=>{ d.merge=!!v; markDirtyAuto(); saveState(); })));
  },
  evaluate:(node, ctx)=>{
    const inp = ctx.getInput(node.id, "in");
    const path = (inp?.out || inp?.path || inp) || [];
    if(!Array.isArray(path) || path.length===0) return { out: [] };

    const d=node.data;
    const n = Math.max(1, Math.floor(Number(d.copies||1)));
    const cx = Number(d.centerX||0), cy=Number(d.centerY||0);
    const baseRot = (Number(d.rotateDeg||0) * Math.PI/180);

    const out=[];
    for(let k=0;k<n;k++){
      const a = baseRot + (k/n)*Math.PI*2;
      const ca=Math.cos(a), sa=Math.sin(a);
      for(let i=0;i<path.length;i++){
        const p=path[i];
        if(!p) continue;
        const x = (isFinite(p.X)? p.X : (p.x??0));
        const y = (isFinite(p.Y)? p.Y : (p.y??0));
        const dx=x-cx, dy=y-cy;
        const X=cx + dx*ca - dy*sa;
        const Y=cy + dx*sa + dy*ca;
        const travel = (!!p.travel) && !d.merge;
        out.push({...p, X, Y, travel});
      }
    }
    return { out };
  }
};
