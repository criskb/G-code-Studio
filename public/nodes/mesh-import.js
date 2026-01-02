window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Mesh Import'] = {
  title:"Mesh Import", tag:"mesh",
  desc:"Load an STL (binary/ASCII). Outputs a mesh, and optionally a surface raster path.",
  inputs: [],
  outputs: [{name:"mesh", type:"mesh"}, {name:"path", type:"path"}],
  initData: ()=>({
      // Surface toolpath output
      surfacePathEnabled:true,
      pattern:"raster",
      spacing: 1.0,
      step: 0.6,
      angleDeg: 0,
      margin: 0,
      zOffset: 0,
      serpentine:true,
      maxPoints: 160000,

    name:"",
    b64:"",
    keep:false,
    centerXY:true,
    zeroZMin:true,
    scale: 1,
    rxDeg:0, ryDeg:0, rzDeg:0,
    tx:0, ty:0, tz:0,
    cellSize: 10,
    _triCount: 0,
    _warn: "",
  }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";

    const file = document.createElement("input");
    file.type="file";
    file.accept=".stl,model/stl,application/sla";
    file.style.width="100%";
    for(const ev of ["pointerdown","mousedown","click"]){
      file.addEventListener(ev, e=>e.stopPropagation());
    }
    file.addEventListener("change", async ()=>{
      const f = file.files && file.files[0];
      if(!f) return;
      try{
        const buf = await f.arrayBuffer();
        const parsed = parseSTL(buf);
        meshRuntimeCache.set(node.id, { mesh: parsed, name:f.name, bytesLen: buf.byteLength });
        d.name = f.name;
        d._triCount = parsed.triCount|0;
        d._warn = (parsed.triCount>80000) ? "Large mesh: wireframe is decimated for preview." : "";
        if(d.keep){
          if(buf.byteLength <= 2_500_000){
            d.b64 = b64FromArrayBuffer(buf);
          } else {
            d.b64 = "";
            d._warn = "Mesh too large to store in project. It will persist only in memory this session.";
          }
        } else {
          d.b64 = "";
        }
        rerenderNode(node.id);
        markDirtyAuto();
        saveState();
        schedulePreviewUpdate();
      }catch(err){
        toast("STL error: " + (err.message||String(err)));
      }
    });
    mount.appendChild(field("STL file", file));

    mount.appendChild(grid2([
      field("Keep in project", elSelect(String(d.keep), [["false","No (memory only)"],["true","Yes (if small)"]], v=>{ d.keep=(v==="true"); markDirtyAuto(); saveState(); })),
      field("Index cell (mm)", elNumber(d.cellSize, v=>{ d.cellSize=Math.max(1, Number(v||10)); markDirtyAuto(); saveState(); }, 1)),
    ]));

    mount.appendChild(grid2([
      field("Center XY", elSelect(String(d.centerXY), [["true","Yes"],["false","No"]], v=>{ d.centerXY=(v==="true"); markDirtyAuto(); saveState(); schedulePreviewUpdate(); })),
      field("Zero Z-min", elSelect(String(d.zeroZMin), [["true","Yes"],["false","No"]], v=>{ d.zeroZMin=(v==="true"); markDirtyAuto(); saveState(); schedulePreviewUpdate(); })),
    ]));

    mount.appendChild(grid2([
      field("Scale", elNumber(d.scale, v=>{ d.scale=Number(v||1); markDirtyAuto(); saveState(); schedulePreviewUpdate(); }, 0.01)),
      field("Rotate Z°", elNumber(d.rzDeg, v=>{ d.rzDeg=Number(v||0); markDirtyAuto(); saveState(); schedulePreviewUpdate(); }, 1)),
    ]));
    mount.appendChild(grid2([
      field("Rotate X°", elNumber(d.rxDeg, v=>{ d.rxDeg=Number(v||0); markDirtyAuto(); saveState(); schedulePreviewUpdate(); }, 1)),
      field("Rotate Y°", elNumber(d.ryDeg, v=>{ d.ryDeg=Number(v||0); markDirtyAuto(); saveState(); schedulePreviewUpdate(); }, 1)),
    ]));
    mount.appendChild(grid2([
      field("Translate X", elNumber(d.tx, v=>{ d.tx=Number(v||0); markDirtyAuto(); saveState(); schedulePreviewUpdate(); }, 0.1)),
      field("Translate Y", elNumber(d.ty, v=>{ d.ty=Number(v||0); markDirtyAuto(); saveState(); schedulePreviewUpdate(); }, 0.1)),
    ]));
    mount.appendChild(field("Translate Z", elNumber(d.tz, v=>{ d.tz=Number(v||0); markDirtyAuto(); saveState(); schedulePreviewUpdate(); }, 0.1)));

    const info = document.createElement("div");
    info.className="hint";
    info.innerHTML = d.name
      ? `Loaded: <b>${escapeHTML(d.name)}</b> • Triangles: <b>${d._triCount||0}</b>${d._warn?`<br><span style="opacity:.8">${escapeHTML(d._warn)}</span>`:""}`
      : "Load an STL to preview it and use it for projection (non-planar / surface mapping).";
    mount.appendChild(info);

    const box = document.createElement("div");
    box.style.height = "160px";
    box.style.borderRadius = "12px";
    box.style.border = "1px solid var(--stroke)";
    box.style.background = "rgba(0,0,0,0.18)";
    box.style.overflow = "hidden";
    const canvas = document.createElement("canvas");
    canvas.width = 520; canvas.height = 260;
    canvas.style.width="100%";
    canvas.style.height="100%";
    box.appendChild(canvas);
    mount.appendChild(box);

    const token = (node._meshPrevTok = (node._meshPrevTok||0)+1);
    function loop(t){
      if(node._meshPrevTok !== token) return;
      const runtime = meshRuntimeCache.get(node.id);
      let mesh = runtime?.mesh || null;
      if(!mesh && d.b64){
        try{ mesh = parseSTL(arrayBufferFromB64(d.b64)); }catch(_){ mesh=null; }
      }
      if(mesh){
        let m = mesh;
        m = centerMesh(m, d.centerXY, d.zeroZMin);
        m = applyMeshTransform(m, d);
        let overlayPath = null;
        if(d.surfacePathEnabled){
          try{
            if(!m.index || m.index.cs !== Number(d.cellSize||10)) buildMeshIndex(m, d.cellSize||10);
            overlayPath = surfaceRasterPath(m, {...d, maxPoints: 4500, step: Math.max(0.25, Number(d.step||0.6)*2) }, 0.2, 4500);
          }catch(_){ overlayPath=null; }
        }
        drawWireframe2D(canvas, m.tris, m.bounds, t*0.001, overlayPath);
      } else {
        const ctx=canvas.getContext("2d");
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.font = "16px ui-sans-serif, system-ui";
        ctx.fillText("No mesh", 18, 34);
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  },
  evaluate:(node, ctx)=>{
    const d=node.data;
    let mesh = meshRuntimeCache.get(node.id)?.mesh || null;
    if(!mesh && d.b64){
      try{ mesh = parseSTL(arrayBufferFromB64(d.b64)); }
      catch(e){ throw new Error("Mesh Import: failed to decode persisted STL. Re-upload."); }
    }
    if(!mesh) return { mesh:null, path:[] };
    mesh = centerMesh(mesh, d.centerXY, d.zeroZMin);
    mesh = applyMeshTransform(mesh, d);
    buildMeshIndex(mesh, d.cellSize||10);
    let path = null;
    if(d.surfacePathEnabled){
      path = surfaceRasterPath(mesh, d, (ctx.base?.layerHeight||0.2));
    }
    return { mesh, path };
  }
};
