window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Feature Paint'] = {
  title:"Feature Paint",
  tag:"modifier",
  desc:"Rule-based feature overrides: recolor roles + speed/flow multipliers (like 'per feature' tuning).",
  inputs:[{name:"in", type:"path"}],
  outputs:[{name:"out", type:"path"}],
  initData:()=>({
    rules:[
      {name:"Slow outer-ish", when:'role=="walls" || role=="outer_wall"', role:"", speedMode:"mul", speedVal:0.75, flowMode:"mul", flowVal:1.00},
      {name:"Boost top skins", when:'role=="top"', role:"", speedMode:"mul", speedVal:0.70, flowMode:"mul", flowVal:1.05},
    ],
    applyToTravel:true
  }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";
    const top = document.createElement("div");
    top.className="row";
    top.style.justifyContent="space-between";
    top.style.gap="10px";
    const left = document.createElement("div");
    left.className="hint";
    left.innerHTML = "<b style='color:var(--text)'>Feature Paint</b><div class='muted'>Rules run top→bottom. Use <code>role</code>, <code>layer</code>, <code>z</code>, <code>t</code>, <code>i</code>, <code>n</code>.</div>";
    const add = document.createElement("button");
    add.className="btn smallBtn";
    add.textContent="+ Add rule";
    add.addEventListener("click", ()=>{
      d.rules.push({name:"New rule", when:"1", role:"", speedMode:"mul", speedVal:1, flowMode:"mul", flowVal:1});
      markDirtyAuto(); saveState(); NODE_DEFS[node.type].render(node, mount);
    });
    top.appendChild(left); top.appendChild(add);
    mount.appendChild(top);

    const hdr = document.createElement("div");
    hdr.className="ruleTable";
    hdr.innerHTML = `
      <div class="hdr">Name</div>
      <div class="hdr">When (expression)</div>
      <div class="hdr">Role set</div>
      <div class="hdr">Speed</div>
      <div class="hdr">Flow</div>
      <div class="hdr"></div>
    `;
    mount.appendChild(hdr);

    const roles = [
      ["","(keep)"],
      ["walls","walls"],
      ["outer_wall","outer_wall"],
      ["inner_wall","inner_wall"],
      ["infill","infill"],
      ["bottom","bottom"],
      ["top","top"],
      ["travel","travel"]
    ];

    const modes = [["none","—"],["mul","×"],["set","="]];

    for(let idx=0; idx<d.rules.length; idx++){
      const r = d.rules[idx];
      const row = document.createElement("div");
      row.className="ruleRow";

      const grid = document.createElement("div");
      grid.className="ruleTable";

      const name = elText(r.name||"", v=>{ r.name=v; saveState(); }, "Rule name");
      const when = elText(r.when||"1", v=>{ r.when=v; markDirtyAuto(); saveState(); }, 'e.g. role=="infill" && layer>10');
      const roleSel = elSelect(String(r.role||""), roles, v=>{ r.role=v; markDirtyAuto(); saveState(); });
      const sp = document.createElement("div");
      sp.style.display="flex"; sp.style.gap="6px"; sp.style.alignItems="center";
      const spMode = elSelect(String(r.speedMode||"mul"), modes, v=>{ r.speedMode=v; markDirtyAuto(); saveState(); });
      const spVal  = elNumber(r.speedVal??1, v=>{ r.speedVal = v; markDirtyAuto(); saveState(); }, 0.01);
      sp.appendChild(spMode); sp.appendChild(spVal);

      const fl = document.createElement("div");
      fl.style.display="flex"; fl.style.gap="6px"; fl.style.alignItems="center";
      const flMode = elSelect(String(r.flowMode||"mul"), modes, v=>{ r.flowMode=v; markDirtyAuto(); saveState(); });
      const flVal  = elNumber(r.flowVal??1, v=>{ r.flowVal=v; markDirtyAuto(); saveState(); }, 0.01);
      fl.appendChild(flMode); fl.appendChild(flVal);

      const del = document.createElement("button");
      del.className="btn smallBtn";
      del.textContent="✕";
      del.addEventListener("click", ()=>{
        d.rules.splice(idx,1);
        markDirtyAuto(); saveState(); NODE_DEFS[node.type].render(node, mount);
      });

      grid.appendChild(name);
      grid.appendChild(when);
      grid.appendChild(roleSel);
      grid.appendChild(sp);
      grid.appendChild(fl);
      grid.appendChild(del);

      row.appendChild(grid);
      mount.appendChild(row);
    }

    const opt = document.createElement("div");
    opt.style.marginTop="10px";
    opt.appendChild(field("Apply to travel points", elToggle(!!d.applyToTravel, v=>{ d.applyToTravel=!!v; markDirtyAuto(); saveState(); })));
    mount.appendChild(opt);

    const ex = document.createElement("div");
    ex.className="hint";
    ex.style.marginTop="8px";
    ex.innerHTML = `
      <div style="margin-bottom:6px"><b style="color:var(--text)">Examples</b></div>
      <div>- Slow infill above layer 20: <code>role=="infill" && layer&gt;20</code></div>
      <div>- Beef up top skins near the end: <code>role=="top" &amp;&amp; t&gt;0.8</code></div>
      <div>- Only bottom: <code>role=="bottom"</code></div>
    `;
    mount.appendChild(ex);
  },
  evaluate:(node, ctx)=>{
    const inp = ctx.getInput(node.id, "in");
    const path = (inp?.out || inp?.path || inp) || null;
    if(!Array.isArray(path) || path.length===0) return { out: [] };

    const d=node.data;
    const rules = Array.isArray(d.rules)? d.rules : [];
    const compiled = [];
    for(const r of rules){
      let fn = null;
      try{ fn = compileExpr(r.when||"1"); }catch(e){ fn = null; }
      compiled.push({r, fn});
    }

    const out = path.map(pt=> pt ? ({...pt, meta: pt.meta ? ({...pt.meta}) : pt.meta}) : pt);
    const n = out.length;

    for(let i=0;i<n;i++){
      const pt = out[i];
      if(!pt) continue;
      const t = (n<=1)? 0 : i/(n-1);
      const x = isFinite(pt.x)? pt.x : (isFinite(pt.X)? pt.X : 0);
      const y = isFinite(pt.y)? pt.y : (isFinite(pt.Y)? pt.Y : 0);
      const z = isFinite(pt.z)? pt.z : 0;
      const layer = isFinite(pt.layer)? pt.layer : (isFinite(pt.meta?.layer)? pt.meta.layer : inferLayer({z}, ctx.base?.layerHeight||0.2));
      const role0 = String(pt.role || pt.meta?.role || "");
      const isTravel = !!pt.travel;
      const pmap = {...ctx.pmap, role: role0};
      if(isTravel && !d.applyToTravel) continue;

      for(const c of compiled){
        if(!c.fn) continue;
        let ok=false;
        try{ ok = !!c.fn(t,i,n,x,y,z,layer,pmap,ctx.base); }catch(e){ ok=false; }
        if(!ok) continue;

        const r=c.r;
        if(r.role){
          pt.role = r.role;
          if(pt.meta) pt.meta.role = r.role;
        }

        // speed
        const sv = Number(r.speedVal);
        if(r.speedMode==="mul" && isFinite(sv)){
          pt.speedHint = (isFinite(pt.speedHint)? pt.speedHint : (ctx.base?.printSpeed||1800)) * sv;
        }else if(r.speedMode==="set" && isFinite(sv)){
          pt.speedHint = sv;
        }

        // flow
        const fv = Number(r.flowVal);
        if(r.flowMode==="mul" && isFinite(fv)){
          pt.flowHint = (isFinite(pt.flowHint)? pt.flowHint : 1.0) * fv;
        }else if(r.flowMode==="set" && isFinite(fv)){
          pt.flowHint = fv;
        }
      }
    }
    return { out };
  }
};
