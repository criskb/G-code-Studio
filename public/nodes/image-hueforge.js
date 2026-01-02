import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Image (HueForge)',
  def: {
  title:"Image (HueForge)",
  tag:"generator",
  desc:"Load an image → generate a heightmap relief (front-lit lithophane style) + optional swap-by-layer filament plan.",
  inputs:[{name:"profile", type:"profile"}],
  outputs:[{name:"mesh", type:"mesh"},{name:"rules", type:"rules"}],
  initData:()=>({
    imgB64:"",
    maxRes:180,
    widthMM:120,
    thicknessMin:0.6,
    thicknessMax:3.2,
    invert:false,
    gamma:1.6,
    blur:0,
    // filament painting plan (single color per layer range)
    enableFilamentPlan:true,
    layerHeight:0.2,
    filamentCmd:"M600",
    palette:[
      {name:"Black", hex:"#0b0b0c"},
      {name:"Gray",  hex:"#6a6f7a"},
      {name:"White", hex:"#f2f2f2"}
    ],
    // stops = boundaries where color changes (layer index)
    stops:[ {layer:0, idx:0}, {layer:12, idx:1}, {layer:26, idx:2} ],
    autoStops:true
  }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";

    // file input
    const row=document.createElement("div");
    row.className="row";
    row.style.justifyContent="space-between";
    row.style.gap="8px";
    const file=document.createElement("input");
    file.type="file";
    file.accept="image/*";
    file.style.flex="1";
    file.className="text";
    const btn=document.createElement("button");
    btn.className="btn smallBtn";
    btn.textContent="Clear";
    btn.addEventListener("click", ()=>{
      d.imgB64=""; node.runtime = node.runtime||{}; node.runtime.mesh=null; node.runtime.imgInfo=null;
      saveState(); markDirtyAuto(); NODE_DEFS[node.type].render(node, mount);
    });
    row.appendChild(file); row.appendChild(btn);
    mount.appendChild(field("Image", row));

    const preview=document.createElement("div");
    preview.className="imgNodePreview";
    const canvas=document.createElement("canvas");
    canvas.width=420; canvas.height=260;
    preview.appendChild(canvas);
    mount.appendChild(preview);

    const info=document.createElement("div");
    info.className="hint";
    info.style.marginTop="8px";
    info.innerHTML = d.imgB64 ? "<span class='chip'><span class='swatch' style='background:var(--accent)'></span><b style='color:var(--text)'>Image loaded</b></span>" : "<span class='muted'>No image loaded.</span>";
    mount.appendChild(info);

    const drawPreview=()=>{
      const ctx=canvas.getContext("2d");
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle="rgba(255,255,255,0.04)";
      ctx.fillRect(0,0,canvas.width,canvas.height);

      const img = node.runtime?.imgObj;
      if(img){
        const fit = fitRect(img.width, img.height, canvas.width, canvas.height);
        ctx.drawImage(img, fit.x, fit.y, fit.w, fit.h);

        // overlay quantized palette preview (simple)
        if(d.enableFilamentPlan && node.runtime?.imgSmall){
          const {w,h,data} = node.runtime.imgSmall;
          const ov = document.createElement("canvas");
          ov.width=w; ov.height=h;
          const octx=ov.getContext("2d");
          const im=octx.createImageData(w,h);
          const stops = getStopsResolved(d, h, node.runtime.imgSmallLayerCount||40);
          for(let y=0;y<h;y++){
            for(let x=0;x<w;x++){
              const i=(y*w+x)*4;
              const r=data[i], g=data[i+1], b=data[i+2];
              const L = (0.2126*r + 0.7152*g + 0.0722*b)/255;
              const li = brightnessToLayerIndex(L, d);
              const pal = pickPaletteForLayer(li, stops, d.palette);
              const pr = hexToRgb(pal.hex);
              im.data[i]=pr.r; im.data[i+1]=pr.g; im.data[i+2]=pr.b; im.data[i+3]=110;
            }
          }
          octx.putImageData(im,0,0);
          const fit2 = fitRect(w,h, canvas.width, canvas.height);
          ctx.drawImage(ov, fit2.x, fit2.y, fit2.w, fit2.h);
        }
      }else{
        ctx.fillStyle="rgba(255,255,255,0.15)";
        ctx.font="12px ui-sans-serif";
        ctx.fillText("Load an image to generate a HueForge-style relief mesh.", 14, 26);
      }
    };

    // settings
    mount.appendChild(dividerTiny());
    mount.appendChild(field("Width (mm)", elNumber(d.widthMM??120, v=>{ d.widthMM=v; scheduleRebuild(node); saveState(); }, 1)));
    mount.appendChild(field("Thickness min (mm)", elNumber(d.thicknessMin??0.6, v=>{ d.thicknessMin=v; scheduleRebuild(node); saveState(); }, 0.01)));
    mount.appendChild(field("Thickness max (mm)", elNumber(d.thicknessMax??3.2, v=>{ d.thicknessMax=v; scheduleRebuild(node); saveState(); }, 0.01)));
    mount.appendChild(field("Invert", elToggle(!!d.invert, v=>{ d.invert=!!v; scheduleRebuild(node); saveState(); })));
    mount.appendChild(field("Gamma", elNumber(d.gamma??1.6, v=>{ d.gamma=v; scheduleRebuild(node); saveState(); }, 0.05)));
    mount.appendChild(field("Blur (px)", elNumber(d.blur??0, v=>{ d.blur=v; scheduleRebuild(node); saveState(); }, 1)));
    mount.appendChild(field("Max resolution (px)", elNumber(d.maxRes??180, v=>{ d.maxRes=v; scheduleRebuild(node); saveState(); }, 1)));

    // filament plan UI
    mount.appendChild(dividerTiny());
    mount.appendChild(field("Enable filament plan (swap-by-layer)", elToggle(!!d.enableFilamentPlan, v=>{ d.enableFilamentPlan=!!v; scheduleRebuild(node); saveState(); drawPreview(); })));
    if(d.enableFilamentPlan){
      mount.appendChild(field("Layer height (mm)", elNumber(d.layerHeight??0.2, v=>{ d.layerHeight=v; scheduleRebuild(node); saveState(); }, 0.01)));
      mount.appendChild(field("Filament change cmd", elText(d.filamentCmd||"M600", v=>{ d.filamentCmd=v; saveState(); }, "M600 / M0 / PAUSE")));

      const palTitle=document.createElement("div");
      palTitle.className="row";
      palTitle.style.justifyContent="space-between";
      palTitle.innerHTML = "<b style='color:var(--text)'>Palette</b><span class='muted'>Top→bottom order in stops</span>";
      const addPal=document.createElement("button");
      addPal.className="btn smallBtn";
      addPal.textContent="+";
      addPal.addEventListener("click", ()=>{
        d.palette.push({name:"Color", hex:"#00ff88"});
        scheduleRebuild(node); saveState(); NODE_DEFS[node.type].render(node, mount);
      });
      palTitle.appendChild(addPal);
      mount.appendChild(palTitle);

      for(let i=0;i<d.palette.length;i++){
        const p=d.palette[i];
        const line=document.createElement("div");
        line.className="paletteRow";
        const name=elText(p.name||"", v=>{ p.name=v; saveState(); }, "Name");
        const hex=document.createElement("input");
        hex.type="color";
        hex.value = normalizeHex(p.hex||"#00ff88");
        hex.style.width="100%";
        hex.addEventListener("input", ()=>{ p.hex=hex.value; scheduleRebuild(node); saveState(); drawPreview(); });
        const del=document.createElement("button");
        del.className="btn smallBtn";
        del.textContent="✕";
        del.addEventListener("click", ()=>{
          d.palette.splice(i,1);
          scheduleRebuild(node); saveState(); NODE_DEFS[node.type].render(node, mount);
        });
        line.appendChild(name); line.appendChild(hex); line.appendChild(del);
        mount.appendChild(line);
      }

      mount.appendChild(dividerTiny());
      const stopRow=document.createElement("div");
      stopRow.className="row";
      stopRow.style.justifyContent="space-between";
      stopRow.innerHTML = "<b style='color:var(--text)'>Stops</b><span class='muted'>layer → palette index</span>";
      const autoBtn=document.createElement("button");
      autoBtn.className="btn smallBtn";
      autoBtn.textContent="Auto";
      autoBtn.addEventListener("click", ()=>{
        d.autoStops=true;
        autoStops(d);
        scheduleRebuild(node); saveState(); NODE_DEFS[node.type].render(node, mount);
      });
      stopRow.appendChild(autoBtn);
      mount.appendChild(stopRow);

      if(!Array.isArray(d.stops)) d.stops=[];
      d.stops.forEach((s,si)=>{
        const r=document.createElement("div");
        r.className="paletteRow";
        const l=elNumber(s.layer??0, v=>{ s.layer=Math.max(0, Math.floor(v)); scheduleRebuild(node); saveState(); drawPreview(); }, 1);
        const opts = d.palette.map((p,pi)=>[String(pi), `${pi}: ${p.name||"Color"}`]);
        const sel=elSelect(String(s.idx??0), opts, v=>{ s.idx=Math.max(0, Math.floor(Number(v))); scheduleRebuild(node); saveState(); drawPreview(); });
        const del=document.createElement("button");
        del.className="btn smallBtn";
        del.textContent="✕";
        del.addEventListener("click", ()=>{
          d.stops.splice(si,1);
          scheduleRebuild(node); saveState(); NODE_DEFS[node.type].render(node, mount);
        });
        r.appendChild(l); r.appendChild(sel); r.appendChild(del);
        mount.appendChild(r);
      });

      const addStop=document.createElement("button");
      addStop.className="btn smallBtn";
      addStop.style.marginTop="8px";
      addStop.textContent="+ Add stop";
      addStop.addEventListener("click", ()=>{
        d.stops.push({layer:0, idx:0});
        scheduleRebuild(node); saveState(); NODE_DEFS[node.type].render(node, mount);
      });
      mount.appendChild(addStop);
    }

    const tip=document.createElement("div");
    tip.className="hint";
    tip.style.marginTop="10px";
    tip.innerHTML =
      "<b style='color:var(--text)'>How it works</b>"+
      "<div>This node builds a relief mesh from your image (thickness varies by brightness). Then it can output a swap-by-layer plan (single color per layer range).</div>"+
      "<div class='muted'>This is an approximation of HueForge-style filament painting; you can refine stops + palette by test prints.</div>";
    mount.appendChild(tip);

    // helpers used above
    function fitRect(w,h,W,H){
      const s=Math.min(W/w, H/h);
      const ww=w*s, hh=h*s;
      return {x:(W-ww)*0.5, y:(H-hh)*0.5, w:ww, h:hh};
    }
    function normalizeHex(h){
      const t=String(h||"").trim();
      if(/^#([0-9a-f]{6})$/i.test(t)) return t;
      return "#00ff88";
    }
    function hexToRgb(hex){
      const h=normalizeHex(hex).slice(1);
      const n=parseInt(h,16);
      return {r:(n>>16)&255, g:(n>>8)&255, b:n&255};
    }
    function brightnessToLayerIndex(L, d){
      // Map luminance to a conceptual layer index: brighter -> lower thickness -> "top layers"
      const inv = d.invert ? (1-L) : L;
      const g = Math.max(0.1, Number(d.gamma||1));
      const v = Math.pow(clamp(inv,0,1), g);
      // 0..1 -> 0..N
      const N = Math.max(1, Math.ceil((Number(d.thicknessMax||3.2)-Number(d.thicknessMin||0.6))/Math.max(0.01, Number(d.layerHeight||0.2)))+2);
      node.runtime = node.runtime||{};
      node.runtime.imgSmallLayerCount = N;
      return Math.floor(v * (N-1));
    }
    function getStopsResolved(d, h, Nlayers){
      if(d.autoStops) autoStops(d, Nlayers);
      const stops = (d.stops||[]).slice().map(s=>({layer:Math.max(0,Math.floor(s.layer||0)), idx:Math.max(0,Math.floor(s.idx||0))}))
        .sort((a,b)=>a.layer-b.layer);
      if(!stops.length) stops.push({layer:0, idx:0});
      // clamp indices
      stops.forEach(s=>{ s.idx = clamp(s.idx, 0, (d.palette?.length||1)-1); });
      return stops;
    }
    function pickPaletteForLayer(layerIdx, stops, palette){
      let cur = stops[0];
      for(const s of stops){ if(layerIdx>=s.layer) cur=s; else break; }
      return palette[clamp(cur.idx,0,(palette.length||1)-1)] || {name:"",hex:"#00ff88"};
    }
    function autoStops(d, NlayersOverride=null){
      const palN = Math.max(1, d.palette?.length||1);
      const lh = Math.max(0.01, Number(d.layerHeight||0.2));
      const thMin = Number(d.thicknessMin||0.6);
      const thMax = Number(d.thicknessMax||3.2);
      const Nlayers = NlayersOverride || Math.max(1, Math.ceil((thMax-thMin)/lh)+2);
      const seg = Math.max(1, Math.floor(Nlayers / palN));
      d.stops = [];
      for(let i=0;i<palN;i++){
        d.stops.push({layer:i*seg, idx:i});
      }
      d.autoStops = true;
    }
    function scheduleRebuild(node){
      node.runtime = node.runtime || {};
      node.runtime.needsRebuild = true;
      markDirtyAuto();
      drawPreview();
    }

    // image load
    file.addEventListener("change", ()=>{
      const f=file.files && file.files[0];
      if(!f) return;
      const reader=new FileReader();
      reader.onload=()=>{
        d.imgB64 = String(reader.result||"");
        node.runtime = node.runtime || {};
        node.runtime.needsRebuild = true;
        node.runtime.mesh = null;
        node.runtime.imgObj = null;
        node.runtime.imgSmall = null;
        saveState();
        buildFromImage(node, canvas, drawPreview);
      };
      reader.readAsDataURL(f);
    });

    // initial
    if(d.imgB64 && (!node.runtime || node.runtime.needsRebuild)){
      buildFromImage(node, canvas, drawPreview);
    }else{
      drawPreview();
    }
  },
  evaluate:(node, ctx)=>{
    // Return cached mesh if ready
    const mesh = node.runtime?.mesh || null;
    const d=node.data;
    let rules=null;
    if(d.enableFilamentPlan){
      const stops = (d.stops||[]).slice().sort((a,b)=>a.layer-b.layer);
      const changes = [];
      for(let i=0;i<stops.length;i++){
        const s=stops[i];
        const pal = d.palette?.[clamp(s.idx||0, 0, (d.palette?.length||1)-1)] || null;
        if(pal) changes.push({layer:Math.max(0,Math.floor(s.layer||0)), name:pal.name||"", hex:pal.hex||""});
      }
      rules = { filamentChanges: changes, filamentCmd: d.filamentCmd || "M600" };
    }
    return { mesh, rules };
  }
}

};
