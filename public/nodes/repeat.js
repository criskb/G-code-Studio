window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Repeat'] = {
    title:"Repeat", tag:"modifier",
    desc:"Duplicate a path into an nx×ny grid.",
    inputs:[{name:"in", type:"path"}],
    outputs:[{name:"out", type:"path"}],
    initData: ()=>({nx:1, ny:1, dx:70, dy:70, center:true}),
    render: (node, mount)=>{
      const d=node.data;
      mount.innerHTML="";
      mount.appendChild(grid2([
        field("nx", elNumber(d.nx, v=>{ d.nx=Math.max(1, Math.floor(v||1)); markDirtyAuto(); saveState(); }, 1)),
        field("ny", elNumber(d.ny, v=>{ d.ny=Math.max(1, Math.floor(v||1)); markDirtyAuto(); saveState(); }, 1)),
      ]));
      mount.appendChild(grid2([
        field("dx (mm)", elNumber(d.dx, v=>{ d.dx=v||0; markDirtyAuto(); saveState(); }, 0.1)),
        field("dy (mm)", elNumber(d.dy, v=>{ d.dy=v||0; markDirtyAuto(); saveState(); }, 0.1)),
      ]));
      mount.appendChild(field("Center", elSelect(String(d.center), [["true","Yes"],["false","No"]], v=>{ d.center=(v==="true"); markDirtyAuto(); saveState(); })));
    },
    evaluate:(node, ctx)=>{
      const inp = ctx.getInput(node.id, "in");
      const path = (inp?.out || inp?.path || inp || []);
      const d=node.data;
      if((d.nx<=1 && d.ny<=1)) return { out: path.slice() };
      const out=[];
      for(let iy=0; iy<d.ny; iy++){
        for(let ix=0; ix<d.nx; ix++){
          const ox = d.center ? (ix - (d.nx-1)/2)*d.dx : ix*d.dx;
          const oy = d.center ? (iy - (d.ny-1)/2)*d.dy : iy*d.dy;
          for(const p of path){
            out.push({...p, x:p.x+ox, y:p.y+oy});
          }
        }
      }
      return { out };
    }
  };
