window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['G-code Post'] = {
  title:"G-code Post",
  tag:"output",
  desc:"Post-process G-code: prepend/append + find/replace (regex optional).",
  inputs:[{name:"in", type:"gcode"}],
  outputs:[{name:"out", type:"gcode"}],
  initData:()=>({
    prepend:"; --- POST: prepend ---\n",
    append:"\n; --- POST: append ---\n",
    rules:[
      {find:"; G-code Studio export", repl:"; G-code Studio export (post-processed)", regex:false, enabled:true},
      {find:"M104 S", repl:"M104 S", regex:false, enabled:true}
    ]
  }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";
    mount.appendChild(field("Prepend", elTextarea(d.prepend||"", v=>{ d.prepend=v; markDirtyAuto(); saveState(); }, 4)));
    mount.appendChild(field("Append", elTextarea(d.append||"", v=>{ d.append=v; markDirtyAuto(); saveState(); }, 4)));
    mount.appendChild(dividerTiny());

    const title=document.createElement("div");
    title.className="row";
    title.style.justifyContent="space-between";
    title.innerHTML = "<b style='color:var(--text)'>Find / Replace</b>";
    const add=document.createElement("button");
    add.className="btn smallBtn";
    add.textContent="+";
    add.addEventListener("click", ()=>{
      d.rules.push({find:"", repl:"", regex:false, enabled:true});
      markDirtyAuto(); saveState(); NODE_DEFS[node.type].render(node, mount);
    });
    title.appendChild(add);
    mount.appendChild(title);

    for(let i=0;i<d.rules.length;i++){
      const r=d.rules[i];
      const box=document.createElement("div");
      box.className="ruleRow";
      const grid=document.createElement("div");
      grid.style.display="grid";
      grid.style.gridTemplateColumns="1fr 1fr";
      grid.style.gap="8px";
      grid.appendChild(field("Find", elText(r.find||"", v=>{ r.find=v; markDirtyAuto(); saveState(); }, "text / regex")));
      grid.appendChild(field("Replace", elText(r.repl||"", v=>{ r.repl=v; markDirtyAuto(); saveState(); }, "replacement")));
      box.appendChild(grid);

      const row=document.createElement("div");
      row.className="row";
      row.style.justifyContent="space-between";
      row.style.marginTop="6px";
      row.appendChild(field("Enabled", elToggle(!!r.enabled, v=>{ r.enabled=!!v; markDirtyAuto(); saveState(); })));
      row.appendChild(field("Regex", elToggle(!!r.regex, v=>{ r.regex=!!v; markDirtyAuto(); saveState(); })));
      const del=document.createElement("button");
      del.className="btn smallBtn";
      del.textContent="✕";
      del.addEventListener("click", ()=>{
        d.rules.splice(i,1);
        markDirtyAuto(); saveState(); NODE_DEFS[node.type].render(node, mount);
      });
      row.appendChild(del);
      box.appendChild(row);
      mount.appendChild(box);
    }
  },
  evaluate:(node, ctx)=>{
    const inp = ctx.getInput(node.id, "in");
    const g = String(inp?.out || inp?.gcode || inp || "");
    if(!g) return { out:"" };
    const d=node.data;
    let txt = g;
    for(const r of (d.rules||[])){
      if(!r?.enabled) continue;
      const f = String(r.find||"");
      const rep = String(r.repl||"");
      if(!f) continue;
      try{
        if(r.regex){
          const re = new RegExp(f, "g");
          txt = txt.replace(re, rep);
        }else{
          txt = txt.split(f).join(rep);
        }
      }catch(_){}
    }
    txt = String(d.prepend||"") + txt + String(d.append||"");
    return { out: txt };
  }
};
