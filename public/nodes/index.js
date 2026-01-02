const modules = [
  { name: "calibration-tower", load: () => import("./calibration-tower.js") },
  { name: "export", load: () => import("./export.js") },
  { name: "feature-paint", load: () => import("./feature-paint.js") },
  { name: "control-experiement", load: () => import("./control-experiement.js") },
  { name: "g-code-post", load: () => import("./g-code-post.js") },
  { name: "image", load: () => import("./image.js") },
  { name: "import-mesh", load: () => import("./import-mesh.js") },
  { name: "inspector", load: () => import("./inspector.js") },
  { name: "layer-schedule", load: () => import("./layer-schedule.js") },
  { name: "mesh-import", load: () => import("./mesh-import.js") },
  { name: "mesh-primitive", load: () => import("./mesh-primitive.js") },
  { name: "mesh-primitive-legacy", load: () => import("./mesh-primitive-legacy.js") },
  { name: "non-planar", load: () => import("./non-planar.js") },
  { name: "note", load: () => import("./note.js") },
  { name: "orca-preset", load: () => import("./orca-preset.js") },
  { name: "path", load: () => import("./path.js") },
  { name: "polar-array", load: () => import("./polar-array.js") },
  { name: "printer", load: () => import("./printer.js") },
  { name: "project-to-mesh", load: () => import("./project-to-mesh.js") },
  { name: "repeat", load: () => import("./repeat.js") },
  { name: "rules", load: () => import("./rules.js") },
  { name: "slicer", load: () => import("./slicer.js") },
  { name: "slicer-quality", load: () => import("./slicer-quality.js") },
  { name: "slicer-walls", load: () => import("./slicer-walls.js") },
  { name: "slicer-infill", load: () => import("./slicer-infill.js") },
  { name: "slicer-top-bottom", load: () => import("./slicer-top-bottom.js") },
  { name: "slicer-skirt-brim", load: () => import("./slicer-skirt-brim.js") },
  { name: "slicer-speeds-flow", load: () => import("./slicer-speeds-flow.js") },
  { name: "slicer-retraction-travel", load: () => import("./slicer-retraction-travel.js") },
  { name: "slicer-cooling", load: () => import("./slicer-cooling.js") },
  { name: "slicer-advanced-limits", load: () => import("./slicer-advanced-limits.js") },
  { name: "slicer-surface-raster", load: () => import("./slicer-surface-raster.js") },
  { name: "snake-wall", load: () => import("./snake-wall.js") },
  { name: "studio-view", load: () => import("./studio-view.js") },
  { name: "svg-import", load: () => import("./svg-import.js") },
  { name: "transform", load: () => import("./transform.js") },
  { name: "travel-optimize", load: () => import("./travel-optimize.js") },
  { name: "vase-control-points", load: () => import("./vase-control-points.js") },
  { name: "weave-offset", load: () => import("./weave-offset.js") },
  { name: "z-warp", load: () => import("./z-warp.js") }
];

export async function registerAllNodes(){
  const register = window.GCODE_STUDIO?.registerNode;
  if(!register){
    throw new Error("Node registry not available");
  }
  const failures = [];
  for(const entry of modules){
    try{
      const mod = await entry.load();
      register(mod);
    }catch(err){
      failures.push(entry.name);
      console.warn(`Failed to load node module: ${entry.name}`, err);
    }
  }
  if(failures.length){
    console.warn(`Node manifest loaded with ${failures.length} failure(s).`, failures);
  }
  return failures;
}

export default registerAllNodes;
