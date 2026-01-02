window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Preview'] = {
  title:"Preview",
  tag:"ui",
  desc:"Docked preview for toolpath + mesh rendering.",
  inputs: [],
  outputs: [],
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
  defaultSize: { w: 560, h: 720 }
};
