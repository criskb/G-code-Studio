import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Note',
  def: {
  title:"Note",
  uiSchema:SCHEMA_NOTE,
  desc:"Demo instructions / documentation. Does not affect the graph.",
  tag:"docs",
  inputs:[],
  outputs:[],
  initData:()=>({
    title:"Demo note",
    compact:false,
    text:"Use this node to describe how the current demo is wired.\n\nTip: In Preview, use Role + Layer filters to inspect walls/infill/top/bottom.\n"
  }),
  render:(node, mount)=>renderSchema(NODE_DEFS[node.type].uiSchema, node, mount),
  evaluate:(node, ctx)=>({})
}


};
