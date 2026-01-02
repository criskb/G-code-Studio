import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Layer Schedule',
  def: {
  title:"Layer Schedule",
  tag:"rules",
  desc:"Generate Rules from simple schedules (speed/flow/temp/fan by layer or height).",
  inputs:[{name:"profile", type:"profile"}],
  outputs:[{name:"rules", type:"rules"}],
  initData:()=>({
    by:"layer",
    speed: { enabled:true, points:[ {x:0,y:1.0}, {x:40,y:1.0} ] },  // multiplier
    flow:  { enabled:false, points:[ {x:0,y:1.0}, {x:40,y:1.0} ] }, // multiplier
    temp:  { enabled:false, points:[ {x:0,y:210}, {x:40,y:210} ] }, // °C
    fan:   { enabled:false, points:[ {x:0,y:0}, {x:5,y:100}, {x:40,y:100} ] }, // %
    clampSpeedMin: 1,
    clampSpeedMax: 60000
  }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";
    mount.appendChild(field("Schedule axis", elSelect(d.by||"layer", [["layer","Layer index"],["z","Z height (mm)"]], v=>{ d.by=v; markDirtyAuto(); saveState(); })));

    function ptsEditor(label, obj, yLabel){
      const wrap=document.createElement("div");
      wrap.className="ruleRow";
      const head=document.createElement("div");
      head.className="row";
      head.style.justifyContent="space-between";
      const left=document.createElement("div");
      left.innerHTML = `<b style="color:var(--text)">${label}</b> <span class="muted">${yLabel}</span>`;
      const en=document.createElement("div");
      en.appendChild(field("Enabled", elToggle(!!obj.enabled, v=>{ obj.enabled=!!v; markDirtyAuto(); saveState(); })));
      head.appendChild(left); head.appendChild(en);
      wrap.appendChild(head);

      const grid=document.createElement("div");
      grid.style.display="grid";
      grid.style.gridTemplateColumns="1fr 1fr 32px";
      grid.style.gap="8px";
      grid.style.alignItems="center";
      (obj.points||[]).forEach((p,i)=>{
        const x = elNumber(p.x??0, v=>{ p.x=v; markDirtyAuto(); saveState(); }, 1);
        const y = elNumber(p.y??0, v=>{ p.y=v; markDirtyAuto(); saveState(); }, 0.01);
        const del=document.createElement("button");
        del.className="btn smallBtn";
        del.textContent="✕";
        del.addEventListener("click", ()=>{
          obj.points.splice(i,1);
          markDirtyAuto(); saveState(); NODE_DEFS[node.type].render(node, mount);
        });
        grid.appendChild(x); grid.appendChild(y); grid.appendChild(del);
      });
      wrap.appendChild(grid);

      const add=document.createElement("button");
      add.className="btn smallBtn";
      add.style.marginTop="8px";
      add.textContent="+ Add point";
      add.addEventListener("click", ()=>{
        obj.points.push({x:(obj.points?.length? (obj.points[obj.points.length-1].x+10):0), y:(obj.points?.length? obj.points[obj.points.length-1].y:1)});
        markDirtyAuto(); saveState(); NODE_DEFS[node.type].render(node, mount);
      });
      wrap.appendChild(add);
      return wrap;
    }

    mount.appendChild(ptsEditor("Speed", d.speed, "(multiplier)"));
    mount.appendChild(ptsEditor("Flow", d.flow, "(multiplier)"));
    mount.appendChild(ptsEditor("Temp", d.temp, "(°C)"));
    mount.appendChild(ptsEditor("Fan", d.fan, "(%)"));

    const ex=document.createElement("div");
    ex.className="hint";
    ex.style.marginTop="8px";
    ex.innerHTML = "<b style='color:var(--text)'>Tip</b><div>Connect this to Export → rules. You can also stack with a Rules node (Feature Paint etc.) by adding another modifier in between.</div>";
    mount.appendChild(ex);
  },
  evaluate:(node, ctx)=>{
    const d=node.data;

    const interp = (pts, x)=>{
      if(!pts || pts.length===0) return 0;
      const a = pts.slice().sort((p,q)=>p.x-q.x);
      if(x <= a[0].x) return a[0].y;
      if(x >= a[a.length-1].x) return a[a.length-1].y;
      for(let i=1;i<a.length;i++){
        if(x <= a[i].x){
          const p0=a[i-1], p1=a[i];
          const t=(x-p0.x)/Math.max(1e-9,(p1.x-p0.x));
          return p0.y + (p1.y-p0.y)*t;
        }
      }
      return a[a.length-1].y;
    };

    const by = d.by || "layer";
    const base = ctx.base || baseFromProfile(ctx.defaultProfile || {});
    const speedFn = (t,i,n,x,y,z,layer,role)=> {
      const ax = (by==="z") ? z : layer;
      const mul = d.speed?.enabled ? Number(interp(d.speed.points, ax)) : 1.0;
      const v = Number((isFinite(base.printSpeed)? base.printSpeed : 1800) * mul);
      return clamp(v, Number(d.clampSpeedMin||1), Number(d.clampSpeedMax||60000));
    };
    const flowFn = (t,i,n,x,y,z,layer,role)=> {
      const ax = (by==="z") ? z : layer;
      const mul = d.flow?.enabled ? Number(interp(d.flow.points, ax)) : 1.0;
      return clamp(mul, 0, 20);
    };
    const tempFn = (t,i,n,x,y,z,layer,role)=> {
      const ax = (by==="z") ? z : layer;
      const v = d.temp?.enabled ? Number(interp(d.temp.points, ax)) : Number(base.tempNozzle||210);
      return clamp(v, 0, 400);
    };
    const fanFn = (t,i,n,x,y,z,layer,role)=> {
      const ax = (by==="z") ? z : layer;
      const v = d.fan?.enabled ? Number(interp(d.fan.points, ax)) : Number(base.fan||0);
      return clamp(v, 0, 100);
    };

    return {
      rules:{
        enableSpeed: !!d.speed?.enabled,
        enableFlow:  !!d.flow?.enabled,
        enableTemp:  !!d.temp?.enabled,
        enableFan:   !!d.fan?.enabled,
        speedFn, flowFn, tempFn, fanFn
      }
    };
  }
}
};
