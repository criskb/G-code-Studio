window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

const controlExperimentNode = window.GCODE_STUDIO.NODE_DEFS["Control Experiment"];
if(controlExperimentNode){
  window.GCODE_STUDIO.NODE_DEFS["Control Experiement"] = {
    ...controlExperimentNode,
    title: "Control Experiment",
    hidden: true
  };
}
