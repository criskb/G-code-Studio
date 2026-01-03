window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Preview'] = {
  title:"Preview",
  tag:"ui",
  desc:"Docked preview for toolpath + mesh rendering.",
  inputs: [
    {name:"mesh", type:"mesh"},
    {name:"toolpath", type:"toolpath"},
    {name:"path", type:"path"},
    {name:"preview", type:"preview"}
  ],
  outputs: [{name:"preview", type:"preview"}],
  defaultW: 560,
  defaultH: 720,
  initData: ()=>({}),
  render:(node, mount)=>{
    initPreviewDock();
    mount.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "previewDock";
    mount.appendChild(wrap);

    if(previewDock.body) wrap.appendChild(previewDock.body);
    else{
      const h = document.createElement("div");
      h.className = "hint";
      h.textContent = "Preview dock missing. (It should be created automatically.)";
      wrap.appendChild(h);
    }

    try{ bindPreviewControls(); }catch(_){ }
    try{ bindPreviewCanvasControls(); }catch(_){ }
    try{ bindPreviewMeshControls(); }catch(_){ }
    try{ applyPreviewLegendColors(); }catch(_){ }

    stopGraphGestures(wrap.querySelector("#glPreview"));
    stopGraphGestures(wrap.querySelector("#mvPreview"));
    stopGraphGestures(wrap.querySelector("#previewControls"));
    stopGraphGestures(wrap.querySelector("#btnFitPreview"));

    try{ schedulePreviewUpdate(); }catch(_){ }
  },
  evaluate:(node, ctx)=>{
    const meshIn = ctx.getInput(node.id, "mesh");
    const toolpathIn = ctx.getInput(node.id, "toolpath");
    const pathIn = ctx.getInput(node.id, "path");
    const previewIn = ctx.getInput(node.id, "preview");
    const mesh = meshIn?.mesh || meshIn?.out || meshIn || null;
    const toolpath = toolpathIn?.toolpath || toolpathIn?.out || toolpathIn || null;
    const pathRaw = pathIn?.path || pathIn?.out || pathIn || null;
    const path = Array.isArray(pathRaw) ? pathRaw.filter(Boolean) : [];
    const base = (previewIn && typeof previewIn === "object") ? {...previewIn} : {};
    if(mesh) base.mesh = mesh;
    if(toolpath) base.toolpath = toolpath;
    if(pathIn) base.path = path;
    const hasPayload = Object.keys(base).length > 0;
    return { preview: hasPayload ? base : null };
  },
  defaultSize: { w: 560, h: 720 }
};
