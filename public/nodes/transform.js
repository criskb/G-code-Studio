window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Transform'] = {
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
      const tx = Number(d.tx||0), ty = Number(d.ty||0);
      const out = path.map(p=>{
        const px = (isFinite(p.x) ? Number(p.x) : (isFinite(p.X) ? Number(p.X) : 0)) * s;
        const py = (isFinite(p.y) ? Number(p.y) : (isFinite(p.Y) ? Number(p.Y) : 0)) * s;
        const xr = px*ca - py*sa;
        const yr = px*sa + py*ca;
        const nx = xr + tx;
        const ny = yr + ty;
        const outPt = { ...p, x: nx, y: ny, X: nx, Y: ny };
        return outPt;
      });
      return { out };
    }
  };
