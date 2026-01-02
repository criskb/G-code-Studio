const register = window.GCODE_STUDIO?.registerNode;
if(!register){
  throw new Error("Node registry not available");
}

const modules = [
  () => import("./calibration-tower.js"),
  () => import("./export.js"),
  () => import("./feature-paint.js"),
  () => import("./fullcontrol-model.js"),
  () => import("./g-code-post.js"),
  () => import("./image-hueforge.js"),
  () => import("./import-mesh.js"),
  () => import("./inspector.js"),
  () => import("./layer-schedule.js"),
  () => import("./mesh-import.js"),
  () => import("./mesh-primitive.js"),
  () => import("./mesh-primitive-legacy.js"),
  () => import("./non-planar.js"),
  () => import("./note.js"),
  () => import("./orca-preset.js"),
  () => import("./path.js"),
  () => import("./polar-array.js"),
  () => import("./printer.js"),
  () => import("./project-to-mesh.js"),
  () => import("./repeat.js"),
  () => import("./rules.js"),
  () => import("./slicer.js"),
  () => import("./snake-wall.js"),
  () => import("./studio-view.js"),
  () => import("./svg-import.js"),
  () => import("./transform.js"),
  () => import("./travel-optimize.js"),
  () => import("./vase-control-points.js"),
  () => import("./weave-offset.js"),
  () => import("./z-warp.js")
];

const results = await Promise.all(modules.map((load)=>load()));
for(const mod of results){
  register(mod);
}
