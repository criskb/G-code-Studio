window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

const meshImport = window.GCODE_STUDIO.NODE_DEFS["Mesh Import"];
if(meshImport){
  window.GCODE_STUDIO.NODE_DEFS["Mesh Import (Legacy)"] = {
    ...meshImport,
    title: "Mesh Import (Legacy)",
    hidden: true
  };
  meshImport.title = "Mesh Import";
  meshImport.hidden = false;
}
