window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

const slicingEngineNode = window.GCODE_STUDIO.NODE_DEFS["Slicing Engine"];
if(slicingEngineNode){
  window.GCODE_STUDIO.NODE_DEFS["Slicer"] = {
    ...slicingEngineNode,
    title: "Slicer",
    hidden: true
  };
}
