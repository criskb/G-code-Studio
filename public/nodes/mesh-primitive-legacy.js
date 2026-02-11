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
