import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Studio View',
  def: {
  title:"Studio View",
  tag:"ui",
  desc:"Docked Preview & Output as a node so the canvas can use full width.",
  inputs: [],
  outputs: [],
  defaultW: 560,
  defaultH: 780,
  initData: ()=>({}),
  render:(node, mount)=>{
    initStudioDock();
    mount.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "studioDock";
    mount.appendChild(wrap);

    if(studioDock.head) wrap.appendChild(studioDock.head);
    if(studioDock.body) wrap.appendChild(studioDock.body);
    else{
      const h = document.createElement("div");
      h.className = "hint";
      h.textContent = "Preview dock missing. (It should be created automatically.)";
      wrap.appendChild(h);
    }

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
}
};
