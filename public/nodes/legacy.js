window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
const meshPrimitive = window.GCODE_STUDIO.NODE_DEFS["Mesh Primitive"];
if(meshPrimitive){
  window.GCODE_STUDIO.NODE_DEFS["Mesh Primitive (Legacy)"] = {
    ...meshPrimitive,
    title: "Mesh Primitive (Legacy)",
    hidden: true
  };
  meshPrimitive.title = "Mesh Primitive";
  meshPrimitive.hidden = false;
}

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
