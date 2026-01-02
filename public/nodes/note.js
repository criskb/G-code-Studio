window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Note'] = {
  title:"Note",
  uiSchema:SCHEMA_NOTE,
  desc:"Demo instructions / documentation. Does not affect the graph.",
  tag:"docs",
  inputs:[],
  outputs:[],
  initData:()=>({
    title:"Demo note",
    compact:false,
    text:"Use this node to describe how the current demo is wired.\n\nTip: In Preview, use Role + Layer filters to inspect walls/infill/top/bottom.\n"
  }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";
    if(!d.compact && d.title){
      const title=document.createElement("div");
      title.className="noteTitle";
      title.textContent = d.title;
      mount.appendChild(title);
    }
    const ta = elTextarea(d.text || "", v=>{ d.text = v; saveState(); });
    ta.className = "textArea";
    for(const ev of ["pointerdown","mousedown","click"]){ ta.addEventListener(ev, e=>e.stopPropagation()); }
    ta.addEventListener("input", ()=>{ markDirtyAuto(); });
    mount.appendChild(ta);
  },
  evaluate:(node, ctx)=>({})
};
