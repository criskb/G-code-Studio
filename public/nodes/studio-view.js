window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Studio View'] = {
  title:"Studio View",
  tag:"ui",
  desc:"Legacy combined Preview & Output node.",
  hidden:true,
  inputs: [],
  outputs: [],
  defaultW: 560,
  defaultH: 780,
  initData: ()=>({}),
  render:(node, mount)=>{
    initPreviewDock();
    initGcodeDock();
    mount.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "studioDock";
    mount.appendChild(wrap);

    if(previewDock.body) wrap.appendChild(previewDock.body);
    if(gcodeDock.body) wrap.appendChild(gcodeDock.body);
    if(!previewDock.body && !gcodeDock.body){
      const h = document.createElement("div");
      h.className = "hint";
      h.textContent = "Preview dock missing. (It should be created automatically.)";
      wrap.appendChild(h);
    }

    try{ bindPreviewControls(); }catch(_){ }
    try{ bindPreviewMeshControls(); }catch(_){ }
    try{ applyPreviewLegendColors(); }catch(_){ }

    // Ensure preview controls remain interactive inside the node
    stopGraphGestures(wrap.querySelector("#glPreview"));
    stopGraphGestures(wrap.querySelector("#mvPreview"));
    stopGraphGestures(wrap.querySelector("#previewControls"));
    stopGraphGestures(wrap.querySelector("#btnCopy"));
    stopGraphGestures(wrap.querySelector("#btnFitPreview"));
    stopGraphGestures(wrap.querySelector("#btnClearOut"));

    // Nudge a refresh so the GL canvas matches its new host size
    try{ schedulePreviewUpdate(); }catch(_){}
  },
  // make it big by default
  defaultSize: { w: 560, h: 780 }
};
