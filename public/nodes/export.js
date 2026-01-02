import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Export',
  def: {
    title:"Export", tag:"output",
    uiSchema:SCHEMA_EXPORT,
  desc:"Generate G-code (needs Path + Printer; Rules optional).",
    inputs: [{name:"path", type:"path"}, {name:"rules", type:"rules"}, {name:"profile", type:"profile"}, {name:"mesh", type:"mesh"}],
    outputs: [{name:"gcode", type:"gcode"}],
    initData: ()=>({ addLayerComments:true, capPreviewChars:200000, fileName:"gcode-studio_output" }),
    render:(node, mount)=>renderSchema(NODE_DEFS[node.type].uiSchema, node, mount),
    evaluate:(node, ctx)=>{
      const pathIn = ctx.getInput(node.id, "path");
      const rulesIn = ctx.getInput(node.id, "rules");
      const profIn = ctx.getInput(node.id, "profile");
      const meshIn = ctx.getInput(node.id, "mesh");
      const path = (pathIn?.out || pathIn?.path || pathIn || []);
      const profile = (profIn?.profile || profIn || ctx.defaultProfile || null);
      const rules = (rulesIn?.rules || rulesIn || null);
      const mesh = (meshIn?.mesh || meshIn?.out || meshIn || null);
      if(!profile) throw new Error("Export: missing Printer profile input");
      const safePath = Array.isArray(path) ? path.filter(Boolean) : [];
      const {gcode, stats, machinePath} = buildGcodeWithRules(safePath, profile, rules, node.data.addLayerComments);
      state.outputs.gcode = gcode;
      state.outputs.stats = stats;
      state.outputs.path = machinePath;
      state.outputs.mesh = mesh || null;
      return { gcode };
    }
  }
};
